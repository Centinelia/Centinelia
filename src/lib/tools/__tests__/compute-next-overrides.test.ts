/**
 * Tests para computeNextOverrides — reducer puro que gobierna las
 * transiciones de estado del ToolOverridesSection.
 *
 * Cobertura exhaustiva de las 4 zonas del state chart:
 *   preset ON  → OFF
 *   preset OFF (via override) → ON
 *   extra ON (via override) → OFF
 *   extra OFF → ON
 * + edge cases: doble-toggle idempotente, no-op cuando ya está en target,
 *   preservación del resto del state.
 */

import { describe, it, expect } from 'vitest';
import { computeNextOverrides, type ToggleTarget } from '../compute-next-overrides';

const emptyOverrides = { disabled: [] as string[], enabled: [] as string[] };

function preset(name: string, extra: Partial<ToggleTarget> = {}): ToggleTarget {
  return { name, inPreset: true, disabledByOverride: false, enabledByOverride: false, ...extra };
}
function extra(name: string, extra: Partial<ToggleTarget> = {}): ToggleTarget {
  return { name, inPreset: false, disabledByOverride: false, enabledByOverride: false, ...extra };
}

describe('computeNextOverrides — preset tools', () => {
  it('preset ON → OFF: agrega a disabled', () => {
    const result = computeNextOverrides(emptyOverrides, preset('read_url'), false);
    expect(result).toEqual({ disabled: ['read_url'], enabled: [] });
  });

  it('preset OFF (via override) → ON: quita de disabled', () => {
    const result = computeNextOverrides(
      { disabled: ['read_url', 'other'], enabled: [] },
      preset('read_url', { disabledByOverride: true }),
      true,
    );
    expect(result).toEqual({ disabled: ['other'], enabled: [] });
  });

  it('preset ON → ON: no-op (no duplica en enabled)', () => {
    const result = computeNextOverrides(emptyOverrides, preset('read_url'), true);
    expect(result).toEqual({ disabled: [], enabled: [] });
  });

  it('preset OFF → OFF: no-op (no duplica en disabled)', () => {
    const result = computeNextOverrides(
      { disabled: ['read_url'], enabled: [] },
      preset('read_url', { disabledByOverride: true }),
      false,
    );
    // El estado ya está OFF por override; no re-agregamos.
    expect(result).toEqual({ disabled: ['read_url'], enabled: [] });
  });
});

describe('computeNextOverrides — extra tools (fuera del preset)', () => {
  it('extra OFF → ON: agrega a enabled', () => {
    const result = computeNextOverrides(emptyOverrides, extra('special_tool'), true);
    expect(result).toEqual({ disabled: [], enabled: ['special_tool'] });
  });

  it('extra ON (via override) → OFF: quita de enabled', () => {
    const result = computeNextOverrides(
      { disabled: [], enabled: ['special_tool', 'other'] },
      extra('special_tool', { enabledByOverride: true }),
      false,
    );
    expect(result).toEqual({ disabled: [], enabled: ['other'] });
  });

  it('extra ON → ON: no-op (no duplica)', () => {
    const result = computeNextOverrides(
      { disabled: [], enabled: ['special_tool'] },
      extra('special_tool', { enabledByOverride: true }),
      true,
    );
    expect(result).toEqual({ disabled: [], enabled: ['special_tool'] });
  });

  it('extra OFF → OFF: no-op', () => {
    const result = computeNextOverrides(emptyOverrides, extra('special_tool'), false);
    expect(result).toEqual({ disabled: [], enabled: [] });
  });
});

describe('computeNextOverrides — doble toggle es idempotente', () => {
  it('preset OFF→ON→OFF vuelve al estado inicial', () => {
    const tool = preset('read_url');
    const s1   = computeNextOverrides(emptyOverrides, tool, false);
    expect(s1.disabled).toContain('read_url');
    const s2   = computeNextOverrides(s1, { ...tool, disabledByOverride: true }, true);
    expect(s2).toEqual(emptyOverrides);
  });

  it('extra ON→OFF→ON vuelve al estado con enabled', () => {
    const tool = extra('t');
    const s1   = computeNextOverrides(emptyOverrides, tool, true);
    const s2   = computeNextOverrides(s1, { ...tool, enabledByOverride: true }, false);
    const s3   = computeNextOverrides(s2, tool, true);
    expect(s3).toEqual({ disabled: [], enabled: ['t'] });
  });
});

describe('computeNextOverrides — preservación del state ajeno', () => {
  it('no altera entries de otras tools al togglear una', () => {
    const start = { disabled: ['a', 'b'], enabled: ['c', 'd'] };
    const result = computeNextOverrides(start, preset('e'), false);
    expect(result.disabled).toEqual(expect.arrayContaining(['a', 'b', 'e']));
    expect(result.enabled).toEqual(['c', 'd']);
  });

  it('nunca deja una tool en ambas listas', () => {
    // Simulación: la tool está en `enabled` (extra ON) y le doy OFF.
    // El code no debería agregarla a `disabled` porque es extra, no preset.
    const start = { disabled: [], enabled: ['t'] };
    const result = computeNextOverrides(
      start,
      extra('t', { enabledByOverride: true }),
      false,
    );
    expect(result.disabled).not.toContain('t');
    expect(result.enabled).not.toContain('t');
  });
});
