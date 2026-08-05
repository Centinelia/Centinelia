export type AreaId = 'escritorio' | 'bandeja' | 'historial' | 'equipo' | 'administracion';

export interface SubItem {
  label: string;
  href: string;
  moduleId?: string;
}

export interface Area {
  id: AreaId;
  label: string;
  iconName: string;
  href: string;
  subItems: SubItem[];
}

export interface BuildAreasInput {
  token: string;
  hasOpsAgent: boolean;
  showOutbound: boolean;
  isOwner: boolean;
  modules?: string[];
  isGovernment?: boolean;
}

function hasModule(input: BuildAreasInput, moduleId: string): boolean {
  if (!input.modules) return true; // owner: sin filtro
  return input.modules.includes(moduleId);
}

export function buildPortalAreas(input: BuildAreasInput): Area[] {
  const t = input.token;
  const areas: Area[] = [];

  // 1. Escritorio (siempre visible)
  areas.push({
    id: 'escritorio',
    label: 'Escritorio',
    iconName: 'Home',
    href: `/portal/${t}`,
    subItems: [],
  });

  // 2. Bandeja (visible si hay ops agent o helpdesk)
  if (input.hasOpsAgent || hasModule(input, 'bandeja') || hasModule(input, 'helpdesk')) {
    const bandejaSubs: SubItem[] = [];
    if (input.hasOpsAgent || hasModule(input, 'helpdesk')) {
      bandejaSubs.push({
        label: 'Mesa de ayuda',
        href: `/portal/${t}/oficina/helpdesk`,
        moduleId: 'helpdesk',
      });
    }
    areas.push({
      id: 'bandeja',
      label: 'Bandeja',
      iconName: 'Inbox',
      href: `/portal/${t}/oficina/bandeja`,
      subItems: bandejaSubs,
    });
  }

  // 3. Historial
  const historialSubs: SubItem[] = [];
  if (hasModule(input, 'llamadas')) {
    historialSubs.push({
      label: 'Llamadas',
      href: input.hasOpsAgent ? `/portal/${t}/oficina/llamadas` : `/portal/${t}/llamadas/entrantes`,
      moduleId: 'llamadas',
    });
  }
  if (input.showOutbound && hasModule(input, 'salientes')) {
    historialSubs.push({
      label: 'Salientes',
      href: `/portal/${t}/llamadas/salientes`,
      moduleId: 'salientes',
    });
  }
  if (input.hasOpsAgent && hasModule(input, 'reportes')) {
    historialSubs.push({
      label: 'Reportes',
      href: `/portal/${t}/oficina/reportes`,
      moduleId: 'reportes',
    });
  }
  if (input.hasOpsAgent && hasModule(input, 'aprendizajes')) {
    historialSubs.push({
      label: 'Aprendizajes',
      href: `/portal/${t}/oficina/aprendizajes`,
      moduleId: 'aprendizajes',
    });
  }
  if (input.hasOpsAgent && hasModule(input, 'investigacion')) {
    historialSubs.push({
      label: 'Investigación',
      href: `/portal/${t}/oficina/investigacion`,
      moduleId: 'investigacion',
    });
  }
  if (historialSubs.length > 0) {
    areas.push({
      id: 'historial',
      label: 'Historial',
      iconName: 'Clock',
      href: historialSubs[0].href,
      subItems: historialSubs,
    });
  }

  // 4. Tu equipo
  const equipoSubs: SubItem[] = [];
  equipoSubs.push({
    label: 'Empleados',
    href: `/portal/${t}/agentes`,
    moduleId: 'agentes',
  });
  if (input.hasOpsAgent && hasModule(input, 'patrones')) {
    equipoSubs.push({
      label: 'Cómo trabajamos',
      href: `/portal/${t}/oficina/patrones`,
      moduleId: 'patrones',
    });
  }
  areas.push({
    id: 'equipo',
    label: 'Tu equipo',
    iconName: 'Users',
    href: `/portal/${t}/agentes`,
    subItems: equipoSubs,
  });

  // 5. Administración
  const adminSubs: SubItem[] = [
    { label: 'Organización', href: `/portal/${t}?tab=negocio` },
    { label: 'Recursos de la oficina', href: `/portal/${t}/oficina` }, // launcher temp = página oficina actual
    { label: 'Integraciones', href: `/portal/${t}/oficina/integraciones`, moduleId: 'integraciones' },
    { label: 'Uso y compras', href: `/portal/${t}?tab=cuenta` },
  ];
  if (input.isOwner) {
    adminSubs.push({ label: 'Usuarios y permisos', href: `/portal/${t}/usuarios` });
  }
  areas.push({
    id: 'administracion',
    label: 'Administración',
    iconName: 'Settings',
    href: `/portal/${t}?tab=negocio`,
    subItems: adminSubs,
  });

  return areas;
}
