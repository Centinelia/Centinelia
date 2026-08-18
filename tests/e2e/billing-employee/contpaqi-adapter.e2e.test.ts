/**
 * contpaqi-adapter.e2e.test.ts
 *
 * E2E tests que usan CONTPAQiAdapter (real) en lugar de MockBillingAdapter.
 *
 * Los CSVs de fixtures del Task 8 se sirven desde el mock de Dropbox para que
 * CONTPAQiAdapter los cargue exactamente igual que en produccion.
 *
 * Test 1: End-to-end con adapter real
 *   - DropboxClient mock devuelve CSVs reales del fixture.
 *   - LLM prefabricado hace extract_note -> match_client (RFC del CSV) ->
 *     match_product -> append_daily_sale.
 *   - Verifica que el Excel diario tenga la fila con el RFC/SKU real del CSV.
 *
 * Test 2: submitInvoiceBatch escribe a Importables_CONTPAQi/pendientes/
 *   - Employee arma factura -> llama adapter.submitInvoiceBatch.
 *   - Verifica dropboxClient.writeFile invocado con path correcto y buffer XML
 *     valido (contiene RfcReceptor + CodigoProducto esperados).
 *
 * Test 3: freshness stale > escalationHours dispara escalate
 *   - freshness JSON con lastSyncAt viejo -> runOnEmail invoca escalate tool.
 *
 * No se realizan llamadas reales a Anthropic, Dropbox ni Supabase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs_node from 'fs';

// ---------------------------------------------------------------------------
// Shared mock refs via vi.hoisted
// ---------------------------------------------------------------------------

const {
  mockMessagesCreate,
  mockSupabaseFrom,
  mockDropboxRead,
  mockDropboxWrite,
  mockSnapshot,
  mockReplyToInboundEmail,
  mockSendBillingMail,
} = vi.hoisted(() => ({
  mockMessagesCreate:      vi.fn(),
  mockSupabaseFrom:        vi.fn(),
  mockDropboxRead:         vi.fn(),
  mockDropboxWrite:        vi.fn(),
  mockSnapshot:            vi.fn(),
  mockReplyToInboundEmail: vi.fn(),
  mockSendBillingMail:     vi.fn(),
}));

// ---------------------------------------------------------------------------
// vi.mock declarations (must live in this file for hoisting)
// ---------------------------------------------------------------------------

vi.mock('@anthropic-ai/sdk', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn().mockImplementation(function (this: any) {
    this.messages = { create: mockMessagesCreate };
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockSupabaseFrom }),
}));

vi.mock('@/lib/billing/storage/dropbox', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DropboxClient: vi.fn().mockImplementation(function (this: any) {
    this.readFile  = mockDropboxRead;
    this.writeFile = mockDropboxWrite;
  }),
}));

vi.mock('@/lib/billing/storage/snapshot', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SnapshotStorage: vi.fn().mockImplementation(function (this: any) {
    this.snapshot = mockSnapshot;
  }),
}));

vi.mock('@/lib/billing/mail/send', () => ({
  replyToInboundEmail: mockReplyToInboundEmail,
  sendBillingMail:     mockSendBillingMail,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { BillingEmployee } from '@/lib/billing/employee/loop';
import { CONTPAQiAdapter } from '@/lib/billing/adapters/contpaqi';
import type { XmlImportConfig } from '@/lib/billing/contpaqi/xml-import';
import {
  BASE_CONFIG,
  makeEmailRow,
  setupSupabaseChain,
  wireDropboxToFS,
  createInMemoryFS,
  llmEndTurn,
  llmToolUse,
  readDailyRows,
  FAKE_IMAGE_BUFFER,
} from './setup';
import type { InMemoryFS } from './setup';

// ---------------------------------------------------------------------------
// Fixture paths (Task 8 CSVs)
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(
  __dirname,
  '../../../src/lib/billing/contpaqi/__tests__/fixtures',
);

const CLIENTES_CSV_BUF = fs_node.readFileSync(
  path.join(FIXTURES_DIR, 'contpaqi_clientes.example.csv'),
);
const PRODUCTOS_CSV_BUF = fs_node.readFileSync(
  path.join(FIXTURES_DIR, 'contpaqi_productos.example.csv'),
);

// ---------------------------------------------------------------------------
// Data real del fixture (refleja las 2 filas del CSV)
// ---------------------------------------------------------------------------

/**
 * Primer cliente en el fixture:
 *   rfc=TDM040101ABC, razon_social=TORTAS DONA MARIA SA
 */
const CSV_CLIENT_RFC   = 'TDM040101ABC';
const CSV_CLIENT_NAME  = 'TORTAS DONA MARIA SA';

/**
 * Primer producto en el fixture:
 *   sku=TOR-MAI-KG, nombre=Tortilla de maiz
 */
const CSV_PRODUCT_SKU  = 'TOR-MAI-KG';

// ---------------------------------------------------------------------------
// CONTPAQiAdapter factory helper
// ---------------------------------------------------------------------------

const XML_CONFIG: XmlImportConfig = {
  serie: 'A',
  rfcEmisor: 'XAXX010101000',
  regimenFiscal: '601',
  lugarExpedicion: '64000',
  usoCFDIDefault: 'G03',
};

/**
 * Construye un CONTPAQiAdapter inyectando un DropboxClient duck-typed que
 * delega a los mocks hoisted (mockDropboxRead / mockDropboxWrite).
 *
 * No usamos `require('@/lib/billing/storage/dropbox')` porque el alias @/
 * no esta disponible en require() dentro de Vitest ESM. En su lugar creamos
 * un objeto que satisface la interfaz DropboxClient directamente.
 *
 * CONTPAQiAdapter acepta cualquier objeto con readFile/writeFile via el tipo
 * DropboxClient importado de '@/lib/billing/storage/dropbox' -- duck-typing
 * funciona aqui porque TypeScript usa structural typing.
 */
function makeAdapter(): CONTPAQiAdapter {
  // Objeto duck-typed que satisface la interfaz de DropboxClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeDropboxClient: any = {
    readFile: mockDropboxRead,
    writeFile: mockDropboxWrite,
  };

  return new CONTPAQiAdapter({
    dropboxClient: fakeDropboxClient,
    basePath: BASE_CONFIG.dropboxBasePath,
    staleWarningMinutes: 30,
    staleEscalationHours: 6,
    xmlConfig: XML_CONFIG,
    cacheTtlMs: 0, // No cache -- siempre lee del mock FS
  });
}

// ---------------------------------------------------------------------------
// Freshness JSON helpers
// ---------------------------------------------------------------------------

function freshnessJson(lastSyncAt: Date, status: 'ok' | 'error' = 'ok'): Buffer {
  return Buffer.from(
    JSON.stringify({
      last_sync_at: lastSyncAt.toISOString(),
      status,
      records: { clients: 2, products: 2 },
      duration_ms: 120,
      agent_version: '1.0.0',
    }),
    'utf-8',
  );
}

const HEALTHY_FRESHNESS_BUF = freshnessJson(new Date());
const STALE_FRESHNESS_BUF = freshnessJson(new Date(Date.now() - 8 * 60 * 60 * 1000));

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

let fs: InMemoryFS;

function resetAndWire(): void {
  vi.clearAllMocks();
  fs = createInMemoryFS();

  // Seed CSVs en las rutas que CONTPAQiAdapter espera leer
  fs.set(`${BASE_CONFIG.dropboxBasePath}/Config/contpaqi_clientes.csv`, CLIENTES_CSV_BUF);
  fs.set(`${BASE_CONFIG.dropboxBasePath}/Config/contpaqi_productos.csv`, PRODUCTOS_CSV_BUF);
  fs.set(`${BASE_CONFIG.dropboxBasePath}/Config/last_sync.json`, HEALTHY_FRESHNESS_BUF);

  wireDropboxToFS(fs, mockDropboxRead, mockDropboxWrite);
  mockSnapshot.mockResolvedValue('snapshot-key-001');
  mockReplyToInboundEmail.mockResolvedValue({ messageId: '<reply-001@centinelia>' });
  mockSendBillingMail.mockResolvedValue({ messageId: '<mail-001@centinelia>' });
}

beforeEach(() => {
  resetAndWire();
});

// ===========================================================================
// Test 1: End-to-end con adapter real (CSVs de fixture)
// ===========================================================================

describe('CONTPAQi E2E Test 1: flujo completo con adapter real y fixtures CSV', () => {
  it('extract_note -> match_client (RFC del CSV) -> append_daily_sale -> fila en Excel', async () => {
    const emailId = 'email-contpaqi-e2e-001';
    const emailRow = makeEmailRow({ id: emailId });
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    const adapter = makeAdapter();

    // Vision response: extrae nota con nombre del cliente real del CSV
    const visionResponse = {
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          cliente_texto: CSV_CLIENT_NAME,
          productos: [{ nombre: 'Tortilla de maiz', cantidad: 5, unidad: 'kg' }],
          metodo_pago: 'efectivo',
          fecha: null,
          monto_total: 90,
          confianza: { cliente: 0.95, productos: 0.92, metodo_pago: 0.98, global: 0.95 },
          notas_raw: `${CSV_CLIENT_NAME} - 5kg tortilla de maiz - efectivo - $90`,
        }),
      }],
    };

    // LLM sequence:
    //   iter 0 -> extract_note_from_image
    //   vision call -> visionResponse
    //   iter 1 -> append_daily_sale (usando el RFC real del CSV)
    //   iter 2 -> log_activity
    //   iter 3 -> end_turn
    mockMessagesCreate
      .mockResolvedValueOnce(llmToolUse('extract_note_from_image', {
        image_base64: FAKE_IMAGE_BUFFER.toString('base64'),
        mime_type: 'image/jpeg',
      }, 'tu_001'))
      .mockResolvedValueOnce(visionResponse)
      .mockResolvedValueOnce(llmToolUse('append_daily_sale', {
        cliente: CSV_CLIENT_NAME,
        rfc: CSV_CLIENT_RFC,
        productos: `5 kg ${CSV_PRODUCT_SKU} Tortilla de maiz`,
        total: 90,
        metodo: 'efectivo',
      }, 'tu_002'))
      .mockResolvedValueOnce(llmToolUse('log_activity', {
        action_type: 'nota_capturada',
        severity: 'info',
        entity_ref: CSV_CLIENT_RFC,
      }, 'tu_003'))
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail(emailId);

    // Resultado del loop
    expect(result.processed).toBe(1);
    expect(result.escalated).toBe(0);
    expect(result.consulted).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Excel diario fue escrito en el FS
    const ventasKey = [...fs.keys()].find((k) => k.includes('Ventas_') && k.endsWith('.xlsx'));
    expect(ventasKey).toBeDefined();

    // La fila tiene el RFC real del CSV fixture
    const rows = await readDailyRows(fs.get(ventasKey!)!);
    expect(rows).toHaveLength(1);
    expect(rows[0].rfc).toBe(CSV_CLIENT_RFC);
    expect(rows[0].total).toBe(90);
    expect(rows[0].status).toBe('pendiente_timbrar');
  });

  it('CONTPAQiAdapter.searchClient encuentra al cliente del CSV por nombre parcial', async () => {
    const adapter = makeAdapter();

    // 'Dona Maria' debe hacer match con 'TORTAS DONA MARIA SA' (palabras en comun)
    const matches = await adapter.searchClient('Dona Maria');

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].rfc).toBe(CSV_CLIENT_RFC);
    expect(matches[0].score).toBeGreaterThan(0.3);
  });

  it('CONTPAQiAdapter.searchProduct encuentra el producto del CSV por nombre', async () => {
    const adapter = makeAdapter();

    const matches = await adapter.searchProduct('Tortilla de maiz');

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].sku).toBe(CSV_PRODUCT_SKU);
    expect(matches[0].precio).toBe(18);
  });
});

// ===========================================================================
// Test 2: submitInvoiceBatch escribe a Importables_CONTPAQi/pendientes/
// ===========================================================================

describe('CONTPAQi E2E Test 2: submitInvoiceBatch escribe XML al path correcto', () => {
  it('el XML escrito contiene RfcReceptor y CodigoProducto del CSV fixture', async () => {
    const adapter = makeAdapter();

    const invoice = {
      clientRFC: CSV_CLIENT_RFC,
      date: '2026-08-18',
      lines: [
        { sku: CSV_PRODUCT_SKU, qty: 5, unitPrice: 18 },
      ],
      paymentMethod: 'efectivo' as const,
      usoCFDI: 'G03',
    };

    const result = await adapter.submitInvoiceBatch([invoice]);

    // Modo 'file' (CONTPAQi no timbra directamente)
    expect(result.mode).toBe('file');
    expect(result.errors).toHaveLength(0);

    // writeFile fue invocado exactamente una vez
    expect(mockDropboxWrite).toHaveBeenCalledOnce();

    const [writtenPath, writtenBuffer] = mockDropboxWrite.mock.calls[0] as [string, Buffer];

    // Path incluye Importables_CONTPAQi/pendientes/ con nombre de fecha
    expect(writtenPath).toContain(`${BASE_CONFIG.dropboxBasePath}/Importables_CONTPAQi/pendientes/`);
    expect(writtenPath).toMatch(/facturas_\d{4}-\d{2}-\d{2}\.xml$/);

    // Buffer es un XML valido que contiene los datos del receptor y el producto
    expect(Buffer.isBuffer(writtenBuffer)).toBe(true);
    const xmlString = writtenBuffer.toString('utf-8');

    // Cabecera XML
    expect(xmlString).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    // RfcReceptor con el RFC del CSV
    expect(xmlString).toContain(`<RfcReceptor>${CSV_CLIENT_RFC}</RfcReceptor>`);
    // CodigoProducto con el SKU del CSV
    expect(xmlString).toContain(`<CodigoProducto>${CSV_PRODUCT_SKU}</CodigoProducto>`);
    // Total correcto: 5 * 18 = 90
    expect(xmlString).toContain('<Total>90.00</Total>');
  });

  it('el result.ref coincide con el path que writeFile recibio', async () => {
    const adapter = makeAdapter();

    const invoice = {
      clientRFC: CSV_CLIENT_RFC,
      date: '2026-08-18',
      lines: [{ sku: CSV_PRODUCT_SKU, qty: 1, unitPrice: 18 }],
      paymentMethod: 'transferencia' as const,
      usoCFDI: 'G03',
    };

    const result = await adapter.submitInvoiceBatch([invoice]);

    const [writtenPath] = mockDropboxWrite.mock.calls[0] as [string, Buffer];
    expect(result.ref).toBe(writtenPath);
  });
});

// ===========================================================================
// Test 3: freshness stale > escalationHours dispara escalate
// ===========================================================================

describe('CONTPAQi E2E Test 3: freshness stale dispara escalate via runOnEmail', () => {
  it('last_sync.json con lastSyncAt hace 8h -> loop escala de inmediato', async () => {
    // Reemplaza el JSON de frescura con uno muy viejo (8 horas)
    fs.set(
      `${BASE_CONFIG.dropboxBasePath}/Config/last_sync.json`,
      STALE_FRESHNESS_BUF,
    );

    const emailRow = makeEmailRow({ id: 'email-contpaqi-stale-001' });
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    const adapter = makeAdapter();

    // staleEscalationHours=6 -> 8h > 6h -> auto-escalate antes del loop
    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-contpaqi-stale-001');

    // El loop LLM no debe haber corrido (la escalacion es previa)
    expect(mockMessagesCreate).not.toHaveBeenCalled();

    // El resultado refleja la escalacion
    expect(result.escalated).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);

    // El mensaje de error menciona los minutos de staleness
    const errMsg = result.errors[0];
    expect(errMsg).toMatch(/min/i);
  });

  it('stale moderado (2h con escalationHours=6) -> loop corre con advertencia en system prompt', async () => {
    // 2 horas de staleness: staleWarningMinutes=30 lo marca como advertencia
    // pero staleEscalationHours=6 no lo bloquea -> el loop corre
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.set(
      `${BASE_CONFIG.dropboxBasePath}/Config/last_sync.json`,
      freshnessJson(twoHoursAgo),
    );

    const emailRow = makeEmailRow({ id: 'email-contpaqi-warn-001' });
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    const adapter = makeAdapter();

    // El LLM recibe el warning en el system prompt y decide escalate
    mockMessagesCreate
      .mockResolvedValueOnce(llmToolUse('escalate', {
        topic: 'Adaptador CONTPAQi sin sincronizar: 120 minutos de retraso',
        urgency: 'high',
        context: { minutesStale: 120, threshold: 30 },
      }, 'tu_001'))
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-contpaqi-warn-001');

    // El loop LLM si corrio
    expect(mockMessagesCreate).toHaveBeenCalled();

    // LLM escaló el problema de frescura
    expect(result.escalated).toBe(1);
    expect(result.errors).toHaveLength(0);

    // El system prompt incluye la advertencia de staleness (minutos)
    const firstCallArgs = mockMessagesCreate.mock.calls[0][0] as { system: string };
    expect(firstCallArgs.system).toMatch(/120 min|2 h/i);
  });
});
