import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  // Include drafts from all agents in the same account
  const { data: allAgents } = await supabase
    .from('voice_agents').select('id').eq('portal_email', agent.portal_email);
  const agentIds = (allAgents ?? []).map(a => a.id);

  const { data: drafts } = await supabase
    .from('contract_drafts')
    .select('*')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false });

  return NextResponse.json({ drafts: drafts ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const body = await req.json() as {
    client_name?:  string;
    client_email?: string;
    client_rfc?:   string;
    client_phone?: string;
    clauses:       unknown[];
    notes?:        string;
    source_type?:  string;
    source_ref?:   string;
    agent_id?:     string; // can come from office agent
  };

  const { data, error } = await supabase.from('contract_drafts').insert({
    agent_id:     body.agent_id ?? agent.id,
    client_name:  body.client_name  ?? null,
    client_email: body.client_email ?? null,
    client_rfc:   body.client_rfc   ?? null,
    client_phone: body.client_phone ?? null,
    clauses:      body.clauses,
    notes:        body.notes        ?? null,
    source_type:  body.source_type  ?? 'manual',
    source_ref:   body.source_ref   ?? null,
    status:       'borrador',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft: data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const body = await req.json() as {
    id:            string;
    client_name?:  string;
    client_email?: string;
    client_rfc?:   string;
    client_phone?: string;
    clauses?:      unknown[];
    notes?:        string;
    status?:       string;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.client_name  !== undefined) updates.client_name  = body.client_name;
  if (body.client_email !== undefined) updates.client_email = body.client_email;
  if (body.client_rfc   !== undefined) updates.client_rfc   = body.client_rfc;
  if (body.client_phone !== undefined) updates.client_phone = body.client_phone;
  if (body.clauses      !== undefined) updates.clauses      = body.clauses;
  if (body.notes        !== undefined) updates.notes        = body.notes;
  if (body.status       !== undefined) updates.status       = body.status;

  const { error } = await supabase
    .from('contract_drafts').update(updates).eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { id } = await req.json() as { id: string };

  const { error } = await supabase
    .from('contract_drafts').update({ status: 'cancelado' }).eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
