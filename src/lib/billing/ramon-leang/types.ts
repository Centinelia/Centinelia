/**
 * Tipos del pipeline Ramón Leang (persona física, retail tortilla).
 * Config fiscal por-agente guardado en `voice_agents.features.ramon_leang_config`.
 */

/** Config fiscal del emisor Ramón Leang para el XML CONTPAQi. */
export interface RamonLeangConfig {
  /** RFC del emisor (13 chars persona física). Ej. LEGR730729PU9. */
  rfcEmisor:      string;
  /** Razón social del emisor (para trazabilidad, no se usa en XML). */
  razonSocial:    string;
  /** Régimen fiscal SAT (ej. "612" personas físicas). */
  regimenFiscal:  string;
  /** Código postal del domicilio fiscal del emisor. Ej. "66470". */
  codigoPostal:   string;
  /** Serie CFDI (ej. "RL"). */
  serie:          string;
  /** Uso CFDI default para Público General (ej. "G01"). */
  usoCFDI:        string;
  /** Forma de pago SAT (ej. "03" transferencia). */
  formaPago:      string;
  /** SKU del producto único (ej. "VT" Venta de Tortilla). */
  sku:            string;
  /** Descripción del producto (ej. "Venta de Tortilla"). */
  descripcion:    string;
  /** IVA tasa (0 para tortillas SAT tasa 0). */
  ivaTasa:        number;
  /** Clave SAT del producto (ej. "50161509" tortillas). */
  claveSAT:       string;
  /** Unidad SAT (ej. "KGM" kilogramo). */
  unidadSAT:      string;
}

// ---- Result types ---------------------------------------------------------

export interface PipelineErrorRL {
  weekStart: string;
  reason:    string;
}

export interface PipelineWarningRL {
  weekStart: string;
  message:   string;
}
