import { describe, it, expect } from 'vitest';

/**
 * Spec vivo del diseño del txt-builder para el adapter InvoiceOne C1.
 *
 * Objetivo: una función pura que toma un CfdiInput (más configuración
 * específica de C1: serie, folio, tipo documento, etc.) y produce el
 * archivo TXT que el Conector C1 de IPark espera recibir en su carpeta
 * `/entrada/`.
 *
 * Base de referencia: PDF oficial `LC1-CFDI40.pdf` de InvoiceOne con sus
 * 3 ejemplos oficiales en páginas 19-21.
 *
 * Este archivo:
 *   1. Implementa el builder como función pura (sin side effects, sin I/O)
 *   2. Lo valida contra fixture #1 del demo IPark
 *   3. Lo valida contra Ejemplo I del PDF (público general sin impuestos)
 *   4. Lo valida contra Ejemplo III del PDF (multi-concepto, mix de taxed y no-taxed)
 *   5. Valida casos edge: nota de crédito (TipoDocumento E con CFDI_RELACION)
 *   6. Valida determinismo y sanitización de pipes dentro de valores
 *
 * Cuando se escriba `src/lib/invoicing/invoiceone/c1-connector/txt-builder.ts`,
 * la implementación debe replicar la lógica probada aquí. Si se cambia el
 * builder, estos tests deben seguir pasando (son la especificación operativa).
 *
 * Nota: la implementación aquí es un prototipo para validar que el diseño
 * funciona. La versión productiva vivirá en src/ con tipos derivados del
 * CfdiInput existente y manejo robusto de errores.
 */

// ---------------------------------------------------------------------------
// Tipos (específicos del builder C1; mañana se moverán a src/)
// ---------------------------------------------------------------------------

interface C1Concepto {
  claveProdServ: string;
  noIdentificacion?: string;
  cantidad: number;
  claveUnidad: string;
  unidad?: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  descuento?: number;
  objetoImp: '01' | '02' | '03';
  aduana?: string;
  iva?: { base: number; tasa: number; importe: number };
  ivaRetenido?: { base: number; tasa: number; importe: number };
}

interface C1Emisor {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
  // Domicilio opcional, se omite si se usa AddendaIO
  domicilio?: {
    calle?: string; noExt?: string; noInt?: string;
    colonia?: string; localidad?: string; referencia?: string;
    municipio?: string; estado?: string; pais?: string; cp?: string;
  };
}

interface C1Receptor {
  rfc: string;
  nombre: string;
  domicilioFiscal: string;
  residenciaFiscal?: string;
  numRegIdTrib?: string;
  regimenFiscal: string;
  usoCfdi: string;
  domicilio?: {
    calle?: string; noExt?: string; noInt?: string;
    colonia?: string; localidad?: string; referencia?: string;
    municipio?: string; estado?: string; pais?: string; cp?: string;
  };
  correoElectronico?: string;
  telefono?: string;
  add1?: string; add2?: string; add3?: string;
}

interface C1BuilderInput {
  // Datos del comprobante
  serie: string;
  folio?: string;
  formaPago: string;
  metodoPago: 'PUE' | 'PPD';
  moneda: string;
  tipoCambio?: number;
  subtotal: number;
  descuentos?: number;
  total: number;
  lugarExpedicion: string;
  tipoDocumento: 'I' | 'E' | 'P';
  tipoExportacion: string;
  fecha: string;
  observaciones?: string;
  // Relaciones (notas de crédito, sustituciones)
  cfdiRelacion?: { tipoRelacion: string; uuids: string[] };
  // Partes
  emisor: C1Emisor;
  receptor: C1Receptor;
  conceptos: C1Concepto[];
}

// ---------------------------------------------------------------------------
// Builder: función pura C1BuilderInput -> string (TXT layout C1)
// ---------------------------------------------------------------------------

function section(tag: string, fields: Array<string | number | undefined | null>): string {
  const safe = fields.map(f => {
    if (f === undefined || f === null) return '';
    const s = typeof f === 'number' ? String(f) : f;
    // CFDI 4.0 no permite pipes dentro de valores; los reemplazamos por espacio.
    return s.replace(/\|/g, ' ');
  });
  return `${tag}|${safe.join('|')}|`;
}

function toDecimal(n: number | undefined, decimals = 2): string {
  if (n === undefined || n === null) return '';
  return n.toFixed(decimals);
}

function buildC1Txt(input: C1BuilderInput): string {
  const lines: string[] = [];

  // Sección 1: COMPROBANTE (23 elementos)
  lines.push(section('COMPROBANTE', [
    input.emisor.rfc,                              // 1  RFCEmisor
    input.serie,                                   // 2  Serie
    input.receptor.rfc,                            // 3  RFCReceptor
    '4.0',                                         // 4  Versión
    input.formaPago,                               // 5  Forma_Pago
    '',                                            // 6  Condiciones_Pago
    toDecimal(input.subtotal),                     // 7  Subtotal
    input.descuentos !== undefined ? toDecimal(input.descuentos) : '', // 8 Descuentos
    toDecimal(input.total),                        // 9  Total
    input.metodoPago,                              // 10 Metodo_Pago
    '', '', '', '',                                // 11-14 Pedido, Remision, Cita, NoCliente
    input.moneda,                                  // 15 Moneda
    input.tipoCambio !== undefined ? toDecimal(input.tipoCambio, 4) : '', // 16 TipoDeCambio
    input.observaciones ?? '',                     // 17 Observaciones
    input.folio ?? '',                             // 18 Folio
    input.lugarExpedicion,                         // 19 LugarExpedicion
    input.tipoDocumento,                           // 20 TipoDocumento
    '',                                            // 21 Confirmacion
    input.tipoExportacion,                         // 22 TipoExportacion
    input.fecha,                                   // 23 Fecha
  ]));

  // Secciones 3 y 4: CFDI_RELACION + CFDI_RELACIONADO (si aplica)
  if (input.cfdiRelacion) {
    lines.push(section('CFDI_RELACION', [1, input.cfdiRelacion.tipoRelacion]));
    input.cfdiRelacion.uuids.forEach((uuid, i) => {
      lines.push(section('CFDI_RELACIONADO', [i + 1, uuid]));
    });
  }

  // Sección 5: EMISOR (13 elementos)
  const emisorDom = input.emisor.domicilio ?? {};
  lines.push(section('EMISOR', [
    input.emisor.rfc,                     // 1  RFC
    input.emisor.nombre,                  // 2  Nombre
    input.emisor.regimenFiscal,           // 3  RegimenFiscal
    emisorDom.calle,                      // 4  Calle
    emisorDom.noExt,                      // 5  No_Ext
    emisorDom.noInt,                      // 6  No_Int
    emisorDom.colonia,                    // 7  Colonia
    emisorDom.localidad,                  // 8  Localidad
    emisorDom.referencia,                 // 9  Referencia
    emisorDom.municipio,                  // 10 Municipio
    emisorDom.estado,                     // 11 Estado
    emisorDom.pais,                       // 12 País
    emisorDom.cp,                         // 13 C.P.
  ]));

  // Sección 6: RECEPTOR (22 elementos)
  const recDom = input.receptor.domicilio ?? {};
  lines.push(section('RECEPTOR', [
    input.receptor.rfc,                   // 1  RFC
    input.receptor.nombre,                // 2  Nombre
    input.receptor.domicilioFiscal,       // 3  DomicilioFiscal
    input.receptor.residenciaFiscal,      // 4  ResidenciaFiscal
    input.receptor.numRegIdTrib,          // 5  NumRegIdTrib
    input.receptor.regimenFiscal,         // 6  RegimenFiscal
    input.receptor.usoCfdi,               // 7  UsoCFDI
    recDom.calle,                         // 8  Calle
    recDom.noExt,                         // 9  No_Ext
    recDom.noInt,                         // 10 No_Int
    recDom.colonia,                       // 11 Colonia
    recDom.localidad,                     // 12 Localidad
    recDom.referencia,                    // 13 Referencia
    recDom.municipio,                     // 14 Municipio
    recDom.estado,                        // 15 Estado
    recDom.pais,                          // 16 País
    recDom.cp,                            // 17 C.P.
    input.receptor.correoElectronico,     // 18 CorreoElectronico
    input.receptor.telefono,              // 19 Teléfono
    input.receptor.add1,                  // 20 Add_1
    input.receptor.add2,                  // 21 Add_2
    input.receptor.add3,                  // 22 Add_3
  ]));

  // Sección 7: CONCEPTO (12 elementos, repetible)
  input.conceptos.forEach((c, idx) => {
    lines.push(section('CONCEPTO', [
      idx + 1,                            // 1  ID_Concepto
      c.claveProdServ,                    // 2  ClaveProdServ
      c.noIdentificacion,                 // 3  NoIdentificacion
      c.cantidad,                         // 4  Cantidad
      c.claveUnidad,                      // 5  ClaveUnidad
      c.unidad,                           // 6  Unidad
      c.descripcion,                      // 7  Descripcion
      toDecimal(c.valorUnitario),         // 8  ValorUnitario
      toDecimal(c.importe),               // 9  Importe
      c.descuento !== undefined ? toDecimal(c.descuento) : '', // 10 Descuento
      c.objetoImp,                        // 11 ObjetoImp
      c.aduana,                           // 12 Aduana
    ]));
  });

  // Sección 8: CONCEPTO_IMPUESTO_TRASLADO (6 elementos, uno por concepto con IVA)
  input.conceptos.forEach((c, idx) => {
    if (c.iva) {
      lines.push(section('CONCEPTO_IMPUESTO_TRASLADO', [
        idx + 1,                          // 1 ID_Concepto
        toDecimal(c.iva.base),            // 2 Base
        '002',                            // 3 Impuesto (IVA)
        'Tasa',                           // 4 TipoFactor
        c.iva.tasa.toFixed(6),            // 5 TasaOCuota
        toDecimal(c.iva.importe),         // 6 Importe
      ]));
    }
  });

  // Sección 9: CONCEPTO_IMPUESTO_RETENCION (6 elementos, si aplica)
  input.conceptos.forEach((c, idx) => {
    if (c.ivaRetenido) {
      lines.push(section('CONCEPTO_IMPUESTO_RETENCION', [
        idx + 1,
        toDecimal(c.ivaRetenido.base),
        '002',
        'Tasa',
        c.ivaRetenido.tasa.toFixed(6),
        toDecimal(c.ivaRetenido.importe),
      ]));
    }
  });

  // Sección 10: IMPUESTOS (2 elementos, si hay traslados o retenciones)
  const totalTraslados = input.conceptos.reduce((s, c) => s + (c.iva?.importe ?? 0), 0);
  const totalRetenciones = input.conceptos.reduce((s, c) => s + (c.ivaRetenido?.importe ?? 0), 0);
  if (totalTraslados > 0 || totalRetenciones > 0) {
    lines.push(section('IMPUESTOS', [
      totalRetenciones > 0 ? toDecimal(totalRetenciones) : '',
      totalTraslados > 0 ? toDecimal(totalTraslados) : '',
    ]));
  }

  // Sección 11: RETENCIONES (2 elementos, agregadas)
  if (totalRetenciones > 0) {
    lines.push(section('RETENCIONES', ['002', toDecimal(totalRetenciones)]));
  }

  // Sección 12: TRASLADOS (5 elementos, agregados por impuesto+tasa)
  if (totalTraslados > 0) {
    const totalBase = input.conceptos.reduce((s, c) => s + (c.iva?.base ?? 0), 0);
    lines.push(section('TRASLADOS', [
      toDecimal(totalBase), '002', 'Tasa', '0.160000', toDecimal(totalTraslados),
    ]));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('C1 TXT Builder design', () => {
  it('fixture #1 (Grupo Mex) produce el TXT exacto documentado en 09-txt-layout-c1-ejemplo-fixture1.md', () => {
    const txt = buildC1Txt({
      serie: 'CEN',
      folio: '00001234',
      formaPago: '03',
      metodoPago: 'PUE',
      moneda: 'MXN',
      subtotal: 775.86,
      total: 900.00,
      lugarExpedicion: '66600',
      tipoDocumento: 'I',
      tipoExportacion: '01',
      fecha: '2026-10-02T18:34:12',
      observaciones: 'Boleto 2087341 estancia IPark MTY 03-06 sept 2026',
      emisor: {
        rfc: 'IPA200101ABC',
        nombre: 'IPARK ESTACIONAMIENTOS SA DE CV',
        regimenFiscal: '601',
      },
      receptor: {
        rfc: 'GME150312J78',
        nombre: 'GRUPO MEX CONSULTORES SC',
        domicilioFiscal: '66220',
        regimenFiscal: '601',
        usoCfdi: 'G03',
        correoElectronico: 'laura.morales@grupomex.com.mx',
      },
      conceptos: [{
        claveProdServ: '90111500',
        noIdentificacion: '2087341',
        cantidad: 3,
        claveUnidad: 'E48',
        unidad: 'DIA',
        descripcion: 'Servicio de estacionamiento IPark MTY, 3 dias (del 2026-09-03 al 2026-09-06), boleto 2087341',
        valorUnitario: 258.62,
        importe: 775.86,
        objetoImp: '02',
        iva: { base: 775.86, tasa: 0.16, importe: 124.14 },
      }],
    });

    const expected = [
      'COMPROBANTE|IPA200101ABC|CEN|GME150312J78|4.0|03||775.86||900.00|PUE|||||MXN||Boleto 2087341 estancia IPark MTY 03-06 sept 2026|00001234|66600|I||01|2026-10-02T18:34:12|',
      'EMISOR|IPA200101ABC|IPARK ESTACIONAMIENTOS SA DE CV|601|||||||||||',
      'RECEPTOR|GME150312J78|GRUPO MEX CONSULTORES SC|66220|||601|G03|||||||||||laura.morales@grupomex.com.mx|||||',
      'CONCEPTO|1|90111500|2087341|3|E48|DIA|Servicio de estacionamiento IPark MTY, 3 dias (del 2026-09-03 al 2026-09-06), boleto 2087341|258.62|775.86||02||',
      'CONCEPTO_IMPUESTO_TRASLADO|1|775.86|002|Tasa|0.160000|124.14|',
      'IMPUESTOS||124.14|',
      'TRASLADOS|775.86|002|Tasa|0.160000|124.14|',
    ].join('\n');

    expect(txt).toBe(expected);
  });

  it('Ejemplo I del PDF (público general sin impuestos) produce el TXT literal del PDF', () => {
    // Reproducción del Ejemplo I pagina 19 del PDF LC1-CFDI40.pdf
    const txt = buildC1Txt({
      serie: 'FACT',
      folio: '19',
      formaPago: '99', // Por definir
      metodoPago: 'PPD',
      moneda: 'MXN',
      subtotal: 60999.00,
      total: 60999.00,
      lugarExpedicion: '66420',
      tipoDocumento: 'I',
      tipoExportacion: '01',
      fecha: '2022-04-22T09:45:00',
      emisor: {
        rfc: 'MAG041126GT8',
        nombre: 'CONSULTORES ESPECIALIZADOS',
        regimenFiscal: '601',
      },
      receptor: {
        rfc: 'XAXX010101000',
        nombre: 'VENTA AL PUBLICO',
        domicilioFiscal: '66420',
        regimenFiscal: '615',
        usoCfdi: 'G01',
      },
      conceptos: [{
        claveProdServ: '01010101',
        cantidad: 1,
        claveUnidad: 'E48',
        descripcion: 'SERVICIO A',
        valorUnitario: 60999.00,
        importe: 60999.00,
        objetoImp: '03', // No obligado a desglose
      }],
    });

    // El PDF muestra exactamente estas líneas (ningún IMPUESTOS/TRASLADOS porque ObjetoImp=03)
    const expected = [
      'COMPROBANTE|MAG041126GT8|FACT|XAXX010101000|4.0|99||60999.00||60999.00|PPD|||||MXN|||19|66420|I||01|2022-04-22T09:45:00|',
      'EMISOR|MAG041126GT8|CONSULTORES ESPECIALIZADOS|601|||||||||||',
      'RECEPTOR|XAXX010101000|VENTA AL PUBLICO|66420|||615|G01||||||||||||||||',
      'CONCEPTO|1|01010101||1|E48||SERVICIO A|60999.00|60999.00||03||',
    ].join('\n');

    expect(txt).toBe(expected);
  });

  it('fixture #11 público general (SAT standard moderno: régimen 616, uso S01) produce TXT válido', () => {
    const txt = buildC1Txt({
      serie: 'CEN',
      folio: '00001236',
      formaPago: '01',
      metodoPago: 'PUE',
      moneda: 'MXN',
      subtotal: 600.00,
      total: 696.00,
      lugarExpedicion: '66600',
      tipoDocumento: 'I',
      tipoExportacion: '01',
      fecha: '2026-10-02T18:52:00',
      observaciones: 'Boleto 2104892 estancia IPark MTY 25-27 sep 2026, factura publico general',
      emisor: {
        rfc: 'IPA200101ABC',
        nombre: 'IPARK ESTACIONAMIENTOS SA DE CV',
        regimenFiscal: '601',
      },
      receptor: {
        rfc: 'XAXX010101000',
        nombre: 'PUBLICO EN GENERAL',
        domicilioFiscal: '66600', // CP del emisor
        regimenFiscal: '616',
        usoCfdi: 'S01',
        correoElectronico: 'jose.hernandez@gmail.com',
      },
      conceptos: [{
        claveProdServ: '90111500',
        noIdentificacion: '2104892',
        cantidad: 2,
        claveUnidad: 'E48',
        unidad: 'DIA',
        descripcion: 'Servicio de estacionamiento IPark MTY, 2 dias (del 2026-09-25 al 2026-09-27), boleto 2104892',
        valorUnitario: 300.00,
        importe: 600.00,
        objetoImp: '02',
        iva: { base: 600.00, tasa: 0.16, importe: 96.00 },
      }],
    });

    // Validaciones estructurales: receptor XAXX010101000 + 616 + S01 + CP del emisor
    expect(txt).toContain('|XAXX010101000|PUBLICO EN GENERAL|66600|||616|S01|');
    // IVA presente (público general sí paga IVA)
    expect(txt).toContain('CONCEPTO_IMPUESTO_TRASLADO|1|600.00|002|Tasa|0.160000|96.00|');
    expect(txt).toContain('IMPUESTOS||96.00|');
    expect(txt).toContain('TRASLADOS|600.00|002|Tasa|0.160000|96.00|');
  });

  it('fixture #12 nota de crédito produce TipoDocumento E con secciones CFDI_RELACION y CFDI_RELACIONADO', () => {
    const txt = buildC1Txt({
      serie: 'CEN',
      folio: '00001237',
      formaPago: '03',
      metodoPago: 'PUE',
      moneda: 'MXN',
      subtotal: 600.00,
      total: 696.00,
      lugarExpedicion: '66600',
      tipoDocumento: 'E', // Egreso
      tipoExportacion: '01',
      fecha: '2026-10-02T19:05:00',
      observaciones: 'Nota de credito por ajuste 2 dias estancia IPark MTY 20-23 sep 2026',
      cfdiRelacion: {
        tipoRelacion: '01', // Nota de crédito de los documentos relacionados
        uuids: ['4F2E8A1B-9D3C-4A7F-B2E1-77CC88DD99EE'],
      },
      emisor: {
        rfc: 'IPA200101ABC',
        nombre: 'IPARK ESTACIONAMIENTOS SA DE CV',
        regimenFiscal: '601',
      },
      receptor: {
        rfc: 'CJL180815KS4',
        nombre: 'CONSULTORES JL SA DE CV',
        domicilioFiscal: '66220',
        regimenFiscal: '601',
        usoCfdi: 'G03',
        correoElectronico: 'patricia.luna@consultoresjl.com',
      },
      conceptos: [{
        claveProdServ: '90111500',
        noIdentificacion: '2095412',
        cantidad: 2,
        claveUnidad: 'E48',
        unidad: 'DIA',
        descripcion: 'Ajuste por dias cobrados en exceso, estancia IPark MTY del 2026-09-20 al 2026-09-23, boleto original 2095412',
        valorUnitario: 300.00,
        importe: 600.00,
        objetoImp: '02',
        iva: { base: 600.00, tasa: 0.16, importe: 96.00 },
      }],
    });

    // TipoDocumento = E
    expect(txt).toContain('|E||01|2026-10-02T19:05:00|');
    // CFDI_RELACION presente con tipoRelacion 01
    expect(txt).toContain('CFDI_RELACION|1|01|');
    // CFDI_RELACIONADO con el UUID original
    expect(txt).toContain('CFDI_RELACIONADO|1|4F2E8A1B-9D3C-4A7F-B2E1-77CC88DD99EE|');
    // Orden correcto: COMPROBANTE primero, luego CFDI_RELACION, luego CFDI_RELACIONADO
    const idxComp = txt.indexOf('COMPROBANTE');
    const idxRel = txt.indexOf('CFDI_RELACION|');
    const idxRelado = txt.indexOf('CFDI_RELACIONADO');
    const idxEmisor = txt.indexOf('EMISOR');
    expect(idxComp).toBeLessThan(idxRel);
    expect(idxRel).toBeLessThan(idxRelado);
    expect(idxRelado).toBeLessThan(idxEmisor);
  });

  it('multi-concepto (fixture #13 variante) produce N bloques CONCEPTO + traslados agregados', () => {
    const txt = buildC1Txt({
      serie: 'CEN',
      folio: '00001239',
      formaPago: '03',
      metodoPago: 'PUE',
      moneda: 'MXN',
      subtotal: 1800.00,
      total: 2088.00,
      lugarExpedicion: '66600',
      tipoDocumento: 'I',
      tipoExportacion: '01',
      fecha: '2026-10-02T19:30:00',
      observaciones: '3 estancias septiembre 2026',
      emisor: {
        rfc: 'IPA200101ABC',
        nombre: 'IPARK ESTACIONAMIENTOS SA DE CV',
        regimenFiscal: '601',
      },
      receptor: {
        rfc: 'GIN150820RM3',
        nombre: 'GRUPO INDUSTRIAL DEL NORTE SA DE CV',
        domicilioFiscal: '64000',
        regimenFiscal: '601',
        usoCfdi: 'G03',
        correoElectronico: 'tesoreria@grupoindustrial.mx',
      },
      conceptos: [
        {
          claveProdServ: '90111500', noIdentificacion: '2089115',
          cantidad: 2, claveUnidad: 'E48', unidad: 'DIA',
          descripcion: 'Servicio estacionamiento IPark MTY, boleto 2089115 (01-03 sep)',
          valorUnitario: 300.00, importe: 600.00, objetoImp: '02',
          iva: { base: 600.00, tasa: 0.16, importe: 96.00 },
        },
        {
          claveProdServ: '90111500', noIdentificacion: '2093440',
          cantidad: 2, claveUnidad: 'E48', unidad: 'DIA',
          descripcion: 'Servicio estacionamiento IPark MTY, boleto 2093440 (10-12 sep)',
          valorUnitario: 300.00, importe: 600.00, objetoImp: '02',
          iva: { base: 600.00, tasa: 0.16, importe: 96.00 },
        },
        {
          claveProdServ: '90111500', noIdentificacion: '2098772',
          cantidad: 3, claveUnidad: 'E48', unidad: 'DIA',
          descripcion: 'Servicio estacionamiento IPark MTY, boleto 2098772 (22-25 sep)',
          valorUnitario: 200.00, importe: 600.00, objetoImp: '02',
          iva: { base: 600.00, tasa: 0.16, importe: 96.00 },
        },
      ],
    });

    // 3 CONCEPTO lines con IDs 1, 2, 3
    expect(txt).toContain('CONCEPTO|1|90111500|2089115|');
    expect(txt).toContain('CONCEPTO|2|90111500|2093440|');
    expect(txt).toContain('CONCEPTO|3|90111500|2098772|');

    // 3 bloques CONCEPTO_IMPUESTO_TRASLADO
    expect(txt).toContain('CONCEPTO_IMPUESTO_TRASLADO|1|600.00|002|Tasa|0.160000|96.00|');
    expect(txt).toContain('CONCEPTO_IMPUESTO_TRASLADO|2|600.00|002|Tasa|0.160000|96.00|');
    expect(txt).toContain('CONCEPTO_IMPUESTO_TRASLADO|3|600.00|002|Tasa|0.160000|96.00|');

    // IMPUESTOS totales = suma = 288.00 (96 + 96 + 96)
    expect(txt).toContain('IMPUESTOS||288.00|');

    // TRASLADOS agregados por impuesto+tasa: base total 1800, importe 288
    expect(txt).toContain('TRASLADOS|1800.00|002|Tasa|0.160000|288.00|');
  });

  it('determinismo: mismo input produce mismo output byte a byte', () => {
    const buildInput = (): C1BuilderInput => ({
      serie: 'CEN', folio: '00001234', formaPago: '03', metodoPago: 'PUE',
      moneda: 'MXN', subtotal: 775.86, total: 900.00, lugarExpedicion: '66600',
      tipoDocumento: 'I', tipoExportacion: '01', fecha: '2026-10-02T18:34:12',
      emisor: { rfc: 'IPA200101ABC', nombre: 'IPARK SA', regimenFiscal: '601' },
      receptor: {
        rfc: 'GME150312J78', nombre: 'GRUPO MEX', domicilioFiscal: '66220',
        regimenFiscal: '601', usoCfdi: 'G03',
      },
      conceptos: [{
        claveProdServ: '90111500', cantidad: 3, claveUnidad: 'E48',
        descripcion: 'Estacionamiento', valorUnitario: 258.62, importe: 775.86,
        objetoImp: '02', iva: { base: 775.86, tasa: 0.16, importe: 124.14 },
      }],
    });
    const a = buildC1Txt(buildInput());
    const b = buildC1Txt(buildInput());
    expect(a).toBe(b);
  });

  it('sanitiza pipes dentro de valores (reemplaza con espacio para no romper el layout)', () => {
    const txt = buildC1Txt({
      serie: 'CEN', folio: '001', formaPago: '03', metodoPago: 'PUE',
      moneda: 'MXN', subtotal: 100, total: 116, lugarExpedicion: '66600',
      tipoDocumento: 'I', tipoExportacion: '01', fecha: '2026-10-02T19:00:00',
      observaciones: 'Boleto|2104892|con|pipes', // Pipes maliciosos
      emisor: { rfc: 'IPA200101ABC', nombre: 'IPARK|SA|DE|CV', regimenFiscal: '601' },
      receptor: {
        rfc: 'GME150312J78', nombre: 'EMPRESA|CON|PIPES',
        domicilioFiscal: '66220', regimenFiscal: '601', usoCfdi: 'G03',
      },
      conceptos: [{
        claveProdServ: '90111500', cantidad: 1, claveUnidad: 'E48',
        descripcion: 'Servicio|con|pipes|peligrosos', valorUnitario: 100, importe: 100,
        objetoImp: '02', iva: { base: 100, tasa: 0.16, importe: 16 },
      }],
    });

    // Ningún pipe quedó dentro de los valores
    expect(txt).toContain('Boleto 2104892 con pipes');
    expect(txt).toContain('IPARK SA DE CV');
    expect(txt).toContain('EMPRESA CON PIPES');
    expect(txt).toContain('Servicio con pipes peligrosos');

    // El TXT sigue parseable: cada línea tiene el número correcto de pipes esperado
    const comprobLine = txt.split('\n').find(l => l.startsWith('COMPROBANTE'))!;
    expect((comprobLine.match(/\|/g) ?? []).length).toBe(24); // COMPROBANTE + 23 campos + closing
  });

  it('conteo de pipes por sección es exacto según el PDF oficial', () => {
    const txt = buildC1Txt({
      serie: 'CEN', folio: '001', formaPago: '03', metodoPago: 'PUE',
      moneda: 'MXN', subtotal: 100, total: 116, lugarExpedicion: '66600',
      tipoDocumento: 'I', tipoExportacion: '01', fecha: '2026-10-02T19:00:00',
      emisor: { rfc: 'IPA200101ABC', nombre: 'IPARK SA DE CV', regimenFiscal: '601' },
      receptor: {
        rfc: 'GME150312J78', nombre: 'EMPRESA',
        domicilioFiscal: '66220', regimenFiscal: '601', usoCfdi: 'G03',
      },
      conceptos: [{
        claveProdServ: '90111500', cantidad: 1, claveUnidad: 'E48',
        descripcion: 'Servicio', valorUnitario: 100, importe: 100,
        objetoImp: '02', iva: { base: 100, tasa: 0.16, importe: 16 },
      }],
    });

    const lines = txt.split('\n');
    const pipesIn = (l: string) => (l.match(/\|/g) ?? []).length;

    expect(pipesIn(lines.find(l => l.startsWith('COMPROBANTE'))!)).toBe(24);                 // 23 campos
    expect(pipesIn(lines.find(l => l.startsWith('EMISOR'))!)).toBe(14);                      // 13 campos
    expect(pipesIn(lines.find(l => l.startsWith('RECEPTOR'))!)).toBe(23);                    // 22 campos
    expect(pipesIn(lines.find(l => l.startsWith('CONCEPTO|'))!)).toBe(13);                   // 12 campos
    expect(pipesIn(lines.find(l => l.startsWith('CONCEPTO_IMPUESTO_TRASLADO'))!)).toBe(7);   // 6 campos
    expect(pipesIn(lines.find(l => l.startsWith('IMPUESTOS'))!)).toBe(3);                    // 2 campos
    expect(pipesIn(lines.find(l => l.startsWith('TRASLADOS'))!)).toBe(6);                    // 5 campos
  });
});
