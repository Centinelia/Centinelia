#!/usr/bin/env tsx
/**
 * Runner de casos de eval con LLM-as-judge.
 *
 * Uso:
 *   npx tsx scripts/eval/run-cases.ts --cases=scripts/eval/cases --model=claude-haiku-4-5-20251001
 *   npx tsx scripts/eval/run-cases.ts --cases=scripts/eval/cases --only=cobros-01
 *
 * A/B testing de F6.1 (CCE → CCP):
 *   PROMPT_VARIANT=old npx tsx scripts/eval/run-cases.ts > baseline.log
 *   PROMPT_VARIANT=new npx tsx scripts/eval/run-cases.ts > new.log
 *   (después comparar counts de passed y ces_estimate promedios por dimensión)
 *
 * Requiere ANTHROPIC_API_KEY en env (auto-carga .env.local).
 */
import '../_bootstrap';
import Anthropic from '@anthropic-ai/sdk';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CONVERSATIONAL_DNA, CCP, CCE_LEGACY_BASELINE, HCP, VOICE_RULES } from '../../src/lib/voice/rules';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.+)$/);
  if (m) args.set(m[1], m[2]);
}

const casesDir = args.get('cases') ?? 'scripts/eval/cases';
const model    = args.get('model') ?? 'claude-haiku-4-5-20251001';
const only     = args.get('only');

interface TranscriptTurn { role: 'assistant' | 'user'; text: string }
interface Expected {
  ces_min?:            Record<string, number>;
  expected_outcome?:   string;
  should_not_contain?: string[];
  should_contain_any?: string[];
}
interface Case {
  id:               string;
  description:      string;
  meerkat_role_id?: string;
  business_context?: string;
  transcript_input: TranscriptTurn[];
  expected:         Expected;
}

interface JudgeVerdict {
  passed:  boolean;
  reasons: string[];
  ces_estimate?: Record<string, number>;
}

const anthropic = new Anthropic();

function loadCases(dir: string): Case[] {
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const cases: Case[] = [];
  for (const f of files) {
    const raw = readFileSync(join(dir, f), 'utf-8');
    const c = JSON.parse(raw) as Case;
    if (only && !c.id.includes(only)) continue;
    cases.push(c);
  }
  return cases;
}

// LLM-as-judge: recibe el output y lo puntúa contra el expected
async function judge(c: Case, generated: string): Promise<JudgeVerdict> {
  const prompt = `Evalúa esta respuesta de agente de voz contra los criterios esperados.

CASO: ${c.description}

RESPUESTA GENERADA:
${generated}

CRITERIOS:
${c.expected.should_not_contain?.length
  ? `- NO debe contener ninguna de estas frases: ${c.expected.should_not_contain.map(s => `"${s}"`).join(', ')}`
  : ''}
${c.expected.should_contain_any?.length
  ? `- Debe contener AL MENOS UNA de estas ideas: ${c.expected.should_contain_any.map(s => `"${s}"`).join(', ')}`
  : ''}
${c.expected.ces_min ? `- Debe cumplir CES mínimo: ${JSON.stringify(c.expected.ces_min)}` : ''}

Responde SOLO con JSON:
{ "passed": bool, "reasons": ["..."], "ces_estimate": { "fluidez": 1-5, "comprension": 1-5, ... } }`;

  const resp = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = resp.content[0].type === 'text' ? resp.content[0].text.trim() : '{}';
  const m   = raw.match(/\{[\s\S]*\}/);
  if (!m) return { passed: false, reasons: ['Judge no devolvió JSON válido'] };
  try {
    return JSON.parse(m[0]) as JudgeVerdict;
  } catch {
    return { passed: false, reasons: ['Judge JSON parse failed'] };
  }
}

async function runCase(c: Case): Promise<{ id: string; verdict: JudgeVerdict; generated: string }> {
  // A/B: PROMPT_VARIANT=old usa CCE legacy, PROMPT_VARIANT=new (default) usa CCP.
  // Ambas variantes usan las mismas piezas fijas (DNA, HCP full, VOICE_RULES) para
  // aislar el efecto de la conversión rules → principles.
  const variant = process.env.PROMPT_VARIANT === 'old' ? 'old' : 'new';
  const conversationalRules = variant === 'old' ? CCE_LEGACY_BASELINE : CCP;

  const systemPrompt = [
    `Eres un empleado telefónico del negocio. Responde el siguiente turno en 1-3 oraciones.`,
    c.business_context ? `\nCONTEXTO DEL NEGOCIO:\n${c.business_context}` : '',
    `\n${CONVERSATIONAL_DNA}`,
    `\n${conversationalRules}`,
    `\n${HCP}`,
    `\n${VOICE_RULES}`,
  ].filter(Boolean).join('\n');

  // Si el transcript termina en assistant, cortamos ese último turno para que
  // el modelo regenere la respuesta y podamos comparar contra el "reference"
  // que dijo el meerkat original. El transcript debe terminar en un user turn
  // para que Anthropic acepte el request.
  let turns = c.transcript_input.slice();
  while (turns.length > 0 && turns[turns.length - 1].role === 'assistant') {
    turns = turns.slice(0, -1);
  }
  if (turns.length === 0) {
    return {
      id: c.id,
      verdict: { passed: false, reasons: ['transcript vacío después de cortar assistants finales'] },
      generated: '',
    };
  }

  const messages: Anthropic.MessageParam[] = turns.map(t => ({
    role:    t.role === 'assistant' ? 'assistant' : 'user',
    content: t.text,
  }));

  const resp = await anthropic.messages.create({
    model,
    max_tokens: 300,
    system:     systemPrompt,
    messages,
  });
  const generated = resp.content[0].type === 'text' ? resp.content[0].text.trim() : '';

  const verdict = await judge(c, generated);
  return { id: c.id, verdict, generated };
}

async function main() {
  const cases = loadCases(casesDir);
  if (cases.length === 0) {
    console.error(`Sin casos en ${casesDir}. Agrega archivos JSON siguiendo el formato de example.json.`);
    process.exit(0);
  }

  const variant = process.env.PROMPT_VARIANT === 'old' ? 'old (CCE legacy)' : 'new (CCP)';
  console.log(`Corriendo ${cases.length} casos con ${model} · variant: ${variant}\n`);

  let passed = 0;
  const results: Array<{ id: string; verdict: JudgeVerdict; generated: string }> = [];

  for (const c of cases) {
    const r = await runCase(c);
    results.push(r);
    if (r.verdict.passed) passed++;
    console.log(`${r.verdict.passed ? '✓' : '✗'} ${r.id}`);
    if (!r.verdict.passed) {
      for (const reason of r.verdict.reasons) console.log(`    · ${reason}`);
    }
  }

  // ── Resumen CES promedio por dimensión ────────────────────────────────────
  const dims = ['fluidez', 'comprension', 'naturalidad', 'conduccion', 'confianza', 'resolucion'] as const;
  const cesAvg: Record<string, { sum: number; count: number }> = {};
  for (const d of dims) cesAvg[d] = { sum: 0, count: 0 };

  for (const r of results) {
    const est = r.verdict.ces_estimate;
    if (!est) continue;
    for (const d of dims) {
      const v = est[d];
      if (typeof v === 'number') {
        cesAvg[d].sum   += v;
        cesAvg[d].count += 1;
      }
    }
  }

  console.log(`\n─── RESUMEN ───`);
  console.log(`${passed}/${cases.length} pasaron (${Math.round(passed / cases.length * 100)}%)`);
  console.log(`\nCES promedio por dimensión (variant ${variant}):`);
  for (const d of dims) {
    const c = cesAvg[d];
    const avg = c.count > 0 ? (c.sum / c.count).toFixed(2) : '—';
    console.log(`  ${d.padEnd(12)} ${avg}  (n=${c.count})`);
  }

  console.log(`\nGenerated responses (para inspección manual):`);
  for (const r of results) {
    console.log(`\n[${r.id}]`);
    console.log(`  ${r.generated.slice(0, 200)}${r.generated.length > 200 ? '…' : ''}`);
  }

  if (passed < cases.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
