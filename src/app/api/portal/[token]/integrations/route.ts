import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

/**
 * Calendar (calendar_type, calendar_event_type_id, calendar_link,
 * calendar_api_key) es una integración ORG-LEVEL: vive en `organizations`,
 * compartida por todos los empleados de la cuenta. Antes vivía per-agent
 * en voice_agents (deuda técnica cerrada 2026-08-09).
 */
const CALENDAR_FIELDS = new Set(['calendar_type', 'calendar_api_key', 'calendar_event_type_id', 'calendar_link']);

export async function GET(_req: NextRequest, { params }: Params) {
  const { token }    = await params;
  const cookieStore  = await cookies();
  const session      = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (session.portalEmail && agent?.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: org } = agent?.portal_email
    ? await supabase
        .from('organizations')
        .select('calendar_type, calendar_event_type_id, calendar_link, calendar_api_key, google_review_url')
        .eq('portal_email', agent.portal_email)
        .maybeSingle()
    : { data: null };

  return NextResponse.json({
    calendar_type:            org?.calendar_type           ?? null,
    calendar_event_type_id:   org?.calendar_event_type_id  ?? '',
    calendar_link:            org?.calendar_link           ?? '',
    cal_api_configured:       !!(org?.calendar_api_key),
    google_review_url:        org?.google_review_url       ?? '',
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token }    = await params;
  const cookieStore  = await cookies();
  const session      = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const allowed = ['calendar_type', 'calendar_api_key', 'calendar_event_type_id', 'calendar_link', 'google_review_url'];

  const supabase = createAdminClient();
  const { data: ag } = await supabase.from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (session.portalEmail && ag?.portal_email && session.portalEmail !== ag.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (!ag?.portal_email) return NextResponse.json({ error: 'No portal_email' }, { status: 400 });

  const orgUpdate: Record<string, string | null> = { portal_email: ag.portal_email };
  let hasChanges = false;

  for (const key of allowed) {
    if (!(key in body)) continue;
    const val = body[key] || null;
    if (CALENDAR_FIELDS.has(key) || key === 'google_review_url') {
      orgUpdate[key] = val;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    await supabase
      .from('organizations')
      .upsert(orgUpdate, { onConflict: 'portal_email' });
  }

  return NextResponse.json({ ok: true });
}
