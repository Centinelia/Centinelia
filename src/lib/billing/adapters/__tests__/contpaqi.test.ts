/**
 * contpaqi.test.ts -- Tests para CONTPAQiAdapter.
 *
 * Usa objetos manuales para DropboxClient (sin vi.mock de la SDK).
 * Cubre: name, supportsAutoStamping, searchClient, searchProduct,
 * getClientByRFC, getProductBySKU, cache TTL, freshness (healthy / stale),
 * submitInvoiceBatch (escribe XML y retorna mode='file').
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONTPAQiAdapter, CONTPAQiAdapterConfig } from '../contpaqi';
import type { XmlImportConfig } from '../../contpaqi/xml-import';

// ---------------------------------------------------------------------------
// Fixtures CSV
// ---------------------------------------------------------------------------

const CLIENTES_CSV = `rfc,adapter_client_id,razon_social,uso_cfdi,regimen_fiscal,codigo_postal,email,telefono
TDM040101ABC,42,TORTAS DONA MARIA SA,G03,601,64000,contacto@donamari.mx,8181234567
XAX010101ABC,1,"CONSULTORIA, TAX Y ASESORIA SA",G03,601,64000,,
`;

const PRODUCTOS_CSV = `sku,nombre,unidad,precio,clave_sat,iva_tasa
TOR-MAI-KG,Tortilla de maiz,kg,18.0,50161509,0.0
TOR-HAR-KG,Tortilla de harina,kg,32.0,50161509,0.0
`;

const FRESHNESS_OK_JSON = JSON.stringify({
  last_sync_at: new Date().toISOString(),
  status: 'ok',
  records: { clients: 2, products: 2 },
  duration_ms: 1234,
  agent_version: '1.0.0',
});

const FRESHNESS_STALE_JSON = JSON.stringify({
  last_sync_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
  status: 'ok',
  records: { clients: 2, products: 2 },
  duration_ms: 800,
  agent_version: '1.0.0',
});

const FRESHNESS_ERROR_JSON = JSON.stringify({
  last_sync_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  status: 'error',
  records: { clients: 0, products: 0 },
  duration_ms: 0,
  agent_version: '1.0.0',
  error_message: 'CONTPAQi not running',
});

// ---------------------------------------------------------------------------
// XML config
// ---------------------------------------------------------------------------

const XML_CONFIG: XmlImportConfig = {
  serie: 'A',
  rfcEmisor: 'EMP010101AAA',
  regimenFiscal: '601',
  lugarExpedicion: '64000',
  usoCFDIDefault: 'G03',
};

// ---------------------------------------------------------------------------
// Manual DropboxClient stub
// ---------------------------------------------------------------------------

function makeDropboxStub(overrides?: {
  readFileImpl?: (path: string) => Promise<Buffer>;
  writeFileImpl?: (path: string, buf: Buffer) => Promise<string>;
}) {
  const readFile = overrides?.readFileImpl ?? vi.fn().mockResolvedValue(Buffer.from(CLIENTES_CSV));
  const writeFile = overrides?.writeFileImpl ?? vi.fn().mockImplementation((path: string) => Promise.resolve(path));

  return {
    readFile: typeof readFile === 'function' ? readFile : vi.fn().mockResolvedValue(Buffer.from(CLIENTES_CSV)),
    writeFile: typeof writeFile === 'function' ? writeFile : vi.fn().mockImplementation((path: string) => Promise.resolve(path)),
    listFolder: vi.fn().mockResolvedValue([]),
    moveFile: vi.fn().mockResolvedValue(undefined),
    getFileVersions: vi.fn().mockResolvedValue([]),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Default adapter config builder
// ---------------------------------------------------------------------------

function makeConfig(
  dropboxClient: ReturnType<typeof makeDropboxStub>,
  extras?: Partial<CONTPAQiAdapterConfig>
): CONTPAQiAdapterConfig {
  return {
    dropboxClient: dropboxClient as any,
    basePath: '/org/contpaqi',
    staleWarningMinutes: 30,
    staleEscalationHours: 2,
    xmlConfig: XML_CONFIG,
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// Helpers to build adapters with controlled readFile routing
// ---------------------------------------------------------------------------

function makeAdapterWithData(opts?: { freshnessJson?: string }) {
  const freshnessJson = opts?.freshnessJson ?? FRESHNESS_OK_JSON;

  const readFileMock = vi.fn().mockImplementation((path: string) => {
    if (path.includes('last_sync.json')) {
      return Promise.resolve(Buffer.from(freshnessJson));
    }
    if (path.includes('contpaqi_clientes')) {
      return Promise.resolve(Buffer.from(CLIENTES_CSV));
    }
    if (path.includes('contpaqi_productos')) {
      return Promise.resolve(Buffer.from(PRODUCTOS_CSV));
    }
    return Promise.reject(new Error(`Unexpected readFile path: ${path}`));
  });

  const writeFileMock = vi.fn().mockImplementation((path: string) => Promise.resolve(path));

  const dropbox = {
    readFile: readFileMock,
    writeFile: writeFileMock,
    listFolder: vi.fn().mockResolvedValue([]),
    moveFile: vi.fn().mockResolvedValue(undefined),
    getFileVersions: vi.fn().mockResolvedValue([]),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  };

  const adapter = new CONTPAQiAdapter(makeConfig(dropbox as any));
  return { adapter, readFileMock, writeFileMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CONTPAQiAdapter', () => {
  // --- Static metadata ---

  it('name returns CONTPAQi Comercial Pro', () => {
    const { adapter } = makeAdapterWithData();
    expect(adapter.name).toBe('CONTPAQi Comercial Pro');
  });

  it('supportsAutoStamping returns false', () => {
    const { adapter } = makeAdapterWithData();
    expect(adapter.supportsAutoStamping()).toBe(false);
  });

  // --- searchClient fuzzy match ---

  it('searchClient finds by fuzzy name (partial match)', async () => {
    const { adapter } = makeAdapterWithData();
    const results = await adapter.searchClient('dona mari', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].rfc).toBe('TDM040101ABC');
    expect(results[0].score).toBeGreaterThan(0.3);
  });

  it('searchClient returns empty array when no match', async () => {
    const { adapter } = makeAdapterWithData();
    const results = await adapter.searchClient('inexistente xyz', 3);
    expect(results).toEqual([]);
  });

  it('searchClient results are sorted by score descending', async () => {
    const { adapter } = makeAdapterWithData();
    const results = await adapter.searchClient('tortilla', 3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  // --- getClientByRFC ---

  it('getClientByRFC returns matching client for known RFC', async () => {
    const { adapter } = makeAdapterWithData();
    const client = await adapter.getClientByRFC('TDM040101ABC');
    expect(client).not.toBeNull();
    expect(client?.razonSocial).toBe('TORTAS DONA MARIA SA');
    expect(client?.usoCFDI).toBe('G03');
  });

  it('getClientByRFC returns null for unknown RFC', async () => {
    const { adapter } = makeAdapterWithData();
    const client = await adapter.getClientByRFC('ZZZ999999ZZZ');
    expect(client).toBeNull();
  });

  // --- searchProduct ---

  it('searchProduct finds by fuzzy name', async () => {
    const { adapter } = makeAdapterWithData();
    const results = await adapter.searchProduct('harina', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sku).toBe('TOR-HAR-KG');
    expect(results[0].score).toBeGreaterThan(0.3);
  });

  // --- getProductBySKU ---

  it('getProductBySKU returns product for known SKU', async () => {
    const { adapter } = makeAdapterWithData();
    const product = await adapter.getProductBySKU('TOR-MAI-KG');
    expect(product).not.toBeNull();
    expect(product?.nombre).toBe('Tortilla de maiz');
    expect(product?.precio).toBe(18);
  });

  it('getProductBySKU returns null for unknown SKU', async () => {
    const { adapter } = makeAdapterWithData();
    const product = await adapter.getProductBySKU('SKU-INEXISTENTE');
    expect(product).toBeNull();
  });

  // --- Cache: 2 calls within TTL => 1 readFile for clients ---

  it('cache: two calls within TTL issue only one readFile for clients CSV', async () => {
    const { adapter, readFileMock } = makeAdapterWithData();

    await adapter.searchClient('dona', 3);
    await adapter.searchClient('tortilla', 3);

    // Only one call to read clientes CSV
    const clientsCalls = readFileMock.mock.calls.filter((c) => (c[0] as string).includes('contpaqi_clientes'));
    expect(clientsCalls).toHaveLength(1);
  });

  it('cache: two calls within TTL issue only one readFile for products CSV', async () => {
    const { adapter, readFileMock } = makeAdapterWithData();

    await adapter.searchProduct('maiz', 3);
    await adapter.searchProduct('harina', 3);

    const productsCalls = readFileMock.mock.calls.filter((c) => (c[0] as string).includes('contpaqi_productos'));
    expect(productsCalls).toHaveLength(1);
  });

  it('cache: expired TTL causes a new readFile fetch', async () => {
    const { adapter, readFileMock } = makeAdapterWithData();

    await adapter.searchClient('dona', 3);

    // Artificially expire the cache by setting cacheTtlMs=0 at construction
    // We re-create the adapter with a 0ms TTL to force expiry on next call
    const readFileMock2 = vi.fn().mockImplementation((path: string) => {
      if (path.includes('contpaqi_clientes')) return Promise.resolve(Buffer.from(CLIENTES_CSV));
      if (path.includes('contpaqi_productos')) return Promise.resolve(Buffer.from(PRODUTOS_CSV_FALLBACK));
      if (path.includes('last_sync.json')) return Promise.resolve(Buffer.from(FRESHNESS_OK_JSON));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    const dropbox2 = {
      readFile: readFileMock2,
      writeFile: vi.fn().mockImplementation((p: string) => Promise.resolve(p)),
      listFolder: vi.fn(),
      moveFile: vi.fn(),
      getFileVersions: vi.fn(),
      deleteFile: vi.fn(),
    };

    const adapter2 = new CONTPAQiAdapter({
      dropboxClient: dropbox2 as any,
      basePath: '/org/contpaqi',
      staleWarningMinutes: 30,
      staleEscalationHours: 2,
      xmlConfig: XML_CONFIG,
      cacheTtlMs: 0,
    });

    await adapter2.searchClient('dona', 3);
    await adapter2.searchClient('dona', 3);

    // With 0ms TTL, each call should refetch
    const clientsCalls = readFileMock2.mock.calls.filter((c) => (c[0] as string).includes('contpaqi_clientes'));
    expect(clientsCalls.length).toBeGreaterThanOrEqual(2);
  });

  // --- freshness: healthy when recent ---

  it('freshness returns healthy=true when lastSyncAt is recent', async () => {
    const { adapter } = makeAdapterWithData({ freshnessJson: FRESHNESS_OK_JSON });
    const health = await adapter.freshness();
    expect(health.healthy).toBe(true);
    expect(health.minutesStale).toBeLessThan(2);
    expect(health.lastSyncAt).toBeTruthy();
  });

  // --- freshness: unhealthy when stale > escalationHours ---

  it('freshness returns healthy=false when stale exceeds escalationHours', async () => {
    const { adapter } = makeAdapterWithData({ freshnessJson: FRESHNESS_STALE_JSON });
    // staleEscalationHours=2, FRESHNESS_STALE_JSON is 3h old
    const health = await adapter.freshness();
    expect(health.healthy).toBe(false);
    expect(health.minutesStale).toBeGreaterThan(60 * 2);
  });

  it('freshness returns healthy=false when status is error', async () => {
    const { adapter } = makeAdapterWithData({ freshnessJson: FRESHNESS_ERROR_JSON });
    const health = await adapter.freshness();
    expect(health.healthy).toBe(false);
  });

  // --- submitInvoiceBatch ---

  it('submitInvoiceBatch writes XML to correct Dropbox path and returns mode=file', async () => {
    const { adapter, writeFileMock } = makeAdapterWithData();

    const result = await adapter.submitInvoiceBatch([
      {
        clientRFC: 'TDM040101ABC',
        date: '2026-08-18',
        lines: [{ sku: 'TOR-MAI-KG', qty: 10, unitPrice: 18 }],
        paymentMethod: 'efectivo',
        usoCFDI: 'G03',
      },
    ]);

    expect(result.mode).toBe('file');
    expect(result.errors).toEqual([]);

    // writeFile called once
    expect(writeFileMock).toHaveBeenCalledTimes(1);

    // Path must be inside basePath/Importables_CONTPAQi/pendientes/
    const writtenPath = writeFileMock.mock.calls[0][0] as string;
    expect(writtenPath).toMatch(/\/org\/contpaqi\/Importables_CONTPAQi\/pendientes\/facturas_/);
    expect(writtenPath).toMatch(/\.xml$/);

    // ref matches the path returned by writeFile
    expect(result.ref).toBe(writtenPath);
  });

  it('submitInvoiceBatch writes valid XML buffer (contains XML declaration)', async () => {
    const { adapter, writeFileMock } = makeAdapterWithData();

    await adapter.submitInvoiceBatch([
      {
        clientRFC: 'XAX010101ABC',
        date: '2026-08-18',
        lines: [{ sku: 'TOR-HAR-KG', qty: 5, unitPrice: 32 }],
        paymentMethod: 'transferencia',
        usoCFDI: 'G03',
      },
    ]);

    const buf: Buffer = writeFileMock.mock.calls[0][1];
    const xmlString = buf.toString('utf-8');
    expect(xmlString).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xmlString).toContain('<Documentos');
    expect(xmlString).toContain('XAX010101ABC');
  });
});

// Fallback products CSV string (used in cache expiry test to avoid import errors)
const PRODUTOS_CSV_FALLBACK = PRODUCTOS_CSV;
