import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const agent = await getAgentByToken<{ portal_email: string }>(token, 'portal_email');
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data } = await supabase.from('organizations')
    .select('invoicing_provider, invoicing_rfc_emisor, invoicing_razon_social')
    .eq('portal_email', agent.portal_email)
    .single();

  return NextResponse.json({
    connected:      !!data?.invoicing_provider,
    rfc_emisor:     data?.invoicing_rfc_emisor ?? null,
    razon_social:   data?.invoicing_razon_social ?? null,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const agent = await getAgentByToken<{ portal_email: string }>(token, 'portal_email');
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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
    admin_email:           agent.portal_email,
    endpoint:              '/api/portal/[token]/invoicing/config',
    method:                'PATCH',
    affected_portal_email: agent.portal_email,
    query_type:            'modify',
    filters:               patch,
  });

  return NextResponse.json({ ok: true });
}
