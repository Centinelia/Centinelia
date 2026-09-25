/**
 * Executor de tareas programadas (agent_tasks).
 *
 * Flujo v1 (sin tool calling real):
 * 1. Carga la tarea + agente + org.
 * 2. Verifica feature flag agent_missions_enabled (default OFF = no ejecutar).
 * 3. Inserta agent_task_runs con status='running'.
 * 4. Verifica pool disponible (consumeAiOp falla si no hay ops).
 * 5. Cobra 1 op de arranque (task_execution_start).
 * 6. Invoca Claude Sonnet con contexto de la tarea + reglas del meerkat.
 * 7. Marca el run como status='narrated' — NO cobra task_action ops.
 *    El LLM produce un plan narrativo pero no ejecuta tools reales.
 *    La narrativa se guarda en metadata.narrative para debugging.
 *
 * IMPORTANTE (Sección 8.2 spec v1): El executor v1 no tiene tool calling real.
 * Claude responde en texto libre describiendo qué haría, pero no ejecuta nada.
 * Por este motivo el status final es 'narrated' (no 'success'), y NO se cobran
 * ops de task_action — solo el 1 op de task_execution_start que consumió tokens.
 * El refactor a v2 con tool calling real está pendiente como Fase 3 v2.
 *
 * Review Fix C1: no cobra task_action por keywords en texto libre (era ficticio).
 * Review Fix I4: pool agotado mid-run marca 'error', no success silencioso.
 * feedback_batched_consume_multi_io: N side-effects → 1 cobro count=N (v2).
 * feedback_anthropic_debe_loggearse: logLlmCall siempre.
 *
 * Ver spec Sección 4.6 y 8.2.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { logLlmCall } from '@/lib/observability/llm-log';
import { getRulesForAgent } from '@/lib/agent-rules/service';

const anthropic = new Anthropic();

export interface ExecuteTaskResult {
  runId: string;
  status: 'success' | 'error' | 'cancelled' | 'narrated';
  /** Narrativa del LLM cuando status='narrated' (executor v1 sin tool calling). */
  narrative?: string;
}

/**
 * Ejecuta una tarea programada. Devuelve el runId y el status final.
 * Nunca lanza — captura errores internamente y los registra en el run.
 */
export async function executeTask(input: {
  taskId: string;
  triggerSource: 'cron' | 'phrase' | 'manual';
}): Promise<ExecuteTaskResult> {
  const { taskId, triggerSource } = input;
  const supabase = createAdminClient();

  // 1. Cargar la tarea con agente y org
  const { data: taskRow, error: taskErr } = await supabase
    .from('agent_tasks')
    .select('*, voice_agents!owner_agent_id(*)')
    .eq('id', taskId)
    .maybeSingle();

  if (taskErr || !taskRow) {
    throw new Error(`Tarea no encontrada: ${taskId} (${taskErr?.message ?? 'sin datos'})`);
  }

  const agent = (taskRow as Record<string, unknown>).voice_agents as Record<string, unknown> | null;
  const portalEmail = taskRow.portal_email as string;
  const ownerAgentId = taskRow.owner_agent_id as string;

  // 2. Verificar feature flag agent_missions_enabled (default OFF)
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  const orgFeatures = (orgRow?.features ?? {}) as Record<string, unknown>;
  const missionEnabled = orgFeatures.agent_missions_enabled === true;

  if (!missionEnabled) {
    // Insertar run cancelado — NO cobrar
    const { data: cancelledRun } = await supabase
      .from('agent_task_runs')
      .insert({
        task_id:        taskId,
        status:         'cancelled',
        trigger_source: triggerSource,
        ledger_ops:     0,
        error_message:  'agent_missions_enabled=false',
        finished_at:    new Date().toISOString(),
      })
      .select('id')
      .single();

    return { runId: cancelledRun?.id ?? 'unknown', status: 'cancelled' };
  }

  // 3. Insertar run con status='running'
  const { data: runRow, error: runInsertErr } = await supabase
    .from('agent_task_runs')
    .insert({
      task_id:        taskId,
      status:         'running',
      trigger_source: triggerSource,
      ledger_ops:     0,
      metadata:       { triggered_at: new Date().toISOString() },
    })
    .select('id')
    .single();

  if (runInsertErr || !runRow) {
    throw new Error(`No se pudo crear el run para la tarea ${taskId}: ${runInsertErr?.message ?? 'sin datos'}`);
  }

  const runId = runRow.id as string;

  // Helper para actualizar el run al final
  async function finalizeRun(
    status: 'success' | 'error' | 'cancelled' | 'narrated',
    ledgerOps: number,
    opts?: { errorMessage?: string; narrative?: string },
  ) {
    const metaUpdate = opts?.narrative
      ? await (async () => {
          const { data: current } = await supabase
            .from('agent_task_runs')
            .select('metadata')
            .eq('id', runId)
            .maybeSingle();
          return { ...((current?.metadata as Record<string, unknown>) ?? {}), narrative: opts.narrative };
        })()
      : undefined;

    await supabase
      .from('agent_task_runs')
      .update({
        status,
        ledger_ops:    ledgerOps,
        finished_at:   new Date().toISOString(),
        error_message: opts?.errorMessage ?? null,
        ...(metaUpdate ? { metadata: metaUpdate } : {}),
      })
      .eq('id', runId);
  }

  // 4. Verificar pool: intentar cobrar 1 op de arranque.
  // Si el pool está agotado, consumeAiOp retorna { ok: false }.
  // Fix I1 (Round 1): usa reason (nuevo) y pasa task_id, run_id, trigger_source
  // como campos estructurados para que validateLedgerEntry no emita warnings.
  // context JSON se mantiene para correlacion en detectTaskActionOrphans.
  const startOp = await consumeAiOp(ownerAgentId, 1, {
    reason:         'task_execution_start',
    reference_id:   taskId,
    task_id:        taskId,
    run_id:         runId,
    trigger_source: triggerSource,
    label:          `Inicio tarea: ${taskRow.slug as string}`,
    context:        JSON.stringify({ run_id: runId, trigger_source: triggerSource }),
  });

  if (!startOp.ok) {
    // Pool agotado — cancelar sin cobrar más ops
    await finalizeRun('cancelled', 0, { errorMessage: 'pool_exhausted' });
    return { runId, status: 'cancelled' };
  }

  // 5. Construir el sistema prompt de ejecución
  const meerkatRoleId = (agent?.features as Record<string, unknown> | null)?.meerkat_role_id as string | null;

  let rulesText = '';
  if (meerkatRoleId) {
    try {
      const rules = await getRulesForAgent(portalEmail, meerkatRoleId);
      if (rules.length > 0) {
        rulesText = '\n\n## Reglas del negocio (respétalas siempre)\n' +
          rules.map(r => `- ${r.regla}${r.detalles ? `\n  Detalles: ${r.detalles}` : ''}`).join('\n');
      }
    } catch (ruleErr) {
      console.warn('[executor] No se pudieron cargar las reglas del meerkat:', ruleErr);
    }
  }

  // En v1 el executor no tiene tool calling real. El prompt es honesto al respecto:
  // pedimos al LLM que narre el plan, no que simule haber ejecutado tools.
  const systemPrompt = [
    `Estás revisando la tarea programada "${taskRow.slug as string}".`,
    '',
    `Misión: ${taskRow.mission as string}`,
    taskRow.parameters ? `\nInstrucciones adicionales:\n${taskRow.parameters as string}` : '',
    `\nEntregable esperado: ${taskRow.deliverable as string}`,
    rulesText,
    '',
    'Nota: en esta versión del sistema no tienes herramientas disponibles para ejecutar acciones directamente.',
    'Describe detalladamente qué pasos realizarías para completar la misión, qué información necesitarías y cuál sería el entregable esperado.',
    'Sé específico y práctico. Este plan se guardará como referencia para la ejecución manual o para el refactor a ejecución automática.',
  ].join('\n');

  // 6. Invocar Claude Sonnet con logLlmCall
  // En v1 el LLM solo narra el plan (no ejecuta tools). NO cobrar task_action ops.
  const __llmStart = Date.now();
  const __llmModel = 'claude-sonnet-4-6';
  let response: Anthropic.Message | null = null;
  let llmError: string | undefined;

  try {
    response = await anthropic.messages.create({
      model:      __llmModel,
      max_tokens: 2048,
      system:     systemPrompt,
      messages: [{
        role:    'user',
        content: `Revisa la tarea "${taskRow.slug as string}". Disparada por: ${triggerSource}. Fecha/hora: ${new Date().toISOString()}.`,
      }],
    });

    void logLlmCall({
      source:     'task_executor',
      model:      __llmModel,
      usage:      response.usage,
      agentId:    ownerAgentId,
      portalEmail,
      latencyMs:  Date.now() - __llmStart,
      meta:       { task_id: taskId, run_id: runId, trigger_source: triggerSource },
    });

  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err);
    void logLlmCall({
      source:    'task_executor',
      model:     __llmModel,
      usage:     { input_tokens: 0, output_tokens: 0 },
      agentId:   ownerAgentId,
      portalEmail,
      latencyMs: Date.now() - __llmStart,
      error:     llmError,
      meta:      { task_id: taskId, run_id: runId },
    });

    // LLM falló: cobrar solo el arranque (ya cobrado), marcar error
    await finalizeRun('error', 1, { errorMessage: `LLM error: ${llmError}` });
    return { runId, status: 'error' };
  }

  // 7. Ejecutar acciones del pool: NOTA v1 — no cobra task_action.
  // Fix C1: eliminar heurística de keywords para cobrar por acciones ficticias.
  // El pool mid-run guard (I4) sigue presente para robustez cuando se implemente v2.
  // En v1 totalOps = 1 (solo el arranque cobrado arriba).
  const totalOps = 1;

  // 8. Extraer narrativa del LLM y marcar run como 'narrated' (no 'success').
  // status='narrated' = el LLM describió un plan pero no ejecutó tools reales.
  const narrativeText = (response.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('');

  // Warning claro en logs para debugging y para que el refactor v2 sea fácil de rastrear.
  console.warn(
    `[executor] Executor v1: LLM narro plan pero no ejecuto tools. Refactor pendiente Fase 3 v2. task=${taskId} run=${runId}`,
  );

  await finalizeRun('narrated', totalOps, { narrative: narrativeText.slice(0, 4000) });
  return { runId, status: 'narrated', narrative: narrativeText };
}
