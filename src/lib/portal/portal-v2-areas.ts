// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupId =
  | 'inicio'
  | 'negocio'
  | 'agentes'
  | 'modulos'
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
      { label: 'Cómo va tu semana',    anchor: 'semana' },
      { label: 'Hoy tienes que atender', anchor: 'hoy' },
    ],
  });

  // ── 2. Organización ────────────────────────────────────────────────────────
  // Labels espejo de los <h2> reales de cada sección en page.tsx.
  all.push({
    id: 'negocio',
    label: 'Organización',
    iconName: 'Building2',
    moduleId: 'negocio',
    tabParam: 'organizacion',
    items: [
      { label: 'Perfil de la organización',       anchor: 'organizacion' },
      { label: 'Manual de la organización',       anchor: 'conocimiento' },
      { label: 'Perfil del responsable',          anchor: 'perfil-dueno' },
      { label: 'Identidad visual',                anchor: 'branding' },
      { label: 'Tono de marca',                   anchor: 'tono-de-marca' },
      { label: 'Sitio web y reseñas',             anchor: 'sitio' },
      { label: 'Horario de atención',             anchor: 'horarios' },
      { label: 'Tu CRM en Google Sheets',         anchor: 'sheets-crm' },
      { label: 'Personas de la organización',     anchor: 'directorio' },
      { label: 'Integraciones',                   anchor: 'integraciones' },
    ],
  });

  // ── 3. Empleados ───────────────────────────────────────────────────────────
  all.push({
    id: 'agentes',
    label: 'Empleados',
    iconName: 'Meerkat',
    moduleId: 'agentes',
    directHref: `/portal/${t}/empleados`,
  });

  // ── 3b. Módulos (catálogo de add-ons activables por org) ──────────────────
  // OCULTO temporalmente 2026-08-31: catálogo existe (/portal/[token]/modulos
  // sigue accesible por URL directa para admin/QA), pero como al día de hoy
  // solo 2-3 módulos están al 100% pulidos (Bitácora, Cloud Catalog, Outbound
  // Calls), preferimos seguir con approach "consultoría privada" hasta tener
  // 5-6 módulos maduros. Descomenta cuando esté listo el resto.
  //
  // all.push({
  //   id: 'modulos',
  //   label: 'Módulos',
  //   iconName: 'Package',
  //   moduleId: 'negocio',
  //   directHref: `/portal/${t}/modulos`,
  // });

  // ── 4. Oficina ───────────────────────────────────────────────────────────
  // Oficina YA NO se agrega como grupo del nav — es EL PRODUCTO y merece
  // trato protagonista. Se renderiza como CTA card destacado arriba del
  // sidebar (ver PortalSidebarV2). Aquí solo dejamos la marca del ID
  // documentada para futuros lectores.

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
          { label: 'Campañas',  href: `/portal/${t}/oficina/campanas` },
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
  // Labels espejo de los <h2> reales de cada sección en page.tsx.
  all.push({
    id: 'cuenta',
    label: 'Cuenta',
    iconName: 'CircleUser',
    moduleId: 'cuenta',
    tabParam: 'cuenta',
    items: [
      { label: 'Consumo promedio',     anchor: 'consumo-promedio' },
      { label: 'Consumo del mes',      anchor: 'uso-del-mes' },
      { label: 'Comprar saldo',        anchor: 'comprar' },
      { label: 'Historial de consumo', anchor: 'historial' },
      { label: 'Reporte mensual',      anchor: 'reporte-mensual' },
      { label: 'Términos de servicio', anchor: 'terminos-servicio' },
    ],
  });

  // ── 7. Usuarios y permisos (owner o sub-usuario con módulo 'usuarios') ────
  if (isOwner || modules?.includes('usuarios')) {
    all.push({
      id: 'usuarios',
      label: 'Usuarios y permisos',
      iconName: 'Users',
      moduleId: 'usuarios',
      directHref: `/portal/${t}/equipo`,
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
