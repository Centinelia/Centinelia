import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/org-token';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value;
  const session = cookie ? await verifySession(cookie) : null;
  if (!session?.portalEmail) return NextResponse.json({ error: 'session missing' }, { status: 401 });

  const { token } = await ctx.params;
  const agent = await getAgentByToken<{ portal_email: string }>(token, 'portal_email');
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // IDOR guard
  if (session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const { data } = await supabase.from('organizations')
    .select(`
      invoicing_provider, invoicing_rfc_emisor, invoicing_razon_social,
      invoicing_regimen_fiscal, invoicing_lugar_expedicion,
      invoicing_test_mode, invoicing_allow_agent_cancellation,
      invoicing_csd_version, invoicing_csd_expires_at, invoicing_csd_no_certificado,
      invoicing_limits
    `)
    .eq('portal_email', agent.portal_email)
    .single();

  return NextResponse.json({
    connected:                          !!data?.invoicing_provider,
    invoicing_provider:                 data?.invoicing_provider ?? null,
    invoicing_rfc_emisor:               data?.invoicing_rfc_emisor ?? null,
    invoicing_razon_social:             data?.invoicing_razon_social ?? null,
    invoicing_regimen_fiscal:           data?.invoicing_regimen_fiscal ?? null,
    invoicing_lugar_expedicion:         data?.invoicing_lugar_expedicion ?? null,
    invoicing_test_mode:                data?.invoicing_test_mode ?? true,
    invoicing_allow_agent_cancellation: !!data?.invoicing_allow_agent_cancellation,
    invoicing_csd_version:              data?.invoicing_csd_version ?? 0,
    invoicing_csd_expires_at:           data?.invoicing_csd_expires_at ?? null,
    invoicing_csd_no_certificado:       data?.invoicing_csd_no_certificado ?? null,
    invoicing_limits:                   data?.invoicing_limits ?? null,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value;
  const session = cookie ? await verifySession(cookie) : null;
  if (!session?.portalEmail) return NextResponse.json({ error: 'session missing' }, { status: 401 });

  const { token } = await ctx.params;
  const agent = await getAgentByToken<{ portal_email: string }>(token, 'portal_email');
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // IDOR guard
  if (session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof body.test_mode === 'boolean') patch.invoicing_test_mode = body.test_mode;
  if (typeof body.allow_agent_cancellation === 'boolean') patch.invoicing_allow_agent_cancellation = body.allow_agent_cancellation;

  if (body.limits && typeof body.limits === 'object') {
    const l = body.limits as Record<string, unknown>;
    const limits: Record<string, unknown> = {};
    if (typeof l.monto_max_mxn === 'number' && l.monto_max_mxn > 0) limits.monto_max_mxn = l.monto_max_mxn;
    if (Array.isArray(l.blocked_uso_cfdi)) limits.blocked_uso_cfdi = l.blocked_uso_cfdi.filter(x => typeof x === 'string');
    if (typeof l.max_stamps_per_day === 'number' && l.max_stamps_per_day > 0) limits.max_stamps_per_day = l.max_stamps_per_day;
    if (typeof l.max_stamps_per_hour_per_rfc === 'number' && l.max_stamps_per_hour_per_rfc > 0) limits.max_stamps_per_hour_per_rfc = l.max_stamps_per_hour_per_rfc;
    patch.invoicing_limits = limits;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('organizations').update(patch).eq('portal_email', agent.portal_email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log — best-effort
  void supabase.from('admin_access_log').insert({
    admin_email:           session.portalEmail,
    endpoint:              '/api/portal/[token]/invoicing/config',
    method:                'PATCH',
    affected_portal_email: agent.portal_email,
    query_type:            'modify',
    filters:               patch,
  });

  return NextResponse.json({ ok: true });
}
