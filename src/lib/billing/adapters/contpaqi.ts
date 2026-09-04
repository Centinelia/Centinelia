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

import { createHash } from 'node:crypto';
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
import type { LocalFilesStorage } from '../storage/local-files';
import { parseClientsCsv, parseProductsCsv, parseFreshnessJson } from '../contpaqi/csv-parser';
import { buildImportXml, type XmlImportConfig } from '../contpaqi/xml-import';

/**
 * Decodifica un buffer CSV auto-detectando encoding. CONTPAQi Comercial exporta
 * en Windows-1252 (Latin-1); si tratamos como UTF-8, cualquier ñ/acento se
 * convierte a U+FFFD � y el fuzzy matching cae por debajo de MIN_SCORE → el
 * cliente nunca se encuentra y la factura nunca se emite. Auditoría 2026-09-04.
 *
 * Heurística: si contiene BOM UTF-8 (0xEF 0xBB 0xBF) o si al parsear como
 * UTF-8 estricto no aparece U+FFFD, es UTF-8. Si no, decodificamos como
 * Windows-1252 (superset ISO-8859-1 con euro/tilde en 0x80-0x9F).
 */
function decodeCsvBuffer(buf: Buffer): string {
  // BOM = UTF-8 seguro.
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf-8');
  }
  const asUtf8 = buf.toString('utf-8');
  // Si el decode UTF-8 no metió U+FFFD (replacement char) y no tiene bytes
  // 0x80-0xFF sueltos (que UTF-8 sí codificaría como 2 bytes), es UTF-8 válido.
  if (!asUtf8.includes('�')) {
    return asUtf8;
  }
  // Fallback: Windows-1252 (superset ISO-8859-1). Node TextDecoder soporta 'windows-1252'.
  try {
    return new TextDecoder('windows-1252').decode(buf);
  } catch {
    // Último recurso: latin1 (mapping 1-a-1).
    return buf.toString('latin1');
  }
}

/**
 * Backend de almacenamiento que necesita CONTPAQiAdapter. Cualquier objeto con
 * estos dos métodos sirve — `DropboxClient` (prod) y `LocalFilesStorage` (dev/E2E)
 * satisfacen la forma.
 */
type FileStorage = Pick<DropboxClient, 'readFile' | 'writeFile'> | LocalFilesStorage;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CONTPAQiAdapterConfig {
  /**
   * Backend de almacenamiento. En prod es `DropboxClient`; en dev/E2E puede ser
   * `LocalFilesStorage`. Ambos exponen la misma forma `{ readFile, writeFile }`.
   */
  dropboxClient: FileStorage;
  /**
   * Ruta raiz donde viven los archivos de la organizacion.
   * En Dropbox ej: '/acme/contpaqi'. En local es interno a `basePath` del storage.
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
 * Distancia de Levenshtein (número mínimo de inserciones, borrados o
 * sustituciones para convertir a en b). Iterativo, memoria O(min(|a|,|b|)).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Aseguramos a como el más corto para minimizar memoria.
  if (a.length > b.length) { const tmp = a; a = b; b = tmp; }
  const prev = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;
  for (let j = 1; j <= b.length; j++) {
    let diagonal = prev[0];
    prev[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const above = prev[i];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[i] = Math.min(prev[i] + 1, prev[i - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return prev[a.length];
}

/**
 * Calcula un score de similitud entre dos strings (0 a 1).
 * Combina 3 señales, se queda con la máxima:
 *   1. Igualdad exacta → 1.
 *   2. Inclusion de substring → 0.85.
 *   3. Overlap de palabras (Jaccard sobre tokens) → 0-1.
 *   4. Levenshtein normalizado (tolera typos de OCR) → 0-1.
 * La #4 permite que "Bolaces Supremes" (mal-OCR) se acerque a "Ballas Superstore"
 * en el catálogo. Suele quedar en rango 0.5-0.7 (bucket "consult"), lo cual
 * fuerza confirmación humana + learnClientAlias para futuros matches auto.
 */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (nb.includes(na) || na.includes(nb)) return 0.85;

  const wordsA = new Set(na.split(/\s+/).filter(Boolean));
  const wordsB = new Set(nb.split(/\s+/).filter(Boolean));
  const wordOverlap =
    wordsA.size === 0 && wordsB.size === 0
      ? 0
      : [...wordsA].filter((w) => wordsB.has(w)).length / Math.max(wordsA.size, wordsB.size);

  const maxLen = Math.max(na.length, nb.length);
  const editSim = maxLen === 0 ? 0 : 1 - levenshtein(na, nb) / maxLen;

  return Math.max(wordOverlap, editSim);
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

  private readonly dropbox: FileStorage;
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

  // Público: usado por VisionContext y otros consumers que necesitan el catálogo entero.
  async listAllClients(): Promise<BillingClient[]> { return this.loadClients(); }
  async listAllProducts(): Promise<BillingProduct[]> { return this.loadProducts(); }

  private async loadClients(): Promise<BillingClient[]> {
    if (isFresh(this.clientsCache)) {
      return this.clientsCache.data;
    }
    const buf = await this.dropbox.readFile(`${this.basePath}/Config/contpaqi_clientes.csv`);
    const clients = parseClientsCsv(decodeCsvBuffer(buf));
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

    // Prefer the date embedded in the first invoice so the filename reflects
    // the content period, not the processing wall-clock time (which may differ
    // after midnight or during retries).
    const date = invoices[0]?.date ?? new Date().toISOString().slice(0, 10);

    // Deterministic 8-char hash of the XML content:
    //  - Same content => same hash => same path (idempotent on retry).
    //  - Different content => different hash => no silent overwrite.
    const contentHash = createHash('sha256').update(xmlString).digest('hex').slice(0, 8);

    const filename = `facturas_${date}_${contentHash}.xml`;
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
