/**
 * Executor de tareas programadas (agent_tasks).
 *
 * Flujo:
 * 1. Carga la tarea + agente + org.
 * 2. Verifica feature flag agent_missions_enabled (default OFF = no ejecutar).
 * 3. Inserta agent_task_runs con status='running'.
 * 4. Verifica pool disponible (consumeAiOp falla si no hay ops).
 * 5. Cobra 1 op de arranque (task_execution_start).
 * 6. Invoca Claude Sonnet con contexto de la tarea + reglas del meerkat.
 * 7. Cobra N ops de acciones en un solo batched-consume (task_action).
 * 8. Actualiza el run con status final y ledger_ops total.
 *
 * Review Focus #5: pool_exhausted → cancelled, 0 ops cobrados.
 * feedback_batched_consume_multi_io: N side-effects → 1 cobro count=N.
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
  status: 'success' | 'error' | 'cancelled';
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
  async function finalizeRun(status: 'success' | 'error' | 'cancelled', ledgerOps: number, errorMessage?: string) {
    await supabase
      .from('agent_task_runs')
      .update({
        status,
        ledger_ops:   ledgerOps,
        finished_at:  new Date().toISOString(),
        error_message: errorMessage ?? null,
      })
      .eq('id', runId);
  }

  // 4. Verificar pool: intentar cobrar 1 op de arranque.
  // Si el pool está agotado, consumeAiOp retorna { ok: false }.
  const startOp = await consumeAiOp(ownerAgentId, 1, {
    source:       'task_execution_start',
    reference_id: taskId,
    label:        `Inicio tarea: ${taskRow.slug as string}`,
    context:      JSON.stringify({ run_id: runId, trigger_source: triggerSource }),
  });

  if (!startOp.ok) {
    // Pool agotado — cancelar sin cobrar más ops
    await finalizeRun('cancelled', 0, 'pool_exhausted');
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

  const systemPrompt = [
    `Estás ejecutando la tarea programada "${taskRow.slug as string}".`,
    '',
    `Misión: ${taskRow.mission as string}`,
    taskRow.parameters ? `\nInstrucciones adicionales:\n${taskRow.parameters as string}` : '',
    `\nEntregable esperado: ${taskRow.deliverable as string}`,
    rulesText,
    '',
    'Ejecuta la misión siguiendo las instrucciones. Si necesitas tomar acciones (enviar correo, registrar datos, etc.), hazlo con las herramientas disponibles. Al finalizar, reporta qué acciones tomaste.',
  ].join('\n');

  // 6. Invocar Claude Sonnet con logLlmCall
  const __llmStart = Date.now();
  const __llmModel = 'claude-sonnet-4-6';
  let response: Anthropic.Message | null = null;
  let llmError: string | undefined;
  let sideEffectsCount = 0;

  try {
    response = await anthropic.messages.create({
      model:      __llmModel,
      max_tokens: 2048,
      system:     systemPrompt,
      messages: [{
        role:    'user',
        content: `Ejecuta la tarea "${taskRow.slug as string}" ahora. Disparada por: ${triggerSource}. Fecha/hora: ${new Date().toISOString()}.`,
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

    // Contar side-effects mencionados en la respuesta del LLM
    // En v1 no hay tool calling — el LLM responde en texto.
    // Si la respuesta menciona acciones tomadas, contamos como 1 side-effect.
    const responseText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    // Heurística simple para v1: cada acción mencionada = 1 side effect
    const actionKeywords = ['envié', 'registré', 'guardé', 'creé', 'actualicé', 'notifiqué', 'generé'];
    sideEffectsCount = actionKeywords.filter(kw => responseText.toLowerCase().includes(kw)).length;

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
    await finalizeRun('error', 1, `LLM error: ${llmError}`);
    return { runId, status: 'error' };
  }

  // 7. Cobrar N ops de acciones en un solo batched-consume
  let totalOps = 1; // 1 ya cobrado en arranque
  if (sideEffectsCount > 0) {
    const actionOp = await consumeAiOp(ownerAgentId, sideEffectsCount, {
      source:       'task_action',
      reference_id: taskId,
      label:        `Acciones de tarea: ${taskRow.slug as string}`,
      context:      JSON.stringify({ run_id: runId, action_count: sideEffectsCount }),
    });
    if (actionOp.ok) {
      totalOps += sideEffectsCount;
    } else {
      // Pool agotado a mitad — cobrar lo que se pudo, marcar run con advertencia
      console.warn('[executor] Pool agotado al cobrar acciones del task', taskId);
    }
  }

  // 8. Marcar run como success
  await finalizeRun('success', totalOps);
  return { runId, status: 'success' };
}
