import { describe, expect, it } from 'vitest';
import { buildToolGroups, presetForMeerkat } from './available-tools';
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

describe('buildToolGroups', () => {
  it('devuelve grupo default primero con universales on', () => {
    const groups = buildToolGroups('nia', EMPTY_OVERRIDES, new Set());
    expect(groups[0].packId).toBe(null);
    expect(groups[0].label).toBe('Habilitadas por default');
    const delegar = groups[0].tools.find(t => t.name === 'delegar_tarea');
    expect(delegar?.state).toBe('on');
    expect(delegar?.source).toBe('universal');
  });

  it('oculta tools de packs inactivos', () => {
    const groups = buildToolGroups('nico', EMPTY_OVERRIDES, new Set());
    const allTools = groups.flatMap(g => g.tools.map(t => t.name));
    expect(allTools).not.toContain('qb_crear_factura');
  });

  it('muestra pack activo con sus tools', () => {
    const groups = buildToolGroups('nico', EMPTY_OVERRIDES, new Set(['quickbooks']));
    const qbGroup = groups.find(g => g.packId === 'quickbooks');
    expect(qbGroup).toBeDefined();
    expect(qbGroup!.tools.length).toBeGreaterThan(0);
    const qbFactura = qbGroup!.tools.find(t => t.name === 'qb_crear_factura');
    expect(qbFactura?.state).toBe('on');
    expect(qbFactura?.source).toBe('preset');
  });

  it('tool de pack activo pero fuera de preset del rol aparece off', () => {
    const groups = buildToolGroups('nia', EMPTY_OVERRIDES, new Set(['quickbooks']));
    const qbGroup = groups.find(g => g.packId === 'quickbooks');
    expect(qbGroup).toBeDefined();
    const qbFactura = qbGroup!.tools.find(t => t.name === 'qb_crear_factura');
    expect(qbFactura?.state).toBe('off');
    expect(qbFactura?.source).toBe('pack');
  });

  it('override.disabled apaga una tool del preset', () => {
    const overrides: ToolOverrides = { disabled: ['crear_lead'], enabled: [] };
    const groups = buildToolGroups('nia', overrides, new Set());
    const defaultGroup = groups[0];
    const lead = defaultGroup.tools.find(t => t.name === 'crear_lead');
    expect(lead?.state).toBe('off');
    expect(lead?.disabledByOverride).toBe(true);
  });

  it('override.enabled prende una tool fuera del preset', () => {
    const overrides: ToolOverrides = { disabled: [], enabled: ['enviar_correo'] };
    const groups = buildToolGroups('nia', overrides, new Set());
    const defaultGroup = groups[0];
    const send = defaultGroup.tools.find(t => t.name === 'enviar_correo');
    expect(send?.state).toBe('on');
    expect(send?.source).toBe('extra');
  });

  it('override.disabled prevalece sobre preset', () => {
    const overrides: ToolOverrides = { disabled: ['crear_lead'], enabled: ['crear_lead'] };
    const groups = buildToolGroups('nia', overrides, new Set());
    const defaultGroup = groups[0];
    const lead = defaultGroup.tools.find(t => t.name === 'crear_lead');
    expect(lead?.state).toBe('off');
  });

  it('grupo default excluye tools sin pack que no toquen al meerkat', () => {
    const groups = buildToolGroups('nia', EMPTY_OVERRIDES, new Set());
    const defaultTools = groups[0].tools.map(t => t.name);
    // iniciar_onboarding es de naia, no de nia — no debe aparecer aunque sea sin pack
    expect(defaultTools).not.toContain('iniciar_onboarding');
  });

  it('grupos pack ordenados alfabético por label después del default', () => {
    const groups = buildToolGroups(
      'nox',
      EMPTY_OVERRIDES,
      new Set(['quickbooks', 'invoicing_cfdi', 'contratos']),
    );
    expect(groups[0].packId).toBe(null);
    const packLabels = groups.slice(1).map(g => g.label);
    expect(packLabels).toEqual([...packLabels].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('tools on primero, off después dentro de cada grupo', () => {
    const groups = buildToolGroups('nico', EMPTY_OVERRIDES, new Set(['quickbooks']));
    const qbGroup = groups.find(g => g.packId === 'quickbooks')!;
    const states = qbGroup.tools.map(t => t.state);
    // sin descenso off→on una vez que empezamos con off
    let sawOff = false;
    for (const s of states) {
      if (s === 'off') sawOff = true;
      if (s === 'on' && sawOff) throw new Error('on aparece después de off');
    }
  });
});
