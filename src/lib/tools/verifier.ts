import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

/**
 * F4.1 — Adversarial verifier para acciones destructivas.
 *
 * Se ejecuta ANTES de disparar acciones con side effects externos: llamada
 * saliente, envío de correo sin approval, etc. El modelo intenta refutar la
 * acción: "¿por qué NO deberíamos hacer esto?" Si detecta un problema serio
 * (privacidad, horario, spam, target equivocado, contenido problemático), la
 * acción se bloquea y devolvemos un mensaje al agente principal.
 *
 * Trade-off: agrega ~500ms de latencia y 1 llamada Haiku. Solo se usa en
 * puntos de riesgo alto donde el humano no está en el loop.
 */

interface VerifyOpts {
  action:            string;              // "llamada saliente", "envío de correo directo"
  target:            string;              // "+528112345678", "cliente@ejemplo.com"
  reason:            string;              // motivo declarado por el agente principal
  businessContext?:  string | null;       // KB o negocio para dar contexto
  currentIsoDate?:   string;              // para checks de horario
}

interface VerifyVerdict {
  safe:    boolean;
  concern: string | null;
}

const VERIFIER_SYSTEM = `Actúas como verificador adversarial. Tu única tarea es intentar refutar una acción que un agente IA está por ejecutar en el mundo real (llamada saliente, envío de correo directo).

Pregúntate: ¿por qué NO deberíamos hacer esto?

Consideraciones ligeras (aceptables, NO bloquear):
- Motivo estándar de negocio
- Target razonable dado el contexto

Bloquear si detectas:
- Riesgo LFPDPPP: contactar sin base legítima, compartir datos personales de terceros
- Contenido problemático: extorsión, fraude, cobranza ilegal, spam masivo, publicidad no solicitada, suplantación
- Horario inapropiado: llamada nocturna (>21h o <8h hora del cliente cuando conste)
- Target incorrecto: número/correo obviamente equivocado o de contacto interno
- Duplicación evidente: mismo target contactado hace pocos minutos por lo mismo

Regla de oro: NO inventes preocupaciones donde no las hay. Si en duda razonable, marca "safe" y menciona la duda en concern.

Responde SOLO JSON:
{ "safe": <true|false>, "concern": <"razón breve" | null> }`;

export async function verifyDestructiveAction(opts: VerifyOpts): Promise<VerifyVerdict> {
  const userContent = [
    `ACCIÓN: ${opts.action}`,
    `DIRIGIDA A: ${opts.target}`,
    `MOTIVO DECLARADO: ${opts.reason}`,
    opts.businessContext ? `\nCONTEXTO DEL NEGOCIO:\n${opts.businessContext.slice(0, 800)}` : '',
    opts.currentIsoDate ? `\nMOMENTO: ${opts.currentIsoDate}` : '',
  ].filter(Boolean).join('\n');

  try {
    const resp = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: [{ type: 'text', text: VERIFIER_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
    });
    const raw = resp.content[0].type === 'text' ? resp.content[0].text.trim() : '';
    const m   = raw.match(/\{[\s\S]*\}/);
    if (!m) return { safe: true, concern: null };  // fail-open si judge no responde JSON
    const parsed = JSON.parse(m[0]) as { safe?: unknown; concern?: unknown };
    const safe    = typeof parsed.safe === 'boolean' ? parsed.safe : true;
    const concern = typeof parsed.concern === 'string' ? parsed.concern.slice(0, 300) : null;
    return { safe, concern };
  } catch (err) {
    console.error('[verifier] error, fail-open:', err);
    return { safe: true, concern: null };  // fail-open ante error del verifier
  }
}
