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
      id, email_id, image_index, reason, extracted, candidates, status,
      corrections, resolved_at, resolved_by, created_at,
      email:billing_incoming_emails ( from_address, subject, received_at, attachments_meta )
    `)
    .eq('portal_email', g.resolved.portalEmail)
    .eq('status', statusFilter)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enriquecer con signed URLs de las imágenes desde Storage (60min).
  const items = await Promise.all((data ?? []).map(async (row) => {
    const emailRow = row.email as { attachments_meta?: Array<{ storageKey?: string; filename?: string; index?: number }> } | null;
    const metas = Array.isArray(emailRow?.attachments_meta) ? emailRow.attachments_meta : [];
    const targetMeta = row.image_index !== null && row.image_index !== undefined
      ? metas.find(m => m.index === row.image_index) ?? metas[0]
      : metas[0];
    let signedUrl: string | null = null;
    if (targetMeta?.storageKey) {
      const { data: sig } = await supabase.storage
        .from('billing-attachments')
        .createSignedUrl(targetMeta.storageKey, 60 * 60);
      signedUrl = sig?.signedUrl ?? null;
    }
    return {
      ...row,
      image_url:      signedUrl,
      image_filename: targetMeta?.filename ?? null,
    };
  }));

  return NextResponse.json({ items });
}
