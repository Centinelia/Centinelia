/**
 * Validación de input para creación y edición de reglas de operación.
 *
 * Ver spec Sección 4.4 y Sección 8.1:
 * - regla: obligatorio, 1-500 chars
 * - detalles: opcional, max 2000 chars
 * - applies_to: lista de meerkat_role_id; vacío = todos los meerkats del org
 *
 * Convención PAC-1: recibe portalEmail (string), no orgId (uuid).
 * Convención PAC-2: los slugs en applies_to son meerkat_role_id de voice_agents.features.
 */

import { getAllRoles } from '@/lib/tags/whitelist';

export interface CreateRuleInput {
  portalEmail: string;
  regla: string;
  detalles?: string;
  applies_to?: string[];
  created_by?: string;
  active?: boolean;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Valida el input antes de crear o actualizar una regla.
 *
 * @param input - Datos de la regla a crear
 * @param opts.rosterCheck - Si true, verifica que los slugs en applies_to existan
 *   en el roster actual de meerkats. Solo activa si applies_to tiene elementos.
 */
export async function validateCreateRuleInput(
  input: CreateRuleInput,
  opts: { rosterCheck?: boolean } = {},
): Promise<ValidationResult> {
  // Validar regla
  if (!input.regla || input.regla.trim().length === 0) {
    return { ok: false, error: 'La regla no puede estar vacía' };
  }
  if (input.regla.length > 500) {
    return { ok: false, error: 'La regla no puede tener más de 500 caracteres' };
  }

  // Validar detalles (opcional)
  if (input.detalles !== undefined && input.detalles !== null) {
    if (input.detalles.length > 2000) {
      return { ok: false, error: 'Los detalles no pueden tener más de 2000 caracteres' };
    }
  }

  // Validar applies_to contra el roster real solo si se pidió
  const appliesTo = input.applies_to ?? [];
  if (opts.rosterCheck && appliesTo.length > 0) {
    const roster = await getAllRoles();
    const invalid = appliesTo.filter((slug) => !roster.includes(slug));
    if (invalid.length > 0) {
      return { ok: false, error: `Empleados no válidos: ${invalid.join(', ')}` };
    }
  }

  return { ok: true };
}
