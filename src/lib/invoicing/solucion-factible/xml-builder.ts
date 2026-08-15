import { create } from 'xmlbuilder2';
import type { CfdiInput } from '../provider';

const NS = {
  cfdi: 'http://www.sat.gob.mx/cfd/4',
  xsi:  'http://www.w3.org/2001/XMLSchema-instance',
  schemaLocation: 'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
};

const fmt = (n: number) => n.toFixed(2);
const fmtTasa = (n: number) => n.toFixed(6);

function fechaLocalMx(): string {
  // CFDI 4.0 exige fecha local del lugar de expedición (sin timezone offset)
  const now = new Date(Date.now() - 6 * 3600 * 1000); // GMT-6 CDMX; ajustar cuando SAT permita otras
  return now.toISOString().slice(0, 19);
}

export function buildCfdiXml(input: CfdiInput, folioInterno = ''): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('cfdi:Comprobante', {
      'xmlns:cfdi': NS.cfdi,
      'xmlns:xsi': NS.xsi,
      'xsi:schemaLocation': NS.schemaLocation,
      Version: '4.0',
      Serie: 'A', Folio: folioInterno || '1',
      Fecha: fechaLocalMx(),
      Sello: '',                        // se rellena en signer
      FormaPago: input.formaPago,
      NoCertificado: '',                // se rellena en signer
      Certificado: '',                  // se rellena en signer
      SubTotal: fmt(input.subtotal),
      Moneda: input.moneda,
      Total: fmt(input.total),
      TipoDeComprobante: 'I',           // Ingreso
      Exportacion: '01',                // No aplica
      MetodoPago: input.metodoPago,
      LugarExpedicion: input.lugarExpedicion,
    });

  if (input.moneda !== 'MXN' && input.tipoCambio) {
    doc.att('TipoCambio', input.tipoCambio.toFixed(4));
  }

  doc.ele('cfdi:Emisor', {
    Rfc: input.emisor.rfc,
    Nombre: input.emisor.nombre,
    RegimenFiscal: input.emisor.regimenFiscal,
  });

  doc.ele('cfdi:Receptor', {
    Rfc: input.receptor.rfc,
    Nombre: input.receptor.nombre,
    DomicilioFiscalReceptor: input.receptor.domicilioFiscal,
    RegimenFiscalReceptor: input.receptor.regimenFiscal,
    UsoCFDI: input.receptor.usoCfdi,
  });

  const conceptos = doc.ele('cfdi:Conceptos');
  for (const c of input.conceptos) {
    const con = conceptos.ele('cfdi:Concepto', {
      ClaveProdServ: c.claveProdServ,
      Cantidad: c.cantidad.toString(),
      ClaveUnidad: c.claveUnidad,
      Descripcion: c.descripcion,
      ValorUnitario: fmt(c.valorUnitario),
      Importe: fmt(c.importe),
      ObjetoImp: c.iva ? '02' : '01',
    });
    if (c.iva) {
      const imps = con.ele('cfdi:Impuestos');
      imps.ele('cfdi:Traslados').ele('cfdi:Traslado', {
        Base: fmt(c.importe),
        Impuesto: '002',      // IVA
        TipoFactor: 'Tasa',
        TasaOCuota: fmtTasa(c.iva / c.importe),
        Importe: fmt(c.iva),
      });
    }
  }

  if (input.iva > 0) {
    const imps = doc.ele('cfdi:Impuestos', { TotalImpuestosTrasladados: fmt(input.iva) });
    imps.ele('cfdi:Traslados').ele('cfdi:Traslado', {
      Base: fmt(input.subtotal),
      Impuesto: '002',
      TipoFactor: 'Tasa',
      TasaOCuota: fmtTasa(0.16),
      Importe: fmt(input.iva),
    });
  }

  return doc.end({ prettyPrint: false });
}
