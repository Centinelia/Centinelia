import { describe, it, expect } from 'vitest';
import { buildPortalAreas, type BuildAreasInput } from '../portal-v2-areas';

const baseInput: BuildAreasInput = {
  token: 'tok123',
  hasOpsAgent: false,
  showOutbound: false,
  isOwner: true,
  modules: undefined, // owner
};

describe('buildPortalAreas', () => {
  it('owner sin ops ni outbound ve Escritorio + Historial(llamadas) + Tu equipo + Administracion (sin Bandeja)', () => {
    const areas = buildPortalAreas(baseInput);
    const ids = areas.map(a => a.id);
    expect(ids).toEqual(['escritorio', 'historial', 'equipo', 'administracion']);
  });

  it('owner con ops agent ve las 5 areas incluyendo Bandeja', () => {
    const areas = buildPortalAreas({ ...baseInput, hasOpsAgent: true });
    const ids = areas.map(a => a.id);
    expect(ids).toEqual(['escritorio', 'bandeja', 'historial', 'equipo', 'administracion']);
  });

  it('Historial incluye Salientes solo si showOutbound=true', () => {
    const sinOutbound = buildPortalAreas(baseInput);
    const conOutbound = buildPortalAreas({ ...baseInput, showOutbound: true });
    const histSin = sinOutbound.find(a => a.id === 'historial')!;
    const histCon = conOutbound.find(a => a.id === 'historial')!;
    expect(histSin.subItems.map(s => s.label)).not.toContain('Salientes');
    expect(histCon.subItems.map(s => s.label)).toContain('Salientes');
  });

  it('Historial incluye Reportes/Aprendizajes/Investigacion solo si hasOpsAgent=true', () => {
    const areas = buildPortalAreas({ ...baseInput, hasOpsAgent: true });
    const hist = areas.find(a => a.id === 'historial')!;
    const labels = hist.subItems.map(s => s.label);
    expect(labels).toContain('Reportes');
    expect(labels).toContain('Aprendizajes');
    expect(labels).toContain('Investigación');
  });

  it('Administracion incluye Usuarios solo si isOwner=true', () => {
    const owner = buildPortalAreas(baseInput);
    const subUser = buildPortalAreas({ ...baseInput, isOwner: false, modules: ['agentes', 'llamadas'] });
    const adminOwner = owner.find(a => a.id === 'administracion')!;
    const adminSub = subUser.find(a => a.id === 'administracion')!;
    expect(adminOwner.subItems.map(s => s.label)).toContain('Usuarios y permisos');
    expect(adminSub.subItems.map(s => s.label)).not.toContain('Usuarios y permisos');
  });

  it('sub-usuario con modules=["agentes"] no ve Historial ni Bandeja', () => {
    const areas = buildPortalAreas({
      ...baseInput,
      isOwner: false,
      hasOpsAgent: false,
      modules: ['agentes'],
    });
    const ids = areas.map(a => a.id);
    expect(ids).toContain('escritorio');
    expect(ids).toContain('equipo');
    expect(ids).toContain('administracion');
    expect(ids).not.toContain('historial'); // sin llamadas ni salientes en modules
    expect(ids).not.toContain('bandeja');
  });

  it('hrefs contienen el token', () => {
    const areas = buildPortalAreas({ ...baseInput, token: 'MYTOK' });
    for (const a of areas) {
      expect(a.href).toContain('MYTOK');
      for (const s of a.subItems) {
        expect(s.href).toContain('MYTOK');
      }
    }
  });

  it('Historial.href apunta a /oficina/llamadas si hasOpsAgent, /llamadas/entrantes si no', () => {
    const conOps = buildPortalAreas({ ...baseInput, hasOpsAgent: true });
    const sinOps = buildPortalAreas({ ...baseInput, hasOpsAgent: false });
    const llamadasConOps = conOps.find(a => a.id === 'historial')!.subItems.find(s => s.label === 'Llamadas')!;
    const llamadasSinOps = sinOps.find(a => a.id === 'historial')!.subItems.find(s => s.label === 'Llamadas')!;
    expect(llamadasConOps.href).toContain('/oficina/llamadas');
    expect(llamadasSinOps.href).toContain('/llamadas/entrantes');
  });
});
