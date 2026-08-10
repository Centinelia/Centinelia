import { describe, it, expect } from 'vitest';
import { buildPortalNav, type BuildNavInput } from '../portal-v2-areas';

const base: BuildNavInput = {
  token: 'tok123',
  hasOpsAgent: true,
  showOutbound: false,
  isOwner: true,
  modules: undefined,
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function groupIds(input: BuildNavInput) {
  return buildPortalNav(input).map(g => g.id);
}

// ─── test suites ──────────────────────────────────────────────────────────────

describe('buildPortalNav', () => {
  // 1. Owner con ops: Oficina YA NO está en el nav flat — vive como CTA
  // protagonista arriba del sidebar (ver PortalSidebarV2). El resto de
  // grupos ordinarios sí se listan.
  it('owner con ops: nav flat sin oficina (es CTA protagonista)', () => {
    const ids = groupIds(base);
    expect(ids).toContain('inicio');
    expect(ids).toContain('negocio');
    expect(ids).toContain('agentes');
    expect(ids).not.toContain('oficina'); // ← CTA protagonista, no grupo
    expect(ids).not.toContain('llamadas'); // hasOpsAgent=true → Llamadas hidden
    expect(ids).toContain('cuenta');
    expect(ids).toContain('usuarios');
  });

  // 2. Owner sin ops ve Inicio, Organización, Empleados, Llamadas, Cuenta, Usuarios
  it('owner sin ops ve llamadas', () => {
    const ids = groupIds({ ...base, hasOpsAgent: false });
    expect(ids).toContain('inicio');
    expect(ids).toContain('negocio');
    expect(ids).toContain('agentes');
    expect(ids).not.toContain('oficina');
    expect(ids).toContain('llamadas');
    expect(ids).toContain('cuenta');
    expect(ids).toContain('usuarios');
  });

  // 3. Llamadas (no-ops) tiene sub-grupos Entrantes; Salientes solo si showOutbound
  it('Llamadas sin outbound tiene solo sub-grupo Entrantes', () => {
    const groups = buildPortalNav({ ...base, hasOpsAgent: false, showOutbound: false });
    const llamadas = groups.find(g => g.id === 'llamadas')!;
    expect(llamadas.subGroups).toHaveLength(1);
    expect(llamadas.subGroups![0].label).toBe('Entrantes');
  });

  it('Llamadas con showOutbound tiene sub-grupos Entrantes + Salientes', () => {
    const groups = buildPortalNav({ ...base, hasOpsAgent: false, showOutbound: true });
    const llamadas = groups.find(g => g.id === 'llamadas')!;
    expect(llamadas.subGroups).toHaveLength(2);
    expect(llamadas.subGroups![0].label).toBe('Entrantes');
    expect(llamadas.subGroups![1].label).toBe('Salientes');
  });

  it('Salientes tiene 3 items: Permisos, Campañas, Contactos', () => {
    const groups = buildPortalNav({ ...base, hasOpsAgent: false, showOutbound: true });
    const llamadas = groups.find(g => g.id === 'llamadas')!;
    const salientes = llamadas.subGroups![1];
    const labels = salientes.items.map(i => i.label);
    expect(labels).toEqual(['Permisos', 'Campañas', 'Contactos']);
  });

  // 4. Sub-usuario con modules=['agentes'] solo ve Empleados
  it('sub-usuario modules=["agentes"] ve solo agentes (y Usuarios no pasa porque !isOwner)', () => {
    const ids = groupIds({
      ...base,
      hasOpsAgent: false,
      isOwner: false,
      modules: ['agentes'],
    });
    expect(ids).toContain('agentes');
    expect(ids).not.toContain('inicio');
    expect(ids).not.toContain('negocio');
    expect(ids).not.toContain('llamadas');
    expect(ids).not.toContain('cuenta');
    expect(ids).not.toContain('usuarios');
  });

  // 5. Sub-usuario con modules=['llamadas'] y hasOpsAgent=true — Oficina ya no
  //    aparece en el nav (es CTA). El acceso a Oficina no depende del nav flat.
  it('sub-usuario con modules=["llamadas"] y hasOpsAgent=true no ve oficina en nav flat', () => {
    const ids = groupIds({
      ...base,
      hasOpsAgent: true,
      isOwner: false,
      modules: ['llamadas'],
    });
    expect(ids).not.toContain('oficina'); // CTA protagonista, no en flat nav
    expect(ids).not.toContain('llamadas'); // hasOpsAgent=true → Llamadas group never generated
  });

  it('sub-usuario con modules=["llamadas"] y hasOpsAgent=false ve Llamadas', () => {
    const ids = groupIds({
      ...base,
      hasOpsAgent: false,
      isOwner: false,
      modules: ['llamadas'],
    });
    expect(ids).toContain('llamadas');
    expect(ids).not.toContain('oficina');
  });

  // 6. Usuarios y permisos solo aparece si isOwner
  it('Usuarios aparece solo cuando isOwner=true', () => {
    const ownerIds = groupIds({ ...base, isOwner: true });
    const subIds = groupIds({ ...base, isOwner: false });
    expect(ownerIds).toContain('usuarios');
    expect(subIds).not.toContain('usuarios');
  });

  // 7. tabParam y directHref correctos
  it('Inicio tiene tabParam="inicio" y no directHref', () => {
    const groups = buildPortalNav(base);
    const inicio = groups.find(g => g.id === 'inicio')!;
    expect(inicio.tabParam).toBe('inicio');
    expect(inicio.directHref).toBeUndefined();
  });

  it('Empleados tiene directHref con token y no tabParam', () => {
    const groups = buildPortalNav({ ...base, token: 'MYTOK' });
    const agentes = groups.find(g => g.id === 'agentes')!;
    expect(agentes.directHref).toBe('/portal/MYTOK/empleados');
    expect(agentes.tabParam).toBeUndefined();
  });

  it('Organización tiene tabParam="organizacion"', () => {
    const groups = buildPortalNav(base);
    const negocio = groups.find(g => g.id === 'negocio')!;
    expect(negocio.tabParam).toBe('organizacion');
  });

  it('Cuenta tiene tabParam="cuenta"', () => {
    const groups = buildPortalNav(base);
    const cuenta = groups.find(g => g.id === 'cuenta')!;
    expect(cuenta.tabParam).toBe('cuenta');
  });

  it('todos los hrefs contienen el token', () => {
    const groups = buildPortalNav({ ...base, token: 'MYTOK' });
    for (const g of groups) {
      if (g.directHref) expect(g.directHref).toContain('MYTOK');
      for (const item of g.items ?? []) {
        if (item.href) expect(item.href).toContain('MYTOK');
      }
      for (const sg of g.subGroups ?? []) {
        for (const item of sg.items) {
          if (item.href) expect(item.href).toContain('MYTOK');
        }
      }
    }
  });

  // Group order verification (sin oficina — es CTA protagonista)
  it('grupos con ops en orden: inicio, negocio, agentes, cuenta, usuarios', () => {
    const ids = groupIds(base);
    expect(ids).toEqual(['inicio', 'negocio', 'agentes', 'cuenta', 'usuarios']);
  });

  it('grupos sin ops en orden: inicio, negocio, agentes, llamadas, cuenta, usuarios', () => {
    const ids = groupIds({ ...base, hasOpsAgent: false });
    expect(ids).toEqual(['inicio', 'negocio', 'agentes', 'llamadas', 'cuenta', 'usuarios']);
  });

  // Anchor items for Inicio
  it('Inicio tiene 6 anchor items', () => {
    const groups = buildPortalNav(base);
    const inicio = groups.find(g => g.id === 'inicio')!;
    expect(inicio.items).toHaveLength(6);
    const anchors = inicio.items!.map(i => i.anchor);
    expect(anchors).toEqual([
      'resumen',
      'equipo-hoy',
      'actividad',
      'horas-pico',
      'reporte-mensual',
      'contexto',
    ]);
  });

  // Cuenta anchor items
  it('Cuenta tiene 3 anchor items', () => {
    const groups = buildPortalNav(base);
    const cuenta = groups.find(g => g.id === 'cuenta')!;
    expect(cuenta.items).toHaveLength(3);
    const anchors = cuenta.items!.map(i => i.anchor);
    expect(anchors).toEqual(['uso-del-mes', 'comprar', 'historial']);
  });
});
