/**
 * computeNextOverrides — reducer puro que decide cómo evolucionar el estado
 * de overrides al togglear una herramienta.
 *
 * Extraído de ToolOverridesSection para poder testearlo sin DOM.
 *
 * Reglas:
 *  - Preset tool ON + toggle OFF   → agrega a `disabled`
 *  - Preset tool OFF (por override) + toggle ON → quita de `disabled`
 *  - Extra tool (no en preset) OFF + toggle ON  → agrega a `enabled`
 *  - Extra tool ON (por override) + toggle OFF  → quita de `enabled`
 *  - Universal tool: se comporta como preset (siempre `inPreset=true`)
 *
 * Nunca duplica entries. Nunca deja una tool en ambas listas.
 */

import type { ToolOverrides } from './tool-overrides';

export interface ToggleTarget {
  name:               string;
  inPreset:           boolean;
  disabledByOverride: boolean;
  enabledByOverride:  boolean;
}

export function computeNextOverrides(
  current: ToolOverrides,
  tool:    ToggleTarget,
  next:    boolean,
): ToolOverrides {
  const disabled = new Set(current.disabled);
  const enabled  = new Set(current.enabled);

  if (!next) {
    // Turning OFF
    if (tool.enabledByOverride) {
      enabled.delete(tool.name);
    } else if (tool.inPreset) {
      disabled.add(tool.name);
    }
    // else: no-op — extra tool already off
  } else {
    // Turning ON
    if (tool.disabledByOverride) {
      disabled.delete(tool.name);
    } else if (!tool.inPreset) {
      enabled.add(tool.name);
    }
    // else: no-op — preset tool already on
  }

  return {
    disabled: [...disabled],
    enabled:  [...enabled],
  };
}
