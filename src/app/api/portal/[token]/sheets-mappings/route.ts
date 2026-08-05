import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshHeaders } from '@/lib/services/sheets';
import { rateLimit, limiters } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

const PURPOSES = ['clientes', 'leads', 'bitacoras', 'oc', 'cajas_chicas', 'custom'] as const;
type Purpose = typeof PURPOSES[number];

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

// GET /api/portal/[token]/sheets-mappings
// Returns all sheets_mappings for the org.
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const org = await resolveOrg(req, token);
  if (org instanceof NextResponse) return org;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from('sheets_mappings')
    .select('*')
    .eq('portal_email', org.portalEmail)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mappings: data ?? [] });
}

// POST /api/portal/[token]/sheets-mappings
// Creates a new sheets mapping and immediately refreshes its headers.
export async function POST(req: NextRequest, { params }: Params) {
  const rl = await rateLimit(req, limiters.scrape);
  if (rl) return rl;

  const { token } = await params;
  const org = await resolveOrg(req, token);
  if (org instanceof NextResponse) return org;

  const body = await req.json();
  const { purpose, custom_purpose_label, spreadsheet_id, tab_name } = body as {
    purpose?: string;
    custom_purpose_label?: string | null;
    spreadsheet_id?: string;
    tab_name?: string;
  };

  if (!purpose || !PURPOSES.includes(purpose as Purpose)) {
    return NextResponse.json({ error: 'invalid_purpose' }, { status: 400 });
  }
  if (purpose === 'custom' && !custom_purpose_label?.trim()) {
    return NextResponse.json({ error: 'custom_purpose_label_required' }, { status: 400 });
  }
  if (purpose !== 'custom' && custom_purpose_label) {
    return NextResponse.json({ error: 'custom_purpose_label_not_allowed' }, { status: 400 });
  }
  if (!spreadsheet_id?.trim() || !tab_name?.trim()) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from('sheets_mappings')
    .insert({
      portal_email:          org.portalEmail,
      purpose:               purpose as Purpose,
      custom_purpose_label:  purpose === 'custom' ? custom_purpose_label!.trim() : null,
      spreadsheet_id:        spreadsheet_id.trim(),
      tab_name:              tab_name.trim(),
      headers:               [],
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire header sync (best-effort — never throws)
  void refreshHeaders(data.id);

  return NextResponse.json({ id: data.id }, { status: 201 });
}
