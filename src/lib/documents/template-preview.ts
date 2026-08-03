/**
 * Genera un PDF preview de un template docx usando datos dummy realistas.
 * Se llama después de auto-templatize para que el usuario pueda verificar
 * visualmente que la plantilla generada se ve como espera.
 */

import { fillDocxTemplate, convertDocxToPdf } from './template-fill';
import type { DocType } from './auto-templatize';

const mxn = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

interface DummyDataOpts {
  docType:      DocType;
  emisorNombre?: string;
}

/** Construye datos dummy realistas para el preview. */
export function buildDummyData(opts: DummyDataOpts): Record<string, unknown> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fecha = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;

  const items = [
    { descripcion: 'Servicio de instalación equipo A/C', cantidad: '2', clave_unidad: 'E48-', clave_prodserv: '80131500', descuento: '0.00', unidad: 'servicio', cliente_equipo: '',
      precio_unitario: mxn(3500), importe: mxn(7000) },
    { descripcion: 'Filtro capilar 3/8"',                cantidad: '5', clave_unidad: 'H87',  clave_prodserv: '40142100', descuento: '0.00', unidad: 'pza',     cliente_equipo: '',
      precio_unitario: mxn(185),  importe: mxn(925) },
  ];
  const subtotalNum = 7925;
  const ivaNum      = 1268;
  const totalNum    = subtotalNum + ivaNum;

  const common: Record<string, unknown> = {
    folio:             'PREVIEW-1234',
    fecha,
    items,
    subtotal:          mxn(subtotalNum),
    iva:               mxn(ivaNum),
    total:             mxn(totalNum),
    total_letras:      'NUEVE MIL CIENTO NOVENTA Y TRES Pesos 00/100 M.N.',
    condiciones_pago:  '15 DIAS',
    notas:             'Este es un preview con datos ficticios para confirmar el diseño.',
    emisor_nombre:     opts.emisorNombre ?? 'Tu Negocio',
    emisor_rfc:        'XAXX010101000',
    emisor_direccion:  'Dirección del emisor',
    emisor_telefono:   '+52 811 000 0000',
    emisor_email:      'info@negocio.mx',
  };

  if (opts.docType === 'orden') {
    common.proveedor_nombre    = 'PROVEEDOR EJEMPLO S.A. DE C.V.';
    common.proveedor_rfc       = 'PRO010101ABC';
    common.proveedor_email     = 'ventas@proveedor.mx';
    common.terminos_entrega    = 'Entrega en 3 días hábiles';
  } else {
    common.cliente_nombre    = 'CLIENTE EJEMPLO S.A. DE C.V.';
    common.cliente_rfc       = 'CLE010101ABC';
    common.cliente_email     = 'contacto@cliente.mx';
    common.cliente_direccion = 'Av. Ejemplo 123, Col. Centro, CDMX';
    if (opts.docType === 'cotizacion') common.vigencia_dias = '15';
    if (opts.docType === 'nota_venta') common.forma_pago    = 'Efectivo';
  }

  return common;
}

/** Fill templatized docx with dummy data + convert to PDF. Returns PDF buffer. */
export async function generatePreviewPdf(
  templateBuffer: Buffer,
  docType:        DocType,
  emisorNombre?:  string,
): Promise<Buffer> {
  const data   = buildDummyData({ docType, emisorNombre });
  const filled = fillDocxTemplate(templateBuffer, data);
  // convertDocxToPdf ignora agentId/supabase args (uses CloudConvert). Pasamos vacíos.
  return convertDocxToPdf(filled, '', {} as unknown as Parameters<typeof convertDocxToPdf>[2]);
}
