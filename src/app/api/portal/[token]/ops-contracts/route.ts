import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

async function getAgentIds(supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, portalEmail: string | null) {
  if (!portalEmail) return [];
  const { data } = await supabase.from('voice_agents').select('id').eq('portal_email', portalEmail);
  return (data ?? []).map(a => a.id as string);
}

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);

  const { data: contracts } = await supabase
    .from('ops_contracts')
    .select('*')
    .in('agent_id', agentIds)
    .order('expiry_date', { ascending: true });

  return NextResponse.json({ contracts: contracts ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);
  const targetId = body.agent_id ?? acct.id;
  if (!agentIds.includes(targetId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name, contract_type, counterparty, expiry_date, alert_days_before, notes } = body;
  if (!name || !expiry_date) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

  const { data: contract, error } = await supabase
    .from('ops_contracts')
    .insert({
      agent_id:          targetId,
      name,
      contract_type:     contract_type ?? 'contrato',
      counterparty:      counterparty ?? null,
      expiry_date,
      alert_days_before: alert_days_before ?? [30, 7, 1],
      notes:             notes ?? null,
      status:            'activo',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: contract.id });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);

  const allowed = ['name', 'contract_type', 'counterparty', 'expiry_date', 'alert_days_before', 'notes', 'status', 'renewal_draft'];
  const update  = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { error } = await supabase
    .from('ops_contracts')
    .update(update)
    .eq('id', body.id)
    .in('agent_id', agentIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const { id }    = await req.json();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);
  await supabase.from('ops_contracts').delete().eq('id', id).in('agent_id', agentIds);

  return NextResponse.json({ ok: true });
}
