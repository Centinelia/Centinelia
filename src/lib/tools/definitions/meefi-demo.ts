/**
 * Definiciones de tools para la demo Meefi — Nelia Soporte.
 *
 * Shape: JSON Schema plano (igual que definitions/sheets.ts).
 * NO usa Zod — el sistema de definiciones del proyecto usa JSON Schema directo.
 *
 * Estas 7 tools las ejecuta el executor vía el bloque `toolName.startsWith('meefi_')`
 * en executeAgentToolInner. Los executors reales viven en
 * src/lib/tools/executors/meefi-*.ts (creados en Tasks 4-6).
 *
 * Canal: voice + chat + email (regla [[feedback-tool-3-canales]]).
 * Meerkat: Nelia (meerkat_role_id = 'nelia') en org Meefi.
 *
 * Nota org-específica: las definiciones están gatadas por `gatedByFeature: 'meefi_demo'`
 * en registry.ts. Orgs sin esa feature no reciben estas tools en el executor aunque
 * Nelia las tenga en su preset. Ver task-7-report.md decisión D1.
 */

export type MeefiToolDef = {
  name:        string;
  description: string;
  parameters:  Record<string, unknown>;
};

export const MEEFI_TOOL_DEFINITIONS: MeefiToolDef[] = [
  {
    name: 'meefi_lookup_user_account',
    description:
      'Busca la cuenta de un usuario Meefi por correo. Regresa flags: password_reset_locked, has_2fa, passkey_registered, identity_verified, kyc_status.',
    parameters: {
      type:     'object',
      required: ['email'],
      properties: {
        email: {
          type:        'string',
          format:      'email',
          description: 'Correo del usuario a buscar.',
        },
      },
    },
  },
  {
    name: 'meefi_send_password_reset_link',
    description:
      'Envía link de restablecimiento de contraseña al correo del usuario. Falla si la cuenta tiene reset bloqueado por falta de verificación.',
    parameters: {
      type:     'object',
      required: ['user_id'],
      properties: {
        user_id: {
          type:        'string',
          description: 'ID del usuario que requiere el reset.',
        },
      },
    },
  },
  {
    name: 'meefi_check_transfer_status',
    description:
      'Consulta estado de una transferencia por monto y fecha aproximada o por transfer_id. Regresa: pendiente_rieles, rechazada o ya_conciliada, con explicación.',
    parameters: {
      type:       'object',
      required:   [],
      properties: {
        amount: {
          type:        'number',
          description: 'Monto de la transferencia (opcional si se provee transfer_id).',
        },
        date_approx: {
          type:        'string',
          description: 'Fecha aproximada en formato YYYY-MM-DD (opcional).',
        },
        transfer_id: {
          type:        'string',
          description: 'ID de transferencia si el usuario lo tiene disponible (opcional).',
        },
      },
    },
  },
  {
    name: 'meefi_initiate_2fa_recovery',
    description:
      'Arranca proceso de recuperación de segundo factor. Regresa ticket_id y checklist de evidencia a pedir al usuario: INE, selfie y últimos 4 dígitos de cuenta.',
    parameters: {
      type:     'object',
      required: ['user_id'],
      properties: {
        user_id: {
          type:        'string',
          description: 'ID del usuario que perdió acceso a su segundo factor.',
        },
      },
    },
  },
  {
    name: 'meefi_capture_bug_report',
    description:
      'Registra un bug técnico. Recibe descripción y contexto (navegador, URL, pasos reproducibles). Regresa ticket_id y el nombre del responsable de atenderlo.',
    parameters: {
      type:     'object',
      required: ['user_id', 'description'],
      properties: {
        user_id: {
          type:        'string',
          description: 'ID del usuario que reporta el bug.',
        },
        description: {
          type:        'string',
          description: 'Descripción del bug: qué pasó, qué esperaba el usuario.',
        },
        technical_context: {
          type:                 'object',
          additionalProperties: true,
          description:          'Datos técnicos opcionales: navegador, URL, pasos, mensaje de error.',
        },
      },
    },
  },
  {
    name: 'meefi_escalate_to_human',
    description:
      'Escala la conversación a la persona correcta del equipo Meefi con contexto preempacado. El topic determina el destinatario: cuentas_docs a Ashley, transferencia_urgente a Emilio, bug_plataforma a Jaime, recovery_2fa a Ashley, otro a Gera. Envía correo con resumen ejecutivo.',
    parameters: {
      type:     'object',
      required: ['topic', 'priority', 'context_summary', 'user_id'],
      properties: {
        topic: {
          type:        'string',
          enum:        ['cuentas_docs', 'transferencia_urgente', 'bug_plataforma', 'recovery_2fa', 'otro'],
          description: 'Categoría del escalamiento para rutar al responsable correcto.',
        },
        priority: {
          type:        'string',
          enum:        ['baja', 'media', 'alta'],
          description: 'Urgencia del caso.',
        },
        context_summary: {
          type:        'string',
          description: 'Resumen ejecutivo de la situación para que el destinatario entienda sin leer el historial completo.',
        },
        user_id: {
          type:        'string',
          description: 'ID del usuario afectado.',
        },
        transcript: {
          type:        'string',
          description: 'Fragmento relevante de la conversación (opcional).',
        },
        hypothesis: {
          type:        'string',
          description: 'Hipótesis de causa raíz si se tiene (opcional).',
        },
        evidence_urls: {
          type:        'array',
          items:       { type: 'string' },
          description: 'URLs de capturas o evidencias adjuntas (opcional).',
        },
        next_action: {
          type:        'string',
          description: 'Próxima acción sugerida para el responsable (opcional).',
        },
      },
    },
  },
  {
    name: 'meefi_search_help_center',
    description:
      'Busca artículos en el centro de ayuda de meefi.io. Regresa los 3 resultados más relevantes con fragmento y enlace al artículo.',
    parameters: {
      type:     'object',
      required: ['query'],
      properties: {
        query: {
          type:        'string',
          description: 'Pregunta o términos de búsqueda del usuario.',
        },
      },
    },
  },
];
