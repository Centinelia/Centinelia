import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { saveLearning } from '@/lib/ai/save-learning';

export const dynamic = 'force-dynamic';

// Convierte el feedback del humano en un learning estructurado auto-aprobado
// (confidence=1.0, viene de fuente supervisada directa). El learning se
// mergea inmediato en role_learnings/guardrails_learnings del agent y se
// sync a Vapi por saveLearning. Aprendizaje instantáneo, no espera al cron.
function buildLearningContent(
  category: string,
  reason: string | null,
  emailSubject: string,
): { content: string; category: 'role_kb' | 'guardrails' } {
  const subj = emailSubject.slice(0, 80) || '(sin asunto)';
  const detail = reason?.trim() || 'sin detalle adicional';

  switch (category) {
    case 'alucinacion':
      return {
        content: `Alucinación reportada en correo "${subj}". Detalle: ${detail}. Antes de mencionar horarios/precios/políticas: verificar con list_calendar_events, search_files, o usar pedir_a_humano si no puedes verificar.`,
        category: 'guardrails',
      };
    case 'tono':
      return {
        content: `Tono inapropiado reportado en correo "${subj}". Detalle: ${detail}. Ajustar tono en correos similares.`,
        category: 'guardrails',
      };
    case 'info_incorrecta':
      return {
        content: `Info incorrecta reportada en correo "${subj}". Detalle: ${detail}. Verificar datos con search_files o buscar_en_web antes de incluirlos en respuestas.`,
        category: 'guardrails',
      };
    case 'no_debia_responder':
      return {
        content: `Correo "${subj}" requería aprobación humana antes de enviar. Contexto: ${detail}. Escalar correos similares con pedir_a_humano en vez de auto-responder.`,
        category: 'guardrails',
      };
    default:
      return {
        content: `Feedback del humano sobre correo "${subj}": ${detail}.`,
        category: 'role_kb',
      };
  }
}

interface Params {
  params: Promise<{ token: string; id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const supabase = createAdminClient();

  // 1. Resolve org (acepta org token o legacy voice_agents.portal_token)
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 2. Cargar item con JOIN al agente para ownership org-scoped
  const { data: item, error: itemErr } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, auto_mode_decision, auto_mode_signals, auto_mode_flagged_at, email_subject, voice_agents!inner(portal_email)')
    .eq('id', id)
    .maybeSingle() as { data: { id: string; agent_id: string; auto_mode_decision: string | null; auto_mode_signals: unknown; auto_mode_flagged_at: string | null; email_subject: string | null; voice_agents: { portal_email: string | null } } | null; error: unknown };

  if (itemErr || !item) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (item.voice_agents.portal_email !== resolved.portalEmail) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Shim para downstream (usa agent.id y agent.portal_email)
  const agent = { id: item.agent_id, portal_email: resolved.portalEmail };

  // 3. Idempotencia: primer flag gana
  if (item.auto_mode_flagged_at) {
    return NextResponse.json({ ok: true, alreadyFlagged: true });
  }

  // 4. Parse body
  const body = (await req.json().catch(() => ({}))) as {
    flagged?:  boolean;
    reason?:   string;
    category?: string;
  };

  if (body.flagged !== true) {
    return NextResponse.json(
      { error: 'flagged=true requerido' },
      { status: 400 }
    );
  }

  const reason =
    typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;

  const VALID_CATEGORIES = new Set(['alucinacion', 'tono', 'info_incorrecta', 'no_debia_responder', 'otro']);
  const category = typeof body.category === 'string' && VALID_CATEGORIES.has(body.category)
    ? body.category
    : null;

  // 5. UPDATE inbox
  const { error: updErr } = await supabase
    .from('ops_inbox')
    .update({
      auto_mode_flagged_at:    new Date().toISOString(),
      auto_mode_flag_reason:   reason,
      auto_mode_flag_category: category,
    })
    .eq('id', item.id);

  if (updErr) {
    console.error('[flag-auto-mode] update failed:', updErr);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  // 6. INSERT en feedback log (no-blocking si falla)
  const { error: feedbackErr } = await supabase
    .from('auto_mode_feedback_log')
    .insert({
      agent_id:      agent.id,
      inbox_id:      item.id,
      decision:      item.auto_mode_decision ?? 'unknown',
      signals:       item.auto_mode_signals ?? [],
      flag_reason:   reason,
      flag_category: category,
    });

  if (feedbackErr) {
    console.error('[flag-auto-mode] feedback log insert failed:', feedbackErr);
  }

  // 7. Aprendizaje inmediato: convertir feedback en learning auto-aprobado.
  // Fire-and-forget para no bloquear la respuesta HTTP. saveLearning con
  // confidence=1.0 mergea inmediato en role/guardrails_learnings del agent
  // y sync a Vapi. Sin dependencia del cron learn biweekly.
  if (category) {
    const { content, category: learningCategory } = buildLearningContent(
      category,
      reason,
      (item.email_subject as string | null) ?? '',
    );
    saveLearning({
      agentId:     agent.id,
      portalEmail: (agent.portal_email as string | null) ?? null,
      content,
      source:      'email',
      confidence:  1.0,
      category:    learningCategory,
    }).catch(err => console.error('[flag-auto-mode] saveLearning failed:', err));
  }

  return NextResponse.json({ ok: true });
}
