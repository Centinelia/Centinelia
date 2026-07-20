export const PORTAL_MODULES = [
  // ── Portal principal — todos los giros ──────────────────────────────────
  {
    id: 'inicio', label: 'Inicio (dashboard)', group: 'Portal', giros: ['all'] as string[],
    desc: 'Resumen general: llamadas, tareas, métricas y actividad reciente de tus empleados.',
  },
  {
    id: 'negocio', label: 'Negocio (KB, horarios)', group: 'Portal', giros: ['all'] as string[],
    desc: 'Manual de la organización, horarios de atención y configuración de tus empleados.',
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
    desc: 'Campañas y registros de llamadas que tus empleados realizan de forma proactiva.',
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
    desc: 'Registro de todo lo que han hecho tus empleados: tareas completadas y pendientes.',
  },
  {
    id: 'of_bandeja', label: 'Bandeja de entrada', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Mensajes, correos y notificaciones que tus empleados han procesado o tienen pendientes.',
  },
  {
    id: 'of_reportes', label: 'Reportes automáticos', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Resúmenes periódicos generados por tus empleados sobre la operación.',
  },
  {
    id: 'of_contratos', label: 'Contratos', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Contratos y documentos legales que tus empleados pueden consultar y referenciar.',
  },
  {
    id: 'of_documentos', label: 'Documentos', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Archivos generados por tus empleados o subidos para que los utilicen como referencia.',
  },
  {
    id: 'of_juntas', label: 'Juntas', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Actas y resúmenes de reuniones procesadas por tus empleados.',
  },
  {
    id: 'of_investigacion', label: 'Investigación', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Búsquedas e investigaciones realizadas por tus empleados sobre clientes o temas.',
  },
  {
    id: 'of_onboarding', label: 'Onboarding', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Flujos de bienvenida y capacitación que tus empleados gestionan para nuevos colaboradores.',
  },
  {
    id: 'of_encuestas', label: 'Encuestas', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Encuestas de satisfacción o recopilación de datos realizadas por llamada.',
  },
  {
    id: 'of_aprendizajes', label: 'Aprendizajes', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Revisión y aprobación de lo que tus empleados aprenden de llamadas, correos y conversaciones.',
  },
  {
    id: 'of_chat', label: 'Consultar empleado', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Chat directo con tus empleados para hacerles preguntas sobre la operación.',
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
