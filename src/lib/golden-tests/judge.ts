import Anthropic from '@anthropic-ai/sdk';
import type { GoldenScenario, ConversationTurn, JudgeOutput } from './types';

const client = new Anthropic();

const MODEL = 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 1000;
const MAX_PARSE_RETRIES = 2;

interface JudgeResult {
  output: JudgeOutput | null;
  tokens: number;
  parseError?: string;
}

export async function judgeTranscript(
  scenario: GoldenScenario,
  transcript: ConversationTurn[],
): Promise<JudgeResult> {
  const systemPrompt = buildJudgeSystemPrompt(scenario);
  const userMessage = buildJudgeUserMessage(scenario, transcript);

  let totalTokens = 0;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.1,
      system: systemPrompt,
      tools: [JUDGE_TOOL],
      tool_choice: { type: 'tool', name: 'submit_verdict' },
      messages: [{ role: 'user', content: userMessage }],
    });

    totalTokens += response.usage.input_tokens + response.usage.output_tokens;

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      lastError = 'no tool_use in response';
      continue;
    }

    const parsed = validateJudgeOutput(toolUse.input);
    if (parsed.ok) {
      return { output: parsed.value, tokens: totalTokens };
    }
    lastError = parsed.error;
  }

  return { output: null, tokens: totalTokens, parseError: lastError };
}

const JUDGE_TOOL = {
  name: 'submit_verdict',
  description: 'Envía el veredicto del transcript en formato estructurado.',
  input_schema: {
    type: 'object' as const,
    properties: {
      score: {
        type: 'number',
        description: 'Score 0.00-1.00 basado en cuántos success_criteria se cumplieron (con pesos según rubric).',
      },
      passed_criteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'Criterios de success_criteria que la recepcionista SÍ cumplió. Copiar texto exacto.',
      },
      failed_criteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'Criterios que NO se cumplieron. Copiar texto exacto.',
      },
      reasoning: {
        type: 'string',
        description: 'Explicación breve (1-3 oraciones) de la decisión del score.',
      },
    },
    required: ['score', 'passed_criteria', 'failed_criteria', 'reasoning'],
  },
};

function validateJudgeOutput(raw: unknown): { ok: true; value: JudgeOutput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
  const o = raw as Record<string, unknown>;

  const score = typeof o.score === 'number' ? o.score : NaN;
  if (Number.isNaN(score) || score < 0 || score > 1) return { ok: false, error: `invalid score: ${o.score}` };

  const passed = Array.isArray(o.passed_criteria) ? o.passed_criteria.filter(x => typeof x === 'string') : null;
  if (!passed) return { ok: false, error: 'passed_criteria not string[]' };

  const failed = Array.isArray(o.failed_criteria) ? o.failed_criteria.filter(x => typeof x === 'string') : null;
  if (!failed) return { ok: false, error: 'failed_criteria not string[]' };

  const reasoning = typeof o.reasoning === 'string' ? o.reasoning : null;
  if (!reasoning) return { ok: false, error: 'reasoning not string' };

  return {
    ok: true,
    value: {
      score: Math.round(score * 100) / 100,
      passed_criteria: passed,
      failed_criteria: failed,
      reasoning,
    },
  };
}

function buildJudgeSystemPrompt(scenario: GoldenScenario): string {
  return `Eres un juez imparcial que evalúa una llamada entre un cliente y una recepcionista digital.

TU TRABAJO:
1. Leer el transcript completo.
2. Evaluar cada criterio de success_criteria por separado.
3. Dar un score global 0.00-1.00 usando la rúbrica del escenario.
4. Usar la herramienta submit_verdict para reportar tu veredicto.

RÚBRICA ESPECÍFICA DE ESTE ESCENARIO:
${scenario.judge_rubric}

REGLAS:
- Sé objetivo. Score 1.00 significa "cumplió todo perfectamente". Score 0.00 significa "fracaso total".
- Score típico de una llamada aceptable: 0.75-0.90.
- Si el escenario tiene un criterio marcado como CRÍTICO en la rúbrica y falló, el score máximo posible es 0.30.
- passed_criteria y failed_criteria deben usar el texto EXACTO de success_criteria (para que se puedan agregar en agregado).`.trim();
}

function buildJudgeUserMessage(scenario: GoldenScenario, transcript: ConversationTurn[]): string {
  const transcriptText = transcript
    .map(t => `${t.role === 'user' ? 'CLIENTE' : 'RECEPCIONISTA'}: ${t.content}`)
    .join('\n');

  const criteriaText = scenario.success_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');

  return `Escenario: ${scenario.title}

Criterios de éxito:
${criteriaText}

Transcript:
${transcriptText}

Emite tu veredicto usando la herramienta submit_verdict.`.trim();
}
