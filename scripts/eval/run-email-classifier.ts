#!/usr/bin/env tsx
/**
 * Golden tests para el email auto-mode classifier.
 *
 * Corre 10 fixtures contra Anthropic real. Valida contra umbrales:
 * - Recall en human|block >= 95% (máximo 1 falso negativo en 20 casos)
 * - Precision en send >= 80% (máximo 1 falso positivo en 5)
 *
 * Uso:
 *   npx tsx scripts/eval/run-email-classifier.ts
 *   npx tsx scripts/eval/run-email-classifier.ts --skip-thresholds
 *
 * Exit code:
 *   0 si pasa thresholds (o --skip-thresholds)
 *   1 si falla
 *
 * Requiere ANTHROPIC_API_KEY en env (auto-carga .env.local).
 */

import '../_bootstrap';
import * as fs from 'fs';
import * as path from 'path';
import type { AutoModeDecision, AutoModeVerdict, ClassifyOpts } from '../../src/lib/tools/email-classifier.js';

// Cargar .env.local manualmente ANTES de importar el classifier
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
}

interface Fixture {
  id: string;
  description: string;
  opts: ClassifyOpts;
  expected: {
    decision: AutoModeDecision | AutoModeDecision[];
  };
}

interface Result {
  id: string;
  description: string;
  expected: AutoModeDecision | AutoModeDecision[];
  actual: AutoModeDecision;
  reason: string;
  signals: string[];
  passed: boolean;
}

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.+))?$/);
  if (m) args.set(m[1], m[2] ?? 'true');
}

const skipThresholds = args.get('skip-thresholds') === 'true';
const casesDir = 'scripts/eval/cases/email-classifier';

const THRESHOLDS = {
  recall_human_block: 0.95,   // >= 95% recall en human|block
  precision_send: 0.80,        // >= 80% precision en send
};

function loadFixtures(dir: string): Fixture[] {
  if (!fs.existsSync(dir)) {
    console.error(`Directorio de fixtures no existe: ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const fixtures: Fixture[] = [];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
    const fixture = JSON.parse(raw) as Fixture;
    fixtures.push(fixture);
  }

  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

async function runFixture(fixture: Fixture): Promise<Result> {
  const { classifyEmailDraft } = await import('../../src/lib/tools/email-classifier.js');

  const start = Date.now();
  let verdict: AutoModeVerdict;

  try {
    verdict = await classifyEmailDraft(fixture.opts);
  } catch (err) {
    return {
      id: fixture.id,
      description: fixture.description,
      expected: fixture.expected.decision,
      actual: 'human',
      reason: `Error: ${String(err)}`,
      signals: [],
      passed: false,
    };
  }

  const dur = Date.now() - start;

  const decisionOk = Array.isArray(fixture.expected.decision)
    ? fixture.expected.decision.includes(verdict.decision)
    : verdict.decision === fixture.expected.decision;

  const passed = decisionOk;

  if (!passed) {
    console.error(`[${dur}ms] ✗ ${fixture.id}`);
    console.error(`        expected: ${Array.isArray(fixture.expected.decision) ? `[${fixture.expected.decision.join(', ')}]` : fixture.expected.decision}`);
    console.error(`        actual:   ${verdict.decision}`);
    console.error(`        reason:   ${verdict.reason}`);
    console.error(`        signals:  ${JSON.stringify(verdict.signals)}`);
  } else {
    console.log(`[${dur}ms] ✓ ${fixture.id} -> ${verdict.decision}`);
  }

  return {
    id: fixture.id,
    description: fixture.description,
    expected: fixture.expected.decision,
    actual: verdict.decision,
    reason: verdict.reason,
    signals: verdict.signals,
    passed,
  };
}

async function main() {
  const fixtures = loadFixtures(casesDir);

  if (fixtures.length === 0) {
    console.error(`Sin fixtures en ${casesDir}`);
    process.exit(1);
  }

  console.log(`Corriendo ${fixtures.length} fixtures del email classifier\n`);

  const results: Result[] = [];
  for (const fixture of fixtures) {
    const result = await runFixture(fixture);
    results.push(result);
  }

  // ── Métricas ────────────────────────────────────────────────────────────────

  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.length - totalPassed;

  // Recall en human|block: ¿cuántos de los casos human|block fueron detectados?
  const humanBlockCases = results.filter(r => {
    const exp = r.expected;
    return Array.isArray(exp)
      ? exp.includes('human') || exp.includes('block')
      : exp === 'human' || exp === 'block';
  });
  const humanBlockCorrect = humanBlockCases.filter(r => r.passed).length;
  const recallHumanBlock = humanBlockCases.length > 0 ? humanBlockCorrect / humanBlockCases.length : 1;

  // Precision en send: ¿cuántos de los casos enviados realmente eran send?
  const sendPredicted = results.filter(r => r.actual === 'send');
  const sendCorrect = sendPredicted.filter(r => r.passed).length;
  const precisionSend = sendPredicted.length > 0 ? sendCorrect / sendPredicted.length : 1;

  console.log(`\n─── RESULTADOS ───`);
  console.log(`Total: ${totalPassed}/${results.length} pasaron`);
  console.log(`Fallos: ${totalFailed}`);

  console.log(`\n─── MÉTRICAS ───`);
  console.log(`Recall (human|block): ${(recallHumanBlock * 100).toFixed(1)}% (${humanBlockCorrect}/${humanBlockCases.length})`);
  console.log(`Precision (send):     ${(precisionSend * 100).toFixed(1)}% (${sendCorrect}/${sendPredicted.length})`);

  console.log(`\n─── UMBRALES ───`);
  const recallOk = recallHumanBlock >= THRESHOLDS.recall_human_block;
  const precisionOk = precisionSend >= THRESHOLDS.precision_send;

  console.log(`Recall >= ${(THRESHOLDS.recall_human_block * 100).toFixed(0)}%: ${recallOk ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Precision >= ${(THRESHOLDS.precision_send * 100).toFixed(0)}%: ${precisionOk ? '✓ PASS' : '✗ FAIL'}`);

  if (skipThresholds) {
    console.log(`\n[--skip-thresholds] Reportando solo, no fallando.\n`);
    process.exit(0);
  }

  if (recallOk && precisionOk) {
    console.log(`\n✓ Todos los umbrales pasados!\n`);
    process.exit(0);
  } else {
    console.log(`\n✗ Umbrales no alcanzados.\n`);
    process.exit(1);
  }
}

void main();
