export const INDUSTRIES = ['restaurante', 'retail', 'clinica', 'hotel'] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRIES_WITH_DAILY_AVAILABILITY: readonly Industry[] = INDUSTRIES;

const INDUSTRY_LABELS: Record<Industry, { daily_availability_title: string; daily_availability_item_word: string }> = {
  restaurante: { daily_availability_title: 'Disponibilidad del menú',    daily_availability_item_word: 'platillo' },
  retail:      { daily_availability_title: 'Disponibilidad del día',      daily_availability_item_word: 'producto' },
  clinica:     { daily_availability_title: 'Disponibilidad de la agenda', daily_availability_item_word: 'servicio' },
  hotel:       { daily_availability_title: 'Disponibilidad del hotel',    daily_availability_item_word: 'servicio' },
};

export function getOrgIndustry(org: { industry?: string | null } | null | undefined): Industry | null {
  const raw = org?.industry;
  if (!raw) return null;
  return (INDUSTRIES as readonly string[]).includes(raw) ? (raw as Industry) : null;
}

export function getIndustryLabel(
  industry: Industry,
  key: 'daily_availability_title' | 'daily_availability_item_word',
): string {
  return INDUSTRY_LABELS[industry][key];
}
