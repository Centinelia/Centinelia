export const PORTAL_MODULES = [
  // ── Portal principal — todos los giros ──────────────────────────────────
  {
    id: 'inicio', label: 'Inicio (dashboard)', group: 'Portal', giros: ['all'] as string[],
    desc: 'Resumen general: llamadas, tareas, métricas y actividad reciente del empleado.',
  },
  {
    id: 'negocio', label: 'Negocio (KB, horarios)', group: 'Portal', giros: ['all'] as string[],
    desc: 'Manual de la organización, horarios de atención y configuración del empleado.',
  },
  {
    id: 'oficina', label: 'Oficina (acceso general)', group: 'Portal', giros: ['all'] as string[],
    desc: 'Acceso al módulo de Oficina con todas las herramientas de trabajo interno, incluyendo llamadas.',
  },
  {
    id: 'llamadas', label: 'Llamadas entrantes', group: 'Portal', giros: ['all'] as string[],
    desc: 'Historial de llamadas recibidas, grabaciones y transcripciones.',
  },
  {
    id: 'salientes', label: 'Llamadas salientes', group: 'Portal', giros: ['all'] as string[],
    desc: 'Campañas y registros de llamadas que el empleado realiza de forma proactiva.',
  },
  {
    id: 'agentes', label: 'Empleados', group: 'Portal', giros: ['all'] as string[],
    desc: 'Lista de todos los empleados Centinelia activos en la cuenta.',
  },
  {
    id: 'integraciones', label: 'Integraciones', group: 'Portal', giros: ['all'] as string[],
    desc: 'Conexiones con calendarios, CRMs, correo, WhatsApp y otras plataformas.',
  },
  {
    id: 'cuenta', label: 'Cuenta y facturación', group: 'Portal', giros: ['all'] as string[],
    desc: 'Plan contratado, minutos disponibles, historial de pagos y datos de la cuenta.',
  },
  // ── Oficina general — todos los giros ───────────────────────────────────
  {
    id: 'of_actividad', label: 'Actividad', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Registro de todo lo que ha hecho el empleado: tareas completadas y pendientes.',
  },
  {
    id: 'of_bandeja', label: 'Bandeja de entrada', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Mensajes, correos y notificaciones que el empleado ha procesado o tiene pendientes.',
  },
  {
    id: 'of_reportes', label: 'Reportes automáticos', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Resúmenes periódicos generados por el empleado sobre la operación.',
  },
  {
    id: 'of_contratos', label: 'Contratos', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Contratos y documentos legales que el empleado puede consultar y referenciar.',
  },
  {
    id: 'of_documentos', label: 'Documentos', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Archivos generados por el empleado o subidos para que los utilice como referencia.',
  },
  {
    id: 'of_juntas', label: 'Juntas', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Actas y resúmenes de reuniones procesadas por el empleado.',
  },
  {
    id: 'of_investigacion', label: 'Investigación', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Búsquedas e investigaciones realizadas por el empleado sobre clientes o temas.',
  },
  {
    id: 'of_onboarding', label: 'Onboarding', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Flujos de bienvenida y capacitación que el empleado gestiona para nuevos colaboradores.',
  },
  {
    id: 'of_encuestas', label: 'Encuestas', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Encuestas de satisfacción o recopilación de datos realizadas por llamada.',
  },
  {
    id: 'of_chat', label: 'Consultar empleado', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Chat directo con el empleado para hacerle preguntas sobre la operación.',
  },
  // ── Oficina sector — Gobierno / Municipio ───────────────────────────────
  {
    id: 'of_reportes_ciudadanos', label: 'Reportes ciudadanos', group: 'Oficina', giros: ['gobierno'] as string[],
    desc: 'Folios de reportes recibidos por ciudadanos: baches, alumbrado, limpieza, etc.',
  },
  {
    id: 'of_cabildo', label: 'Cabildo', group: 'Oficina', giros: ['gobierno'] as string[],
    desc: 'Gestión de sesiones de cabildo: puntos de acuerdo, actas y votaciones.',
  },
  // ── Oficina sector — Tecnología / IT ────────────────────────────────────
  {
    id: 'of_helpdesk', label: 'Mesa de ayuda', group: 'Oficina', giros: ['tecnologia', 'gobierno'] as string[],
    desc: 'Tickets de soporte técnico: apertura, seguimiento y resolución de incidentes.',
  },
];

export const GIRO_GROUPS: { id: string; label: string }[] = [
  { id: 'gobierno',   label: 'Gobierno / Municipio' },
  { id: 'tecnologia', label: 'Tecnología / IT' },
];

export type PortalModuleId = (typeof PORTAL_MODULES)[number]['id'];
