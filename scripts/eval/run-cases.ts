#!/usr/bin/env tsx
/**
 * Runner de casos de eval con LLM-as-judge.
 *
 * Uso:
 *   npx tsx scripts/eval/run-cases.ts --cases=scripts/eval/cases --model=claude-haiku-4-5-20251001
 *   npx tsx scripts/eval/run-cases.ts --cases=scripts/eval/cases --only=cobros-01
 *
 * Requiere ANTHROPIC_API_KEY en env (auto-carga .env.local).
 */
import '../_bootstrap';
import Anthropic from '@anthropic-ai/sdk';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

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
  // TODO(Nazre): reemplazar este placeholder con una llamada real al prompt-builder
  // Idealmente: importar buildSystemPrompt de src/lib/voice/prompt-builder.ts y armar
  // el mismo prompt que iría a Vapi, luego correr localmente con el modelo del meerkat.
  // Por ahora: usa un system prompt básico para que el harness sea auditable end-to-end.

  const systemPrompt = `Eres un agente de voz para el negocio. Responde el siguiente turno de forma natural, breve y sin frases robóticas.
${c.business_context ? `Contexto: ${c.business_context}` : ''}`;

  const messages: Anthropic.MessageParam[] = c.transcript_input.map(t => ({
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

  console.log(`Corriendo ${cases.length} casos con ${model}...\n`);

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

  console.log(`\n${passed}/${cases.length} pasaron.`);
  if (passed < cases.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
