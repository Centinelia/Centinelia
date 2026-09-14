/**
 * defineCron — factory único para crons de Centinelia.
 *
 * Encapsula el patrón repetido en 63 rutas de /api/cron/*:
 *  1. verifyCronAuth (CRON_SECRET Bearer)
 *  2. createAdminClient
 *  3. timing start/end
 *  4. try/catch alrededor del handler
 *  5. counters expected/processed/errors → alertCronPartialFailure
 *  6. registro en cron_runs (observabilidad estructurada)
 *  7. log estructurado (name, duration_ms, status)
 *  8. timeout budget (soft; hard timeout es de Vercel)
 *  9. respuesta consistente { ok, name, expected, processed, errors_count, duration_ms }
 *
 * Uso:
 *
 *   export const GET = defineCron({
 *     name: 'heartbeat',
 *     maxDuration: 300,
 *     handler: async ({ supabase, now, log }) => {
 *       const items = await supabase.from('voice_agents').select(...);
 *       let processed = 0;
 *       const errors: string[] = [];
 *       for (const item of items.data ?? []) {
 *         try { await doWork(item); processed++; }
 *         catch (e) { errors.push(errorMessage(e)); }
 *       }
 *       return { expected: items.data?.length ?? 0, processed, errors };
 *     },
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { alertCronPartialFailure, errorMessage } from './alert-partial-failure';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CronContext {
  supabase: SupabaseClient;
  /** Timestamp del inicio del run, útil para tests con fake timers. */
  now:      Date;
  /** Logger estructurado; auto-prefija el cron name. */
  log:      {
    info:  (msg: string, meta?: Record<string, unknown>) => void;
    warn:  (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

export interface CronResult {
  /** Items totales a procesar. Sirve para detectar partial failure. */
  expected:  number;
  /** Items procesados exitosamente. */
  processed: number;
  /** Errores acumulados durante el loop. */
  errors?:   string[];
  /** Metadata libre para debug (ej. { skipped: 3, refunded: 2 }). */
  metadata?: Record<string, unknown>;
}

export interface DefineCronOptions {
  /** Nombre único del cron — debe matchear su ruta (heartbeat, reset-minutes). */
  name:         string;
  handler:      (ctx: CronContext) => Promise<CronResult>;
  /** Presupuesto soft en segundos. Si se excede, se marca timeout pero se retorna
   *  la respuesta parcial. NO cancela el handler — Vercel es quien hard-corta. */
  maxDuration?: number;
  /** Si true, no dispara alertCronPartialFailure al final. Útil para crons de
   *  scan que "por diseño" no procesan todo (ej. dispatch-post-call-surveys). */
  silenceAlerts?: boolean;
}

// ─── Wrapper ────────────────────────────────────────────────────────────────

export function defineCron(opts: DefineCronOptions) {
  return async function cronHandler(req: NextRequest): Promise<NextResponse> {
    // 1. Auth CRON_SECRET
    if (!verifyCronAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const startedAt = new Date();
    const startedMs = Date.now();

    // 2. Registrar inicio en cron_runs (best-effort — si la tabla no existe,
    // continuamos sin bloquear el cron).
    const runId = await recordCronStart(supabase, opts.name, startedAt);

    // 3. Ejecutar handler
    let result: CronResult | null = null;
    let handlerError: unknown = null;
    try {
      result = await opts.handler({
        supabase,
        now: startedAt,
        log: makeLogger(opts.name),
      });
    } catch (err) {
      handlerError = err;
    }

    const durationMs = Date.now() - startedMs;
    const timedOut   = typeof opts.maxDuration === 'number'
      ? durationMs > opts.maxDuration * 1000
      : false;
    const status: CronRunStatus =
      handlerError ? 'error' :
      timedOut     ? 'timeout' :
      result && (result.errors?.length ?? 0) === 0 && result.expected === result.processed ? 'ok' :
      'partial';

    // 4. Registrar fin en cron_runs
    await recordCronEnd(supabase, runId, {
      status,
      durationMs,
      expected:     result?.expected,
      processed:    result?.processed,
      errorsCount:  result?.errors?.length,
      errorSample:  (result?.errors ?? []).slice(0, 3).join(' | ') || (handlerError ? errorMessage(handlerError) : null),
      metadata:     result?.metadata ?? null,
    });

    // 5. Alertas para partial failure y crashes
    if (!opts.silenceAlerts) {
      if (handlerError) {
        await alertCronPartialFailure(supabase, {
          cronName:  opts.name,
          expected:  0,
          processed: 0,
          errors:    [errorMessage(handlerError)],
        }).catch(err => console.error(`[${opts.name}] alert failed:`, err));
      } else if (result && (result.expected > result.processed || (result.errors?.length ?? 0) > 0)) {
        await alertCronPartialFailure(supabase, {
          cronName:  opts.name,
          expected:  result.expected,
          processed: result.processed,
          errors:    result.errors,
        }).catch(err => console.error(`[${opts.name}] alert failed:`, err));
      }
    }

    // 6. Log estructurado (JSON) — útil para logs de Vercel + Grep
    console.log(JSON.stringify({
      cron:        opts.name,
      status,
      duration_ms: durationMs,
      expected:    result?.expected ?? null,
      processed:   result?.processed ?? null,
      errors:      result?.errors?.length ?? (handlerError ? 1 : 0),
    }));

    // 7. Respuesta HTTP consistente
    if (handlerError) {
      return NextResponse.json({
        ok: false,
        cron: opts.name,
        status,
        duration_ms: durationMs,
        error: errorMessage(handlerError),
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: status === 'ok',
      cron: opts.name,
      status,
      duration_ms:  durationMs,
      expected:     result?.expected ?? 0,
      processed:    result?.processed ?? 0,
      errors_count: result?.errors?.length ?? 0,
      ...(result?.metadata ? { metadata: result.metadata } : {}),
    });
  };
}

// ─── Observability ──────────────────────────────────────────────────────────

type CronRunStatus = 'ok' | 'partial' | 'error' | 'timeout';

interface CronRunEndArgs {
  status:       CronRunStatus;
  durationMs:   number;
  expected?:    number;
  processed?:   number;
  errorsCount?: number;
  errorSample?: string | null;
  metadata?:    Record<string, unknown> | null;
}

/**
 * Insert row en cron_runs (best-effort). Retorna el id o null si falla.
 * Si la tabla no existe (migration pendiente), no rompemos el cron.
 */
async function recordCronStart(
  supabase: SupabaseClient,
  cronName: string,
  startedAt: Date,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('cron_runs')
      .insert({
        cron_name:  cronName,
        started_at: startedAt.toISOString(),
        status:     'running',
      })
      .select('id')
      .maybeSingle();
    if (error) {
      // Tabla no existe / permisos → no bloqueamos.
      console.warn(`[${cronName}] cron_runs insert failed (safe fallback):`, error.message);
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    console.warn(`[${cronName}] cron_runs insert threw:`, err);
    return null;
  }
}

async function recordCronEnd(
  supabase: SupabaseClient,
  runId: string | null,
  args: CronRunEndArgs,
): Promise<void> {
  if (!runId) return;
  try {
    await supabase
      .from('cron_runs')
      .update({
        ended_at:      new Date().toISOString(),
        duration_ms:   args.durationMs,
        status:        args.status,
        expected:      args.expected ?? null,
        processed:     args.processed ?? null,
        errors_count:  args.errorsCount ?? 0,
        error_sample:  args.errorSample ?? null,
        metadata:      args.metadata ?? null,
      })
      .eq('id', runId);
  } catch (err) {
    console.warn('[cron_runs] update failed:', err);
  }
}

// ─── Logger ─────────────────────────────────────────────────────────────────

function makeLogger(name: string): CronContext['log'] {
  const prefix = `[cron:${name}]`;
  return {
    info:  (msg, meta) => console.log(`${prefix} ${msg}`, meta ?? ''),
    warn:  (msg, meta) => console.warn(`${prefix} ${msg}`, meta ?? ''),
    error: (msg, meta) => console.error(`${prefix} ${msg}`, meta ?? ''),
  };
}

// Re-export para conveniencia — muchos crons van a llamar errorMessage.
export { errorMessage };
