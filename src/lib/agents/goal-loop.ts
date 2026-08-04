/**
 * L1 — runGoalLoop: framework reutilizable de "loop on evidence".
 *
 * Extraído del patrón de delegar-tarea/route.ts. Cualquier tool o handler que
 * quiera ejecutar → verificar → reintentar con feedback ahora usa este helper.
 *
 * Loop on evidence, no on confidence: el `verify()` externo decide si el
 * resultado cumple el goal. El agente no puede auto-declararse "listo".
 */

export interface GoalLoopEvent<TResult> {
  kind:     'attempt_start' | 'attempt_end' | 'verify_start' | 'verify_end' | 'budget_exceeded' | 'timeout';
  attempt:  number;
  maxTries: number;
  result?:  TResult;
  verdict?: VerifyVerdict;
  elapsed?: number;
}

export interface VerifyVerdict {
  met:   boolean;
  notes: string;
}

export interface RunGoalLoopParams<TResult> {
  /** Human-readable goal, used only for verify feedback. */
  goal:            string;
  /** Executes one attempt. Receives previous eval notes (empty on first try). */
  action:          (attemptCtx: { attempt: number; previousNotes: string }) => Promise<TResult>;
  /** Returns verdict on whether TResult satisfies goal. Return null to auto-pass. */
  verify?:         (result: TResult) => Promise<VerifyVerdict | null>;
  /** Max attempts. Clamped [1, 5]. Default 3 when verify present, 1 otherwise. */
  maxTries?:       number;
  /** Wall-clock budget in ms. If exceeded between attempts, loop stops. Default 26s. */
  timeBudgetMs?:   number;
  /** Called on lifecycle events (for tracing / progress reporting). */
  onEvent?:        (ev: GoalLoopEvent<TResult>) => void | Promise<void>;
  /** Optional loop id, otherwise generated. Useful for correlating trace rows. */
  loopId?:         string;
}

export interface GoalLoopOutcome<TResult> {
  result:          TResult | null;
  met:             boolean;
  attempts:        number;
  evalNotes:       string;
  stoppedReason:   'success' | 'exhausted' | 'timeout' | 'no_result';
  loopId:          string;
  elapsedMs:       number;
}

export async function runGoalLoop<TResult>(
  params: RunGoalLoopParams<TResult>,
): Promise<GoalLoopOutcome<TResult>> {
  const {
    goal, action, verify,
    maxTries     = verify ? 3 : 1,
    timeBudgetMs = 26_000,
    onEvent,
  } = params;

  const clampedTries = Math.min(Math.max(maxTries, 1), 5);
  const loopId       = params.loopId ?? newLoopId();
  const startedAt    = Date.now();

  let lastResult:    TResult | null = null;
  let lastNotes  = '';
  let met        = false;
  let attemptsRun = 0;

  for (let attempt = 1; attempt <= clampedTries; attempt++) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > timeBudgetMs) {
      await safeEmit(onEvent, { kind: 'timeout', attempt, maxTries: clampedTries, elapsed });
      return finish('timeout');
    }

    attemptsRun = attempt;
    await safeEmit(onEvent, { kind: 'attempt_start', attempt, maxTries: clampedTries });

    let attemptResult: TResult;
    try {
      attemptResult = await action({ attempt, previousNotes: lastNotes });
    } catch (err) {
      lastNotes = `Falló el intento ${attempt}: ${err instanceof Error ? err.message : String(err)}`;
      await safeEmit(onEvent, { kind: 'attempt_end', attempt, maxTries: clampedTries });
      continue;
    }

    lastResult = attemptResult;
    await safeEmit(onEvent, { kind: 'attempt_end', attempt, maxTries: clampedTries, result: attemptResult });

    if (!verify) {
      met = true;
      return finish('success');
    }

    await safeEmit(onEvent, { kind: 'verify_start', attempt, maxTries: clampedTries, result: attemptResult });
    const verdict = await verify(attemptResult);
    if (!verdict) { met = true; return finish('success'); }
    lastNotes = verdict.notes;
    await safeEmit(onEvent, { kind: 'verify_end', attempt, maxTries: clampedTries, result: attemptResult, verdict });
    if (verdict.met) { met = true; return finish('success'); }
  }

  return finish(lastResult ? 'exhausted' : 'no_result');

  function finish(reason: GoalLoopOutcome<TResult>['stoppedReason']): GoalLoopOutcome<TResult> {
    return {
      result:        lastResult,
      met,
      attempts:      attemptsRun,
      evalNotes:     lastNotes,
      stoppedReason: reason,
      loopId,
      elapsedMs:     Date.now() - startedAt,
    };
  }

  // Referenced only for type-clarity of the closure param; used by callers via `goal`.
  void goal;
}

async function safeEmit<T>(
  onEvent: ((ev: GoalLoopEvent<T>) => void | Promise<void>) | undefined,
  ev: GoalLoopEvent<T>,
): Promise<void> {
  if (!onEvent) return;
  try { await onEvent(ev); } catch { /* swallow — instrumentation must never break loop */ }
}

function newLoopId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `loop_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
