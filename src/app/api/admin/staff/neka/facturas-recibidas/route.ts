import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createFacturaRecibida, uploadRecibidaFiles } from '@/lib/billing/centinelia-facturas-recibidas';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET — lista facturas recibidas con filtros opcionales.
 * Query:
 *   deducible=true|false
 *   from=YYYY-MM-DD
 *   to=YYYY-MM-DD
 *   rfc=<rfc emisor exacto>
 */
export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });

  const url = new URL(req.url);
  const deducible = url.searchParams.get('deducible');
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');
  const rfc  = url.searchParams.get('rfc');

  const supabase = createAdminClient();
  let query = supabase.from('centinelia_facturas_recibidas').select('*');
  if (deducible === 'true')  query = query.eq('deducible', true);
  if (deducible === 'false') query = query.eq('deducible', false);
  if (from) query = query.gte('fecha_emision', from);
  if (to)   query = query.lte('fecha_emision', to);
  if (rfc)  query = query.eq('rfc_emisor', rfc.trim().toUpperCase());

  const { data, error } = await query.order('fecha_emision', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ facturas: data ?? [] });
}

/**
 * POST — sube XML+PDF de una factura recibida (proveedor a Centinelia).
 * multipart/form-data: xml, pdf, [categoriaGasto], [deducible=true|false], [notas]
 */
export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });

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

  const categoriaGasto = (form.get('categoriaGasto') as string | null)?.trim() || undefined;
  const deducibleRaw   = form.get('deducible') as string | null;
  const deducible      = deducibleRaw === null ? undefined : deducibleRaw === 'true';
  const notas          = (form.get('notas') as string | null)?.trim() || undefined;

  const xmlText   = await xml.text();
  const xmlBuffer = Buffer.from(xmlText, 'utf-8');
  const pdfBuffer = Buffer.from(await pdf.arrayBuffer());

  const uploadedBy = process.env.NAZRE_ADMIN_EMAIL ?? 'nazre20@gmail.com';

  const create = await createFacturaRecibida({
    xmlContent:  xmlText,
    uploadedBy,
    categoriaGasto,
    deducible,
    notas,
  });
  if (!create.ok) {
    const status = create.code === 'xml_invalido' ? 400 : 500;
    return NextResponse.json({ error: create.message, code: create.code }, { status });
  }

  const upload = await uploadRecibidaFiles({
    facturaId:  create.factura.id,
    xmlContent: xmlBuffer,
    pdfContent: pdfBuffer,
  });
  if (!upload.ok) {
    return NextResponse.json({ error: upload.message, code: upload.code }, { status: 500 });
  }

  return NextResponse.json({ factura: create.factura, xmlPath: upload.xmlPath, pdfPath: upload.pdfPath });
}
