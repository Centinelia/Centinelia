export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

// Descarga en un ZIP todos los CFDIs (XML + PDF) del año solicitado.
// Cumple con la obligación fiscal SAT de retención 5 años sin depender
// del PAC (SF purga tras 60-90 días típicamente).
//
// GET /api/portal/[token]/factura-requests/download-year?year=2026

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value;
  const session = cookie ? await verifySession(cookie) : null;
  if (!session?.portalEmail) return NextResponse.json({ error: 'session missing' }, { status: 401 });

  const { token } = await ctx.params;
  const agent = await getPrimaryAgentFromToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.portalEmail !== agent.portal_email) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const yearParam = req.nextUrl.searchParams.get('year');
  const year = yearParam ? Number.parseInt(yearParam, 10) : new Date().getFullYear();
  const currentYear = new Date().getFullYear();
  if (!Number.isFinite(year) || year < 2020 || year > currentYear) {
    return NextResponse.json({ error: 'year fuera de rango' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Todas las agent_ids del org (org-scoped IDOR pattern)
  const { data: siblings } = await supabase
    .from('voice_agents').select('id').eq('portal_email', agent.portal_email);
  const agentIds = (siblings ?? []).map(s => s.id);
  if (agentIds.length === 0) return NextResponse.json({ error: 'no agents' }, { status: 404 });

  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString();
  const to   = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0)).toISOString();

  const { data: facturas } = await supabase
    .from('factura_requests')
    .select('id, uuid, fecha_timbrado, xml_storage_path, pdf_storage_path, cliente_rfc')
    .in('agent_id', agentIds)
    .eq('status', 'stamped')
    .gte('fecha_timbrado', from)
    .lt('fecha_timbrado', to)
    .order('fecha_timbrado', { ascending: true });

  const rows = (facturas ?? []).filter(f => f.uuid && f.xml_storage_path);
  if (rows.length === 0) {
    return NextResponse.json({ error: `Sin CFDIs stamped en ${year}` }, { status: 404 });
  }

  const zip = new JSZip();
  let addedXml = 0;
  let addedPdf = 0;
  let failed   = 0;

  for (const f of rows) {
    const dateStr = f.fecha_timbrado ? f.fecha_timbrado.slice(0, 10) : year.toString();
    const rfc     = (f.cliente_rfc ?? 'sin-rfc').toString().toUpperCase();
    const short   = f.uuid!.slice(-8);
    const base    = `${dateStr}_${rfc}_${short}`;

    try {
      const [xmlRes, pdfRes] = await Promise.all([
        supabase.storage.from('cfdi').download(f.xml_storage_path!),
        f.pdf_storage_path
          ? supabase.storage.from('cfdi').download(f.pdf_storage_path)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (xmlRes.data) {
        zip.file(`XML/${base}.xml`, Buffer.from(await xmlRes.data.arrayBuffer()));
        addedXml++;
      } else {
        failed++;
        continue;
      }
      if (pdfRes.data) {
        zip.file(`PDF/${base}.pdf`, Buffer.from(await pdfRes.data.arrayBuffer()));
        addedPdf++;
      }
    } catch (err) {
      console.error('[download-year] blob fetch failed', f.id, err);
      failed++;
    }
  }

  // Manifest CSV para trazabilidad
  const manifestLines = ['fecha,uuid,cliente_rfc,archivo_xml,archivo_pdf'];
  for (const f of rows) {
    const dateStr = f.fecha_timbrado ? f.fecha_timbrado.slice(0, 10) : '';
    const rfc     = (f.cliente_rfc ?? '').toString();
    const short   = f.uuid!.slice(-8);
    const base    = `${dateStr}_${(rfc || 'sin-rfc').toUpperCase()}_${short}`;
    manifestLines.push(`${dateStr},${f.uuid},${rfc},XML/${base}.xml,PDF/${base}.pdf`);
  }
  zip.file('manifest.csv', manifestLines.join('\n'));
  zip.file('README.txt',
    `Backup CFDI ${year} — ${agent.portal_email}\n` +
    `Total facturas: ${rows.length}\n` +
    `XML incluidos: ${addedXml}\n` +
    `PDF incluidos: ${addedPdf}\n` +
    `Errores de descarga: ${failed}\n\n` +
    `Guardado local requerido: SAT exige retención de 5 años (Art. 30 CFF).\n` +
    `Este ZIP satisface esa obligación. Guárdalo en almacenamiento seguro.\n`
  );

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });

  // Best-effort audit
  void supabase.from('admin_access_log').insert({
    admin_email:           session.portalEmail,
    endpoint:              '/api/portal/[token]/factura-requests/download-year',
    method:                'GET',
    affected_portal_email: agent.portal_email,
    query_type:            'export_csv',
    filters:               { year, count: rows.length, xml: addedXml, pdf: addedPdf, failed },
  });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="cfdi-${year}-${agent.portal_email}.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
