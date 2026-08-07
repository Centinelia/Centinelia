import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token }      = await params;
  const { searchParams } = req.nextUrl;

  const code    = searchParams.get('code');
  const realmId = searchParams.get('realmId');
  const error   = searchParams.get('error');

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const to = (extra: string) => `${appUrl}/portal/${token}?tab=negocio&${extra}#integraciones`;

  if (error || !code || !realmId) {
    return NextResponse.redirect(to('error=qb_denied'));
  }

  const clientId     = process.env.INTUIT_CLIENT_ID!;
  const clientSecret = process.env.INTUIT_CLIENT_SECRET!;
  const redirectUri  = `${appUrl}/api/portal/${token}/qb-oauth/callback`;
  const creds        = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type':  'application/x-www-form-urlencoded',
      'Accept':        'application/json',
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    console.error('QB token exchange failed', await tokenRes.text());
    return NextResponse.redirect(to('error=qb_token'));
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json();
  const expiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString();

  // Fetch company name
  const apiBase    = process.env.INTUIT_SANDBOX === '1'
    ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
    : `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
  let companyName: string | null = null;

  try {
    const infoRes = await fetch(`${apiBase}/companyinfo/${realmId}?minorversion=65`, {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' },
    });
    if (infoRes.ok) {
      const d = await infoRes.json();
      companyName = d?.CompanyInfo?.CompanyName ?? null;
    }
  } catch { /* ignore */ }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();

  if (!agent?.portal_email) {
    return NextResponse.redirect(to('error=qb_agent'));
  }

  await supabase
    .from('qb_integrations')
    .upsert({
      portal_email:     agent.portal_email,
      realm_id:         realmId,
      access_token,
      refresh_token,
      token_expires_at: expiresAt,
      company_name:     companyName,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'portal_email' });

  return NextResponse.redirect(to('success=qb'));
}
