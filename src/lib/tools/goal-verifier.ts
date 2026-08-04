/**
 * L3 — Verifier de completitud contra objetivo del usuario.
 *
 * Se ejecuta DESPUÉS del tool loop (agent-chat / inbox-processor / voice).
 * Detecta el patrón peligroso: el agente escribe "te envié X" o "ya lo guardé"
 * pero no invocó el tool correspondiente. Loop on evidence, no on confidence.
 *
 * Uso:
 *   import { verifyGoalResponse } from '@/lib/tools/goal-verifier';
 *   const check = await verifyGoalResponse({
 *     userIntent:    userMessage,
 *     agentResponse: draftReply,
 *     toolsInvoked:  ['send_email', 'save_to_drive'],  // solo las que ok:true
 *   });
 *   if (!check.met) {  // halucinación de acción — no auto-enviar }
 *
 * Cheap (Haiku, ~300 tokens). Fail-open ante errores del verifier.
 */
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export interface GoalResponseVerdict {
  met:     boolean;
  concern: string | null;
}

export interface VerifyResponseOpts {
  userIntent:     string;
  agentResponse:  string;
  toolsInvoked:   string[];
}

const RESPONSE_VERIFIER_SYSTEM = `Actúas como auditor de completitud de un agente IA.

El agente recibió una petición y respondió al usuario. Tu tarea: detectar el patrón peligroso donde el agente DICE que hizo algo pero no ejecutó el tool correspondiente (halucinación de acción).

Ejemplos que DEBES marcar como no cumplido:
- Agente dice "te envié el correo" pero no aparece send_email en tools invocadas
- Agente dice "ya lo guardé en Drive" pero no aparece save_to_drive
- Agente dice "agendé tu cita" pero no aparece create_calendar_event
- Agente dice "creé el documento" pero no aparece create_document / create_file

Ejemplos que NO son problema (marcar met=true):
- Agente ofrece información sin decir que ejecutó algo
- Agente hace una pregunta de clarificación
- Agente confirma que sí ejecutó Y aparece el tool en la lista

Regla: si no hay evidencia clara de halucinación, marca met=true.

Responde SOLO JSON: { "met": <true|false>, "concern": <"razón breve" | null> }`;

export async function verifyGoalResponse(opts: VerifyResponseOpts): Promise<GoalResponseVerdict> {
  const userMsg = [
    `PETICIÓN ORIGINAL DEL USUARIO:`,
    opts.userIntent.slice(0, 1500),
    ``,
    `TOOLS INVOCADAS EXITOSAMENTE: ${opts.toolsInvoked.length ? opts.toolsInvoked.join(', ') : '(ninguna)'}`,
    ``,
    `RESPUESTA DEL AGENTE:`,
    opts.agentResponse.slice(0, 2000),
  ].join('\n');

  try {
    const resp = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: [{ type: 'text', text: RESPONSE_VERIFIER_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }],
    });
    const raw = resp.content[0].type === 'text' ? resp.content[0].text.trim() : '';
    const m   = raw.match(/\{[\s\S]*\}/);
    if (!m) return { met: true, concern: null };
    const parsed = JSON.parse(m[0]) as { met?: unknown; concern?: unknown };
    const met     = typeof parsed.met === 'boolean' ? parsed.met : true;
    const concern = typeof parsed.concern === 'string' ? parsed.concern.slice(0, 300) : null;
    return { met, concern };
  } catch (err) {
    console.error('[goal-verifier] error, fail-open:', err);
    return { met: true, concern: null };
  }
}
