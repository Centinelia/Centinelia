/**
 * contpaqi.ts -- CONTPAQiAdapter implementando BillingAdapter.
 *
 * Conecta tres piezas de infraestructura del Plan B:
 *   - DropboxClient: lectura de CSVs y escritura de XMLs de importacion.
 *   - csv-parser: parseo de contpaqi_clientes.csv, contpaqi_productos.csv y last_sync.json.
 *   - xml-import: generacion del XML ADD para CONTPAQi Comercial.
 *
 * Cache en memoria (TTL configurable, default 10 min) para clientes, productos
 * y frescura. El cache de frescura usa un TTL fijo de 60 s.
 *
 * No timbra directamente (supportsAutoStamping = false).
 * submitInvoiceBatch escribe el XML a Dropbox y retorna mode='file'.
 */

import type {
  BillingAdapter,
  BillingClient,
  BillingClientMatch,
  BillingProduct,
  BillingProductMatch,
  BillingInvoice,
  BillingBatchResult,
  BillingAdapterHealth,
} from '../adapter';
import type { DropboxClient } from '../storage/dropbox';
import { parseClientsCsv, parseProductsCsv, parseFreshnessJson } from '../contpaqi/csv-parser';
import { buildImportXml, type XmlImportConfig } from '../contpaqi/xml-import';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CONTPAQiAdapterConfig {
  /** Instancia de DropboxClient configurada para la organizacion. */
  dropboxClient: DropboxClient;
  /**
   * Ruta raiz en Dropbox donde viven los archivos de la organizacion.
   * Ej: '/acme/contpaqi'
   */
  basePath: string;
  /** Minutos de staleness antes de emitir advertencia (sin cortar operacion). */
  staleWarningMinutes: number;
  /** Horas de staleness que marcan el adaptador como no saludable. */
  staleEscalationHours: number;
  /** Configuracion del emisor para el XML de importacion. */
  xmlConfig: XmlImportConfig;
  /**
   * TTL en milisegundos para el cache de clientes y productos.
   * Default: 10 minutos (600_000 ms).
   */
  cacheTtlMs?: number;
}

// ---------------------------------------------------------------------------
// Fuzzy matching (mismo patron que MockBillingAdapter)
// ---------------------------------------------------------------------------

/**
 * Normaliza un string para comparacion: minusculas, sin acentos, sin espacios extras.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

/**
 * Calcula un score de similitud entre dos strings (0 a 1).
 * Orden de prioridad: igualdad exacta > inclusion de substring > palabras en comun.
 */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (nb.includes(na) || na.includes(nb)) return 0.85;
  const wordsA = new Set(na.split(/\s+/).filter(Boolean));
  const wordsB = new Set(nb.split(/\s+/).filter(Boolean));
  const common = [...wordsA].filter((w) => wordsB.has(w)).length;
  if (wordsA.size === 0 && wordsB.size === 0) return 0;
  return common / Math.max(wordsA.size, wordsB.size);
}

const MIN_SCORE = 0.3;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const FRESHNESS_CACHE_TTL_MS = 60 * 1000; // 60 segundos

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return entry !== null && Date.now() < entry.expiresAt;
}

// ---------------------------------------------------------------------------
// CONTPAQiAdapter
// ---------------------------------------------------------------------------

export class CONTPAQiAdapter implements BillingAdapter {
  readonly name = 'CONTPAQi Comercial Pro';

  private readonly dropbox: DropboxClient;
  private readonly basePath: string;
  private readonly staleWarningMinutes: number;
  private readonly staleEscalationHours: number;
  private readonly xmlConfig: XmlImportConfig;
  private readonly cacheTtlMs: number;

  // Caches separados por tipo de dato
  private clientsCache: CacheEntry<BillingClient[]> | null = null;
  private productsCache: CacheEntry<BillingProduct[]> | null = null;
  private freshnessCache: CacheEntry<ReturnType<typeof parseFreshnessJson>> | null = null;

  constructor(config: CONTPAQiAdapterConfig) {
    this.dropbox = config.dropboxClient;
    this.basePath = config.basePath;
    this.staleWarningMinutes = config.staleWarningMinutes;
    this.staleEscalationHours = config.staleEscalationHours;
    this.xmlConfig = config.xmlConfig;
    this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  // ---------------------------------------------------------------------------
  // Carga de datos con cache
  // ---------------------------------------------------------------------------

  private async loadClients(): Promise<BillingClient[]> {
    if (isFresh(this.clientsCache)) {
      return this.clientsCache.data;
    }
    const buf = await this.dropbox.readFile(`${this.basePath}/Config/contpaqi_clientes.csv`);
    const clients = parseClientsCsv(buf.toString('utf-8'));
    this.clientsCache = { data: clients, expiresAt: Date.now() + this.cacheTtlMs };
    return clients;
  }

  private async loadProducts(): Promise<BillingProduct[]> {
    if (isFresh(this.productsCache)) {
      return this.productsCache.data;
    }
    const buf = await this.dropbox.readFile(`${this.basePath}/Config/contpaqi_productos.csv`);
    const products = parseProductsCsv(buf.toString('utf-8'));
    this.productsCache = { data: products, expiresAt: Date.now() + this.cacheTtlMs };
    return products;
  }

  private async loadFreshness(): Promise<ReturnType<typeof parseFreshnessJson>> {
    if (isFresh(this.freshnessCache)) {
      return this.freshnessCache.data;
    }
    const buf = await this.dropbox.readFile(`${this.basePath}/Config/last_sync.json`);
    const data = parseFreshnessJson(buf.toString('utf-8'));
    this.freshnessCache = { data, expiresAt: Date.now() + FRESHNESS_CACHE_TTL_MS };
    return data;
  }

  // ---------------------------------------------------------------------------
  // BillingAdapter: busqueda
  // ---------------------------------------------------------------------------

  async searchClient(query: string, limit = 3): Promise<BillingClientMatch[]> {
    const clients = await this.loadClients();
    return clients
      .map((c) => ({ ...c, score: Math.max(similarity(query, c.razonSocial), similarity(query, c.rfc)) }))
      .filter((c) => c.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async searchProduct(query: string, limit = 3): Promise<BillingProductMatch[]> {
    const products = await this.loadProducts();
    return products
      .map((p) => ({ ...p, score: Math.max(similarity(query, p.nombre), similarity(query, p.sku)) }))
      .filter((p) => p.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getClientByRFC(rfc: string): Promise<BillingClient | null> {
    const clients = await this.loadClients();
    return clients.find((c) => c.rfc === rfc) ?? null;
  }

  async getProductBySKU(sku: string): Promise<BillingProduct | null> {
    const products = await this.loadProducts();
    return products.find((p) => p.sku === sku) ?? null;
  }

  // ---------------------------------------------------------------------------
  // BillingAdapter: envio de lote
  // ---------------------------------------------------------------------------

  async submitInvoiceBatch(invoices: BillingInvoice[]): Promise<BillingBatchResult> {
    const xmlString = buildImportXml(invoices, this.xmlConfig);
    const buffer = Buffer.from(xmlString, 'utf-8');

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `facturas_${date}.xml`;
    const destPath = `${this.basePath}/Importables_CONTPAQi/pendientes/${filename}`;

    const writtenPath = await this.dropbox.writeFile(destPath, buffer);

    return {
      mode: 'file',
      ref: writtenPath,
      errors: [],
    };
  }

  // ---------------------------------------------------------------------------
  // BillingAdapter: salud / frescura
  // ---------------------------------------------------------------------------

  async freshness(): Promise<BillingAdapterHealth> {
    let data: ReturnType<typeof parseFreshnessJson>;
    try {
      data = await this.loadFreshness();
    } catch (err) {
      return {
        lastSyncAt: null,
        minutesStale: Infinity,
        healthy: false,
        message: `No se pudo leer last_sync.json: ${String(err)}`,
      };
    }

    const lastSyncAt = data.lastSyncAt;
    const minutesStale = (Date.now() - new Date(lastSyncAt).getTime()) / 60_000;
    const escalationMin = this.staleEscalationHours * 60;
    const healthy = data.status === 'ok' && minutesStale < escalationMin;

    let message: string | undefined;
    if (data.status !== 'ok') {
      message = `Estado del agente: ${data.status}${data.error ? '. ' + data.error : ''}`;
    } else if (minutesStale >= escalationMin) {
      message = `Datos obsoletos: ${Math.round(minutesStale)} minutos sin sincronizar (limite ${escalationMin} min)`;
    } else if (minutesStale >= this.staleWarningMinutes) {
      message = `Advertencia: ${Math.round(minutesStale)} minutos sin sincronizar`;
    }

    return {
      lastSyncAt,
      minutesStale: Math.round(minutesStale * 10) / 10,
      healthy,
      ...(message ? { message } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // BillingAdapter: capacidades
  // ---------------------------------------------------------------------------

  supportsAutoStamping(): boolean {
    return false;
  }
}
