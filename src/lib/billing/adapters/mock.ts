/**
 * mock.ts — MockBillingAdapter para testing.
 *
 * Implementa BillingAdapter con datos en memoria y fuzzy matching basico.
 * Mimics un adaptador de modo 'file' (no timbra directamente).
 *
 * USO: solo en tests. No importar en codigo de produccion.
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

/** Datos iniciales para el mock. */
export interface MockData {
  clients: BillingClient[];
  products: BillingProduct[];
}

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

export class MockBillingAdapter implements BillingAdapter {
  readonly name = 'MockBillingAdapter';

  constructor(private data: MockData) {}

  async searchClient(query: string, limit = 3): Promise<BillingClientMatch[]> {
    return this.data.clients
      .map((c) => ({ ...c, score: similarity(query, c.razonSocial) }))
      .filter((c) => c.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async searchProduct(query: string, limit = 3): Promise<BillingProductMatch[]> {
    return this.data.products
      .map((p) => ({ ...p, score: similarity(query, p.nombre) }))
      .filter((p) => p.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getClientByRFC(rfc: string): Promise<BillingClient | null> {
    return this.data.clients.find((c) => c.rfc === rfc) ?? null;
  }

  async getProductBySKU(sku: string): Promise<BillingProduct | null> {
    return this.data.products.find((p) => p.sku === sku) ?? null;
  }

  async listAllClients(): Promise<BillingClient[]> { return [...this.data.clients]; }
  async listAllProducts(): Promise<BillingProduct[]> { return [...this.data.products]; }

  async submitInvoiceBatch(invoices: BillingInvoice[]): Promise<BillingBatchResult> {
    // Mock genera un archivo XML por lote (mimics file-mode adapter)
    const filename = `mock_batch_${Date.now()}.xml`;
    return {
      mode: 'file',
      ref: `/tmp/mock/${filename}`,
      errors: [],
    };
  }

  async freshness(): Promise<BillingAdapterHealth> {
    return {
      lastSyncAt: new Date().toISOString(),
      minutesStale: 0,
      healthy: true,
    };
  }

  supportsAutoStamping(): boolean {
    return false;
  }
}
