export type CreativityTool =
  | 'generar_propuesta_comercial'
  | 'generar_cotizacion'
  | 'generar_one_pager'
  | 'generar_correo_estructurado'
  | 'generar_pitch_deck'
  | 'generar_reporte_metricas_excel';

export type MeerkatRoleId = 'noah' | 'nico' | 'naia' | 'nelia' | 'nia' | 'nara' | 'nox' | 'niva' | 'neo' | 'nova';

export const MEERKAT_TOOL_ACCESS: Record<CreativityTool, MeerkatRoleId[]> = {
  generar_propuesta_comercial:     ['noah'],
  generar_cotizacion:              ['noah'],
  generar_one_pager:               ['noah', 'nelia'],
  generar_correo_estructurado:     ['noah', 'nico', 'naia', 'nelia'],
  generar_pitch_deck:              ['noah'],
  generar_reporte_metricas_excel:  ['noah', 'nara', 'nelia'],
};

export function meerkatCanUse(role: string | null | undefined, tool: CreativityTool): boolean {
  if (!role) return false;
  const allowed = MEERKAT_TOOL_ACCESS[tool];
  if (!allowed) return false;
  return (allowed as string[]).includes(role);
}
