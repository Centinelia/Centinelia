import { describe, expect, it } from 'vitest';
import {
  SKILL_PACKS,
  TOOL_TO_PACK,
  resolveActivePacks,
  filterByActivePacks,
  meerkatActivePacks,
  type OrgPackContext,
} from './packs';
import { TOOL_REGISTRY } from './registry';

describe('SKILL_PACKS', () => {
  it('every pack has at least 1 tool', () => {
    for (const p of SKILL_PACKS) {
      expect(p.tools.length).toBeGreaterThan(0);
    }
  });

  it('every pack has unique id', () => {
    const ids = SKILL_PACKS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no tool appears in 2 packs (TOOL_TO_PACK univocal)', () => {
    const seen = new Map<string, string>();
    for (const p of SKILL_PACKS) {
      for (const t of p.tools) {
        const previous = seen.get(t);
        if (previous) throw new Error(`Tool "${t}" in packs "${previous}" and "${p.id}"`);
        seen.set(t, p.id);
      }
    }
  });
});

describe('resolveActivePacks', () => {
  it('empty context returns empty set', () => {
    const active = resolveActivePacks({});
    expect(active.size).toBe(0);
  });

  it('quickbooks pack está DESACTIVADO 2026-08-28 (activeCheck hardcoded false)', () => {
    // qb_realm_id se ignora — pack no se activa hasta reactivación manual.
    const active = resolveActivePacks({ qb_realm_id: 'realm-123' });
    expect(active.has('quickbooks')).toBe(false);
    expect(active.has('mercado_libre')).toBe(false);
  });

  it('invoicing_provider activates invoicing_cfdi', () => {
    const active = resolveActivePacks({ invoicing_provider: 'solucion_factible' });
    expect(active.has('invoicing_cfdi')).toBe(true);
  });

  it('multiple flags activate multiple packs (excepto quickbooks desactivado)', () => {
    const active = resolveActivePacks({ qb_realm_id: 'r', has_ml: true, has_outbound: true });
    expect(active.has('quickbooks')).toBe(false); // desactivado 2026-08-28
    expect(active.has('mercado_libre')).toBe(true);
    expect(active.has('outbound_calls')).toBe(true);
  });
});

describe('filterByActivePacks', () => {
  it('tool without pack always passes', () => {
    // pedir_a_humano no está en ningún pack
    const filtered = filterByActivePacks(['pedir_a_humano'], new Set());
    expect(filtered).toEqual(['pedir_a_humano']);
  });

  it('tool in inactive pack is dropped', () => {
    const filtered = filterByActivePacks(['qb_crear_factura'], new Set());
    expect(filtered).toEqual([]);
  });

  it('tool in active pack passes', () => {
    const filtered = filterByActivePacks(['qb_crear_factura'], new Set(['quickbooks']));
    expect(filtered).toEqual(['qb_crear_factura']);
  });

  it('mixed set filters correctly', () => {
    const filtered = filterByActivePacks(
      ['qb_crear_factura', 'pedir_a_humano', 'analizar_publicaciones_ml'],
      new Set(['quickbooks']),
    );
    expect(filtered).toEqual(['qb_crear_factura', 'pedir_a_humano']);
  });
});

describe('meerkatActivePacks', () => {
  it('pack sin meerkatGate se mantiene activo si el org lo tiene', () => {
    const active = meerkatActivePacks(new Set(['quickbooks']), {});
    expect(active.has('quickbooks')).toBe(true);
  });

  it('outbound_calls requiere features.outbound_calls === true', () => {
    const withoutGate = meerkatActivePacks(new Set(['outbound_calls']), {});
    expect(withoutGate.has('outbound_calls')).toBe(false);

    const gateOff = meerkatActivePacks(new Set(['outbound_calls']), { outbound_calls: false });
    expect(gateOff.has('outbound_calls')).toBe(false);

    const gateOn = meerkatActivePacks(new Set(['outbound_calls']), { outbound_calls: true });
    expect(gateOn.has('outbound_calls')).toBe(true);
  });

  it('pack inactivo org-level nunca aparece aunque meerkatGate pase', () => {
    const active = meerkatActivePacks(new Set(), { outbound_calls: true });
    expect(active.has('outbound_calls')).toBe(false);
  });
});

describe('registry ↔ packs consistency', () => {
  it('every gatedByFeature entry has a pack assigned', () => {
    const drift = TOOL_REGISTRY.filter(t => t.gatedByFeature && !t.pack);
    if (drift.length > 0) {
      throw new Error(`Tools con gatedByFeature sin pack: ${drift.map(t => t.name).join(', ')}`);
    }
  });
});
