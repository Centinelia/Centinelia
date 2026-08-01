import type { GoldenScenario, MeerkatId } from './types';
import { NIA_SCENARIOS } from './scenarios/nia';
import { NOX_SCENARIOS } from './scenarios/nox';
import { NIVA_SCENARIOS } from './scenarios/niva';

// Los escenarios se agregan en Task 3 (nia) y en follow-ups (resto de meerkats).
// Regla: importar el array desde ./scenarios/<meerkat>.ts, nunca inline aquí.

export const GOLDEN_SCENARIOS: Record<MeerkatId, GoldenScenario[]> = {
  nia:   NIA_SCENARIOS,
  noah:  [],
  nico:  [],
  nelia: [],
  nara:  [],
  naia:  [],
  neo:   [],
  nova:  [],
  nox:   NOX_SCENARIOS,
  niva:  NIVA_SCENARIOS,
};
