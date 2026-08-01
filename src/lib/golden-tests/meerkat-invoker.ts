import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam, ToolUseBlockParam, ToolResultBlockParam, ContentBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { resolveMeerkatConfig } from '@/lib/vapi/resolve-meerkat';
import { NIA_SYSTEM_PROMPT } from './prompts/nia-system';
import { NOX_SYSTEM_PROMPT } from './prompts/nox-system';
import { NIVA_SYSTEM_PROMPT } from './prompts/niva-system';
import { getToolsForMeerkat } from './tools';
import type { MeerkatId, ConversationTurn, ToolCall } from './types';

const client = new Anthropic();

/** Guard duro contra loops de tool use dentro de un solo turno. */
const MAX_TOOL_ITERATIONS = 6;

const MEERKAT_SYSTEM_PROMPTS: Partial<Record<MeerkatId, string>> = {
  nia:  NIA_SYSTEM_PROMPT,
  nox:  NOX_SYSTEM_PROMPT,
  niva: NIVA_SYSTEM_PROMPT,
};

export function getSystemPromptForMeerkat(meerkatId: MeerkatId): string {
  const prompt = MEERKAT_SYSTEM_PROMPTS[meerkatId];
  if (!prompt) {
    throw new Error(
      `No canonical system prompt registered for meerkat=${meerkatId}. Add one in src/lib/golden-tests/prompts/`,
    );
  }
  return prompt;
}

interface InvokeResult {
  /** Texto final que el meerkat dijo al usuario (concatenacion de text blocks). */
  content: string;
  tokens: number;
  model: string;
  /** Todas las tools llamadas durante este turno, en orden. */
  tool_calls: ToolCall[];
}

/**
 * Mock de respuestas de tools declarado por el scenario.
 * Valor estatico (siempre devuelve lo mismo) o funcion (input) => output.
 */
export type MockResponses = Record<string, unknown | ((input: unknown) => unknown)>;

/**
 * Invoca al meerkat con la config especifica de la version pedida.
 * NOTA: usa Anthropic directo (no Vapi) para aislar el test del stack de telefonia.
 * El comportamiento del modelo con este system prompt + config debe ser representativo
 * de la produccion — validarlo con smoke tests periodicos.
 *
 * Modo con tools (Nox, Niva, etc.):
 *   Si el meerkat tiene tools registradas en getToolsForMeerkat, activa loop:
 *   modelo puede llamar tools → invoker ejecuta mock → devuelve tool_result → modelo
 *   continua hasta emitir texto final (o hasta MAX_TOOL_ITERATIONS).
 *
 * Modo sin tools (Nia):
 *   Un solo llamado, comportamiento igual al original.
 */
export interface ConfigOverride {
  model?:       string;
  maxTokens?:   number;
  temperature?: number;
}

export async function invokeMeerkat(
  meerkatId: MeerkatId,
  version: number,
  transcript: ConversationTurn[],
  mockResponses?: MockResponses,
  configOverride?: ConfigOverride,
): Promise<InvokeResult> {
  const baseConfig = await resolveMeerkatConfig(meerkatId, version);
  const config = {
    ...baseConfig,
    ...(configOverride?.model       != null ? { model:       configOverride.model       } : {}),
    ...(configOverride?.maxTokens   != null ? { maxTokens:   configOverride.maxTokens   } : {}),
    ...(configOverride?.temperature != null ? { temperature: configOverride.temperature } : {}),
  };
  const systemPrompt = getSystemPromptForMeerkat(meerkatId);
  const tools = getToolsForMeerkat(meerkatId);

  const messages: MessageParam[] = transcriptToMessages(transcript);
  const accumulatedToolCalls: ToolCall[] = [];
  const textPieces: string[] = [];
  let totalTokens = 0;
  let modelUsed = config.model;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    });

    totalTokens += response.usage.input_tokens + response.usage.output_tokens;
    modelUsed = response.model;

    const textBlocks = response.content.filter(b => b.type === 'text');
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    const textThisIter = textBlocks
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim();
    if (textThisIter) textPieces.push(textThisIter);

    // Sin tool_use: turno terminado
    if (toolUseBlocks.length === 0) {
      return {
        content: textPieces.join('\n').trim(),
        tokens: totalTokens,
        model: modelUsed,
        tool_calls: accumulatedToolCalls,
      };
    }

    // Con tool_use: registrar assistant message tal cual + ejecutar mocks + tool_result
    messages.push({ role: 'assistant', content: response.content as ContentBlockParam[] });

    const toolResults: ToolResultBlockParam[] = [];
    for (const tu of toolUseBlocks) {
      if (tu.type !== 'tool_use') continue;
      const output = executeMock(tu.name, tu.input, mockResponses);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(output),
      });
      accumulatedToolCalls.push({ name: tu.name, input: tu.input, output });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return {
    content: textPieces.join('\n').trim() || '[MAX_TOOL_ITERATIONS reached without final text]',
    tokens: totalTokens,
    model: modelUsed,
    tool_calls: accumulatedToolCalls,
  };
}

function executeMock(
  name: string,
  input: unknown,
  mockResponses?: MockResponses,
): unknown {
  if (!mockResponses || !(name in mockResponses)) {
    return { error: `no mock registered for tool '${name}'` };
  }
  const mock = mockResponses[name];
  if (typeof mock === 'function') {
    try {
      return (mock as (i: unknown) => unknown)(input);
    } catch (e) {
      return { error: `mock threw: ${(e as Error).message}` };
    }
  }
  return mock;
}

/**
 * Convierte el transcript persistido a MessageParam[] para la API.
 * Turnos meerkat con tool_calls se expanden en:
 *   assistant [tool_use blocks] → user [tool_result blocks] → assistant [texto final]
 *
 * Simplificacion: se folded en un solo ciclo aunque en runtime el turno haya tenido
 * multiples ciclos internos. Pierde algo de fidelidad pero es suficiente para que el
 * meerkat mantenga memoria de que tools llamo antes.
 */
function transcriptToMessages(transcript: ConversationTurn[]): MessageParam[] {
  const msgs: MessageParam[] = [];
  let idCounter = 0;

  for (const t of transcript) {
    if (t.role === 'user') {
      msgs.push({ role: 'user', content: t.content });
      continue;
    }

    if (!t.tool_calls || t.tool_calls.length === 0) {
      msgs.push({ role: 'assistant', content: t.content });
      continue;
    }

    const toolUses: ToolUseBlockParam[] = t.tool_calls.map((tc, i) => ({
      type: 'tool_use',
      id: `prior_${idCounter}_${i}`,
      name: tc.name,
      input: (tc.input ?? {}) as Record<string, unknown>,
    }));
    msgs.push({ role: 'assistant', content: toolUses });

    const toolResults: ToolResultBlockParam[] = t.tool_calls.map((tc, i) => ({
      type: 'tool_result',
      tool_use_id: `prior_${idCounter}_${i}`,
      content: JSON.stringify(tc.output),
    }));
    msgs.push({ role: 'user', content: toolResults });

    if (t.content) {
      msgs.push({ role: 'assistant', content: t.content });
    }
    idCounter++;
  }

  return msgs;
}
