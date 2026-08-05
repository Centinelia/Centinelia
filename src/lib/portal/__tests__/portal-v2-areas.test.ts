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
  // 1. Owner con ops ve todos los grupos incluida Oficina
  it('owner con ops ve todos los grupos: inicio, negocio, agentes, oficina, cuenta, usuarios', () => {
    const ids = groupIds(base);
    expect(ids).toContain('inicio');
    expect(ids).toContain('negocio');
    expect(ids).toContain('agentes');
    expect(ids).toContain('oficina');
    expect(ids).not.toContain('llamadas'); // hasOpsAgent=true → Llamadas hidden
    expect(ids).toContain('cuenta');
    expect(ids).toContain('usuarios');
  });

  // 2. Owner sin ops ve Inicio, Organización, Empleados, Llamadas, Cuenta, Usuarios (SIN Oficina)
  it('owner sin ops ve llamadas en vez de oficina', () => {
    const ids = groupIds({ ...base, hasOpsAgent: false });
    expect(ids).toContain('inicio');
    expect(ids).toContain('negocio');
    expect(ids).toContain('agentes');
    expect(ids).not.toContain('oficina');
    expect(ids).toContain('llamadas');
    expect(ids).toContain('cuenta');
    expect(ids).toContain('usuarios');
  });

  // 3. Oficina tiene exactamente 5 sub-grupos con los items correctos
  it('Oficina tiene 5 sub-grupos con conteos correctos', () => {
    const groups = buildPortalNav(base);
    const oficina = groups.find(g => g.id === 'oficina')!;
    expect(oficina).toBeDefined();
    expect(oficina.subGroups).toHaveLength(5);

    const [actividad, analisis, documentos, programado, sistema] = oficina.subGroups!;

    expect(actividad.label).toBe('Actividad');
    expect(actividad.items).toHaveLength(4);

    expect(analisis.label).toBe('Análisis');
    expect(analisis.items).toHaveLength(3);

    expect(documentos.label).toBe('Documentos');
    expect(documentos.items).toHaveLength(3);

    expect(programado.label).toBe('Programado');
    expect(programado.items).toHaveLength(4);

    expect(sistema.label).toBe('Sistema');
    expect(sistema.items).toHaveLength(1);
  });

  // 3b. Oficina Actividad sub-group items correctos
  it('Oficina > Actividad contiene los 4 items correctos', () => {
    const groups = buildPortalNav(base);
    const oficina = groups.find(g => g.id === 'oficina')!;
    const actividad = oficina.subGroups![0];
    const labels = actividad.items.map(i => i.label);
    expect(labels).toEqual([
      'Hoy en la oficina',
      'Bandeja',
      'Llamadas',
      'Mesa de ayuda',
    ]);
  });

  // 4. Llamadas (no-ops) tiene sub-grupos Entrantes; Salientes solo si showOutbound
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

  // 5. Sub-usuario con modules=['agentes'] solo ve Empleados (y Cuenta y Usuarios no aparecen)
  it('sub-usuario modules=["agentes"] ve solo agentes (y Usuarios no pasa porque !isOwner)', () => {
    const ids = groupIds({
      ...base,
      hasOpsAgent: false,
      isOwner: false,
      modules: ['agentes'],
    });
    expect(ids).toContain('agentes');
    // No 'inicio' (moduleId='inicio' not in ['agentes'])
    expect(ids).not.toContain('inicio');
    // No 'negocio'
    expect(ids).not.toContain('negocio');
    // No 'llamadas' (moduleId='llamadas' not in ['agentes'])
    expect(ids).not.toContain('llamadas');
    // No 'cuenta' (moduleId='cuenta' not in ['agentes'])
    expect(ids).not.toContain('cuenta');
    // No 'usuarios' (owner-only guard, isOwner=false)
    expect(ids).not.toContain('usuarios');
  });

  // 6. Sub-usuario con modules=['llamadas'] ve Oficina (special case) o Llamadas top-level
  it('sub-usuario con modules=["llamadas"] y hasOpsAgent=true ve Oficina (special case)', () => {
    const ids = groupIds({
      ...base,
      hasOpsAgent: true,
      isOwner: false,
      modules: ['llamadas'],
    });
    expect(ids).toContain('oficina');
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
    expect(ids).not.toContain('oficina'); // hasOpsAgent=false → Oficina never generated
  });

  // 7. Usuarios y permisos solo aparece si isOwner
  it('Usuarios aparece solo cuando isOwner=true', () => {
    const ownerIds = groupIds({ ...base, isOwner: true });
    const subIds = groupIds({ ...base, isOwner: false });
    expect(ownerIds).toContain('usuarios');
    expect(subIds).not.toContain('usuarios');
  });

  // 8. tabParam y directHref correctos
  it('Inicio tiene tabParam="inicio" y no directHref', () => {
    const groups = buildPortalNav(base);
    const inicio = groups.find(g => g.id === 'inicio')!;
    expect(inicio.tabParam).toBe('inicio');
    expect(inicio.directHref).toBeUndefined();
  });

  it('Empleados tiene directHref con token y no tabParam', () => {
    const groups = buildPortalNav({ ...base, token: 'MYTOK' });
    const agentes = groups.find(g => g.id === 'agentes')!;
    expect(agentes.directHref).toBe('/portal/MYTOK/agentes');
    expect(agentes.tabParam).toBeUndefined();
  });

  it('Organización tiene tabParam="negocio"', () => {
    const groups = buildPortalNav(base);
    const negocio = groups.find(g => g.id === 'negocio')!;
    expect(negocio.tabParam).toBe('negocio');
  });

  it('Cuenta tiene tabParam="cuenta"', () => {
    const groups = buildPortalNav(base);
    const cuenta = groups.find(g => g.id === 'cuenta')!;
    expect(cuenta.tabParam).toBe('cuenta');
  });

  it('Oficina tiene directHref=/portal/tok123/oficina', () => {
    const groups = buildPortalNav(base);
    const oficina = groups.find(g => g.id === 'oficina')!;
    expect(oficina.directHref).toBe('/portal/tok123/oficina');
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

  // Group order verification
  it('grupos en orden correcto: inicio, negocio, agentes, oficina, cuenta, usuarios', () => {
    const ids = groupIds(base);
    expect(ids).toEqual(['inicio', 'negocio', 'agentes', 'oficina', 'cuenta', 'usuarios']);
  });

  it('grupos en orden correcto sin ops: inicio, negocio, agentes, llamadas, cuenta, usuarios', () => {
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
