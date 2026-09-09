/**
 * GET /api/portal/[token]/billing/pendientes
 * Lista de notitas pendientes de revisión humana (Nala no pudo auto-timbrar).
 *
 * POST /api/portal/[token]/billing/pendientes/[id]
 * body: { action: 'approve' | 'reject' | 'edit', corrections?: {...} }
 * — approve: mueve a status='approved', re-encola el email para que Nala reintente
 * — reject: status='rejected', no timbra
 * — edit: guarda corrections y status='edited_approved', re-encola
 *
 * Auth: portal session (verifySession + org ownership).
 * Ver dry run FASE 4 (2026-09-07) UX fix.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

async function guard(token: string) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (session.portalEmail !== resolved.portalEmail) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session, resolved };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const g = await guard(token);
  if ('error' in g) return g.error;

  const supabase = createAdminClient();
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status') ?? 'pending';

  const { data, error } = await supabase
    .from('billing_pending_review')
    .select(`
      id, email_id, image_index, remision_index, reason, extracted, candidates, status,
      folio, cliente_texto, rfc_matched, total, fecha, productos,
      corrections, resolved_at, resolved_by, created_at,
      email:billing_incoming_emails ( from_address, subject, received_at, attachments_meta )
    `)
    .eq('portal_email', g.resolved.portalEmail)
    .eq('status', statusFilter)
    .order('created_at', { ascending: false })
    .order('remision_index', { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enriquecer con signed URLs de los adjuntos desde Storage (60min).
  // Para vision path: image_url + image_filename (foto de la nota).
  // Para excel path: source_url + source_filename (xlsx que Beatriz mandó).
  const items = await Promise.all((data ?? []).map(async (row) => {
    const emailRow = row.email as { attachments_meta?: Array<{ storageKey?: string; filename?: string; index?: number; contentType?: string }> } | null;
    const metas = Array.isArray(emailRow?.attachments_meta) ? emailRow.attachments_meta : [];

    // Foto de la nota (vision path): image_index apunta a la remisión específica.
    const imageMeta = row.image_index !== null && row.image_index !== undefined
      ? metas.find(m => m.index === row.image_index) ?? null
      : null;
    let imageUrl: string | null = null;
    if (imageMeta?.storageKey) {
      const { data: sig } = await supabase.storage
        .from('billing-attachments')
        .createSignedUrl(imageMeta.storageKey, 60 * 60);
      imageUrl = sig?.signedUrl ?? null;
    }

    // Excel path: cualquier xlsx/xls en el correo (puede haber varios).
    const isExcel = (m: { filename?: string; contentType?: string }) =>
      (m.contentType ?? '').toLowerCase().includes('spreadsheet') ||
      (m.contentType ?? '').toLowerCase().includes('ms-excel') ||
      (m.filename ?? '').toLowerCase().endsWith('.xlsx') ||
      (m.filename ?? '').toLowerCase().endsWith('.xls');
    const excelMetas = metas.filter(isExcel);
    const excelSources = await Promise.all(excelMetas.map(async (m) => {
      if (!m.storageKey) return null;
      const { data: sig } = await supabase.storage
        .from('billing-attachments')
        .createSignedUrl(m.storageKey, 60 * 60);
      if (!sig?.signedUrl) return null;
      return { filename: m.filename ?? 'archivo.xlsx', url: sig.signedUrl };
    }));

    return {
      ...row,
      image_url:      imageUrl,
      image_filename: imageMeta?.filename ?? null,
      source_files:   excelSources.filter((s): s is { filename: string; url: string } => s !== null),
    };
  }));

  return NextResponse.json({ items });
}
