import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
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

  const resolved = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  const tokenAgent = { portal_email: resolved.portalEmail };
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
    // Guardamos también el content final (por si fue editado) para poder
    // ubicar y remover exactamente esta bullet si el usuario lo elimina luego.
    supabase.from('agent_learnings')
      .update({ status: 'approved', approved_at: new Date().toISOString(), category: finalCategory, content: finalContent }).eq('id', id),
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
    // syncPeers=false: learning solo afecta al prompt de este agente.
    updateVapiAssistant(
      agent.vapi_agent_id,
      { ...agent, [field]: newLearnings } as VoiceAgent,
      { syncPeers: false },
    ).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}

// DELETE — quita un aprendizaje ya incorporado. Estrategia:
// 1. Marca el row como 'rejected' (así desaparece de "Ya incorporado")
// 2. Quita la bullet correspondiente del field agregado en voice_agents
// 3. Resync a Vapi para que deje de aparecer en el prompt
// Es best-effort: si la bullet fue editada manualmente después, no la encuentra
// y solo cambia el status. El usuario podrá limpiar el field manualmente en /configurar.
export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (auth.isSubUser && !auth.modules?.includes('of_aprendizajes'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  const resolved = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  const tokenAgent = { portal_email: resolved.portalEmail };
  if (auth.portalEmail && tokenAgent.portal_email && auth.portalEmail !== tokenAgent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data: learning } = await supabase
    .from('agent_learnings')
    .select('id, agent_id, content, category, status')
    .eq('id', id)
    .eq('portal_email', tokenAgent.portal_email)
    .single();
  if (!learning) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: agent } = await supabase
    .from('voice_agents').select('*').eq('id', learning.agent_id).single();
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const category = ((learning as { category: string | null }).category ?? 'role_kb') as 'role_kb' | 'guardrails';
  const field    = category === 'guardrails' ? 'guardrails_learnings' : 'role_learnings';
  const current  = ((agent as Record<string, unknown>)[field] as string | null) ?? '';

  // Remove exact bullet "• {content}". Preserve surrounding separators.
  const bullet = `• ${learning.content}`.trim();
  let updated  = current;
  if (current.includes(bullet)) {
    updated = current
      .split('\n\n')
      .filter(chunk => chunk.trim() !== bullet)
      .join('\n\n')
      .trim();
  }

  await Promise.all([
    supabase.from('voice_agents').update({ [field]: updated }).eq('id', agent.id),
    supabase.from('agent_learnings').update({ status: 'rejected' }).eq('id', id),
  ]);

  if (agent.vapi_agent_id) {
    // syncPeers=false: solo modifica prompt del agente actual.
    updateVapiAssistant(
      agent.vapi_agent_id,
      { ...agent, [field]: updated } as VoiceAgent,
      { syncPeers: false },
    ).catch(console.error);
  }

  return NextResponse.json({ ok: true, removed: current !== updated });
}
