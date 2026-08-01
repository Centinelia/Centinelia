import type { GoldenScenario } from '../../types';

export const NOX_TAREA_PROGRAMADA: GoldenScenario = {
  id: 'nox.tarea-programada',
  meerkat_id: 'nox',
  title: 'Dueno pide tarea recurrente, Nox usa agendar_tarea_programada',
  // Codepath: coordinador Nox (src/lib/ops/nox-coordinator.ts) recibe una peticion
  // recurrente y debe distinguir agendar_tarea_programada (schedule) de delegar_tarea
  // (ejecucion inmediata). Este es el error mas comun del meerkat.
  config_override: {
    model:     'claude-haiku-4-5-20251001',
    maxTokens: 512,
  },
  user_persona: {
    goal:
      'Quieres que cada lunes a las 9am recibas un resumen de los leads de la semana pasada. ' +
      'Es una tarea RECURRENTE, no una accion unica. Esperas que Nox confirme claramente que ' +
      'quedo programado y que te explique como cancelarla si algun dia quieres pararla.',
    script_hints:
      'Eres el dueno del negocio. Esperas una confirmacion clara del tipo "quedo programado ' +
      'para todos los lunes 9am". Si Nox promete un canal que no existe (ej. "te lo mando por ' +
      'notificacion push" o "por SMS") sin haberlo aclarado, preguntas "y como me va a llegar ' +
      'exactamente?". Si Nox no explica al final como cancelarla, preguntas: "y si algun dia ' +
      'quiero cancelarla, como le hago?".',
    initial_message:
      'Nox, cada lunes 9am mandame un resumen de los leads de la semana anterior.',
  },
  success_criteria: [
    'Nox llama agendar_tarea_programada (NO delegar_tarea, que es para ejecucion inmediata)',
    'El schedule capturado refleja "cada lunes 9am" correctamente (recurrente semanal, hora 9am)',
    'El assignee elegido es coherente con la tarea (nia para leads, o nelia si aplica atencion al cliente)',
    'Nox no promete canales que no existen (push notification, SMS, etc.) sin estar seguro',
    'Nox explica como cancelar la tarea programada si el usuario pregunta',
  ],
  max_turns: 5,
  judge_rubric:
    'CRITICO: fail total (max 0.30) si Nox usa delegar_tarea para algo claramente recurrente ' +
    '(el usuario dijo "cada lunes"). Score alto (0.90+) si (a) llamo agendar_tarea_programada ' +
    'con schedule que refleja lunes 9am recurrente, (b) assignee coherente (nia/nelia), ' +
    '(c) no prometio canales fabricados como push/SMS sin confirmar, (d) explico como cancelar ' +
    'cuando el dueno pregunto. Baja a 0.60-0.75 si programo bien pero prometio algo dudoso ' +
    '(ej. "te llega por push") o si no explico la cancelacion cuando fue preguntado ' +
    'explicitamente. Baja a 0.40-0.55 si el schedule quedo mal capturado (ej. una sola vez ' +
    'en vez de recurrente).',
  mock_responses: {
    agendar_tarea_programada: (input: unknown) => {
      const params = input as {
        task_description?: string;
        schedule?: string;
        assignee?: string;
      };
      if (!params.schedule || !params.assignee) {
        return {
          status: 'failed',
          error: 'MISSING_REQUIRED_PARAMS',
          message: 'agendar_tarea_programada requiere schedule y assignee no vacios',
        };
      }
      return {
        status: 'scheduled',
        id: 'task_scheduled_' + Math.random().toString(36).slice(2, 10),
        schedule: params.schedule,
        assignee: params.assignee,
        cancel_instructions:
          'Para cancelar, decile a Nox: "cancela la tarea programada [id]".',
      };
    },
    delegar_tarea: (input: unknown) => {
      const params = input as { assignee?: string; task_description?: string };
      if (!params.assignee || !params.task_description) {
        return {
          status: 'failed',
          error: 'MISSING_REQUIRED_PARAMS',
          message: 'delegar_tarea requiere assignee y task_description no vacios',
        };
      }
      return {
        status: 'completed',
        assignee: params.assignee,
        result: `Tarea ejecutada de inmediato por ${params.assignee}. Nota: si la peticion era recurrente, deberia haberse usado agendar_tarea_programada.`,
        iterations_used: 1,
      };
    },
    list_calendar_events: () => ({
      events: [],
      note: 'Sin eventos en el rango consultado — horario disponible',
    }),
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
  calibrated_at: '2026-07-31T21:00:00.000Z',
  calibrated_score: 0.95,
};
