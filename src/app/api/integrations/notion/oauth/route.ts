import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  // Verify the portal token exists (acepta org token o legacy voice_agents.portal_token)
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const clientId    = process.env.NOTION_CLIENT_ID!;
  const redirectUri = process.env.NOTION_REDIRECT_URI!;

  const url = new URL('https://api.notion.com/v1/oauth/authorize');
  url.searchParams.set('client_id',     clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('owner',         'user');
  url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('state',         token);

  return NextResponse.redirect(url.toString());
}
