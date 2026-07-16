import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const CIVIC_CATEGORIES = ['bache', 'luminaria', 'basura', 'agua', 'ruido', 'parque', 'transporte', 'tramite', 'otro'] as const;
export type CivicCategory = typeof CIVIC_CATEGORIES[number];

export const CIVIC_STATUSES = ['abierto', 'en_proceso', 'resuelto', 'cerrado'] as const;
export type CivicStatus = typeof CIVIC_STATUSES[number];

export const STATUS_LABELS: Record<CivicStatus, string> = {
  abierto:    'Abierto',
  en_proceso: 'En proceso',
  resuelto:   'Resuelto',
  cerrado:    'Cerrado',
};

export const STATUS_COLORS: Record<CivicStatus, { color: string; bg: string }> = {
  abierto:    { color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  en_proceso: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  resuelto:   { color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  cerrado:    { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

export const CATEGORY_LABELS: Record<string, string> = {
  bache:      'Bache',
  luminaria:  'Luminaria',
  basura:     'Basura',
  agua:       'Agua',
  ruido:      'Ruido',
  parque:     'Parque',
  transporte: 'Transporte',
  tramite:    'Trámite / Expediente',
  otro:       'Otro',
};

// ── Tramite docs config ────────────────────────────────────────────────────────
// Maps trámite type name → list of required document names
export type TramiteDocsConfig = Record<string, string[]>;

export const DEFAULT_TRAMITE_DOCS: TramiteDocsConfig = {};

export async function getTramiteDocs(agentId: string, supabase: SupabaseClient): Promise<TramiteDocsConfig> {
  const { data } = await supabase
    .from('voice_agents').select('tramite_docs').eq('id', agentId).single();
  return ((data as any)?.tramite_docs as TramiteDocsConfig | null) ?? DEFAULT_TRAMITE_DOCS;
}

// ── Folio config ──────────────────────────────────────────────────────────────

export interface FolioConfig {
  prefix:       string;   // e.g. "REP", "MTY-311", "SRPM"
  separator:    string;   // "-", "/", "_", ""
  include_year: boolean;  // true → REP-2026-00001 | false → REP-00001
  digits:       number;   // 4-6
}

export const DEFAULT_FOLIO_CONFIG: FolioConfig = {
  prefix:       'REP',
  separator:    '-',
  include_year: true,
  digits:       5,
};

export function previewFolio(config: FolioConfig, seq = 1): string {
  const { prefix, separator, include_year, digits } = config;
  const year   = new Date().getFullYear().toString();
  const seqStr = seq.toString().padStart(Math.max(1, digits), '0');
  return include_year
    ? `${prefix}${separator}${year}${separator}${seqStr}`
    : `${prefix}${separator}${seqStr}`;
}

export async function getFolioConfig(agentId: string, supabase: SupabaseClient): Promise<FolioConfig> {
  const { data } = await supabase
    .from('voice_agents').select('folio_config').eq('id', agentId).single();
  const raw = (data as any)?.folio_config as Partial<FolioConfig> | null;
  if (!raw) return DEFAULT_FOLIO_CONFIG;
  return {
    prefix:       raw.prefix       ?? DEFAULT_FOLIO_CONFIG.prefix,
    separator:    raw.separator    ?? DEFAULT_FOLIO_CONFIG.separator,
    include_year: raw.include_year ?? DEFAULT_FOLIO_CONFIG.include_year,
    digits:       raw.digits       ?? DEFAULT_FOLIO_CONFIG.digits,
  };
}

export async function generateFolio(agentId: string, supabase: SupabaseClient): Promise<string> {
  const config = await getFolioConfig(agentId, supabase);

  let query = supabase
    .from('civic_reports')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId);

  // Reset counter annually when folio includes the year
  if (config.include_year) {
    const yearStart = `${new Date().getFullYear()}-01-01T00:00:00.000Z`;
    query = query.gte('created_at', yearStart);
  }

  const { count } = await query;
  return previewFolio(config, (count ?? 0) + 1);
}
