import type { GoldenScenario, MeerkatId } from './types';

// Los escenarios se agregan en Task 3 (nia) y en follow-ups (resto de meerkats).
// Regla: importar el array desde ./scenarios/<meerkat>.ts, nunca inline aquí.

export const GOLDEN_SCENARIOS: Record<MeerkatId, GoldenScenario[]> = {
  nia:   [],
  noah:  [],
  nico:  [],
  nelia: [],
  nara:  [],
  naia:  [],
  neo:   [],
  nova:  [],
  nox:   [],
  niva:  [],
};
