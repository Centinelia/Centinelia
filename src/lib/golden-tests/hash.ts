import { createHash } from 'node:crypto';
import { GOLDEN_SCENARIOS } from './registry';
import type { MeerkatId, GoldenScenario } from './types';

/**
 * Hash estable del registry para un meerkat. Cualquier cambio en id/goal/rubric/criteria
 * cambia el hash → invalida baselines. Serializa con keys ordenadas.
 */
export function hashScenarioSet(meerkatId: MeerkatId): string {
  const scenarios = GOLDEN_SCENARIOS[meerkatId] ?? [];
  const stable = scenarios
    .map(canonicalize)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const json = JSON.stringify(stable);
  return createHash('sha256').update(json).digest('hex');
}

function canonicalize(s: GoldenScenario) {
  // Excluye campos de calibración — son metadata operacional, no cambian el "shape" del test
  return {
    id: s.id,
    meerkat_id: s.meerkat_id,
    title: s.title,
    user_persona: {
      goal: s.user_persona.goal,
      script_hints: s.user_persona.script_hints,
      initial_message: s.user_persona.initial_message,
    },
    success_criteria: [...s.success_criteria].sort(),
    max_turns: s.max_turns,
    judge_rubric: s.judge_rubric,
  };
}
