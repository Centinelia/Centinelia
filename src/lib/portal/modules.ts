export const PORTAL_MODULES = [
  // ── Portal principal — todos los giros ──────────────────────────────────
  // Oficina va primero: es donde el sub-usuario trabaja el día a día;
  // el resto (Inicio, Organización, Empleados, Cuenta, Usuarios) son meta/config.
  {
    id: 'oficina', label: 'Oficina', group: 'Portal', giros: ['all'] as string[],
    desc: 'Acceso al módulo de Oficina con todas las herramientas de trabajo interno.',
  },
  {
    id: 'inicio', label: 'Inicio', group: 'Portal', giros: ['all'] as string[],
    desc: 'Resumen general: llamadas, tareas, métricas y actividad reciente de tus empleados.',
  },
  {
    id: 'negocio', label: 'Organización', group: 'Portal', giros: ['all'] as string[],
    desc: 'Manual de la organización, branding, horarios y configuración de tus empleados.',
  },
  {
    id: 'agentes', label: 'Empleados', group: 'Portal', giros: ['all'] as string[],
    desc: 'Lista de todos los empleados Centinelia activos en la cuenta.',
  },
  {
    id: 'cuenta', label: 'Cuenta', group: 'Portal', giros: ['all'] as string[],
    desc: 'Consumo, saldo, historial y términos de servicio de la cuenta.',
  },
  {
    id: 'usuarios', label: 'Usuarios y permisos', group: 'Portal', giros: ['all'] as string[],
    desc: 'Administrar colaboradores del portal: crear accesos, cambiar contraseñas y asignar secciones. No incluye modificar al propietario ni a sí mismo.',
  },
  // ── Oficina general — todos los giros ───────────────────────────────────
  {
    id: 'of_actividad', label: 'Hoy en la oficina', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Panorama en tiempo real de lo que tus empleados están haciendo ahora.',
  },
  {
    id: 'llamadas', label: 'Llamadas entrantes', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Historial de llamadas recibidas, grabaciones y transcripciones.',
  },
  {
    id: 'salientes', label: 'Llamadas salientes', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Campañas y registros de llamadas que tus empleados realizan de forma proactiva.',
  },
  {
    id: 'of_bandeja', label: 'Bandeja', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Correos entrantes, respuestas automáticas y aprobaciones que gestionan tus empleados.',
  },
  {
    id: 'of_reportes', label: 'Reportes', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Resúmenes periódicos generados por tus empleados sobre la operación.',
  },
  {
    id: 'of_aprendizajes', label: 'Cómo trabajamos', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Revisión y aprobación de lo que tus empleados aprenden de llamadas, correos y conversaciones.',
  },
  {
    id: 'of_investigacion', label: 'Investigación', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Búsquedas e investigaciones realizadas por tus empleados sobre clientes o temas.',
  },
  {
    id: 'of_documentos', label: 'Documentos', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Archivos generados por tus empleados o subidos para que los utilicen como referencia.',
  },
  {
    id: 'of_contratos', label: 'Contratos', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Borradores de contratos que tus empleados redactan a partir de plantillas de la organización.',
  },
  {
    id: 'of_plantillas', label: 'Plantillas', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Plantillas de factura, orden de compra, contrato y otros documentos que tus empleados usan como base.',
  },
  {
    id: 'of_facturas', label: 'Facturas', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Solicitudes de factura pendientes de emitir y su seguimiento fiscal.',
  },
  {
    id: 'of_tareas_programadas', label: 'Tareas', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Tareas manuales y programadas que ejecutan tus empleados, con calendario y aprobaciones.',
  },
  {
    id: 'of_juntas', label: 'Juntas', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Actas y resúmenes de reuniones procesadas por tus empleados.',
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
    id: 'integraciones', label: 'Integraciones', group: 'Oficina', giros: ['all'] as string[],
    desc: 'Conexiones con calendarios, CRMs, correo, WhatsApp y otras plataformas.',
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

// Maps sub-route segment (after /portal/{token}/) to the module ID it requires.
// Used by proxy.ts to enforce sub-user access on direct URL navigation.
export const ROUTE_MODULE_MAP: Record<string, string> = {
  // Portal top-level
  'agentes':                       'agentes',
  'llamadas':                      'llamadas',
  'llamadas/entrantes':            'llamadas',
  'llamadas/salientes':            'salientes',
  'usuarios':                      'usuarios',
  // Oficina
  'oficina':                       'oficina',
  'oficina/bandeja':               'of_bandeja',
  'oficina/reportes':              'of_reportes',
  'oficina/aprendizajes':          'of_aprendizajes',
  'oficina/investigacion':         'of_investigacion',
  'oficina/documentos':            'of_documentos',
  'oficina/contratos':             'of_contratos',
  'oficina/plantillas':            'of_plantillas',
  'oficina/facturas':              'of_facturas',
  'oficina/tareas':                'of_tareas_programadas',
  'oficina/tareas-programadas':    'of_tareas_programadas', // redirige a /oficina/tareas
  'oficina/juntas':                'of_juntas',
  'oficina/reportes-ciudadanos':   'of_reportes_ciudadanos',
  'oficina/cabildo':               'of_cabildo',
  'oficina/llamadas':              'llamadas',
  'oficina/onboarding':            'of_onboarding',
  'oficina/encuestas':             'of_encuestas',
  'oficina/helpdesk':              'of_helpdesk',
  'oficina/integraciones':         'integraciones',
};

// Given a pathname like "/portal/{token}/oficina/bandeja", return the module ID
// the visitor needs, or null if the route is unrestricted.
export function requiredModuleForPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/[^/]+\/(.+?)(?:\/|$|\?)/);
  if (!m) return null;
  const rest = pathname.replace(/^\/portal\/[^/]+\//, '').replace(/\?.*$/, '').replace(/\/$/, '');
  // Try longest-match first (two segments), then fall back to first segment
  if (ROUTE_MODULE_MAP[rest])                     return ROUTE_MODULE_MAP[rest];
  const firstTwo = rest.split('/').slice(0, 2).join('/');
  if (ROUTE_MODULE_MAP[firstTwo])                 return ROUTE_MODULE_MAP[firstTwo];
  const firstOne = rest.split('/')[0];
  if (ROUTE_MODULE_MAP[firstOne])                 return ROUTE_MODULE_MAP[firstOne];
  return null;
}
