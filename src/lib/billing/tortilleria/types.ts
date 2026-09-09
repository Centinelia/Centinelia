/**
 * Tipos del mapping por-cliente para el pipeline Excel → CFDI de la Tortillería.
 *
 * Se guarda en `voice_agents.features.tortilleria_mapping` y se carga con
 * `getTortilleriaMapping(agentId)`. La regeneración manual vive en el script
 * `scripts/upload-tortilleria-mapping.ts` — cada vez que Beatriz agregue un
 * cliente/producto nuevo, se corre ese script contra el JSON consolidado.
 */

/** Regla que consolida N bloques del Excel en 1 solo CFDI. */
export interface ConsolidationRule {
  /** Prefijo del título del bloque para hacer match (case-insensitive). Ej: "DCA". */
  matchPrefix: string;
  /** Código CONTPAQi al que se consolidan todos los bloques que matcheen. */
  consolidateToCode: string;
  /** Razón por la cual se consolida (para trazabilidad). */
  reason: string;
}

/** Mapping de título de bloque del Excel → código de cliente CONTPAQi. */
export interface ClientMappingEntry {
  /**
   * Patrón para hacer match contra `ParsedBlock.tituloBloque` normalizado.
   * Puede ser un string exacto (case-insensitive) o una substring distintiva.
   * Ej: "MELENDEZ HACIENDA / ROMULO", "MELENDEZ HUINALA", "F CARNES".
   */
  titlePattern: string;
  /** Código CONTPAQi canónico. Puede ser numérico ("045") o alfanumérico ("SILLATPROP"). */
  codigo: string;
  /** Razón social para referencia visual/debug. */
  razon?: string;
  /** RFC del receptor. Se usa para validar contra el catálogo del adapter. */
  rfc?: string;
  /** Si true, el pipeline ignora este bloque (cliente descontinuado). */
  skip?: boolean;
  /** Notas internas. */
  notes?: string;
}

/**
 * Mapping de columna del Excel + precio → SKU CONTPAQi.
 *
 * Match: (nombre columna case-insensitive) + (precio dentro del rango).
 * Si el rango de precio es null, aplica a cualquier precio para esa columna.
 */
export interface ProductMappingEntry {
  /** Nombre normalizado de la columna del Excel. Ej: "ESTRELLA 1/2", "TACO 1KG". */
  columnaPattern: string;
  /** Rango de precio opcional. Si null, aplica a cualquier precio. */
  precioRange?: { min: number; max: number } | null;
  /** SKU del producto en CONTPAQi. */
  sku: string;
  /** Nombre en CONTPAQi para debug. */
  nombreContpaqi?: string;
  /** Clave SAT (ej. "50161509"). */
  claveSat: string;
  /** Unidad SAT (ej. "KGM", "H87"). */
  unidadSat: string;
  /**
   * Tasa de IVA (0.16 = 16%, 0 = exento/tasa cero). Default 0 si no viene.
   * Tortillas típicamente son tasa 0; salsas/subproductos pueden ser 16%.
   * Confirmar con Beatriz cuando se agreguen SKUs de otras categorías.
   */
  ivaTasa?: number;
  /** Notas internas. */
  notes?: string;
}

/** Mapping completo. Se persiste como JSON en `voice_agents.features.tortilleria_mapping`. */
export interface TortilleriaMapping {
  /** Versión del schema para migraciones futuras. */
  version: string;
  /** ISO timestamp de la última actualización. */
  updatedAt: string;
  /** Códigos de cliente que se timbran a crédito (MetodoPago = PPD). */
  creditCodes: string[];
  /** Reglas de consolidación (ej. DCA). */
  consolidationRules: ConsolidationRule[];
  /** Mappings de cliente (título Excel → código CONTPAQi). */
  clients: ClientMappingEntry[];
  /** Mappings de producto (columna+precio → SKU). */
  products: ProductMappingEntry[];
}

/** Config por-org para el pipeline (viene de organization_integrations.config). */
export interface TortilleriaPipelineConfig {
  /** RFC emisor de la tortillería. */
  rfcEmisor: string;
  /** Serie CFDI default. */
  serieDefault: string;
  /** Uso CFDI default (ej. "G03"). */
  usoCFDIDefault: string;
  /** Clave SAT default de producto (fallback si el mapping no tiene). */
  claveSATDefault: string;
  /** Régimen fiscal del emisor. */
  regimenFiscal: string;
  /** Código postal del emisor. */
  codigoPostalEmisor: string;
}

// ---- Result types ---------------------------------------------------------

export interface SkipReport {
  tituloBloque: string;
  reason: string;
}

export interface PipelineError {
  tituloBloque: string;
  reason: string;
  /** Datos parciales del bloque para debug. */
  detail?: Record<string, unknown>;
}

export interface PipelineWarning {
  tituloBloque: string;
  message: string;
}
