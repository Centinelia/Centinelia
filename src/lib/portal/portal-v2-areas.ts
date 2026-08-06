// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupId =
  | 'inicio'
  | 'negocio'
  | 'agentes'
  | 'oficina'
  | 'llamadas'
  | 'cuenta'
  | 'usuarios';

export interface NavItem {
  label: string;
  /** Direct href — used as-is. Mutually exclusive with anchor+tabParam. */
  href?: string;
  /** Anchor id (without #). Combined with the group's tabParam when navigating. */
  anchor?: string;
  moduleId?: string;
}

export interface SubGroup {
  /** Section header label (e.g. 'Actividad', 'Entrantes') */
  label: string;
  items: NavItem[];
}

export interface NavGroup {
  id: GroupId;
  label: string;
  /** Lucide component name — resolved at render time via ICON_MAP */
  iconName: string;
  /** moduleId used for sub-user filtering */
  moduleId?: string;
  /** If set, the group header is a direct link (no tab query param) */
  directHref?: string;
  /** e.g. 'inicio' — for ?tab=inicio href on the group header */
  tabParam?: string;
  /** Flat anchor list when there are no sub-groups */
  items?: NavItem[];
  /** Nested sub-groups (Oficina, Llamadas) */
  subGroups?: SubGroup[];
}

export interface BuildNavInput {
  token: string;
  hasOpsAgent: boolean;
  showOutbound: boolean;
  isOwner: boolean;
  modules?: string[];
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildPortalNav(input: BuildNavInput): NavGroup[] {
  const { token: t, hasOpsAgent, showOutbound, isOwner, modules } = input;

  const all: NavGroup[] = [];

  // ── 1. Inicio ──────────────────────────────────────────────────────────────
  all.push({
    id: 'inicio',
    label: 'Inicio',
    iconName: 'LayoutDashboard',
    moduleId: 'inicio',
    tabParam: 'inicio',
    items: [
      { label: 'Resumen',    anchor: 'semana' },
      { label: 'Pendientes', anchor: 'hoy' },
    ],
  });

  // ── 2. Organización ────────────────────────────────────────────────────────
  all.push({
    id: 'negocio',
    label: 'Organización',
    iconName: 'Building2',
    moduleId: 'negocio',
    tabParam: 'negocio',
    items: [
      { label: 'Organización',                 anchor: 'organizacion' },
      { label: 'Branding',                     anchor: 'branding' },
      { label: 'Manual de la organización',    anchor: 'conocimiento' },
      { label: 'Perfil del responsable',       anchor: 'perfil-dueno' },
      { label: 'Contratos internos',           anchor: 'contratos-internos' },
      { label: 'Sitio web y reseñas',          anchor: 'sitio' },
      { label: 'Notificaciones al cliente',    anchor: 'dominio-correo' },
      { label: 'Horarios',                     anchor: 'horarios' },
    ],
  });

  // ── 3. Empleados ───────────────────────────────────────────────────────────
  all.push({
    id: 'agentes',
    label: 'Empleados',
    iconName: 'Bot',
    moduleId: 'agentes',
    directHref: `/portal/${t}/agentes`,
  });

  // ── 4. Oficina (only if hasOpsAgent) ──────────────────────────────────────
  if (hasOpsAgent) {
    all.push({
      id: 'oficina',
      label: 'Oficina',
      iconName: 'Briefcase',
      moduleId: 'oficina',
      directHref: `/portal/${t}/oficina`,
      subGroups: [
        {
          label: 'Actividad',
          items: [
            { label: 'Hoy en la oficina', href: `/portal/${t}/oficina` },
            { label: 'Bandeja',           href: `/portal/${t}/oficina/bandeja` },
            { label: 'Llamadas',          href: `/portal/${t}/oficina/llamadas?filtro=entrantes` },
            { label: 'Salientes',         href: `/portal/${t}/oficina/llamadas?filtro=salientes` },
            { label: 'Mesa de ayuda',     href: `/portal/${t}/oficina/bandeja?tipo=helpdesk` },
          ],
        },
        {
          label: 'Análisis',
          items: [
            { label: 'Reportes',       href: `/portal/${t}/oficina/reportes` },
            { label: 'Cómo trabajamos', href: `/portal/${t}/oficina/aprendizajes` },
            { label: 'Investigación',  href: `/portal/${t}/oficina/investigacion` },
          ],
        },
        {
          label: 'Documentos',
          items: [
            { label: 'Documentos', href: `/portal/${t}/oficina/documentos` },
            { label: 'Contratos',  href: `/portal/${t}/oficina/contratos` },
            { label: 'Plantillas', href: `/portal/${t}/oficina/plantillas` },
          ],
        },
        {
          label: 'Programado',
          items: [
            { label: 'Tareas programadas', href: `/portal/${t}/oficina/tareas-programadas` },
            { label: 'Juntas',             href: `/portal/${t}/oficina/juntas` },
            { label: 'Onboarding',         href: `/portal/${t}/oficina/onboarding` },
            { label: 'Encuestas',          href: `/portal/${t}/oficina/encuestas` },
          ],
        },
        {
          label: 'Sistema',
          items: [
            { label: 'Integraciones', href: `/portal/${t}/oficina/integraciones` },
          ],
        },
      ],
    });
  }

  // ── 5. Llamadas (only if !hasOpsAgent) ────────────────────────────────────
  if (!hasOpsAgent) {
    const llamadasSubGroups: SubGroup[] = [
      {
        label: 'Entrantes',
        items: [
          { label: 'Registro de llamadas',    anchor: 'registro' },
          { label: 'Leads / Citas / Pedidos', anchor: 'leads-citas-pedidos' },
        ],
      },
    ];

    if (showOutbound) {
      llamadasSubGroups.push({
        label: 'Salientes',
        items: [
          { label: 'Permisos',  anchor: 'llamadas-sal' },
          { label: 'Campañas',  href: `/portal/${t}/oficina/llamadas?filtro=campanas` },
          { label: 'Contactos', href: `/portal/${t}/oficina/llamadas?filtro=salientes` },
        ],
      });
    }

    all.push({
      id: 'llamadas',
      label: 'Llamadas',
      iconName: 'Phone',
      moduleId: 'llamadas',
      directHref: `/portal/${t}/oficina/llamadas?filtro=entrantes`,
      subGroups: llamadasSubGroups,
    });
  }

  // ── 6. Cuenta ──────────────────────────────────────────────────────────────
  all.push({
    id: 'cuenta',
    label: 'Cuenta',
    iconName: 'CircleUser',
    moduleId: 'cuenta',
    tabParam: 'cuenta',
    items: [
      { label: 'Consumo',          anchor: 'uso-del-mes' },
      { label: 'Saldo',            anchor: 'comprar' },
      { label: 'Historial',        anchor: 'historial' },
      { label: 'Reporte mensual',  anchor: 'reporte-mensual' },
    ],
  });

  // ── 7. Usuarios y permisos (owner-only) ───────────────────────────────────
  if (isOwner) {
    all.push({
      id: 'usuarios',
      label: 'Usuarios y permisos',
      iconName: 'Users',
      directHref: `/portal/${t}/usuarios`,
    });
  }

  // ── Module filtering (sub-users only) ─────────────────────────────────────
  if (!modules) return all; // owner: no filter

  return all.filter(g => {
    if (!g.moduleId) return true; // no restriction (e.g. Usuarios — owner-only guard is above)
    if (modules.includes(g.moduleId)) return true;
    // Special case: Oficina visible if user has llamadas or salientes access
    if (g.id === 'oficina' && ['llamadas', 'salientes'].some(m => modules.includes(m))) return true;
    return false;
  });
}

// ─── Compatibility alias ──────────────────────────────────────────────────────

/** @deprecated Use buildPortalNav instead */
export const buildPortalAreas = buildPortalNav;

// ─── Legacy type aliases (keep exports so old imports compile) ────────────────

/** @deprecated */
export type BuildAreasInput = BuildNavInput;

/** @deprecated Use NavGroup */
export type Area = NavGroup;
