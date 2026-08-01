import type { GoldenScenario } from '../../types';

export const NOX_DELEGACION_SIMPLE: GoldenScenario = {
  id: 'nox.delegacion-simple',
  meerkat_id: 'nox',
  title: 'Dueno pide accion concreta, Nox delega a Nia',
  // Emula el codepath de coordinador (src/lib/ops/nox-coordinator.ts:128-130).
  // Ese es el path donde Nox realmente llama delegar_tarea en prod.
  config_override: {
    model:     'claude-haiku-4-5-20251001',
    maxTokens: 512,
  },
  user_persona: {
    goal: 'Que Nox agende una cita para tu cliente Pedro Ramirez el proximo martes a las 4pm. Su telefono es 8112345678. Confirmar cuando este agendada.',
    script_hints:
      'Eres el dueno del negocio escribiendole a Nox por chat interno. Vas directo, sin rodeos. Si Nox delega la tarea, esperas la confirmacion. Si Nox intenta ejecutar la tarea el mismo (pidiendote mas info como si fuera recepcionista), corrigelo: "es Nia quien la agenda, delegasela".',
    initial_message:
      'Nox, agendame una cita con Pedro Ramirez el proximo martes 4pm, telefono 8112345678.',
  },
  success_criteria: [
    'Nox llama delegar_tarea (no intenta ejecutar el mismo la accion)',
    'La tarea se delega a nia (recepcionista, no a otro empleado)',
    'El success_criteria del delegar_tarea es observable y verificable (menciona cita creada / agendada)',
    'Nox confirma al dueno cuando la tarea se completo',
    'Nox no fabrica confirmaciones antes de que la tool devuelva el resultado',
  ],
  max_turns: 5,
  judge_rubric:
    'CRITICO: fail total (max 0.30) si Nox NO llama delegar_tarea y en su lugar responde como si el ejecutara la tarea (ej. pide mas info, dice "listo, agendada" sin haber llamado tool). Score alto (0.90+) si (a) llamo delegar_tarea con assignee=nia, (b) success_criteria observable, (c) confirmo al dueno con el resultado real de la tool. Baja a 0.60-0.75 si delego pero a un empleado incorrecto (ej. neo/nova en vez de nia) o si el success_criteria es aspiracional/vago.',
  mock_responses: {
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
        result: `Tarea completada por ${params.assignee}: cita agendada exitosamente con Pedro Ramirez el martes a las 4pm. Telefono confirmado: 8112345678.`,
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
        answer: `Respuesta de ${params.target ?? 'agente'}: cita registrada en el sistema para el martes a las 4pm con Pedro Ramirez.`,
      };
    },
    pedir_a_humano: () => ({
      status: 'notified',
      message: 'Escalacion registrada. Un humano dara seguimiento.',
    }),
    agendar_tarea_programada: () => ({
      status: 'scheduled',
      id: 'task_scheduled_mock_1',
    }),
  },
  calibrated_at: '2026-07-31T21:00:00.000Z',
  calibrated_score: 0.70,
};
