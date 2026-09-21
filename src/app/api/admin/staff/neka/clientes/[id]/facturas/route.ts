import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  registrarCfdiEmitido,
  uploadFacturaFiles,
} from '@/lib/billing/centinelia-facturas';
import { parseCfdiXml } from '@/lib/billing/centinelia-cfdi-parser';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

/** GET — lista todas las facturas (cfdi_emitido + rep_emitido) del cliente. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { id } = await params;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('centinelia_billing')
    .select('*')
    .eq('cliente_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ facturas: data ?? [] });
}

/**
 * POST — sube XML+PDF de una factura ya timbrada (portal SAT o Facturama).
 * Parsea el XML para extraer UUID + metadata fiscal, registra un row
 * cfdi_emitido en centinelia_billing, y sube ambos archivos al bucket.
 *
 * multipart/form-data:
 *   xml:       CFDI XML
 *   pdf:       Representacion impresa
 *   cicloKey?: 'YYYY-MM' (opcional, para idempotencia con el cron)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { id } = await params;

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

  const cicloKey = (form.get('cicloKey') as string | null)?.trim() || undefined;

  const xmlText   = await xml.text();
  const xmlBuffer = Buffer.from(xmlText, 'utf-8');
  const pdfBuffer = Buffer.from(await pdf.arrayBuffer());

  const parsed = parseCfdiXml(xmlText);
  if (!parsed.ok) {
    return NextResponse.json({ error: `XML invalido: ${parsed.error}` }, { status: 400 });
  }

  if (parsed.data.tipoComprobante !== 'I') {
    return NextResponse.json({
      error: `Este endpoint es para CFDI tipo Ingreso (I). El XML es tipo ${parsed.data.tipoComprobante}. Para REP usa /rep.`,
    }, { status: 400 });
  }

  const registrarResult = await registrarCfdiEmitido({
    clienteId:  id,
    cfdiUuid:   parsed.data.uuid,
    cicloKey,
    monto:      parsed.data.total,
    subtotal:   parsed.data.subtotal,
    iva:        parsed.data.iva,
    metodoPago: parsed.data.metodoPago ?? 'PUE',
    formaPago:  parsed.data.formaPago,
    usoCfdi:    parsed.data.receptor.usoCfdi,
    moneda:     parsed.data.moneda,
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
    variant:    'ingreso',
  });

  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.message, code: uploadResult.code }, { status: 500 });
  }

  return NextResponse.json({ factura: registrarResult.factura, xmlPath: uploadResult.xmlPath, pdfPath: uploadResult.pdfPath });
}
