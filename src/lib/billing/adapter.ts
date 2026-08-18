/**
 * adapter.ts — Contrato base para adaptadores de facturacion externa.
 *
 * Cada sistema contable (Solucion Factible, CONTPAQi, SAP, etc.) implementa
 * BillingAdapter para exponer una interfaz uniforme al empleado de facturacion.
 *
 * No contiene logica de negocio ni dependencias externas; solo tipos y la interfaz.
 */

export type PaymentMethod = 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta';

/** Datos de un cliente fiscal registrado en el sistema contable. */
export interface BillingClient {
  /** RFC del receptor. */
  rfc: string;
  /** Identificador interno del adaptador (ID del cliente en el sistema externo). */
  adapterId: string;
  /** Razon social completa. */
  razonSocial: string;
  /** Clave de uso CFDI (SAT). Ej: G03, P01. */
  usoCFDI: string;
  /** Clave de regimen fiscal (SAT). Ej: 601, 612. */
  regimen: string;
  /** Codigo postal del domicilio fiscal del receptor. */
  codigoPostal: string;
}

/** BillingClient con score de coincidencia (para resultados de busqueda). */
export interface BillingClientMatch extends BillingClient {
  /** Score de similitud entre 0 y 1. Mayor es mejor. */
  score: number;
}

/** Producto o servicio registrado en el catalogo del sistema contable. */
export interface BillingProduct {
  /** Clave de articulo o SKU interno. */
  sku: string;
  /** Nombre descriptivo del producto o servicio. */
  nombre: string;
  /** Unidad de medida. Ej: kg, pieza, litro. */
  unidad: string;
  /** Precio unitario base (sin impuestos). */
  precio: number;
  /** Clave del catalogo de productos SAT. */
  claveSAT: string;
  /** Tasa de IVA como decimal (0.16 = 16%, 0 = exento). */
  ivaTasa: number;
}

/** BillingProduct con score de coincidencia (para resultados de busqueda). */
export interface BillingProductMatch extends BillingProduct {
  /** Score de similitud entre 0 y 1. Mayor es mejor. */
  score: number;
}

/** Una linea de detalle dentro de una factura. */
export interface BillingLineItem {
  /** SKU del producto o servicio. */
  sku: string;
  /** Cantidad. */
  qty: number;
  /** Precio unitario al momento de la factura (puede diferir del precio base). */
  unitPrice: number;
  /**
   * Tasa de IVA como decimal (0.16 = 16%, 0 = exento/tasa cero).
   * Opcional para backwards compat: si no se indica, se asume 0 (sin IVA).
   */
  ivaTasa?: number;
}

/** Datos de una factura a generar. */
export interface BillingInvoice {
  /** RFC del receptor. */
  clientRFC: string;
  /** Fecha de emision (YYYY-MM-DD). */
  date: string;
  /** Lineas de detalle. */
  lines: BillingLineItem[];
  /** Forma de pago. */
  paymentMethod: PaymentMethod;
  /** Clave de uso CFDI. */
  usoCFDI: string;
  /** Serie del comprobante (opcional). */
  serie?: string;
  /** Observaciones adicionales (no aparecen en el XML). */
  notes?: string;
}

/**
 * Modo de envio del lote.
 * - 'file': el adaptador genera un archivo local (XML, ZIP) para descarga o carga manual.
 * - 'api': el adaptador envio directamente al PAC y devuelve folio/UUID.
 */
export type BillingSubmitMode = 'file' | 'api';

/** Resultado de un envio de lote de facturas. */
export interface BillingBatchResult {
  /** Modo en que se proceso el lote. */
  mode: BillingSubmitMode;
  /**
   * Referencia del resultado.
   * - mode='file': ruta o URL del archivo generado.
   * - mode='api': folio(s) o UUID(s) del PAC (string si es uno, string[] si son varios).
   */
  ref: string | string[];
  /** Errores por factura. Si no hubo errores, array vacio. */
  errors: Array<{ invoiceIndex: number; reason: string }>;
}

/** Estado de salud / frescura de los datos del adaptador. */
export interface BillingAdapterHealth {
  /** ISO timestamp de la ultima sincronizacion con el sistema externo. Null si nunca. */
  lastSyncAt: string | null;
  /** Minutos desde la ultima sincronizacion. 0 si esta al dia. */
  minutesStale: number;
  /** true si el adaptador puede operar normalmente. */
  healthy: boolean;
  /** Mensaje opcional de diagnostico. */
  message?: string;
}

/**
 * Contrato que debe implementar cualquier adaptador de sistema contable.
 *
 * Principios de diseno:
 * - Todos los metodos son async para permitir adaptadores remotos.
 * - supportsAutoStamping() es sincrono porque es metadato estatico del adaptador.
 * - No lanza errores de negocio — los encapsula en BillingBatchResult.errors.
 * - name es un identificador legible del adaptador, usado en logs y en el system prompt.
 *   Cada implementacion debe declararlo como `readonly name = 'NombreDelAdaptador'`.
 */
export interface BillingAdapter {
  /**
   * Nombre legible del adaptador. Ejemplo: 'MockBillingAdapter', 'CONTPAQiAdapter'.
   * Usado en logs y en el system prompt del empleado digital.
   */
  readonly name: string;

  /**
   * Busca clientes por nombre o RFC usando coincidencia fuzzy.
   * @param query Texto libre a buscar.
   * @param limit Maximo de resultados (default 3).
   * @returns Lista ordenada por score descendente, filtrada a score >= 0.3.
   */
  searchClient(query: string, limit?: number): Promise<BillingClientMatch[]>;

  /**
   * Busca productos por nombre o SKU usando coincidencia fuzzy.
   * @param query Texto libre a buscar.
   * @param limit Maximo de resultados (default 3).
   * @returns Lista ordenada por score descendente, filtrada a score >= 0.3.
   */
  searchProduct(query: string, limit?: number): Promise<BillingProductMatch[]>;

  /**
   * Obtiene un cliente por RFC exacto.
   * @param rfc RFC completo del receptor.
   * @returns BillingClient si existe, null si no se encuentra.
   */
  getClientByRFC(rfc: string): Promise<BillingClient | null>;

  /**
   * Obtiene un producto por SKU exacto.
   * @param sku Clave de articulo interna del sistema contable.
   * @returns BillingProduct si existe, null si no se encuentra.
   */
  getProductBySKU(sku: string): Promise<BillingProduct | null>;

  /**
   * Envia un lote de facturas al sistema contable.
   * @param invoices Lista de facturas a generar.
   * @returns Resultado del lote con modo, referencia y errores por factura.
   */
  submitInvoiceBatch(invoices: BillingInvoice[]): Promise<BillingBatchResult>;

  /**
   * Retorna el estado de salud y frescura del adaptador.
   */
  freshness(): Promise<BillingAdapterHealth>;

  /**
   * Indica si este adaptador puede timbrar CFDIs directamente (sin intervencion humana).
   * - true: el adaptador conecta con un PAC y puede timbrar en automatico.
   * - false: genera un archivo que requiere carga manual o aprobacion.
   */
  supportsAutoStamping(): boolean;
}
