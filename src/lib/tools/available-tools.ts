import { TOOL_REGISTRY } from './registry';
import { SKILL_PACKS, TOOL_TO_PACK } from './packs';
import { MEERKAT_VOICE_DISTRIBUTION, UNIVERSAL_VOICE_TOOLS } from '@/lib/vapi/sync';
import { MEERKAT_EMAIL_DISTRIBUTION } from '@/lib/ops/inbox-processor';
import { UNIVERSAL_TOOLS } from './channel-mapping';
import type { ToolOverrides } from './tool-overrides';

export type ToolSource = 'universal' | 'preset' | 'extra' | 'pack';
export type ToolState  = 'on' | 'off';

export interface AvailableTool {
  name:         string;
  description:  string;
  source:       ToolSource;
  state:        ToolState;
  disabledByOverride: boolean;
  enabledByOverride:  boolean;
}

export interface ToolGroup {
  packId:      string | null;
  label:       string;
  description: string | null;
  tools:       AvailableTool[];
}

/** Preset unificado del meerkat: unión de voice + email + universales. */
export function presetForMeerkat(meerkatId: string | null): Set<string> {
  const voice = meerkatId ? MEERKAT_VOICE_DISTRIBUTION[meerkatId] ?? [] : [];
  const email = meerkatId ? MEERKAT_EMAIL_DISTRIBUTION[meerkatId] ?? [] : [];
  return new Set([...voice, ...email, ...UNIVERSAL_TOOLS, ...UNIVERSAL_VOICE_TOOLS]);
}

/**
 * Construye los grupos de tools para la UI de overrides finos.
 *
 * - Grupo "default" (packId=null): tools SIN pack que este meerkat usa por
 *   default (preset ∪ universales) o que el owner habilitó via override.
 *   Tools que el owner deshabilitó siguen visibles pero con state='off' para
 *   que pueda re-habilitarlas.
 * - Grupos por pack: TODAS las tools del pack (solo si el pack está activo).
 *   Marca state según preset ∪ overrides. Tools de packs inactivos se ocultan.
 *
 * Retorna grupos en orden: default primero, luego packs alfabéticos por label.
 */
export function buildToolGroups(
  meerkatId:   string | null,
  overrides:   ToolOverrides,
  activePacks: Set<string>,
): ToolGroup[] {
  const preset       = presetForMeerkat(meerkatId);
  const universalSet = new Set([...UNIVERSAL_TOOLS, ...UNIVERSAL_VOICE_TOOLS]);
  const enabledSet   = new Set(overrides.enabled);
  const disabledSet  = new Set(overrides.disabled);

  const defaultTools:      AvailableTool[]                  = [];
  const packToolsById:     Map<string, AvailableTool[]>     = new Map();

  for (const entry of TOOL_REGISTRY) {
    const packId = entry.pack;

    if (packId && !activePacks.has(packId)) continue;

    const inPreset          = preset.has(entry.name);
    const enabledByOverride = enabledSet.has(entry.name);
    const disabledByOverride = disabledSet.has(entry.name);
    const state: ToolState  = (inPreset || enabledByOverride) && !disabledByOverride ? 'on' : 'off';

    let source: ToolSource;
    if (universalSet.has(entry.name)) source = 'universal';
    else if (inPreset)                source = 'preset';
    else if (enabledByOverride)       source = 'extra';
    else                              source = 'pack';

    const tool: AvailableTool = {
      name:               entry.name,
      description:        entry.description,
      source,
      state,
      disabledByOverride,
      enabledByOverride,
    };

    if (packId) {
      const arr = packToolsById.get(packId) ?? [];
      arr.push(tool);
      packToolsById.set(packId, arr);
    } else {
      if (inPreset || enabledByOverride || disabledByOverride) {
        defaultTools.push(tool);
      }
    }
  }

  const defaultGroup: ToolGroup = {
    packId:      null,
    label:       'Habilitadas por default',
    description: 'Herramientas base del rol y universales que todo empleado recibe.',
    tools:       sortTools(defaultTools),
  };

  const packGroups: ToolGroup[] = SKILL_PACKS
    .filter(p => activePacks.has(p.id) && packToolsById.has(p.id))
    .map(p => ({
      packId:      p.id,
      label:       p.label,
      description: p.description,
      tools:       sortTools(packToolsById.get(p.id) ?? []),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));

  return [defaultGroup, ...packGroups];
}

function sortTools(tools: AvailableTool[]): AvailableTool[] {
  const rank: Record<ToolState, number> = { on: 0, off: 1 };
  return [...tools].sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    return a.name.localeCompare(b.name, 'es');
  });
}

export { TOOL_TO_PACK };
