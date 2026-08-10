import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { refreshHeaders } from '@/lib/services/sheets';
import { rateLimit, limiters } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string; id: string }> }

// POST /api/portal/[token]/sheets-mappings/[id]/refresh-headers
// Re-reads the first row of the mapped spreadsheet tab and updates stored headers.
export async function POST(req: NextRequest, { params }: Params) {
  const rl = await rateLimit(req, limiters.scrape);
  if (rl) return rl;

  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token, id } = await params;
  const sb = createAdminClient();

  // Verify the URL token belongs to the session's org
  const agent = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', sb);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const portalEmail = auth.portalEmail || agent.portal_email;
  if (!portalEmail) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // IDOR: explicit two-step verify — fetch mapping, then compare portal_email before calling refreshHeaders
  const { data: mapping } = await sb
    .from('sheets_mappings')
    .select('id, portal_email')
    .eq('id', id)
    .single();

  if (!mapping) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (mapping.portal_email !== portalEmail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const result = await refreshHeaders(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, detail: result.detail }, { status: 500 });
  }

  return NextResponse.json({ headers: result.data.headers });
}
