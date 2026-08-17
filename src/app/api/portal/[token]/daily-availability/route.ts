import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { validateDailyAvailability } from '@/lib/daily-availability';
import { getOrgIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';
import { resyncPeerAgents } from '@/lib/vapi/sync';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

async function resolvePortalEmail(token: string, cookieValue: string): Promise<string | null> {
  const auth = await verifySession(cookieValue);
  if (!auth) return null;
  const supabase = createAdminClient();
  const data = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', supabase);
  if (!data?.portal_email) return null;
  if (auth.portalEmail && auth.portalEmail !== data.portal_email) return null;
  return data.portal_email as string;
}

// GET /api/portal/[token]/daily-availability
// Returns { ok: true, industry: Industry | null, data: DailyAvailability | null }
// Never 4xx when industry doesn't qualify — returns industry: null so UI self-hides.
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const portalEmail = await resolvePortalEmail(token, cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!portalEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('industry, daily_availability')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  const industry = getOrgIndustry(org as { industry?: string | null } | null);
  if (!industry || !INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry)) {
    return NextResponse.json({ ok: true, industry: null, data: null });
  }

  return NextResponse.json({ ok: true, industry, data: (org as any)?.daily_availability ?? null });
}

// PUT /api/portal/[token]/daily-availability
// Body: { unavailable: string[], limited: string[], special: string | null, notes: string | null }
// 400 if industry doesn't qualify.
export async function PUT(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const portalEmail = await resolvePortalEmail(token, cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!portalEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('industry')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  const industry = getOrgIndustry(org as { industry?: string | null } | null);
  if (!industry || !INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry)) {
    return NextResponse.json({ ok: false, error: 'industria no soporta disponibilidad diaria' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  let snapshot;
  try {
    snapshot = validateDailyAvailability({
      updated_at:  new Date().toISOString(),
      updated_by:  `portal:${portalEmail}`,
      unavailable: body.unavailable ?? [],
      limited:     body.limited     ?? [],
      special:     body.special     ?? null,
      notes:       body.notes       ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'datos invalidos';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const { error } = await supabase
    .from('organizations')
    .update({ daily_availability: snapshot })
    .eq('portal_email', portalEmail);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Vapi caches the system prompt per assistant. Availability lives in the prompt
  // (injected by prompt-builder), so a change here doesn't reach voice until we
  // resync. Fire-and-forget across every voice agent in the org: the empty exclude
  // id means no agent is skipped. Non-voice roles are filtered inside.
  resyncPeerAgents(portalEmail, '').catch(err => {
    console.error('daily-availability: Vapi resync failed', err);
  });

  return NextResponse.json({ ok: true, data: snapshot });
}
