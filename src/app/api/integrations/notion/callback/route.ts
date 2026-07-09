import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state'); // portal_token
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&notion=error`);
  }

  // Exchange code for access token
  const clientId     = process.env.NOTION_CLIENT_ID!;
  const clientSecret = process.env.NOTION_CLIENT_SECRET!;
  const redirectUri  = process.env.NOTION_REDIRECT_URI!;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res   = await fetch('https://api.notion.com/v1/oauth/token', {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type:   'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&notion=error`);
  }

  const data = await res.json();
  const { access_token, workspace_id, workspace_name } = data;

  // Store token for all agents in this account
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', state).single();
  if (!agent?.portal_email) {
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&notion=error`);
  }

  await supabase.from('voice_agents').update({
    notion_access_token:  access_token,
    notion_workspace_id:  workspace_id,
    notion_workspace_name: workspace_name,
    notion_db_id:         null, // clear existing DB so user picks a new page
  }).eq('portal_email', agent.portal_email);

  return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&notion=connected`);
}
