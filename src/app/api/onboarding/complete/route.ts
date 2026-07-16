import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    token:               string;
    organization_mission: string;
    service_definition:  string;
    speech_style:        'tu' | 'usted';
  };
  const { token, organization_mission, service_definition, speech_style } = body;

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  // Verify session owns this agent
  const cookieStore   = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_COOKIE)?.value ?? '';
  const session       = await verifySession(sessionCookie);

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Save alignment data and mark onboarding complete on all agents of this account
  const { error } = await supabase
    .from('voice_agents')
    .update({
      organization_mission,
      service_definition,
      speech_style,
      onboarding_completed: true,
    })
    .eq('portal_email', agent.portal_email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
