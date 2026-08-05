import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto';
import { google } from 'googleapis';
import { rateLimit, limiters } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

// GET /api/portal/[token]/sheets/spreadsheets
// Lists all Google Spreadsheets accessible via the org's connected Google account.
// Requires that the org has a connected Gmail/Google integration in integration_accounts.
export async function GET(req: NextRequest, { params }: Params) {
  const rl = await rateLimit(req, limiters.scrape);
  if (rl) return rl;

  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token } = await params;
  const sb = createAdminClient();

  // Verify the URL token belongs to the session's org
  const { data: agent } = await sb
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const portalEmail = auth.portalEmail || agent.portal_email;
  if (!portalEmail) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Fetch Google integration tokens from integration_accounts
  const { data: account } = await sb
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, status')
    .eq('portal_email', portalEmail)
    .eq('provider', 'gmail')
    .neq('status', 'disconnected')
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: 'google_no_conectado' }, { status: 400 });
  }

  const accessToken  = account.access_token  ? decrypt(account.access_token  as string) : '';
  const refreshToken = account.refresh_token ? decrypt(account.refresh_token as string) : null;

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token:  accessToken  || undefined,
    refresh_token: refreshToken || undefined,
  });

  try {
    const drive = google.drive({ version: 'v3', auth: oauth2 });
    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      pageSize: 100,
      fields: 'files(id,name)',
      orderBy: 'modifiedTime desc',
    });

    return NextResponse.json({ spreadsheets: res.data.files ?? [] });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'drive_api_error', detail }, { status: 500 });
  }
}
