import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

async function resolveAgent(token: string) {
  return getPrimaryAgentFromToken<{ id: string; portal_email: string | null; agent_name: string | null }>(token, 'id, portal_email, agent_name');
}

// GET — list documents for this agent (excludes expired)
export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const agent = await resolveAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Collect all agent IDs for the same account so stats are account-wide
  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id, agent_name').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id, agent_name: agent.agent_name }] };
  const siblingList = siblings ?? [{ id: agent.id, agent_name: agent.agent_name }];
  const agentIds    = siblingList.map(a => a.id as string);
  const agentNames  = Object.fromEntries(siblingList.map(a => [a.id, (a.agent_name as string | null) ?? null]));

  const { data: docs } = await supabase
    .from('ops_documents')
    .select('id, title, filename, template_type, agent_id, created_at, last_accessed_at, expires_at')
    .in('agent_id', agentIds)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  return NextResponse.json({
    documents: docs ?? [],
    agentNames,
  });
}

// PATCH — "Conservar": extend TTL 30 days without downloading
export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const agent = await resolveAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? [{ id: agent.id }]).map(a => a.id as string);

  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('ops_documents')
    .update({ expires_at: newExpiry })
    .eq('id', id)
    .in('agent_id', agentIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, expires_at: newExpiry });
}

// DELETE — remove a document and its storage object
export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const agent = await resolveAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? [{ id: agent.id }]).map(a => a.id as string);

  const { data: doc } = await supabase
    .from('ops_documents')
    .select('storage_path')
    .eq('id', id)
    .in('agent_id', agentIds)
    .single();

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase.storage.from('agent-documents').remove([doc.storage_path]);
  await supabase.from('ops_documents').delete().eq('id', id);

  return NextResponse.json({ ok: true });
}
