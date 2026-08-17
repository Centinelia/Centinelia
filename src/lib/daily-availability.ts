import type { Industry } from './industry';
import { getIndustryLabel } from './industry';

export type DailyAvailability = {
  updated_at: string;
  updated_by: string;
  unavailable: string[];
  limited: string[];
  special: string | null;
  notes: string | null;
};

export function validateDailyAvailability(input: unknown): DailyAvailability {
  if (!input || typeof input !== 'object') throw new Error('daily_availability must be an object');
  const o = input as Record<string, unknown>;
  const arr = (k: string): string[] => {
    const v = o[k];
    if (!Array.isArray(v)) throw new Error(`${k} must be an array`);
    return v.map(String);
  };
  const strOrNull = (k: string): string | null => {
    const v = o[k];
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') throw new Error(`${k} must be a string or null`);
    return v;
  };
  return {
    updated_at:  typeof o.updated_at  === 'string' ? o.updated_at  : new Date().toISOString(),
    updated_by:  typeof o.updated_by  === 'string' ? o.updated_by  : 'unknown',
    unavailable: arr('unavailable'),
    limited:     arr('limited'),
    special:     strOrNull('special'),
    notes:       strOrNull('notes'),
  };
}

export function formatDailyAvailabilityForPrompt(
  data: DailyAvailability | null,
  industry: Industry,
): string {
  if (!data) return '';
  const title    = getIndustryLabel(industry, 'daily_availability_title');
  const itemWord = getIndustryLabel(industry, 'daily_availability_item_word');
  const lines: string[] = [`\n### ${title} (actualizado ${data.updated_at})`];
  if (data.unavailable.length) lines.push(`No disponibles hoy: ${data.unavailable.join(', ')}.`);
  if (data.limited.length)     lines.push(`${itemWord.charAt(0).toUpperCase() + itemWord.slice(1)}s con existencia limitada: ${data.limited.join(', ')}.`);
  if (data.special)            lines.push(`Especial del día: ${data.special}.`);
  if (data.notes)              lines.push(`Nota: ${data.notes}.`);
  return lines.join('\n');
}
