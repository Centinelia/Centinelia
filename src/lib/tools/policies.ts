/**
 * L2 — Retry/budget policy declarativa por tool.
 *
 * Fuente única de verdad para: timeout, retry en fallo transitorio, y
 * si el resultado debe pasar por verifier externo antes de ir al usuario.
 *
 * El executor consulta este mapa antes de invocar cada tool. Sin policy
 * declarada, se usa `DEFAULT_POLICY` (1 intento, 25s timeout, sin verify).
 *
 * NO retries automáticos para tools destructivas (enviar_correo, llamadas,
 * facturación, contratos). Un retry silencioso ahí = doble envío.
 */

export type VerifyStrategy = 'none' | 'external';

export interface ToolPolicy {
  /** Número total de intentos incluyendo el primero. 1 = sin retry. */
  maxAttempts:   number;
  /** Timeout por intento en ms. */
  timeoutMs:     number;
  /** Backoff en ms entre intento N y N+1. Ignorado si maxAttempts === 1. */
  backoffMs:     number;
  /** Costo en ops que el tool consume por invocación (informativo — la carga real vive dentro del handler). */
  budgetOps:     number;
  /** Si `external`, el llamador debería pasar el resultado por un verifier antes de devolverlo. */
  verifyStrategy: VerifyStrategy;
  /** Si true, retry se permite solo cuando el error luce transitorio (network / 5xx / timeout). */
  retryOnlyTransient?: boolean;
}

export const DEFAULT_POLICY: ToolPolicy = {
  maxAttempts:   1,
  timeoutMs:     25_000,
  backoffMs:     0,
  budgetOps:     0,
  verifyStrategy: 'none',
};

/**
 * Categorías:
 *  - safe-read: buscar, leer, lookup. Retry libre.
 *  - safe-idempotent: crear con dedupe key, update por id. Retry libre.
 *  - destructive: enviar_correo, llamadas, factura, contrato. Sin retry silencioso.
 *  - long-io: web search, scrape. Retry limitado.
 */
export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  // safe-read
  read_url:               { ...DEFAULT_POLICY, timeoutMs: 15_000, maxAttempts: 2, backoffMs: 800, retryOnlyTransient: true },
  buscar_en_web:          { ...DEFAULT_POLICY, timeoutMs: 12_000, maxAttempts: 2, backoffMs: 500, retryOnlyTransient: true },
  search_leads:           { ...DEFAULT_POLICY, timeoutMs: 20_000, maxAttempts: 2, backoffMs: 800, retryOnlyTransient: true },
  buscar_archivo:         { ...DEFAULT_POLICY, timeoutMs: 12_000, maxAttempts: 2, backoffMs: 500, retryOnlyTransient: true },
  leer_archivo:           { ...DEFAULT_POLICY, timeoutMs: 20_000, maxAttempts: 2, backoffMs: 500, retryOnlyTransient: true },
  list_calendar_events:   { ...DEFAULT_POLICY, timeoutMs: 10_000, maxAttempts: 2, backoffMs: 500, retryOnlyTransient: true },
  qb_consultar_facturas:  { ...DEFAULT_POLICY, timeoutMs: 15_000, maxAttempts: 2, backoffMs: 800, retryOnlyTransient: true },
  qb_buscar_cliente:      { ...DEFAULT_POLICY, timeoutMs: 15_000, maxAttempts: 2, backoffMs: 800, retryOnlyTransient: true },
  lookup_civic_report:    { ...DEFAULT_POLICY, timeoutMs: 10_000, maxAttempts: 2, backoffMs: 500, retryOnlyTransient: true },
  consultar_factura:      { ...DEFAULT_POLICY, timeoutMs: 10_000, maxAttempts: 2, backoffMs: 500, retryOnlyTransient: true },
  buscar_producto:        { ...DEFAULT_POLICY, timeoutMs: 10_000, maxAttempts: 2, backoffMs: 500, retryOnlyTransient: true },
  analizar_publicaciones_ml: { ...DEFAULT_POLICY, timeoutMs: 15_000, maxAttempts: 2, backoffMs: 800, retryOnlyTransient: true },
  ver_metricas_ml:        { ...DEFAULT_POLICY, timeoutMs: 15_000, maxAttempts: 2, backoffMs: 800, retryOnlyTransient: true },

  // safe-idempotent (creación con id/dedupe)
  create_civic_report:    { ...DEFAULT_POLICY, timeoutMs: 15_000 },
  update_civic_report:    { ...DEFAULT_POLICY, timeoutMs: 10_000, maxAttempts: 2, backoffMs: 500, retryOnlyTransient: true },
  create_calendar_event:  { ...DEFAULT_POLICY, timeoutMs: 15_000 },
  delete_calendar_event:  { ...DEFAULT_POLICY, timeoutMs: 10_000 },
  save_to_drive:          { ...DEFAULT_POLICY, timeoutMs: 25_000, budgetOps: 0 },
  organize_files:         { ...DEFAULT_POLICY, timeoutMs: 15_000 },

  // long-io — generación de documentos
  create_document:        { ...DEFAULT_POLICY, timeoutMs: 45_000, budgetOps: 1 },
  create_file:            { ...DEFAULT_POLICY, timeoutMs: 45_000, budgetOps: 1 },
  create_contract_draft:  { ...DEFAULT_POLICY, timeoutMs: 30_000, budgetOps: 0 },

  // destructive — sin retry silencioso, verifier obligatorio
  enviar_correo:          { ...DEFAULT_POLICY, timeoutMs: 20_000, verifyStrategy: 'external' },
  trigger_outbound_call:  { ...DEFAULT_POLICY, timeoutMs: 15_000, verifyStrategy: 'external' },
  solicitar_factura:      { ...DEFAULT_POLICY, timeoutMs: 20_000, verifyStrategy: 'external' },
  qb_crear_factura:       { ...DEFAULT_POLICY, timeoutMs: 25_000, budgetOps: 1, verifyStrategy: 'external' },

  // meta-tools (delegación / consulta) — timeout largo, sin retry
  delegar_tarea:          { ...DEFAULT_POLICY, timeoutMs: 90_000 },
  consultar_agente:       { ...DEFAULT_POLICY, timeoutMs: 60_000 },
};

export function policyFor(toolName: string): ToolPolicy {
  return TOOL_POLICIES[toolName] ?? DEFAULT_POLICY;
}

/** Heuristic: does this error look transient (network glitch / 5xx / timeout)? */
export function looksTransient(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.toLowerCase();
  if (m.includes('timeout')) return true;
  if (m.includes('econnreset') || m.includes('etimedout') || m.includes('enotfound') || m.includes('econnrefused')) return true;
  if (/\b(50\d|429|408)\b/.test(m)) return true;
  if (m.includes('fetch failed') || m.includes('network')) return true;
  return false;
}
