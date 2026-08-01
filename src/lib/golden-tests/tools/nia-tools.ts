import type { Tool } from '@anthropic-ai/sdk/resources/messages';

/**
 * Tool schemas de Nia para golden tests — tramites externos.
 *
 * Subset del executor.ts real (src/lib/tools/executor.ts, ramas 1105-1175).
 * En produccion las tools consultan Supabase y llaman endpoints externos.
 * Aca preservamos la semantica minima necesaria para evaluar comportamiento:
 * que tool eligio Nia, con que parametros, y en que orden.
 *
 * Tambien se incluye pedir_a_humano para el escenario de 5xx con escalate=true.
 *
 * Cuando cambien los schemas reales en executor.ts, actualizar este archivo y
 * re-calibrar los escenarios de tramites.
 */
export const NIA_TOOLS: Tool[] = [
  {
    name: 'consultar_catalogo_externo',
    description:
      'Obtiene los items de un catalogo externo del tramite (sedes, escuelas, grados, turnos, colonias, etc.). ' +
      'Llama esta tool antes de ofrecer opciones al ciudadano — nunca inventes valores de catalogo. ' +
      'Si el catalogo requiere un filtro (ej. nombre de escuela), incluyelo en filtros.',
    input_schema: {
      type: 'object',
      properties: {
        tramite_id: {
          type: 'string',
          description: 'ID del tramite configurado para esta org. Ej: "mty-utiles-2026".',
        },
        catalogo_key: {
          type: 'string',
          description: 'Clave del catalogo a consultar. Ejemplos: "sedes", "escuelas", "grados", "turnos".',
        },
        filtros: {
          type: 'object',
          description:
            'Pares clave-valor para filtrar o parametrizar el catalogo. ' +
            'Ejemplo: { "escuela": "11 de Mayo" } para buscar escuelas por nombre. ' +
            'Omitir si el catalogo no requiere filtros.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['tramite_id', 'catalogo_key'],
    },
  },
  {
    name: 'buscar_en_padron_externo',
    description:
      'Consulta el padron oficial del tramite con un CURP para autocompletar datos del beneficiario o del adulto responsable. ' +
      'Si el padron devuelve datos, confirmalos con el ciudadano antes de continuar. ' +
      'Si devuelve found=false, actua segun las reglas de negocio del tramite (no intentes captura manual si esta prohibida).',
    input_schema: {
      type: 'object',
      properties: {
        tramite_id: {
          type: 'string',
          description: 'ID del tramite configurado para esta org.',
        },
        lookup_key: {
          type: 'string',
          description:
            'Clave del lookup a usar. Ejemplos: "curp_beneficiario", "curp_responsable". ' +
            'Segun la config del tramite.',
        },
        valor: {
          type: 'string',
          description:
            'Valor a buscar. Para CURP: los 18 caracteres exactos ya confirmados con el protocolo de captura critica.',
        },
      },
      required: ['tramite_id', 'lookup_key', 'valor'],
    },
  },
  {
    name: 'enviar_tramite_externo',
    description:
      'Envia el formulario completo del tramite al sistema externo del municipio. ' +
      'Solo llamar cuando todos los campos obligatorios hayan sido capturados y el ciudadano haya otorgado consentimiento al aviso de privacidad. ' +
      'Si la respuesta incluye escalate=true, invoca pedir_a_humano inmediatamente con el contexto completo. ' +
      'Comunica el folio devuelto al ciudadano cuando ok=true.',
    input_schema: {
      type: 'object',
      properties: {
        tramite_id: {
          type: 'string',
          description: 'ID del tramite configurado para esta org.',
        },
        campos: {
          type: 'object',
          description:
            'Objeto con todos los campos del formulario. Las claves deben coincidir exactamente ' +
            'con los keys definidos en la config del tramite. ' +
            'Ejemplo: { "curp_beneficiario": "MOAE121121MNLLDRA3", "sede_id": "12", ... }.',
          additionalProperties: true,
        },
      },
      required: ['tramite_id', 'campos'],
    },
  },
  {
    name: 'pedir_a_humano',
    description:
      'Escala el caso a un compañero humano cuando (a) el envio del tramite falla con escalate=true, ' +
      '(b) el ciudadano no aparece en el padron y las reglas de negocio no permiten captura manual, ' +
      '(c) el ciudadano solicita explicitamente hablar con un humano. ' +
      'Incluye el contexto completo del tramite y los datos capturados hasta el momento.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'Por que se escala. Incluye que tramite se intentaba, los datos ya capturados (sin datos sensibles completos), y el motivo exacto de la falla.',
        },
        urgency: {
          type: 'string',
          enum: ['normal', 'alta', 'critica'],
          description: 'Urgencia del caso.',
        },
      },
      required: ['reason', 'urgency'],
    },
  },
];
