import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

export interface OrdenConfig {
  condiciones_pago?:  string;
  terminos_entrega?:  string;
  folio_prefix?:      string;
  incluir_iva?:       boolean;
  template_path?:     string;
  template_name?:     string;
  template_ext?:      string;
}

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ features: Record<string, unknown> | null; portal_email: string | null }>(token, 'features, portal_email', supabase);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const config = ((agent.features as Record<string, unknown>)?.orden_config ?? {}) as OrdenConfig;
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const body      = await req.json() as OrdenConfig;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; features: Record<string, unknown> | null; portal_email: string | null }>(token, 'id, features, portal_email', supabase);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const existing = (agent.features as Record<string, unknown>) ?? {};
  const merged   = { ...existing, orden_config: { ...(existing.orden_config as object ?? {}), ...body } };

  const { error } = await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
