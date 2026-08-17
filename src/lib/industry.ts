export const INDUSTRIES = ['restaurante', 'retail', 'clinica', 'hotel', 'agencia'] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRIES_WITH_DAILY_AVAILABILITY: readonly Industry[] = INDUSTRIES;

// Labels per industry. Each entry drives the DailyAvailabilityCard title,
// the placeholder wording ("Un {item_word} por coma"), and the four section
// headings the agent sees in the injected prompt block. Field labels are
// industry-specific because "Especial del día" reads awkward for an agency
// operating on a weekly cadence, "Con existencia limitada" doesn't fit a
// clinic, etc.
type IndustryLabels = {
  title:             string;
  item_word:         string;
  special_label:     string;
  unavailable_label: string;
  limited_label:     string;
  notes_label:       string;
};

const INDUSTRY_LABELS: Record<Industry, IndustryLabels> = {
  restaurante: {
    title:             'Disponibilidad del menú',
    item_word:         'platillo',
    special_label:     'Especial del día',
    unavailable_label: 'No disponibles hoy',
    limited_label:     'Con existencia limitada',
    notes_label:       'Nota general',
  },
  retail: {
    title:             'Disponibilidad del día',
    item_word:         'producto',
    special_label:     'Promoción del día',
    unavailable_label: 'Sin existencias hoy',
    limited_label:     'Stock bajo',
    notes_label:       'Nota general',
  },
  clinica: {
    title:             'Disponibilidad de la agenda',
    item_word:         'servicio',
    special_label:     'Prioridad de la jornada',
    unavailable_label: 'No se atiende hoy',
    limited_label:     'Cupos limitados',
    notes_label:       'Nota general',
  },
  hotel: {
    title:             'Disponibilidad del hotel',
    item_word:         'servicio',
    special_label:     'Promoción vigente',
    unavailable_label: 'No disponibles hoy',
    limited_label:     'Con cupo limitado',
    notes_label:       'Nota general',
  },
  agencia: {
    title:             'Disponibilidad y prioridades',
    item_word:         'servicio',
    special_label:     'Foco de esta semana',
    unavailable_label: 'No estamos tomando',
    limited_label:     'Con capacidad limitada',
    notes_label:       'Nota',
  },
};

export function getOrgIndustry(org: { industry?: string | null } | null | undefined): Industry | null {
  const raw = org?.industry;
  if (!raw) return null;
  return (INDUSTRIES as readonly string[]).includes(raw) ? (raw as Industry) : null;
}

export function getIndustryLabels(industry: Industry): IndustryLabels {
  return INDUSTRY_LABELS[industry];
}

// Backwards compat with call sites (DailyAvailabilityCard) that only need
// the title or the item word — new code should prefer getIndustryLabels.
export function getIndustryLabel(
  industry: Industry,
  key: 'daily_availability_title' | 'daily_availability_item_word',
): string {
  const labels = INDUSTRY_LABELS[industry];
  return key === 'daily_availability_title' ? labels.title : labels.item_word;
}
