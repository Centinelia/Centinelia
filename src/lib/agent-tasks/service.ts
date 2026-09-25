/**
 * Service de CRUD para Tareas programadas (agent_tasks).
 *
 * Convenciones:
 * - PAC-1: FK a organizations por portal_email TEXT, no org_id UUID.
 * - owner_agent_id: UUID del voice_agent específico dueño de la tarea.
 * - Cobro: 1 op de setup al crear (consumeAiOp via ownerAgentId, reason: task_setup).
 *   Editar/borrar = 0 ops.
 * - trigger_type='cron': si trigger_config no tiene next_run_at, se calcula al crear.
 *   Nota: next_run_at se calcula con lógica básica (cron-parser no disponible).
 *   Se guarda en trigger_config.next_run_at como ISOString.
 *
 * Ver spec Sección 4.5, 4.6 y 8.2.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { validateCreateTaskInput, type CreateTaskInput } from './validation';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { CronExpressionParser } from 'cron-parser';

export interface AgentTask {
  id: string;
  portal_email: string;
  owner_agent_id: string;
  slug: string;
  mission: string;
  trigger_type: 'cron' | 'manual' | 'phrase';
  trigger_config: Record<string, unknown>;
  parameters: string | null;
  deliverable: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Calcula el próximo next_run_at exacto para una expresión cron usando cron-parser.
 * Fix C2: reemplaza la aproximación "ahora + 1 min" con el intervalo real del cron.
 * Si la expresión es inválida (no debería llegar aquí si pasó validación), usa fallback.
 */
function computeNextRunAt(cronExpr?: string, timezone?: string): string {
  if (cronExpr) {
    try {
      const interval = CronExpressionParser.parse(cronExpr, {
        tz: timezone ?? 'America/Monterrey',
      });
      return interval.next().toISOString() ?? new Date(Date.now() + 60_000).toISOString();
    } catch {
      // Fallback si el cron es inválido (no debería ocurrir tras validación)
      console.warn('[agent-tasks/service] computeNextRunAt cron-parser falló, usando fallback 1min');
    }
  }
  // Fallback: 1 minuto desde ahora (solo si no se pasó expresión cron)
  return new Date(Date.now() + 60_000).toISOString();
}

/**
 * Crea una nueva tarea programada.
 * Valida input, inserta en DB, cobra 1 op al ownerAgent, retorna la tarea.
 */
export async function createTask(input: CreateTaskInput): Promise<AgentTask> {
  const validation = await validateCreateTaskInput(input, { ownershipCheck: true });
  if (!validation.ok) throw new Error(validation.error);

  const supabase = createAdminClient();

  // Para cron: asegurar que trigger_config tenga next_run_at calculado con cron-parser.
  // Fix C2: calcula el siguiente disparo real (no "ahora + 1 min").
  let triggerConfig = { ...input.trigger_config };
  if (input.trigger_type === 'cron' && !triggerConfig.next_run_at) {
    const cronExpr  = triggerConfig.cron as string | undefined;
    const timezone  = triggerConfig.timezone as string | undefined;
    triggerConfig   = { ...triggerConfig, next_run_at: computeNextRunAt(cronExpr, timezone) };
  }

  const { data, error } = await supabase
    .from('agent_tasks')
    .insert({
      portal_email:   input.portalEmail,
      owner_agent_id: input.ownerAgentId,
      slug:           input.slug,
      mission:        input.mission,
      trigger_type:   input.trigger_type,
      trigger_config: triggerConfig,
      parameters:     input.parameters ?? null,
      deliverable:    input.deliverable,
      created_by:     input.created_by ?? null,
      active:         true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const task = data as AgentTask;

  // Cobrar 1 op de setup al agente dueño. Si falla el cobro NO revierte el insert.
  try {
    await consumeAiOp(input.ownerAgentId, 1, {
      source:       'task_setup',
      reference_id: task.id,
      label:        `Tarea creada: ${input.slug.slice(0, 60)}`,
    });
  } catch (opErr) {
    console.warn('[agent-tasks/service] consumeAiOp task_setup failed (non-fatal):', opErr);
  }

  return task;
}

/**
 * Actualiza campos de una tarea existente. Sin cobro.
 */
export async function updateTask(
  id: string,
  patch: Partial<Omit<CreateTaskInput, 'portalEmail' | 'ownerAgentId'>>,
): Promise<AgentTask> {
  const updateData: Record<string, unknown> = {};
  if (patch.slug           !== undefined) updateData.slug           = patch.slug;
  if (patch.mission        !== undefined) updateData.mission        = patch.mission;
  if (patch.trigger_type   !== undefined) updateData.trigger_type   = patch.trigger_type;
  if (patch.trigger_config !== undefined) updateData.trigger_config = patch.trigger_config;
  if (patch.parameters     !== undefined) updateData.parameters     = patch.parameters;
  if (patch.deliverable    !== undefined) updateData.deliverable    = patch.deliverable;
  if (patch.created_by     !== undefined) updateData.created_by     = patch.created_by;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('agent_tasks')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data as AgentTask;
}

/**
 * Elimina una tarea. Sin cobro.
 */
export async function deleteTask(id: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('agent_tasks')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Lista las tareas de un agente específico. Opcionalmente filtra solo activas.
 */
export async function listTasksForAgent(
  ownerAgentId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<AgentTask[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from('agent_tasks')
    .select('*')
    .eq('owner_agent_id', ownerAgentId);

  if (opts.activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []) as AgentTask[];
}

/**
 * Lista todas las tareas de un portal/org. Opcionalmente filtra solo activas.
 */
export async function listTasksForPortal(
  portalEmail: string,
  opts: { activeOnly?: boolean } = {},
): Promise<AgentTask[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from('agent_tasks')
    .select('*')
    .eq('portal_email', portalEmail);

  if (opts.activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []) as AgentTask[];
}

/**
 * Obtiene una tarea por ID. Retorna null si no existe.
 */
export async function getTaskById(id: string): Promise<AgentTask | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as AgentTask | null) ?? null;
}
