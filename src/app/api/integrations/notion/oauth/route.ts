import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  // Verify the portal token exists
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('id').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

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
