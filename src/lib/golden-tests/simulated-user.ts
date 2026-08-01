import Anthropic from '@anthropic-ai/sdk';
import type { GoldenScenario, ConversationTurn, MeerkatId } from './types';

const client = new Anthropic();

/**
 * Descripcion del rol que juega el usuario simulado segun con quien habla.
 * Nia recibe clientes por telefono; Nox/Niva coordinan al dueno via chat interno.
 */
interface UserRolePlay {
  actor:  string; // "un cliente que llama a una recepcionista"
  medium: string; // "como una persona real por telefono"
}

const USER_ROLEPLAY: Record<MeerkatId, UserRolePlay> = {
  nia:   { actor: 'un cliente que llama a una recepcionista',      medium: 'como una persona real por telefono' },
  noah:  { actor: 'un prospecto contactado por un vendedor',       medium: 'como una persona real por telefono' },
  nico:  { actor: 'un deudor contactado por cobranza',             medium: 'como una persona real por telefono' },
  nelia: { actor: 'un cliente contactando atencion',               medium: 'como una persona real por telefono o chat' },
  nara:  { actor: 'un ciudadano reportando algo al gobierno',      medium: 'como una persona real por telefono' },
  naia:  { actor: 'un empleado consultando a recursos humanos',    medium: 'como una persona real por telefono' },
  neo:   { actor: 'un usuario reportando un problema tecnico',     medium: 'como una persona real por telefono o chat' },
  nova:  { actor: 'una persona reportando una urgencia operativa', medium: 'como una persona real por telefono' },
  nox:   { actor: 'el dueno del negocio pidiendole algo al director del equipo', medium: 'como si le estuvieras escribiendo por chat interno' },
  niva:  { actor: 'el dueno del negocio consultando a la directora del equipo',  medium: 'como si le estuvieras escribiendo por chat interno' },
};

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
  const roleplay = USER_ROLEPLAY[scenario.meerkat_id];
  return `Estas jugando el rol de ${roleplay.actor}. Tu objetivo es SIMULAR una interaccion real, NO ayudar a nadie.

TU META (goal):
${scenario.user_persona.goal}

TU PERSONA:
${scenario.user_persona.script_hints}

REGLAS DE JUEGO:
- Cada turno debe ser UNA sola respuesta en 1-2 oraciones (${roleplay.medium}).
- NO expliques que estas simulando. Solo actua el rol.
- Cuando tu META este cumplida, termina tu turno con el sentinel: [GOAL_REACHED]
- Si te frustras y cortarias la interaccion en la vida real, termina tu turno con: [HANGUP]
- Nunca cambies el goal a mitad de conversacion.
- Si el empleado te pregunta informacion que ya diste, respondela otra vez pero anota que se te olvido (es senal para el juez).
- Habla como persona mexicana casual.`;
}
