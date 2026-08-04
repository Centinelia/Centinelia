export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

interface BriefConfig {
  enabled:  boolean;
  hour:     number;
  channels: { email: boolean; whatsapp: boolean; portal: boolean };
}

// GET /api/portal/[token]/brief-config?agent_id=<uuid>
// Returns { config: BriefConfig | null }
// IDOR: verifica que agent_id pertenece al portal_email de la sesión
// Nox guard: solo permite meerkat_role_id === 'nox'
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;

  // Auth via session cookie (mismo patrón que org/route.ts)
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const agentId = new URL(req.url).searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'missing_agent_id' }, { status: 400 });

  const supabase = createAdminClient();

  // IDOR: leer agent y verificar pertenencia en una sola query
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, brief_del_dia_config, features')
    .eq('id', agentId)
    .maybeSingle();

  if (!agent || agent.portal_email !== session.portalEmail) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Nox guard: solo Nox puede tener brief del día
  const meerkatId = (agent.features as { meerkat_role_id?: string } | null)?.meerkat_role_id;
  if (meerkatId !== 'nox') {
    return NextResponse.json({ error: 'not_nox' }, { status: 400 });
  }

  return NextResponse.json({ config: (agent as any).brief_del_dia_config ?? null });
}

// PATCH /api/portal/[token]/brief-config?agent_id=<uuid>
// Body: { config: BriefConfig | null }  — null desactiva completamente
// IDOR: misma verificación que GET
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const agentId = new URL(req.url).searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'missing_agent_id' }, { status: 400 });

  // Validar shape del body antes de tocar DB
  const body   = await req.json();
  const config = body.config as BriefConfig | null;

  if (config !== null) {
    if (
      typeof config.enabled !== 'boolean' ||
      typeof config.hour !== 'number' ||
      config.hour < 0 ||
      config.hour > 23 ||
      !config.channels ||
      typeof config.channels.email !== 'boolean' ||
      typeof config.channels.whatsapp !== 'boolean' ||
      typeof config.channels.portal !== 'boolean'
    ) {
      return NextResponse.json({ error: 'invalid_config' }, { status: 400 });
    }
  }

  const supabase = createAdminClient();

  // IDOR: verificar pertenencia antes de escribir
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, features')
    .eq('id', agentId)
    .maybeSingle();

  if (!agent || agent.portal_email !== session.portalEmail) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Nox guard
  const meerkatId = (agent.features as { meerkat_role_id?: string } | null)?.meerkat_role_id;
  if (meerkatId !== 'nox') {
    return NextResponse.json({ error: 'not_nox' }, { status: 400 });
  }

  await supabase
    .from('voice_agents')
    .update({ brief_del_dia_config: config })
    .eq('id', agentId);

  return NextResponse.json({ ok: true, config });
}
