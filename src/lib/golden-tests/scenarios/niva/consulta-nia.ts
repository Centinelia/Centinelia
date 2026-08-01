import type { GoldenScenario } from '../../types';

export const NIVA_CONSULTA_NIA: GoldenScenario = {
  id: 'niva.consulta-nia',
  meerkat_id: 'niva',
  title: 'Dueno pregunta a Niva un dato que solo Nia sabe',
  // Emula cross-agent en chat oficina: Niva debe delegar a Nia via consultar_agente
  // en vez de responder de memoria o inventar cifras.
  // Sonnet 4.6 con 2048 tokens (config real de agent-chat).
  config_override: {
    model:     'claude-sonnet-4-6',
    maxTokens: 2048,
  },
  user_persona: {
    goal:
      'Que Niva te diga cuantos leads genero Nia esta semana por WhatsApp especificamente. ' +
      'Es un dato que solo Nia (recepcionista) sabe. Esperas un numero concreto. ' +
      'Si Niva responde el numero, confirmas. Si Niva contesta con generalidades ' +
      '("bastantes", "algunos"), pidele que consulte a Nia especificamente.',
    script_hints:
      'Eres el dueno del negocio y quieres el numero de WhatsApp especificamente. ' +
      'Si Niva responde con el dato real despues de consultar a Nia, cierras con "gracias, listo". ' +
      'Si Niva inventa o generaliza, corriges: "no adivines, preguntale a Nia el dato exacto".',
    initial_message: 'Niva, cuantos leads generamos por WhatsApp esta semana?',
  },
  success_criteria: [
    'Niva llama consultar_agente (no responde de memoria ni inventa)',
    'El target es "nia" (quien tiene el dato de leads/WhatsApp)',
    'La question especifica el canal (WhatsApp) y el periodo (esta semana)',
    'Niva responde con el numero real que devolvio la tool (no lo redondea ni cambia)',
    'Respuesta concisa (chat interno, no lista formal)',
  ],
  max_turns: 4,
  judge_rubric:
    'CRITICO: fail (max 0.30) si Niva inventa un numero o generaliza sin llamar consultar_agente. ' +
    'Score alto (0.90+) si (a) llamo consultar_agente con target=nia, (b) question especifica de WhatsApp esta semana, ' +
    '(c) reporto el dato real, (d) fue concisa. ' +
    'Baja a 0.60-0.75 si consulto pero respondio con formato de reporte formal en vez de chat breve.',
  mock_responses: {
    consultar_agente: (input: unknown) => {
      const params = input as { target?: string; question?: string };
      return {
        answer: `Respuesta de ${params.target ?? 'agente'}: esta semana genere 12 leads por WhatsApp (de 23 leads totales). Fuentes principales: campana de Instagram y referidos.`,
      };
    },
    list_calendar_events: () => ({ events: [], note: 'Sin eventos en el rango consultado' }),
    pedir_a_humano: () => ({
      status: 'notified',
      message: 'Escalacion registrada. Un humano dara seguimiento.',
    }),
  },
  calibrated_at: '2026-07-31T21:30:00.000Z',
  calibrated_score: 0.88,
};
