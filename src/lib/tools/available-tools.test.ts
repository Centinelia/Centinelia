import { describe, expect, it } from 'vitest';
import { buildToolGroups, presetForMeerkat } from './available-tools';
import { formatToolLabel, TOOL_LABELS } from './tool-labels';
import type { ToolOverrides } from './tool-overrides';

const EMPTY_OVERRIDES: ToolOverrides = { disabled: [], enabled: [] };

describe('presetForMeerkat', () => {
  it('unifica voice + email + universales para nia', () => {
    const preset = presetForMeerkat('nia');
    expect(preset.has('crear_lead')).toBe(true);
    expect(preset.has('delegar_tarea')).toBe(true);
    expect(preset.has('consultar_agente')).toBe(true);
    expect(preset.has('pedir_a_humano')).toBe(true);
  });

  it('meerkat desconocido devuelve solo universales', () => {
    const preset = presetForMeerkat('unknown_meerkat');
    expect(preset.has('delegar_tarea')).toBe(true);
    expect(preset.has('crear_lead')).toBe(false);
  });

  it('meerkatId null devuelve solo universales', () => {
    const preset = presetForMeerkat(null);
    expect(preset.has('delegar_tarea')).toBe(true);
    expect(preset.size).toBeGreaterThan(0);
  });
});

describe('formatToolLabel', () => {
  it('devuelve el label del mapping cuando existe', () => {
    expect(formatToolLabel('agregar_tag_contacto')).toBe('Etiquetar contacto');
    expect(formatToolLabel('delegar_tarea')).toBe('Delegar tarea a otro empleado');
  });

  it('cae a Title Case cuando la tool no tiene mapping', () => {
    expect(formatToolLabel('foo_bar_baz')).toBe('Foo Bar Baz');
  });

  it('nunca devuelve snake_case crudo', () => {
    const cases = ['x', 'x_y', 'un_nombre_muy_largo_con_muchas_palabras'];
    for (const c of cases) expect(formatToolLabel(c)).not.toContain('_');
  });

  it('las tools universales tienen label', () => {
    for (const name of ['delegar_tarea', 'consultar_agente', 'pedir_a_humano', 'reportar_falla', 'read_url', 'buscar_en_web']) {
      expect(TOOL_LABELS[name]).toBeDefined();
    }
  });
});

describe('buildToolGroups', () => {
  it('devuelve universales primero, luego rol, luego packs', () => {
    const groups = buildToolGroups('nia', EMPTY_OVERRIDES, new Set(['quickbooks']));
    expect(groups[0].id).toBe('universales');
    expect(groups[1].id).toBe('rol');
    expect(groups[2].id).toBe('quickbooks');
  });

  it('grupo universales contiene delegar_tarea on', () => {
    const groups = buildToolGroups('nia', EMPTY_OVERRIDES, new Set());
    const universales = groups.find(g => g.id === 'universales')!;
    const delegar = universales.tools.find(t => t.name === 'delegar_tarea');
    expect(delegar?.state).toBe('on');
    expect(delegar?.source).toBe('universal');
    expect(delegar?.label).toBe('Delegar tarea a otro empleado');
  });

  it('grupo rol no incluye tools universales', () => {
    const groups = buildToolGroups('nia', EMPTY_OVERRIDES, new Set());
    const rol = groups.find(g => g.id === 'rol')!;
    const names = rol.tools.map(t => t.name);
    for (const universal of ['delegar_tarea', 'consultar_agente', 'pedir_a_humano', 'reportar_falla', 'read_url', 'buscar_en_web']) {
      expect(names).not.toContain(universal);
    }
  });

  it('grupo rol no incluye tools con pack', () => {
    const groups = buildToolGroups('nico', EMPTY_OVERRIDES, new Set(['quickbooks']));
    const rol = groups.find(g => g.id === 'rol')!;
    const names = rol.tools.map(t => t.name);
    expect(names).not.toContain('qb_crear_factura');
  });

  it('oculta tools de packs inactivos', () => {
    const groups = buildToolGroups('nico', EMPTY_OVERRIDES, new Set());
    const allTools = groups.flatMap(g => g.tools.map(t => t.name));
    expect(allTools).not.toContain('qb_crear_factura');
  });

  it('muestra pack activo con sus tools', () => {
    const groups = buildToolGroups('nico', EMPTY_OVERRIDES, new Set(['quickbooks']));
    const qb = groups.find(g => g.id === 'quickbooks')!;
    expect(qb.tools.length).toBeGreaterThan(0);
    const factura = qb.tools.find(t => t.name === 'qb_crear_factura');
    expect(factura?.state).toBe('on');
    expect(factura?.source).toBe('preset');
    expect(factura?.label).toBe('Crear factura en QuickBooks');
  });

  it('tool de pack activo pero fuera de preset aparece off', () => {
    const groups = buildToolGroups('nia', EMPTY_OVERRIDES, new Set(['quickbooks']));
    const qb = groups.find(g => g.id === 'quickbooks')!;
    const factura = qb.tools.find(t => t.name === 'qb_crear_factura');
    expect(factura?.state).toBe('off');
    expect(factura?.source).toBe('pack');
  });

  it('override.disabled apaga una tool del preset', () => {
    const overrides: ToolOverrides = { disabled: ['crear_lead'], enabled: [] };
    const groups = buildToolGroups('nia', overrides, new Set());
    const rol = groups.find(g => g.id === 'rol')!;
    const lead = rol.tools.find(t => t.name === 'crear_lead');
    expect(lead?.state).toBe('off');
    expect(lead?.disabledByOverride).toBe(true);
  });

  it('override.enabled prende una tool fuera del preset', () => {
    const overrides: ToolOverrides = { disabled: [], enabled: ['enviar_correo'] };
    const groups = buildToolGroups('nia', overrides, new Set());
    const rol = groups.find(g => g.id === 'rol')!;
    const send = rol.tools.find(t => t.name === 'enviar_correo');
    expect(send?.state).toBe('on');
    expect(send?.source).toBe('extra');
  });

  it('override.disabled prevalece sobre preset+enabled', () => {
    const overrides: ToolOverrides = { disabled: ['crear_lead'], enabled: ['crear_lead'] };
    const groups = buildToolGroups('nia', overrides, new Set());
    const rol = groups.find(g => g.id === 'rol')!;
    const lead = rol.tools.find(t => t.name === 'crear_lead');
    expect(lead?.state).toBe('off');
  });

  it('grupo rol excluye tools sin pack que no toquen al meerkat', () => {
    const groups = buildToolGroups('nia', EMPTY_OVERRIDES, new Set());
    const rol = groups.find(g => g.id === 'rol')!;
    const names = rol.tools.map(t => t.name);
    expect(names).not.toContain('iniciar_onboarding');
  });

  it('grupos pack ordenados alfabético por label', () => {
    const groups = buildToolGroups(
      'nox',
      EMPTY_OVERRIDES,
      new Set(['quickbooks', 'invoicing_cfdi', 'contratos']),
    );
    const packGroups = groups.filter(g => g.id !== 'universales' && g.id !== 'rol');
    const labels = packGroups.map(g => g.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('tools on primero, off después dentro de cada grupo', () => {
    const groups = buildToolGroups('nico', EMPTY_OVERRIDES, new Set(['quickbooks']));
    const qb = groups.find(g => g.id === 'quickbooks')!;
    const states = qb.tools.map(t => t.state);
    let sawOff = false;
    for (const s of states) {
      if (s === 'off') sawOff = true;
      if (s === 'on' && sawOff) throw new Error('on after off');
    }
  });

  it('todas las tools tienen label no vacío', () => {
    const groups = buildToolGroups('noah', EMPTY_OVERRIDES, new Set(['quickbooks', 'invoicing_cfdi']));
    for (const g of groups) for (const t of g.tools) {
      expect(t.label).toBeTruthy();
      expect(t.label).not.toContain('_');
    }
  });
});
