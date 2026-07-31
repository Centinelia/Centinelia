export type ObsWindow = '24h' | '7d' | '30d' | 'since_activation';

export interface ObsFilters {
  window:               ObsWindow;
  meerkatIds:           string[] | null; // null = todos
  flagKey:              string | null;   // null = sin filtro
  includeUnattributed:  boolean;
}

export interface MeerkatObservabilityRow {
  meerkat_id:       string | 'unattributed';
  meerkat_version:  number | null; // null si unattributed
  calls:            number;
  autonomia_pct:    number | null; // 0..100
  ces_avg:          number | null; // 0..5
  cost_avg:         number | null; // usd
  lat_p50:          number | null; // ms
  lat_p95:          number | null; // ms
}
