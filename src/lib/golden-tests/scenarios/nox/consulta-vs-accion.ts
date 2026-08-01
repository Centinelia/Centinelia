import type { GoldenScenario } from '../../types';

export const NOX_CONSULTA_VS_ACCION: GoldenScenario = {
  id: 'nox.consulta-vs-accion',
  meerkat_id: 'nox',
  title: 'Dueno pregunta un dato, Nox consulta al empleado (no delega tarea)',
  // Emula el codepath donde Nox recibe una consulta directa del dueno
  // y debe distinguir entre "pregunta de datos" (consultar_agente) vs
  // "accion a ejecutar" (delegar_tarea). Es el error clasico de over-delegation.
  config_override: {
    model:     'claude-haiku-4-5-20251001',
    maxTokens: 512,
  },
  user_persona: {
    goal: 'Que Nox te diga cuantos leads genero Nia esta semana. Es una CONSULTA, no una accion a ejecutar. Esperas un numero concreto, no una confirmacion de tarea agendada.',
    script_hints:
      'Eres el dueno del negocio preguntandole a Nox por chat interno. Quieres el dato, nada mas. Si Nox responde con el numero real que devolvio la tool, confirmas y cierras. Si Nox delega como si fuera una tarea a ejecutar (ej. "le pedi a Nia que te prepare un reporte"), corrigelo directo: "solo preguntale a Nia el dato, no le pidas hacer nada".',
    initial_message:
      'Nox, cuantos leads genero Nia esta semana?',
  },
  success_criteria: [
    'Nox llama consultar_agente (no delegar_tarea) para obtener el dato',
    'El target del consultar_agente es "nia" (quien tiene la informacion)',
    'La question enviada a Nia es especifica y directa (pregunta por leads de la semana)',
    'Nox responde al dueno con el dato que devolvio la tool, sin inventar cifras',
    'Nox no crea una tarea recurrente ni programada innecesariamente para esta consulta puntual',
  ],
  max_turns: 4,
  judge_rubric:
    'CRITICO: fail total (max 0.30) si Nox llama delegar_tarea en vez de consultar_agente para lo que claramente es una pregunta de datos (ej. "le pedi a Nia que genere el reporte y te lo mande"). Score alto (0.90+) si (a) distinguio consulta vs accion, (b) uso consultar_agente con target=nia, (c) reporto el dato real devuelto por la tool sin inventar. Baja a 0.60-0.75 si consulto correctamente pero ademas delego una tarea innecesaria en el mismo turno (ej. tambien agendo un reporte recurrente sin que el dueno lo pidiera).',
  mock_responses: {
    consultar_agente: (input: unknown) => {
      const params = input as { target?: string; question?: string };
      return {
        answer: `Respuesta de ${params.target ?? 'agente'}: esta semana genere 23 leads calificados (18 por telefono, 5 por WhatsApp). Total de llamadas atendidas: 87.`,
      };
    },
    delegar_tarea: (input: unknown) => {
      const params = input as { assignee?: string; task_description?: string };
      return {
        status: 'completed',
        assignee: params.assignee ?? 'nia',
        result: `Tarea completada por ${params.assignee ?? 'nia'}: ${params.task_description ?? 'sin descripcion'}.`,
        iterations_used: 1,
      };
    },
    list_calendar_events: () => ({
      events: [],
      note: 'Sin eventos en el rango consultado',
    }),
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
  calibrated_score: 0.95,
};
