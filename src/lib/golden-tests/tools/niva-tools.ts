import type { Tool } from '@anthropic-ai/sdk/resources/messages';

/**
 * Tool schemas de Niva para golden tests.
 *
 * Subset del executor.ts real (chat oficina). En prod Niva tiene el toolset
 * completo del executor (~20+ tools), pero para golden tests limitamos a las
 * tools relevantes a los scenarios (consulta cross-agent, calendario, escalacion).
 *
 * Cuando cambien las tools reales de Niva en prod, actualizar este archivo y
 * re-calibrar los escenarios.
 */
export const NIVA_TOOLS: Tool[] = [
  {
    name: 'consultar_agente',
    description:
      'Pregunta informacion a otro empleado del equipo. Solo para obtener datos que el otro sabe (ej. metricas, historicos, estado de leads/pedidos). NO uses para delegar acciones.',
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
    name: 'list_calendar_events',
    description:
      'Lista eventos del calendario del negocio en un rango. Usar cuando el dueno pregunta por citas, agenda, horarios ocupados/libres.',
    input_schema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Fecha/hora inicio (ISO o natural, ej. "manana 00:00").',
        },
        to: {
          type: 'string',
          description: 'Fecha/hora fin (ISO o natural, ej. "manana 23:59").',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'pedir_a_humano',
    description:
      'Escala al dueno o a un humano cuando (a) el dato solicitado no existe en el sistema ni en el conocimiento del equipo, (b) es una decision fuera del alcance del equipo digital. NO uses para consultas resolvibles con las otras tools.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'Por que se escala. Se especifica: que se pidio, por que no se puede resolver, que info faltaria.',
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
];
