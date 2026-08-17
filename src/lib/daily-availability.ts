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
  const title = getIndustryLabel(industry, 'daily_availability_title');
  const lines: string[] = [`\n### ${title} (actualizado ${data.updated_at})`];
  if (data.special) {
    lines.push(`Especial del día — ofrécelo proactivamente al inicio de la conversación o cuando sea natural mencionarlo: ${data.special}.`);
  }
  if (data.notes) {
    lines.push(`Nota general: ${data.notes}.`);
  }
  if (data.unavailable.length) {
    lines.push(`No disponibles hoy — indícalo SOLO si el cliente pide alguno de estos; NUNCA los enumeres por iniciativa propia: ${data.unavailable.join(', ')}.`);
  }
  if (data.limited.length) {
    lines.push(`Con existencia limitada — avisa al cliente SOLO si pide alguno de estos; no los promuevas: ${data.limited.join(', ')}.`);
  }
  return lines.join('\n');
}
