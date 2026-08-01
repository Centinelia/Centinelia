import type { Tool } from '@anthropic-ai/sdk/resources/messages';

/**
 * Tool schemas de Nox para golden tests.
 *
 * Version simplificada de las tools reales del executor (src/lib/tools/executor.ts):
 * en produccion tienen mas params y validacion. Aca preservamos la semantica minima
 * necesaria para evaluar comportamiento (que tool eligio, con que params, en que orden).
 *
 * Cuando cambien las tools reales de Nox en prod, actualizar este archivo y
 * re-calibrar los escenarios.
 */
export const NOX_TOOLS: Tool[] = [
  {
    name: 'delegar_tarea',
    description:
      'Asigna una tarea a otro empleado del equipo para que la ejecute. Se usa cuando hay una accion concreta a realizar (crear cita, enviar correo, procesar pedido). El empleado destino ejecuta la tarea en un loop hasta cumplir el success_criteria o agotar max_iterations.',
    input_schema: {
      type: 'object',
      properties: {
        task_description: {
          type: 'string',
          description: 'Descripcion breve y accionable de la tarea (que hay que hacer).',
        },
        assignee: {
          type: 'string',
          description: 'ID del empleado al que se delega. Ej: nia, noah, neo, nelia.',
          enum: ['nia', 'noah', 'nico', 'nelia', 'nara', 'naia', 'neo', 'nova'],
        },
        success_criteria: {
          type: 'string',
          description:
            'Criterio observable/verificable de exito (ej: "cita agendada con nombre y telefono"). Debe ser evaluable, no aspiracional.',
        },
        max_iterations: {
          type: 'number',
          description: 'Numero maximo de intentos del ejecutor. Default 3.',
        },
      },
      required: ['task_description', 'assignee', 'success_criteria'],
    },
  },
  {
    name: 'consultar_agente',
    description:
      'Pregunta informacion a otro empleado del equipo. NO es para delegar acciones, es solo para obtener datos que el otro sabe. Ej: "cuantos leads genero Nia esta semana".',
    input_schema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'ID del empleado a consultar.',
          enum: ['nia', 'noah', 'nico', 'nelia', 'nara', 'naia', 'neo', 'nova'],
        },
        question: {
          type: 'string',
          description: 'Pregunta especifica a hacerle.',
        },
      },
      required: ['target', 'question'],
    },
  },
  {
    name: 'pedir_a_humano',
    description:
      'Escala al dueno humano cuando (a) una tarea delegada fallo tras max_iterations, (b) no hay empleado que pueda resolverlo, (c) se necesita decision fuera del alcance del equipo. Incluye contexto completo del intento.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Por que se escala. Incluye que se intento y por que fallo.',
        },
        urgency: {
          type: 'string',
          enum: ['normal', 'alta', 'critica'],
          description: 'Urgencia del asunto.',
        },
      },
      required: ['reason', 'urgency'],
    },
  },
  {
    name: 'agendar_tarea_programada',
    description:
      'Crea una tarea recurrente o unica programada a futuro. Ej: "cada lunes 9am, dame resumen de leads". Solo para tareas realmente programadas, no para delegaciones inmediatas.',
    input_schema: {
      type: 'object',
      properties: {
        task_description: {
          type: 'string',
          description: 'Que hay que hacer cuando dispare.',
        },
        schedule: {
          type: 'string',
          description:
            'Cuando dispara. Formato natural (ej: "cada lunes 9am", "manana 3pm", "el 15 de cada mes").',
        },
        assignee: {
          type: 'string',
          enum: ['nia', 'noah', 'nico', 'nelia', 'nara', 'naia', 'neo', 'nova'],
          description: 'Empleado que ejecuta cuando dispare.',
        },
      },
      required: ['task_description', 'schedule', 'assignee'],
    },
  },
  {
    name: 'list_calendar_events',
    description:
      'Lista eventos del calendario del negocio en un rango. Se usa antes de proponer horarios para reuniones.',
    input_schema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Fecha/hora inicio (ISO o natural).',
        },
        to: {
          type: 'string',
          description: 'Fecha/hora fin (ISO o natural).',
        },
      },
      required: ['from', 'to'],
    },
  },
];
