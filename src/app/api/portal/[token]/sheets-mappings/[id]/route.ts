import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshHeaders } from '@/lib/services/sheets';
import { rateLimit, limiters } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string; id: string }> }

/**
 * Resolves the portal_email for the given [token] and verifies session ownership.
 * Returns { portalEmail } on success, or a NextResponse error to return early.
 */
async function resolveOrg(
  req: NextRequest,
  token: string,
): Promise<{ portalEmail: string } | NextResponse> {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = createAdminClient();
  const { data: agent } = await sb
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // IDOR: verify the session's org matches the token's org
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const portalEmail = auth.portalEmail || agent.portal_email;
  if (!portalEmail) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  return { portalEmail };
}

/**
 * Verifies that a mapping with the given id belongs to the given org.
 * Two-step IDOR: fetch first, then compare — so we can return 404 vs 403 correctly.
 * Returns the mapping row on success, or a NextResponse error to return early.
 */
async function verifyOwnership(
  mappingId: string,
  portalEmail: string,
): Promise<{ id: string; portal_email: string } | NextResponse> {
  const sb = createAdminClient();
  const { data: mapping } = await sb
    .from('sheets_mappings')
    .select('id, portal_email')
    .eq('id', mappingId)
    .single();

  // Row not found at all
  if (!mapping) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Row exists but belongs to a different org — still return 404 (no info leak)
  if (mapping.portal_email !== portalEmail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return mapping as { id: string; portal_email: string };
}

// GET /api/portal/[token]/sheets-mappings/[id]
// Returns a single mapping by id.
export async function GET(req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const org = await resolveOrg(req, token);
  if (org instanceof NextResponse) return org;

  const owned = await verifyOwnership(id, org.portalEmail);
  if (owned instanceof NextResponse) return owned;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from('sheets_mappings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mapping: data });
}

// PATCH /api/portal/[token]/sheets-mappings/[id]
// Updates spreadsheet_id, tab_name, or custom_purpose_label of an existing mapping.
export async function PATCH(req: NextRequest, { params }: Params) {
  const rl = await rateLimit(req, limiters.scrape);
  if (rl) return rl;

  const { token, id } = await params;
  const org = await resolveOrg(req, token);
  if (org instanceof NextResponse) return org;

  // IDOR: explicit two-step verify before writing
  const owned = await verifyOwnership(id, org.portalEmail);
  if (owned instanceof NextResponse) return owned;

  const body = await req.json() as Record<string, unknown>;
  const ALLOWED = ['spreadsheet_id', 'tab_name', 'custom_purpose_label'] as const;
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key] ?? null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no_fields_to_update' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  // M-2: if tab_name is changing, invalidate the cached headers so appendRow
  // does not use stale column order from the old tab.
  let shouldRefreshHeaders = false;
  if ('tab_name' in body && typeof body.tab_name === 'string') {
    const sb0 = createAdminClient();
    const { data: current } = await sb0
      .from('sheets_mappings')
      .select('tab_name')
      .eq('id', id)
      .single();
    if (current && current.tab_name !== body.tab_name) {
      patch.headers = [];
      patch.headers_synced_at = new Date().toISOString();
      shouldRefreshHeaders = true;
    }
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from('sheets_mappings')
    .update(patch)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire header re-sync in the background (same pattern as POST)
  if (shouldRefreshHeaders) void refreshHeaders(id);

  return NextResponse.json({ ok: true });
}

// DELETE /api/portal/[token]/sheets-mappings/[id]
// Deletes a mapping. Verifies ownership before deletion (IDOR-safe).
export async function DELETE(req: NextRequest, { params }: Params) {
  const rl = await rateLimit(req, limiters.scrape);
  if (rl) return rl;

  const { token, id } = await params;
  const org = await resolveOrg(req, token);
  if (org instanceof NextResponse) return org;

  // IDOR: explicit two-step verify before deleting
  const owned = await verifyOwnership(id, org.portalEmail);
  if (owned instanceof NextResponse) return owned;

  const sb = createAdminClient();
  const { error } = await sb
    .from('sheets_mappings')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
