export type CreativityTool =
  | 'generar_propuesta_comercial'
  | 'generar_cotizacion'
  | 'generar_one_pager'
  | 'generar_correo_estructurado'
  | 'generar_pitch_deck'
  | 'generar_reporte_metricas_excel';

export type MeerkatRoleId = 'noah' | 'nico' | 'naia' | 'nelia' | 'nia' | 'nara' | 'nox' | 'niva' | 'neo' | 'nova';

// Distribución alineada con MEERKAT_VOICE_DISTRIBUTION en src/lib/vapi/sync.ts
// y con TOOL_REGISTRY.gatedByRole en src/lib/tools/registry.ts. Fuente única
// del "quién puede generar qué" — mantener las 3 sincronizadas al agregar tools.
// Actualizado 2026-08-18 en refactor Capa 1 tool bloat (feedback-tool-bloat-reglas).
export const MEERKAT_TOOL_ACCESS: Record<CreativityTool, MeerkatRoleId[]> = {
  generar_propuesta_comercial:     ['noah'],
  generar_cotizacion:              ['noah'],
  generar_one_pager:               ['nelia'],
  generar_correo_estructurado:     ['noah', 'nico', 'naia', 'nelia'],
  generar_pitch_deck:              ['niva'],
  generar_reporte_metricas_excel:  ['nelia', 'nara', 'niva'],
};

export function meerkatCanUse(role: string | null | undefined, tool: CreativityTool): boolean {
  if (!role) return false;
  const allowed = MEERKAT_TOOL_ACCESS[tool];
  if (!allowed) return false;
  return (allowed as string[]).includes(role);
}
