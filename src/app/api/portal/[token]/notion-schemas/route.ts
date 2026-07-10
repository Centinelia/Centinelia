import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { validateAgentDbs } from '@/lib/ops/notion-validator';

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

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);

  const { data: schemas } = await supabase
    .from('notion_db_schemas')
    .select('*')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: true });

  return NextResponse.json({ schemas: schemas ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);
  const targetId = body.agent_id ?? acct.id;
  if (!agentIds.includes(targetId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { db_name, notion_db_id, db_type, required_props, allowed_values, description } = body;
  if (!db_name || !notion_db_id) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

  const { data: schema, error } = await supabase
    .from('notion_db_schemas')
    .insert({
      agent_id:       targetId,
      db_name,
      notion_db_id:   notion_db_id.replace(/-/g, '').trim(),
      db_type:        db_type ?? 'read',
      required_props: required_props ?? [],
      allowed_values: allowed_values ?? {},
      description:    description ?? null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: schema.id });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);

  // Trigger manual validation
  if (body.action === 'validate') {
    const schemas = await supabase
      .from('notion_db_schemas')
      .select('agent_id')
      .eq('id', body.id)
      .in('agent_id', agentIds)
      .single();

    if (!schemas.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const results = await validateAgentDbs(schemas.data.agent_id as string);
    return NextResponse.json({ ok: true, results });
  }

  const allowed = ['db_name', 'db_type', 'required_props', 'allowed_values', 'description', 'active'];
  const update  = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { error } = await supabase
    .from('notion_db_schemas')
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

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);
  await supabase.from('notion_db_schemas').delete().eq('id', id).in('agent_id', agentIds);

  return NextResponse.json({ ok: true });
}
