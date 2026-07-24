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
  if (auth.isSubUser && !auth.modules?.includes('of_aprendizajes'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const { token, id } = await params;
  const { action, content: editedContent, category: categoryOverride } = (await req.json()) as { action: 'approve' | 'reject'; content?: string; category?: 'role_kb' | 'guardrails' };
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: tokenAgent } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!tokenAgent?.portal_email) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && tokenAgent.portal_email && auth.portalEmail !== tokenAgent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data: learning } = await supabase
    .from('agent_learnings')
    .select('id, agent_id, content, status, category')
    .eq('id', id)
    .eq('portal_email', tokenAgent.portal_email)
    .single();
  if (!learning)                    return NextResponse.json({ error: 'Not found' },        { status: 404 });
  if (learning.status !== 'pending') return NextResponse.json({ error: 'Already processed' }, { status: 409 });

  if (action === 'reject') {
    await supabase.from('agent_learnings').update({ status: 'rejected' }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  // Approve: append to the correct field based on category, then sync to Vapi
  const finalContent  = editedContent?.trim() || learning.content;
  const finalCategory = categoryOverride ?? ((learning as any).category as 'role_kb' | 'guardrails' | null) ?? 'role_kb';
  const field         = finalCategory === 'guardrails' ? 'guardrails_learnings' : 'role_learnings';

  const { data: agent } = await supabase
    .from('voice_agents').select('*').eq('id', learning.agent_id).single();
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const existing     = (agent as any)[field] ?? '';
  const separator    = existing.trim() ? '\n\n' : '';
  const newLearnings = `${existing}${separator}• ${finalContent}`;

  await Promise.all([
    supabase.from('voice_agents').update({ [field]: newLearnings }).eq('id', agent.id),
    supabase.from('agent_learnings')
      .update({ status: 'approved', approved_at: new Date().toISOString(), category: finalCategory }).eq('id', id),
    supabase.from('agent_messages').insert({
      portal_email:  tokenAgent.portal_email,
      from_agent_id: agent.id,
      to_agent_id:   null,
      type:          'learning',
      content:       finalContent,
      metadata:      { category: finalCategory },
    }),
  ]);

  if (agent.vapi_agent_id) {
    updateVapiAssistant(
      agent.vapi_agent_id,
      { ...agent, [field]: newLearnings } as VoiceAgent,
    ).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
