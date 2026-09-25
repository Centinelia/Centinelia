/**
 * Validación de input para creación y edición de tareas programadas.
 *
 * Ver spec Sección 4.5 y 8.2:
 * - slug: 1-64 chars, /^[a-z0-9_]+$/, único por owner_agent_id
 * - mission: 1-2000 chars
 * - deliverable: 1-2000 chars
 * - parameters: opcional, máximo 4000 chars
 * - trigger_type: cron | manual | phrase con validación específica por tipo
 *
 * Convención PAC-1: recibe portalEmail (string), no orgId (uuid).
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface CreateTaskInput {
  portalEmail: string;
  ownerAgentId: string;
  slug: string;
  mission: string;
  trigger_type: 'cron' | 'manual' | 'phrase';
  trigger_config: Record<string, unknown>;
  parameters?: string;
  deliverable: string;
  created_by?: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

const SLUG_RE = /^[a-z0-9_]+$/;

/**
 * Valida una expresión cron con regex simple.
 * Acepta expresiones de 5 campos separados por espacio.
 * Nota: cron-parser no está en package.json. Se usa regex como fallback documentado.
 * Para validación robusta, considera agregar cron-parser a dependencias.
 */
function isValidCronExpression(expr: string): boolean {
  if (typeof expr !== 'string') return false;
  // 5 campos: minuto hora día-mes mes día-semana
  // Acepta números, *, /, -, ,
  const cronFieldRe = /^(\*|[0-9,\-/*]+)$/;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every(p => cronFieldRe.test(p));
}

/**
 * Valida el input antes de crear o actualizar una tarea.
 *
 * @param input - Datos de la tarea a crear
 * @param opts.ownershipCheck - Si true, verifica que owner_agent_id exista y
 *   su portal_email coincida con el del input. Solo activa si se proporciona.
 */
export async function validateCreateTaskInput(
  input: CreateTaskInput,
  opts: { ownershipCheck?: boolean } = {},
): Promise<ValidationResult> {
  // Validar slug
  if (!input.slug || input.slug.trim().length === 0) {
    return { ok: false, error: 'El slug no puede estar vacío' };
  }
  if (input.slug.length > 64) {
    return { ok: false, error: 'El slug no puede tener más de 64 caracteres' };
  }
  if (!SLUG_RE.test(input.slug)) {
    return { ok: false, error: 'El slug solo puede contener letras minúsculas, números y guiones bajos' };
  }

  // Validar mission
  if (!input.mission || input.mission.trim().length === 0) {
    return { ok: false, error: 'La misión no puede estar vacía' };
  }
  if (input.mission.length > 2000) {
    return { ok: false, error: 'La misión no puede tener más de 2000 caracteres' };
  }

  // Validar deliverable
  if (!input.deliverable || input.deliverable.trim().length === 0) {
    return { ok: false, error: 'El entregable no puede estar vacío' };
  }
  if (input.deliverable.length > 2000) {
    return { ok: false, error: 'El entregable no puede tener más de 2000 caracteres' };
  }

  // Validar parameters (opcional)
  if (input.parameters !== undefined && input.parameters !== null) {
    if (input.parameters.length > 4000) {
      return { ok: false, error: 'Los parámetros no pueden tener más de 4000 caracteres' };
    }
  }

  // Validar trigger_config según trigger_type
  if (input.trigger_type === 'cron') {
    const cronExpr = input.trigger_config?.cron;
    if (typeof cronExpr !== 'string' || !cronExpr.trim()) {
      return { ok: false, error: 'trigger_config.cron es obligatorio para tareas de tipo cron' };
    }
    if (!isValidCronExpression(cronExpr)) {
      return { ok: false, error: `Expresión cron inválida: "${cronExpr}". Use formato: minuto hora día-mes mes día-semana` };
    }
  } else if (input.trigger_type === 'phrase') {
    const phrases = input.trigger_config?.phrases;
    if (!Array.isArray(phrases) || phrases.length === 0) {
      return { ok: false, error: 'trigger_config.phrases debe ser un arreglo no vacío de strings para tareas de tipo phrase' };
    }
    const invalidPhrases = phrases.filter(p => typeof p !== 'string' || !p.trim());
    if (invalidPhrases.length > 0) {
      return { ok: false, error: 'Todas las frases en trigger_config.phrases deben ser strings no vacíos' };
    }
  }
  // trigger_type === 'manual': trigger_config puede ser {}

  // Verificar ownership del agente
  if (opts.ownershipCheck) {
    const supabase = createAdminClient();
    const { data: agentRow } = await supabase
      .from('voice_agents')
      .select('id, portal_email')
      .eq('id', input.ownerAgentId)
      .maybeSingle();

    if (!agentRow) {
      return { ok: false, error: `El agente con ID ${input.ownerAgentId} no existe` };
    }
    if ((agentRow.portal_email as string) !== input.portalEmail) {
      return { ok: false, error: 'El agente no pertenece a la organización indicada' };
    }
  }

  return { ok: true };
}
