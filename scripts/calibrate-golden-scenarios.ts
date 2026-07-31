/**
 * Calibración one-off de escenarios golden.
 *
 * Para cada escenario en NIA_SCENARIOS, corre N=5 veces contra v1,
 * calcula la mediana y sugiere calibrated_at + calibrated_score.
 * NO modifica ningún archivo — solo imprime las instrucciones.
 *
 * Uso:
 *   npx tsx scripts/calibrate-golden-scenarios.ts
 *
 * Requiere ANTHROPIC_API_KEY en .env.local o en el entorno.
 * Costo aproximado: ~$1.50. Tiempo: ~15-25 min.
 */

// Cargar .env.local antes de cualquier import que use Anthropic/Supabase
import './_bootstrap';

import { NIA_SCENARIOS } from '@/lib/golden-tests/scenarios/nia';
import { runScenario } from '@/lib/golden-tests/runner';
import type { GoldenScenario } from '@/lib/golden-tests/types';

const N_CALIBRATION = 5;
const TARGET_MIN = 0.75;
const TARGET_MAX = 0.95;

async function calibrate(scenario: GoldenScenario, version: number) {
  console.log(`\n=== ${scenario.id} vs v${version} — running N=${N_CALIBRATION} ===`);
  const scores: number[] = [];

  for (let i = 1; i <= N_CALIBRATION; i++) {
    const result = await runScenario(scenario, version);
    const s = result.score;
    console.log(`  attempt ${i}: score=${s}, cost=$${result.cost_usd}, dur=${result.duration_ms}ms, err=${result.error}`);
    if (s != null) scores.push(s);
  }

  if (scores.length === 0) {
    console.error(`  NO SCORES — cannot calibrate. Fix runner/judge before proceeding.`);
    return;
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  console.log(`  median=${median.toFixed(2)}, range=[${min.toFixed(2)}, ${max.toFixed(2)}]`);

  if (median < TARGET_MIN) {
    console.log(`  AVISO: median por debajo de ${TARGET_MIN} — rubric demasiado estricto, considera suavizarlo.`);
  } else if (max >= 1.00 && min >= 0.98) {
    console.log(`  AVISO: scoring en el techo — rubric no discrimina, agrega criterios negativos.`);
  } else if (median > TARGET_MAX) {
    console.log(`  AVISO: median por encima de ${TARGET_MAX} — considera rubric mas estricto.`);
  } else {
    console.log(`  OK: dentro de [${TARGET_MIN}, ${TARGET_MAX}] — listo para calibrar.`);
  }

  console.log(`\n  Para calibrar, agrega al escenario en src/lib/golden-tests/scenarios/nia.ts:`);
  console.log(`    calibrated_at: '${new Date().toISOString()}',`);
  console.log(`    calibrated_score: ${median.toFixed(2)},`);
}

async function main() {
  console.log(`Calibracion golden tests — N=${N_CALIBRATION} por escenario`);
  console.log(`Target rango: [${TARGET_MIN}, ${TARGET_MAX}]`);
  console.log(`Escenarios: ${NIA_SCENARIOS.length}`);

  for (const scenario of NIA_SCENARIOS) {
    await calibrate(scenario, 1);
  }

  console.log(`\n=== Calibracion completa ===`);
  console.log(`Siguiente paso: copia las lineas 'calibrated_at' y 'calibrated_score' a cada escenario en nia.ts.`);
  console.log(`Luego corre: npx tsx scripts/verify-golden-scenarios-snapshot.ts (el hash NO debe cambiar).`);
}

main().catch(e => { console.error(e); process.exit(1); });
