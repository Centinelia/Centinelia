import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  registrarRepEmitido,
  uploadFacturaFiles,
} from '@/lib/billing/centinelia-facturas';
import { parseCfdiXml } from '@/lib/billing/centinelia-cfdi-parser';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST — sube XML+PDF de un REP (Complemento de Pago, tipo P) contra una
 * factura padre (Ingreso PPD). Parsea el XML, verifica que el padre existe,
 * registra un row rep_emitido con related_uuid apuntando al Ingreso, y sube
 * los archivos al bucket.
 *
 * multipart/form-data:
 *   xml: CFDI REP XML
 *   pdf: Representacion impresa del REP
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; billingId: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { id, billingId } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json({ error: `formData invalido: ${(e as Error).message}` }, { status: 400 });
  }

  const xml = form.get('xml');
  const pdf = form.get('pdf');
  if (!(xml instanceof File)) return NextResponse.json({ error: 'campo xml requerido' }, { status: 400 });
  if (!(pdf instanceof File)) return NextResponse.json({ error: 'campo pdf requerido' }, { status: 400 });

  const xmlText   = await xml.text();
  const xmlBuffer = Buffer.from(xmlText, 'utf-8');
  const pdfBuffer = Buffer.from(await pdf.arrayBuffer());

  const parsed = parseCfdiXml(xmlText);
  if (!parsed.ok) {
    return NextResponse.json({ error: `XML invalido: ${parsed.error}` }, { status: 400 });
  }

  if (parsed.data.tipoComprobante !== 'P') {
    return NextResponse.json({
      error: `Este endpoint es para CFDI tipo Pago (P). El XML es tipo ${parsed.data.tipoComprobante}.`,
    }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: padre, error: fetchErr } = await supabase
    .from('centinelia_billing')
    .select('id, cfdi_uuid, tipo')
    .eq('id', billingId)
    .single();
  if (fetchErr || !padre) {
    return NextResponse.json({ error: `factura padre ${billingId} no existe` }, { status: 404 });
  }
  if ((padre as { tipo: string }).tipo !== 'cfdi_emitido') {
    return NextResponse.json({ error: `factura padre debe ser cfdi_emitido, es ${(padre as { tipo: string }).tipo}` }, { status: 400 });
  }

  const ingresoUuid = (padre as { cfdi_uuid: string }).cfdi_uuid;

  const registrarResult = await registrarRepEmitido({
    clienteId:   id,
    repUuid:     parsed.data.uuid,
    ingresoUuid,
    monto:       parsed.data.total,
    subtotal:    parsed.data.subtotal,
    iva:         parsed.data.iva,
    formaPago:   parsed.data.formaPago,
    moneda:      parsed.data.moneda,
  });

  if (!registrarResult.ok) {
    return NextResponse.json({ error: registrarResult.message, code: registrarResult.code }, { status: 500 });
  }

  const uploadResult = await uploadFacturaFiles({
    billingId:  registrarResult.factura.id,
    clienteId:  id,
    uuidFiscal: parsed.data.uuid,
    xmlContent: xmlBuffer,
    pdfContent: pdfBuffer,
    variant:    'rep',
  });

  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.message, code: uploadResult.code }, { status: 500 });
  }

  return NextResponse.json({ factura: registrarResult.factura, xmlPath: uploadResult.xmlPath, pdfPath: uploadResult.pdfPath });
}
