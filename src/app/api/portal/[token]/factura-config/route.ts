import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { updateOrgFeatureConfig } from '@/lib/portal/features';

interface Params { params: Promise<{ token: string }> }

export interface FacturaConfig {
  rfc?:              string;
  direccion?:        string;
  condiciones_pago?: string;
  folio_prefix?:     string;
  incluir_iva?:      boolean;
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

  const config = ((agent.features as Record<string, unknown>)?.factura_config ?? {}) as FacturaConfig;
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const body      = await req.json() as FacturaConfig;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; features: Record<string, unknown> | null; portal_email: string | null }>(token, 'id, features, portal_email', supabase);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Propagar a TODOS los meerkats del org (config compartida, no per-agent).
  // Ver [[handoff-peer-discrimination-fix]] audit 2026-08-18.
  const result = await updateOrgFeatureConfig(
    supabase, agent.portal_email, agent.id, 'factura_config', body as Record<string, unknown>,
  );
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true });
}
