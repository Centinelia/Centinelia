import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { getSheetsClient } from '@/lib/connectors/sheets-client';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string; spreadsheetId: string }> }

// GET /api/portal/[token]/sheets/spreadsheets/[spreadsheetId]/tabs
// Lists all sheet tab titles for the given spreadsheet.
// Requires that the org has a connected Gmail/Google integration.
export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token, spreadsheetId } = await params;
  const sb = createAdminClient();

  // Verify the URL token belongs to the session's org
  const agent = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', sb);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const portalEmail = auth.portalEmail || agent.portal_email;
  if (!portalEmail) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    // getSheetsClient(orgId) — orgId is portal_email in this codebase
    const client = await getSheetsClient(portalEmail);
    const res = await client.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    });

    const tabs = (res.data.sheets ?? [])
      .map(s => s.properties?.title)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);

    return NextResponse.json({ tabs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'sheets_no_conectado') {
      return NextResponse.json({ error: 'google_no_conectado' }, { status: 400 });
    }
    return NextResponse.json({ error: 'sheets_api_error', detail: msg }, { status: 500 });
  }
}
