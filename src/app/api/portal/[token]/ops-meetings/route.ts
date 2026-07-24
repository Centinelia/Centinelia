import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { processMeetingAudio } from '@/lib/ops/meeting-processor';

interface Params { params: Promise<{ token: string }> }

async function getAgentForToken(supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, token: string) {
  const { data } = await supabase
    .from('voice_agents')
    .select('id, portal_email, business_name, client_email, agent_name, knowledge_base, role_knowledge_base')
    .eq('portal_token', token)
    .single();
  return data;
}

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
  const acct      = await getAgentForToken(supabase, token);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);

  const { data: meetings } = await supabase
    .from('ops_meetings')
    .select('*')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ meetings: meetings ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const acct      = await getAgentForToken(supabase, token);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body         = await req.json();
  const { title, participants, audio_url, instructions } = body;

  if (!title || !audio_url) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

  const { data: meeting, error } = await supabase
    .from('ops_meetings')
    .insert({
      agent_id:     acct.id,
      title,
      participants: participants ?? [],
      audio_url,
      status:       'pending',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger async processing
  processMeetingAudio({
    meetingId:        meeting.id as string,
    agentId:          acct.id as string,
    audioUrl:         audio_url,
    title,
    participants:     participants ?? [],
    ownerEmail:       acct.client_email as string,
    businessName:     acct.business_name as string,
    knowledgeBase:    acct.knowledge_base as string | null,
    roleKnowledgeBase: acct.role_knowledge_base as string | null,
    instructions:     instructions as string | undefined,
  }).catch(err => console.error('[ops-meetings] Processing error:', err));

  return NextResponse.json({ ok: true, id: meeting.id });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const acct      = await getAgentForToken(supabase, token);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);
  const body     = await req.json();
  const { id, action, meeting_data, task } = body;

  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  // Verify the meeting belongs to this account
  const { data: meeting } = await supabase
    .from('ops_meetings')
    .select('id, agent_id')
    .eq('id', id)
    .in('agent_id', agentIds)
    .single();

  if (!meeting) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  if (action === 'create_task') {
    if (!task?.task) return NextResponse.json({ error: 'Falta task' }, { status: 400 });

    const parts = [task.assignee, task.due].filter(Boolean).join(' · ');
    const { error } = await supabase.from('agent_tasks').insert({
      portal_email:   acct.portal_email,
      created_by:     acct.id,
      assigned_to:    acct.id,
      title:          (task.task as string).slice(0, 200),
      description:    parts ? `Responsable: ${parts}` : 'Creada desde resumen de junta.',
      status:         'pending',
      trigger_type:   'meeting_action_item',
      source_context: `Reunión: ${id}`,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (meeting_data) {
    const { error } = await supabase
      .from('ops_meetings')
      .update({ meeting_data })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const acct      = await getAgentForToken(supabase, token);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);
  const { id }   = await req.json();

  await supabase.from('ops_meetings').delete().eq('id', id).in('agent_id', agentIds);
  return NextResponse.json({ ok: true });
}
