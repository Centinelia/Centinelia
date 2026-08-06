import Anthropic from '@anthropic-ai/sdk';
import type { GoldenScenario, ConversationTurn, JudgeOutput, MeerkatId } from './types';
import { logLlmCall } from '@/lib/observability/llm-log';

/**
 * Etiqueta legible del rol del meerkat para el juez.
 * Se muestra en el transcript y en el prompt del juez.
 */
const MEERKAT_ROLE_LABEL: Record<MeerkatId, string> = {
  nia:   'RECEPCIONISTA',
  noah:  'VENDEDOR',
  nico:  'COBRANZA',
  nelia: 'ATENCION',
  nara:  'COORDINADORA',
  naia:  'RRHH',
  neo:   'OPERACIONES',
  nova:  'DESPACHO',
  nox:   'COORDINADOR',
  niva:  'COORDINADORA',
};

/**
 * Etiqueta legible del interlocutor del meerkat.
 * Nia habla con clientes; Nox/Niva hablan con el dueno del negocio.
 */
const MEERKAT_COUNTERPART_LABEL: Record<MeerkatId, string> = {
  nia:   'CLIENTE',
  noah:  'PROSPECTO',
  nico:  'DEUDOR',
  nelia: 'CLIENTE',
  nara:  'CIUDADANO',
  naia:  'EMPLEADO',
  neo:   'USUARIO',
  nova:  'SOLICITANTE',
  nox:   'DUENO',
  niva:  'DUENO',
};

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
    const __t = Date.now();
    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.1,
        system: systemPrompt,
        tools: [JUDGE_TOOL],
        tool_choice: { type: 'tool', name: 'submit_verdict' },
        messages: [{ role: 'user', content: userMessage }],
      });
      void logLlmCall({ source: 'golden_test_judge', model: MODEL, usage: response.usage, latencyMs: Date.now() - __t, meta: { scenarioId: scenario.id, attempt } });
    } catch (err) {
      void logLlmCall({ source: 'golden_test_judge', model: MODEL, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { scenarioId: scenario.id, attempt } });
      throw err;
    }

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
  const roleLabel = MEERKAT_ROLE_LABEL[scenario.meerkat_id];
  const counterpartLabel = MEERKAT_COUNTERPART_LABEL[scenario.meerkat_id];

  return `Eres un juez imparcial que evalua una interaccion entre un ${counterpartLabel.toLowerCase()} y un empleado digital (${roleLabel.toLowerCase()}).

TU TRABAJO:
1. Leer el transcript completo (incluyendo las llamadas a tools que el empleado hizo).
2. Evaluar cada criterio de success_criteria por separado.
3. Dar un score global 0.00-1.00 usando la rubrica del escenario.
4. Usar la herramienta submit_verdict para reportar tu veredicto.

RUBRICA ESPECIFICA DE ESTE ESCENARIO:
${scenario.judge_rubric}

REGLAS:
- Se objetivo. Score 1.00 significa "cumplio todo perfectamente". Score 0.00 significa "fracaso total".
- Score tipico de una interaccion aceptable: 0.75-0.90.
- Si el escenario tiene un criterio marcado como CRITICO en la rubrica y fallo, el score maximo posible es 0.30.
- passed_criteria y failed_criteria deben usar el texto EXACTO de success_criteria (para que se puedan agregar en agregado).
- Si el empleado usa tools, evalua QUE tool eligio (correcta o no), CON QUE PARAMS y CUANTAS VECES. La eleccion de tool suele ser parte del criterio a evaluar.`.trim();
}

function buildJudgeUserMessage(scenario: GoldenScenario, transcript: ConversationTurn[]): string {
  const roleLabel = MEERKAT_ROLE_LABEL[scenario.meerkat_id];
  const counterpartLabel = MEERKAT_COUNTERPART_LABEL[scenario.meerkat_id];

  const transcriptText = transcript
    .map(t => {
      if (t.role === 'user') return `${counterpartLabel}: ${t.content}`;
      // Tool calls ocurren ANTES del texto final del turno (el texto es la sintesis
      // post-tool). Se renderizan primero para que el juez vea el orden real.
      const lines: string[] = [];
      if (t.tool_calls && t.tool_calls.length > 0) {
        for (const tc of t.tool_calls) {
          const inputStr = JSON.stringify(tc.input);
          const outputStr = JSON.stringify(tc.output);
          lines.push(`  [tool] ${tc.name}(${inputStr}) => ${outputStr}`);
        }
      }
      lines.push(`${roleLabel}: ${t.content || '(sin texto)'}`);
      return lines.join('\n');
    })
    .join('\n');

  const criteriaText = scenario.success_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');

  return `Escenario: ${scenario.title}

Criterios de exito:
${criteriaText}

Transcript:
${transcriptText}

Emite tu veredicto usando la herramienta submit_verdict.`.trim();
}
