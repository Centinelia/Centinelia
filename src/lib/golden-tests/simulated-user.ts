import Anthropic from '@anthropic-ai/sdk';
import type { GoldenScenario, ConversationTurn } from './types';

const client = new Anthropic();

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_OUTPUT_TOKENS = 200;
const TEMPERATURE = 0.7;

export interface UserTurnResult {
  content: string;
  tokens: number;
  stopReason: 'continue' | 'goal_reached' | 'user_hangup';
}

/**
 * Genera el próximo turno del usuario simulado dado el escenario y el transcript
 * hasta el momento. El primer turno DEBE ser el `initial_message` del escenario —
 * este helper solo se llama para turnos ≥ 2.
 */
export async function generateUserTurn(
  scenario: GoldenScenario,
  transcript: ConversationTurn[],
): Promise<UserTurnResult> {
  const systemPrompt = buildUserSystemPrompt(scenario);

  const messages = transcript.map(t => ({
    // Invertimos roles: cuando meerkat responde, para el "usuario simulado" es un turno "user".
    // Cuando el usuario habla, para él mismo es "assistant" (lo que él dijo antes).
    role: (t.role === 'meerkat' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: t.content,
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages,
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  const tokens = response.usage.input_tokens + response.usage.output_tokens;

  // Convención: si el modelo emite [GOAL_REACHED] o [HANGUP] al final del texto,
  // detectamos y limpiamos el sentinel del content.
  if (text.endsWith('[GOAL_REACHED]')) {
    return {
      content: text.replace(/\s*\[GOAL_REACHED\]\s*$/, '').trim(),
      tokens,
      stopReason: 'goal_reached',
    };
  }
  if (text.endsWith('[HANGUP]')) {
    return {
      content: text.replace(/\s*\[HANGUP\]\s*$/, '').trim(),
      tokens,
      stopReason: 'user_hangup',
    };
  }
  return { content: text, tokens, stopReason: 'continue' };
}

function buildUserSystemPrompt(scenario: GoldenScenario): string {
  return `Estás jugando el rol de un cliente que llama a una recepcionista. Tu objetivo es SIMULAR una llamada real, NO ayudar a nadie.

TU META (goal):
${scenario.user_persona.goal}

TU PERSONA:
${scenario.user_persona.script_hints}

REGLAS DE JUEGO:
- Cada turno debe ser UNA sola respuesta en 1-2 oraciones (como una persona real por teléfono).
- NO expliques que estás simulando. Solo actúa el rol.
- Cuando tu META esté cumplida, termina tu turno con el sentinel: [GOAL_REACHED]
- Si te frustras y colgarías en la vida real, termina tu turno con: [HANGUP]
- Nunca cambies el goal a mitad de conversación.
- Si la recepcionista te pregunta información que ya diste, respóndela otra vez pero anota que se te olvidó (es señal para el juez).
- Habla como cliente mexicano casual.`;
}
