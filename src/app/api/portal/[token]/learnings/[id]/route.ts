import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';

interface Params { params: Promise<{ token: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const { action } = (await req.json()) as { action: 'approve' | 'reject' };
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: tokenAgent } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!tokenAgent?.portal_email) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { data: learning } = await supabase
    .from('agent_learnings')
    .select('id, agent_id, content, status')
    .eq('id', id)
    .eq('portal_email', tokenAgent.portal_email)
    .single();
  if (!learning)                    return NextResponse.json({ error: 'Not found' },        { status: 404 });
  if (learning.status !== 'pending') return NextResponse.json({ error: 'Already processed' }, { status: 409 });

  if (action === 'reject') {
    await supabase.from('agent_learnings').update({ status: 'rejected' }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  // Approve: append to the agent's knowledge base and sync to Vapi
  const { data: agent } = await supabase
    .from('voice_agents').select('*').eq('id', learning.agent_id).single();
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const separator = agent.knowledge_base?.trim() ? '\n\n' : '';
  const newKb     = `${agent.knowledge_base ?? ''}${separator}• ${learning.content}`;

  await Promise.all([
    supabase.from('voice_agents').update({ knowledge_base: newKb }).eq('id', agent.id),
    supabase.from('agent_learnings')
      .update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', id),
    // Post to team feed so the learning appears in La Oficina
    supabase.from('agent_messages').insert({
      portal_email:  tokenAgent.portal_email,
      from_agent_id: agent.id,
      to_agent_id:   null,
      type:          'learning',
      content:       learning.content,
      metadata:      {},
    }),
  ]);

  if (agent.vapi_agent_id) {
    updateVapiAssistant(
      agent.vapi_agent_id,
      { ...agent, knowledge_base: newKb } as VoiceAgent,
    ).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
