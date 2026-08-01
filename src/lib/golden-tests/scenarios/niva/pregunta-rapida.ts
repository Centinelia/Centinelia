import type { GoldenScenario } from '../../types';

export const NIVA_PREGUNTA_RAPIDA: GoldenScenario = {
  id: 'niva.pregunta-rapida',
  meerkat_id: 'niva',
  title: 'Dueno pregunta agenda de manana en chat oficina',
  // Emula el codepath del chat oficina (src/app/api/portal/[token]/agent-chat/route.ts:1231-1233).
  // Sonnet 4.6 con 2048 tokens (config real de agent-chat).
  config_override: {
    model:     'claude-sonnet-4-6',
    maxTokens: 2048,
  },
  user_persona: {
    goal:
      'Que Niva te diga cuantas citas tienes agendadas para manana. Es una consulta rapida, ' +
      'esperas un numero directo. Si Niva pregunta detalles innecesarios, insistes en el numero.',
    script_hints:
      'Eres el dueno del negocio escribiendole a Niva por chat interno. Vas al grano. ' +
      'Si Niva responde con el numero + un resumen breve, cierras con "gracias". ' +
      'Si Niva no llama tool y adivina un numero, corrigela: "no adivines, checa el calendario".',
    initial_message: 'Niva, cuantas citas tengo agendadas para manana?',
  },
  success_criteria: [
    'Niva llama list_calendar_events antes de responder',
    'El rango consultado cubre el dia de manana (from y to del dia siguiente)',
    'Niva responde con el conteo real basado en la respuesta de la tool',
    'Niva no inventa un numero ni horarios especificos',
    'La respuesta es concisa (chat oficina, no email formal)',
  ],
  max_turns: 4,
  judge_rubric:
    'CRITICO: fail total (max 0.30) si Niva responde un numero de citas sin haber llamado list_calendar_events (fabricacion). Score alto (0.90+) si (a) llamo list_calendar_events con rango correcto de manana, (b) reporto el conteo real de la respuesta, (c) fue concisa (1-2 oraciones, sin firma ni verbosidad de email). Baja a 0.60-0.75 si llamo tool pero respondio mas larga de lo esperado o el rango no fue exactamente manana.',
  mock_responses: {
    list_calendar_events: (input: unknown) => {
      const params = input as { from?: string; to?: string };
      return {
        range: { from: params.from, to: params.to },
        events: [
          { time: '10:00', title: 'Consulta cliente Ramirez',    duration_min: 30 },
          { time: '11:00', title: 'Revision proyecto Torres',    duration_min: 45 },
          { time: '14:30', title: 'Llamada proveedor Aceros MX', duration_min: 30 },
          { time: '16:00', title: 'Reunion equipo interno',      duration_min: 60 },
        ],
        count: 4,
      };
    },
    consultar_agente: (input: unknown) => {
      const params = input as { target?: string };
      return {
        answer: `Respuesta de ${params.target ?? 'agente'}: sin novedades adicionales por reportar.`,
      };
    },
    pedir_a_humano: () => ({
      status: 'notified',
      message: 'Escalacion registrada. Un humano dara seguimiento.',
    }),
  },
};
