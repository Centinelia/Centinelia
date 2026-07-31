import { invokeMeerkat } from './meerkat-invoker';
import { generateUserTurn } from './simulated-user';
import { judgeTranscript } from './judge';
import type { GoldenScenario, ScenarioRun, ConversationTurn, ScenarioError } from './types';

export const RUNNER_TIMEOUT_MS = 90_000;

/**
 * Corre 1 escenario end-to-end contra la versión especificada.
 * Compone: user turn → meerkat turn → user turn → ... hasta goal_reached / hangup / max_turns.
 * Al final: judge → JudgeOutput.
 *
 * GARANTÍAS:
 * - Timeout duro de RUNNER_TIMEOUT_MS (90s) sobre todo el scenario.
 * - Loop detection: si el usuario simulado repite verbatim cualquier turno previo (sin contar
 *   el initial_message fijo), se corta con error='user_loop'.
 * - Judge corre SIEMPRE si transcript.length >= 2, incluso ante error, para score parcial.
 * - Pure: no loguea contenido de transcripts — solo scenario.id, version y msg de error.
 */
export async function runScenario(
  scenario: GoldenScenario,
  version: number,
): Promise<ScenarioRun> {
  const startedAt = Date.now();
  const transcript: ConversationTurn[] = [];
  const tokens = { user: 0, meerkat: 0, judge: 0 };
  let meerkatModel: string | null = null;
  let error: ScenarioError | null = null;

  const timeoutPromise = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error('RUNNER_TIMEOUT')), RUNNER_TIMEOUT_MS),
  );

  try {
    await Promise.race([runLoop(), timeoutPromise]);
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[runner] error', { scenario: scenario.id, version, msg });
    if (msg === 'RUNNER_TIMEOUT') error = 'max_turns_reached';
    else if (msg.startsWith('MEERKAT_FAIL')) error = 'meerkat_provider_fail';
    else if (msg.startsWith('USER_FAIL')) error = 'user_provider_fail';
    else if (msg === 'USER_LOOP') error = 'user_loop';
    else error = 'meerkat_provider_fail'; // fallback conservador
  }

  async function runLoop(): Promise<void> {
    // Turno 1 (fijo): user dice initial_message
    transcript.push({ role: 'user', content: scenario.user_persona.initial_message });

    while (transcript.length < scenario.max_turns * 2) {
      // Meerkat turn
      try {
        const m = await invokeMeerkat(scenario.meerkat_id, version, transcript);
        transcript.push({ role: 'meerkat', content: m.content });
        tokens.meerkat += m.tokens;
        meerkatModel = m.model;
      } catch (e) {
        throw new Error(`MEERKAT_FAIL: ${(e as Error).message}`);
      }

      // User turn
      try {
        const u = await generateUserTurn(scenario, transcript);
        tokens.user += u.tokens;

        // Loop detection: si el usuario repite exactamente un turno anterior (sin contar el 1er
        // turno fijo), cortamos. Empujamos el contenido para que el juez vea el loop.
        const priorUserTurns = transcript.filter(t => t.role === 'user').slice(1);
        if (priorUserTurns.some(t => t.content === u.content)) {
          transcript.push({ role: 'user', content: u.content });
          throw new Error('USER_LOOP');
        }

        transcript.push({ role: 'user', content: u.content });

        if (u.stopReason === 'goal_reached' || u.stopReason === 'user_hangup') return;
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === 'USER_LOOP') throw e;
        throw new Error(`USER_FAIL: ${msg}`);
      }
    }

    // Salimos por max_turns sin goal ni hangup
    if (!error) error = 'max_turns_reached';
  }

  // Juez (siempre corre si hay al menos 1 turno de cada lado, incluso en error — para score parcial)
  let judgeOutput = null;
  if (transcript.length >= 2) {
    try {
      const j = await judgeTranscript(scenario, transcript);
      judgeOutput = j.output;
      tokens.judge += j.tokens;
      if (!judgeOutput) error = error ?? 'judge_parse_fail';
    } catch (e) {
      console.error('[runner] judge error', { scenario: scenario.id, e: (e as Error).message });
      error = error ?? 'judge_parse_fail';
    }
  }

  const score = judgeOutput?.score ?? null;
  const scenario_passed = score != null ? score >= 0.70 : false;

  const cost_usd = estimateCost(tokens, meerkatModel);
  const duration_ms = Date.now() - startedAt;

  return {
    scenario_id: scenario.id,
    version,
    score,
    scenario_passed,
    transcript,
    judge_output: judgeOutput,
    duration_ms,
    error,
    tokens_used: tokens,
    cost_usd,
  };
}

/**
 * Estimación conservadora de costo por scenario_run.
 *
 * Rates blended input+output (aprox. media de anthropic pricing):
 *   Haiku 4.5    ≈ $2.40/M tokens
 *   Sonnet 4.6   ≈ $9.00/M tokens
 *   Opus         ≈ $45.00/M tokens (por si algún meerkat lo usa en el futuro)
 *
 * User simulado siempre es Haiku. Judge siempre es Sonnet.
 * Meerkat: usa el modelo resuelto en runtime (puede ser Haiku, Sonnet, o Opus).
 * Si meerkatModel es null (falló antes del primer turno), asume Haiku conservadoramente.
 */
function estimateCost(
  tokens: { user: number; meerkat: number; judge: number },
  meerkatModel: string | null,
): number {
  const userRate  = 2.4;
  const judgeRate = 9.0;
  const meerkatRate = rateForModel(meerkatModel);

  const userCost    = (tokens.user    / 1_000_000) * userRate;
  const meerkatCost = (tokens.meerkat / 1_000_000) * meerkatRate;
  const judgeCost   = (tokens.judge   / 1_000_000) * judgeRate;
  return Math.round((userCost + meerkatCost + judgeCost) * 10_000) / 10_000;
}

function rateForModel(model: string | null): number {
  if (!model) return 2.4; // conservador
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 45.0;
  if (lower.includes('sonnet')) return 9.0;
  return 2.4; // haiku o cualquier otro barato
}
