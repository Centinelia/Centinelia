/**
 * Mapa de reasons válidos para el ledger de ops (ai_ops_log + ops_ledger).
 *
 * Alineado con feedback_pool_transparencia: ledger event-sourced con reason
 * explícito y auditable. Cada reason declara qué metadata se espera y una
 * descripción en español para el historial de consumo.
 *
 * Uso:
 *   import { validateLedgerEntry, LEDGER_REASONS } from '@/lib/ai/ledger-schemas';
 *   const result = validateLedgerEntry('rule_setup', { rule_id: '...', applies_to: [] });
 *   if (!result.ok) console.warn('[ledger] metadata incompleta:', result.error);
 *   // NUNCA romper el cobro por fallo de validación — solo advertir.
 *
 * Regla de validación (defensiva):
 *   - Si reason no está en el enum → warning + cobrar de todos modos.
 *   - Si metadata tiene keys faltantes → warning (no error fatal).
 *   - Extra keys en metadata → OK.
 *
 * Firma backwards-compat: OpsMeta acepta `source` (legacy) y `reason` (nuevo).
 * Internamente se usa `reason`; `source` sigue siendo el nombre de columna en
 * ai_ops_log para no romper consumption-audit.ts que lee `source`.
 */

export const LEDGER_REASONS = {
  rule_setup: {
    description: 'Creación de una regla de operación',
    metadata: ['rule_id', 'applies_to'],
  },
  task_setup: {
    description: 'Creación de una tarea programada',
    metadata: ['task_id', 'trigger_type'],
  },
  task_execution_start: {
    description: 'Arranque de ejecución de tarea programada',
    metadata: ['task_id', 'run_id', 'trigger_source'],
  },
  task_action: {
    description: 'Side-effect de tarea programada (batched)',
    metadata: ['task_id', 'run_id', 'action_types'],
  },
  ficha_setup: {
    description: 'Creación de ficha informativa',
    metadata: ['ficha_id'],
  },
  ingest_ficha_informativa: {
    description: 'Ficha informativa cargada al portal',
    metadata: ['ficha_id'],
  },
  ficha_retrieval: {
    description: 'Retrieval de fichas en runtime',
    metadata: ['ficha_ids'],
  },
  ficha_autotag_migration: {
    description: 'Migración masiva de autotag (NO cobra al cliente)',
    metadata: ['ficha_id'],
  },
} as const;

export type LedgerReason = keyof typeof LEDGER_REASONS;

export type LedgerValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Valida que un reason exista en el enum y que la metadata contenga
 * las keys esperadas. Extra keys son OK. Missing keys son warning-only.
 *
 * NUNCA debe bloquear el cobro — quien llama debe continuar con el cobro
 * aunque la validacion falle (defensivo). Solo sirve para logging y trazabilidad.
 */
export function validateLedgerEntry(
  reason: string,
  metadata: Record<string, unknown>,
): LedgerValidationResult {
  if (!Object.prototype.hasOwnProperty.call(LEDGER_REASONS, reason)) {
    return {
      ok: false,
      error: `Reason "${reason}" no esta en el catalogo de LEDGER_REASONS. Cobro continua de todos modos.`,
    };
  }

  const schema = LEDGER_REASONS[reason as LedgerReason];
  const missingKeys = schema.metadata.filter(
    (key) => !Object.prototype.hasOwnProperty.call(metadata, key),
  );

  if (missingKeys.length > 0) {
    return {
      ok: false,
      error: `Reason "${reason}" tiene metadata incompleta. Faltan keys: ${missingKeys.join(', ')}. Cobro continua de todos modos.`,
    };
  }

  return { ok: true };
}

/**
 * Normaliza el identificador del cobro: acepta `reason` (nuevo) o `source`
 * (legacy) en OpsMeta. Devuelve siempre el string a usar como reason/source.
 * Si se pasan ambos, `reason` tiene prioridad.
 */
export function resolveReason(
  reason?: string,
  source?: string,
): string {
  // Tratar strings vacios igual que undefined (falsy semantico).
  return (reason || source || 'unknown');
}
