import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

// Per-agent calendar fields (not org-level)
const CALENDAR_FIELDS = new Set(['calendar_type', 'calendar_api_key', 'calendar_event_type_id', 'calendar_link']);

export async function GET(_req: NextRequest, { params }: Params) {
  const { token }    = await params;
  const cookieStore  = await cookies();
  const session      = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email, calendar_type, calendar_event_type_id, calendar_link, calendar_api_key')
    .eq('portal_token', token)
    .single();
  if (session.portalEmail && agent?.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Calendar vive per-agent pero se comparte a nivel org: si el agente por
  // token no lo tiene, buscamos cualquier hermano que sí. Así todos los
  // empleados de la cuenta ven la misma integración.
  let source = agent;
  if (!source?.calendar_type && agent?.portal_email) {
    const { data: sibling } = await supabase
      .from('voice_agents')
      .select('portal_email, calendar_type, calendar_event_type_id, calendar_link, calendar_api_key')
      .eq('portal_email', agent.portal_email)
      .not('calendar_type', 'is', null)
      .limit(1)
      .maybeSingle();
    if (sibling) source = sibling;
  }

  // google_review_url is org-level — read from organizations
  const { data: org } = agent?.portal_email
    ? await supabase.from('organizations').select('google_review_url').eq('portal_email', agent.portal_email).single()
    : { data: null };

  return NextResponse.json({
    calendar_type:            source?.calendar_type           ?? null,
    calendar_event_type_id:   source?.calendar_event_type_id  ?? '',
    calendar_link:            source?.calendar_link            ?? '',
    cal_api_configured:       !!(source?.calendar_api_key),
    google_review_url:        org?.google_review_url          ?? '',
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token }    = await params;
  const cookieStore  = await cookies();
  const session      = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const allowed = ['calendar_type', 'calendar_api_key', 'calendar_event_type_id', 'calendar_link', 'google_review_url'];
  // IDOR: verify session owns this portal token before writing
  {
    const supabase = createAdminClient();
    const { data: ag } = await supabase.from('voice_agents').select('portal_email').eq('portal_token', token).single();
    if (session.portalEmail && ag?.portal_email && session.portalEmail !== ag.portal_email)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const calendarUpdate: Record<string, string | null> = {};
  let reviewUrl: string | null | undefined;

  for (const key of allowed) {
    if (!(key in body)) continue;
    const val = body[key] || null;
    if (CALENDAR_FIELDS.has(key)) {
      calendarUpdate[key] = val;
    } else if (key === 'google_review_url') {
      reviewUrl = val;
    }
  }

  const supabase = createAdminClient();

  if (Object.keys(calendarUpdate).length > 0) {
    await supabase.from('voice_agents').update(calendarUpdate).eq('portal_token', token);
  }

  if (reviewUrl !== undefined) {
    const { data: agent } = await supabase
      .from('voice_agents').select('portal_email').eq('portal_token', token).single();
    if (agent?.portal_email) {
      await supabase
        .from('organizations')
        .upsert({ portal_email: agent.portal_email, google_review_url: reviewUrl }, { onConflict: 'portal_email' });
    }
  }

  return NextResponse.json({ ok: true });
}
