import { TOOL_REGISTRY } from './registry';
import { SKILL_PACKS, TOOL_TO_PACK } from './packs';
import { MEERKAT_VOICE_DISTRIBUTION, UNIVERSAL_VOICE_TOOLS } from '@/lib/vapi/sync';
import { MEERKAT_EMAIL_DISTRIBUTION } from '@/lib/ops/inbox-processor';
import { UNIVERSAL_TOOLS } from './channel-mapping';
import { formatToolLabel } from './tool-labels';
import type { ToolOverrides } from './tool-overrides';

export type ToolSource = 'universal' | 'preset' | 'extra' | 'pack';
export type ToolState  = 'on' | 'off';

export interface AvailableTool {
  name:               string;
  label:              string;
  description:        string;
  source:             ToolSource;
  state:              ToolState;
  inPreset:           boolean;
  disabledByOverride: boolean;
  enabledByOverride:  boolean;
}

/**
 * Un grupo agrupa tools para el UI de overrides. `id` es el discriminador:
 *  - 'universales'  → base común de todo empleado
 *  - 'rol'          → preset específico del meerkat + extras habilitados
 *  - <pack.id>      → tools de un skills pack activo
 */
export interface ToolGroup {
  id:          string;
  label:       string;
  description: string | null;
  tools:       AvailableTool[];
}

const UNIVERSAL_SET = new Set([...UNIVERSAL_TOOLS, ...UNIVERSAL_VOICE_TOOLS]);

/** Preset unificado del meerkat: unión de voice + email + universales. */
export function presetForMeerkat(meerkatId: string | null): Set<string> {
  const voice = meerkatId ? MEERKAT_VOICE_DISTRIBUTION[meerkatId] ?? [] : [];
  const email = meerkatId ? MEERKAT_EMAIL_DISTRIBUTION[meerkatId] ?? [] : [];
  return new Set([...voice, ...email, ...UNIVERSAL_TOOLS, ...UNIVERSAL_VOICE_TOOLS]);
}

/**
 * Construye los grupos de tools para la UI de overrides finos.
 *
 * Grupos en orden:
 *  1. 'universales' — 5-6 tools base que todo empleado tiene.
 *  2. 'rol'         — preset específico del meerkat SIN pack y NO universales,
 *                     más tools habilitadas por override que caen en esa zona.
 *  3. <pack.id>     — TODAS las tools del pack (solo si pack está activo).
 *
 * Tools de packs inactivos: ocultas. Tools con state='off' aparecen debajo de
 * las 'on' dentro de cada grupo.
 */
export function buildToolGroups(
  meerkatId:   string | null,
  overrides:   ToolOverrides,
  activePacks: Set<string>,
): ToolGroup[] {
  const preset      = presetForMeerkat(meerkatId);
  const enabledSet  = new Set(overrides.enabled);
  const disabledSet = new Set(overrides.disabled);

  const universalTools: AvailableTool[]           = [];
  const rolTools:       AvailableTool[]           = [];
  const packToolsById:  Map<string, AvailableTool[]> = new Map();

  for (const entry of TOOL_REGISTRY) {
    const packId = entry.pack;

    if (packId && !activePacks.has(packId)) continue;

    const isUniversal       = UNIVERSAL_SET.has(entry.name);
    const inPreset          = preset.has(entry.name);
    const enabledByOverride = enabledSet.has(entry.name);
    const disabledByOverride = disabledSet.has(entry.name);
    const state: ToolState  = (inPreset || enabledByOverride) && !disabledByOverride ? 'on' : 'off';

    let source: ToolSource;
    if (isUniversal)                 source = 'universal';
    else if (inPreset)               source = 'preset';
    else if (enabledByOverride)      source = 'extra';
    else                             source = 'pack';

    const tool: AvailableTool = {
      name:                entry.name,
      label:               formatToolLabel(entry.name),
      description:         entry.description,
      source,
      state,
      inPreset:            isUniversal || inPreset,
      disabledByOverride,
      enabledByOverride,
    };

    if (isUniversal) {
      universalTools.push(tool);
    } else if (packId) {
      const arr = packToolsById.get(packId) ?? [];
      arr.push(tool);
      packToolsById.set(packId, arr);
    } else if (inPreset || enabledByOverride || disabledByOverride) {
      rolTools.push(tool);
    }
  }

  const groups: ToolGroup[] = [
    {
      id:          'universales',
      label:       'Base universal',
      description: 'Herramientas base que todo empleado tiene sin importar su puesto.',
      tools:       sortTools(universalTools),
    },
    {
      id:          'rol',
      label:       'Propias del puesto',
      description: 'Herramientas del rol específico de este empleado.',
      tools:       sortTools(rolTools),
    },
  ];

  const packGroups: ToolGroup[] = SKILL_PACKS
    .filter(p => activePacks.has(p.id) && packToolsById.has(p.id))
    .map(p => ({
      id:          p.id,
      label:       p.label,
      description: p.description,
      tools:       sortTools(packToolsById.get(p.id) ?? []),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));

  return [...groups, ...packGroups];
}

function sortTools(tools: AvailableTool[]): AvailableTool[] {
  const rank: Record<ToolState, number> = { on: 0, off: 1 };
  return [...tools].sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    return a.label.localeCompare(b.label, 'es');
  });
}

export { TOOL_TO_PACK };
