/**
 * Smoke test del pipeline tool-aware de golden tests con el pilot scenario de Nox.
 *
 * Uso:
 *   npx tsx scripts/smoke-nox-golden.ts
 *
 * Requiere ANTHROPIC_API_KEY en .env.local o en el entorno.
 */

import './_bootstrap';

import { NOX_SCENARIOS } from '@/lib/golden-tests/scenarios/nox';
import { runScenario } from '@/lib/golden-tests/runner';

async function main() {
  const idx = process.argv[2] ? parseInt(process.argv[2], 10) : 0;
  const scenario = NOX_SCENARIOS[idx];
  if (!scenario) {
    console.error(`No scenario at index ${idx}. Available: 0..${NOX_SCENARIOS.length - 1}`);
    process.exit(1);
  }
  console.log(`Running scenario [${idx}]: ${scenario.id} vs v1...`);
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
    console.log(`  ${t.role.toUpperCase()}: ${t.content || '(sin texto)'}`);
    if (t.tool_calls) {
      for (const tc of t.tool_calls) {
        console.log(`    -> ${tc.name}(${JSON.stringify(tc.input)})`);
        console.log(`       => ${JSON.stringify(tc.output)}`);
      }
    }
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
