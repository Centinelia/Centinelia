export const PORTAL_MODULES = [
  // Main portal sections
  { id: 'inicio',                 label: 'Inicio (dashboard)',        group: 'Portal'  },
  { id: 'negocio',                label: 'Negocio (KB, horarios)',    group: 'Portal'  },
  { id: 'llamadas',               label: 'Llamadas entrantes',        group: 'Portal'  },
  { id: 'salientes',              label: 'Llamadas salientes',        group: 'Portal'  },
  { id: 'oficina',                label: 'Oficina (acceso general)',  group: 'Portal'  },
  { id: 'agentes',                label: 'Empleados / Agentes',       group: 'Portal'  },
  { id: 'integraciones',          label: 'Integraciones',             group: 'Portal'  },
  { id: 'cuenta',                 label: 'Cuenta y facturación',      group: 'Portal'  },
  // Oficina sub-sections
  { id: 'of_actividad',           label: 'Actividad',                 group: 'Oficina' },
  { id: 'of_bandeja',             label: 'Bandeja de entrada',        group: 'Oficina' },
  { id: 'of_reportes',            label: 'Reportes automáticos',      group: 'Oficina' },
  { id: 'of_contratos',           label: 'Contratos',                 group: 'Oficina' },
  { id: 'of_documentos',          label: 'Documentos',                group: 'Oficina' },
  { id: 'of_juntas',              label: 'Juntas',                    group: 'Oficina' },
  { id: 'of_investigacion',       label: 'Investigación',             group: 'Oficina' },
  { id: 'of_onboarding',          label: 'Onboarding',                group: 'Oficina' },
  { id: 'of_reportes_ciudadanos', label: 'Reportes ciudadanos',       group: 'Oficina' },
  { id: 'of_cabildo',             label: 'Cabildo',                   group: 'Oficina' },
  { id: 'of_helpdesk',            label: 'Mesa de ayuda',             group: 'Oficina' },
  { id: 'of_encuestas',           label: 'Encuestas',                 group: 'Oficina' },
  { id: 'of_chat',                label: 'Consultar agente',          group: 'Oficina' },
] as const;

export type PortalModuleId = typeof PORTAL_MODULES[number]['id'];
