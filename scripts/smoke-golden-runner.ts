/**
 * Smoke test end-to-end del runner de golden tests.
 *
 * Corre el primer escenario de Nia (agendar-cita-basico) contra v1 y reporta
 * score, costo, duración y transcript completo.
 *
 * NOTA: Este script se reutiliza en Task 12 (calibración). NO borrar.
 *
 * Uso:
 *   npx tsx scripts/smoke-golden-runner.ts
 *
 * Requiere ANTHROPIC_API_KEY en .env.local o en el entorno.
 */

// Cargar .env.local antes de cualquier import que use Anthropic/Supabase
import './_bootstrap';

import { NIA_SCENARIOS } from '@/lib/golden-tests/scenarios/nia';
import { runScenario } from '@/lib/golden-tests/runner';

async function main() {
  const scenario = NIA_SCENARIOS[0]; // nia.agendar-cita-basico
  console.log(`Running scenario: ${scenario.id} vs v1...`);
  console.log(`Max turns: ${scenario.max_turns}`);
  console.log('---');

  const result = await runScenario(scenario, 1);

  console.log('Score:   ', result.score);
  console.log('Passed:  ', result.scenario_passed);
  console.log('Error:   ', result.error ?? 'none');
  console.log('Duration:', result.duration_ms, 'ms');
  console.log('Tokens:  ', result.tokens_used);
  console.log('Cost: $  ', result.cost_usd);
  console.log('---');
  console.log('Transcript:');
  for (const t of result.transcript) {
    console.log(`  ${t.role.toUpperCase()}: ${t.content}`);
  }
  console.log('---');
  if (result.judge_output) {
    console.log('Judge reasoning:', result.judge_output.reasoning);
    console.log('Passed criteria:', result.judge_output.passed_criteria);
    console.log('Failed criteria:', result.judge_output.failed_criteria);
  } else {
    console.log('Judge output: null');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
