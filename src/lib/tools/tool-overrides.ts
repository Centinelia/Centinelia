/**
 * Capa 3 del refactor tool-bloat: overrides finos por meerkat.
 *
 * `voice_agents.tool_overrides` (jsonb) permite al owner deshabilitar tools
 * específicas que el preset del rol da por default, o habilitar tools extra
 * fuera del preset. Se aplica DESPUÉS del filtro por preset en los 3 canales:
 *
 *     tools = (preset del rol ∪ universales) - disabled + enabled
 *
 * Ejemplo: Noah tiene `generar_propuesta_comercial` en su preset. Un cliente
 * concreto no lo quiere → owner agrega la tool a `disabled`. Se sigue viendo
 * en el rol default pero ese meerkat específico no la recibe.
 *
 * Reverso: Nia por default no tiene `send_email`. Un cliente quiere que Nia
 * pueda responder ciertos correos → owner agrega `enviar_correo` a `enabled`.
 */

export interface ToolOverrides {
  disabled: string[];
  enabled:  string[];
}

export function parseToolOverrides(raw: unknown): ToolOverrides {
  if (!raw || typeof raw !== 'object') return { disabled: [], enabled: [] };
  const o = raw as Record<string, unknown>;
  const disabled = Array.isArray(o.disabled) ? o.disabled.filter((x): x is string => typeof x === 'string') : [];
  const enabled  = Array.isArray(o.enabled)  ? o.enabled .filter((x): x is string => typeof x === 'string') : [];
  return { disabled, enabled };
}

/**
 * Aplica overrides a un array de tools ya filtradas por preset. `getTool` es
 * el resolver que dice cómo obtener el objeto de tool dado un nombre (varía
 * por canal: EMAIL_TOOL_BY_NAME, CHAT_TOOL_BY_NAME, etc.). Retorna array
 * nuevo, no muta.
 */
export function applyToolOverrides<T extends { name: string }>(
  tools: T[],
  overrides: ToolOverrides,
  getTool: (name: string) => T | undefined,
): T[] {
  const disabled = new Set(overrides.disabled);
  const enabled  = overrides.enabled;

  const filtered = tools.filter(t => !disabled.has(t.name));
  const seen     = new Set(filtered.map(t => t.name));

  for (const name of enabled) {
    if (seen.has(name)) continue;
    const t = getTool(name);
    if (t) { filtered.push(t); seen.add(name); }
  }

  return filtered;
}
