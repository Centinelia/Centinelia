import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

async function resolvePortalEmail(token: string, cookieValue: string): Promise<string | null> {
  const auth = await verifySession(cookieValue);
  if (!auth) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!data?.portal_email) return null;
  if (auth.portalEmail && auth.portalEmail !== data.portal_email) return null;
  return data.portal_email as string;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const portalEmail = await resolvePortalEmail(token, cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!portalEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('organizations')
    .select('always_approve_delegations, auto_approve_task_plans, instant_processing_enabled')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  return NextResponse.json({
    always_approve_delegations: !!(data?.always_approve_delegations),
    auto_approve_task_plans:    !!(data?.auto_approve_task_plans),
    // Default true si no está seteado (nuevo campo, evita romper clientes existentes).
    instant_processing_enabled: data?.instant_processing_enabled !== false,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const portalEmail = await resolvePortalEmail(token, cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!portalEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    always_approve_delegations?: boolean;
    auto_approve_task_plans?:    boolean;
    instant_processing_enabled?: boolean;
  };
  const update: Record<string, unknown> = {};
  if (typeof body.always_approve_delegations === 'boolean') update.always_approve_delegations = body.always_approve_delegations;
  if (typeof body.auto_approve_task_plans === 'boolean')    update.auto_approve_task_plans    = body.auto_approve_task_plans;
  if (typeof body.instant_processing_enabled === 'boolean') update.instant_processing_enabled = body.instant_processing_enabled;
  // Precedence guard: si ambos están activos, quitamos auto_approve (always gana como modo supervisado).
  if (update.always_approve_delegations === true && update.auto_approve_task_plans === true) {
    update.auto_approve_task_plans = false;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('organizations').update(update).eq('portal_email', portalEmail);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Invalida el cache in-memory del gate para que la próxima consulta lea fresco.
  if (typeof body.instant_processing_enabled === 'boolean') {
    const { clearInstantProcessingCache } = await import('@/lib/ops/instant-processing');
    clearInstantProcessingCache(portalEmail);
  }

  return NextResponse.json({ ok: true, updated: update });
}
