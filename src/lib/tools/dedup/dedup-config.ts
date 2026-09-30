// Overrides de dedup por tool. Ver spec §5.
// Tools no listadas usan la heurística default de computeArgsHash().

export const DEFAULT_WINDOW_MIN = 5;

export type DedupOverride = {
  window_min?:    number;    // default 5 min
  disable?:       boolean;   // opt-out completo del dedup
  identity_keys?: string[];  // añade a la heurística automática
  detail_keys?:   string[];  // añade a la heurística automática
};

export const DEDUP_CONFIG: Record<string, DedupOverride> = {
  // Tools con args no capturados por la heurística estándar
  registrar_pedido: { identity_keys: ['contact_phone', 'items_hash'] },
  agendar_cita:     { identity_keys: ['contact_phone', 'fecha_hora'] },

  // Opt-outs explícitos: cada call es único por naturaleza
  reportar_falla:   { disable: true },
  crear_reporte:    { disable: true },
};

export function getDedupConfig(toolName: string): DedupOverride {
  return DEDUP_CONFIG[toolName] ?? {};
}
