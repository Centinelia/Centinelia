/**
 * happy-path.e2e.test.ts
 *
 * E2E cases 1, 4, 5 -- successful processing paths.
 *
 * Case 1: Clear nota + known client + known product
 *         -> auto-processed, row in Ventas_YYYY-MM-DD.xlsx, no escalation.
 *
 * Case 4: Weekly client -- 5 notas M-F accumulate in Pendientes_<RFC>.xlsx.
 *
 * Case 5: Reassign "no facturado" to daily/weekly client
 *         -> reflected in diario + acumulador.
 *
 * All external dependencies are mocked. No real Anthropic, Dropbox, or Supabase calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
// vi.mock declarations (must be in file, not setup.ts, for hoisting)
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
import { MockBillingAdapter } from '@/lib/billing/adapters/mock';
import {
  BASE_CONFIG,
  CLIENT_DAILY,
  CLIENT_WEEKLY,
  PRODUCT_TORTILLA,
  makeEmailRow,
  setupSupabaseChain,
  wireDropboxToFS,
  createInMemoryFS,
  llmEndTurn,
  llmToolUse,
  buildDailyExcel,
  readDailyRows,
  readPendingRows,
  FAKE_IMAGE_BUFFER,
} from './setup';
import type { InMemoryFS } from './setup';
import { reassignSales } from '@/lib/billing/employee/reassign';

let fs: InMemoryFS;

function resetAndWire() {
  vi.clearAllMocks();
  fs = createInMemoryFS();
  wireDropboxToFS(fs, mockDropboxRead, mockDropboxWrite);
  mockSnapshot.mockResolvedValue('snapshot-key-001');
  mockReplyToInboundEmail.mockResolvedValue({ messageId: '<reply-001@centinelia>' });
  mockSendBillingMail.mockResolvedValue({ messageId: '<mail-001@centinelia>' });
}

beforeEach(() => {
  resetAndWire();
});

// ===========================================================================
// Case 1: Clear nota -> known client + known product -> auto-processed
// ===========================================================================

describe('E2E Case 1: clara nota -> cliente/producto conocidos -> auto-procesada', () => {
  it('escribe fila en Ventas_YYYY-MM-DD.xlsx y no escala', async () => {
    const emailId = 'email-case1';
    const emailRow = makeEmailRow({ id: emailId });
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    const adapter = new MockBillingAdapter({
      clients: [CLIENT_DAILY],
      products: [PRODUCT_TORTILLA],
    });

    // The loop's Anthropic client and the vision's Anthropic client share
    // mockMessagesCreate (both go through the sdk mock).
    //
    // Sequence:
    //   LLM call 1 (loop iter 0): invokes extract_note_from_image tool
    //   LLM call 2 (inner vision call inside extractNoteFromImage handler): returns JSON note
    //   LLM call 3 (loop iter 1): LLM got vision result, invokes append_daily_sale
    //   LLM call 4 (loop iter 2): log_activity
    //   LLM call 5 (loop iter 3): end_turn

    const visionResponse = {
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          cliente_texto: 'Publico en General',
          productos: [{ nombre: 'Tortilla de maiz', cantidad: 2, unidad: 'kg' }],
          metodo_pago: 'efectivo',
          fecha: null,
          monto_total: 50,
          confianza: { cliente: 0.95, productos: 0.9, metodo_pago: 0.95, global: 0.93 },
          notas_raw: 'Publico en General - 2kg tortilla - efectivo',
        }),
      }],
    };

    mockMessagesCreate
      .mockResolvedValueOnce(llmToolUse('extract_note_from_image', {
        image_base64: FAKE_IMAGE_BUFFER.toString('base64'),
        mime_type: 'image/jpeg',
      }, 'tu_001'))
      .mockResolvedValueOnce(visionResponse)
      .mockResolvedValueOnce(llmToolUse('append_daily_sale', {
        cliente: CLIENT_DAILY.razonSocial,
        rfc: CLIENT_DAILY.rfc,
        productos: '2 kg tortilla de maiz',
        total: 50,
        metodo: 'efectivo',
      }, 'tu_002'))
      .mockResolvedValueOnce(llmToolUse('log_activity', {
        action_type: 'nota_capturada',
        severity: 'info',
        entity_ref: CLIENT_DAILY.rfc,
      }, 'tu_003'))
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail(emailId);

    // Core assertions
    expect(result.processed).toBe(1);
    expect(result.escalated).toBe(0);
    expect(result.consulted).toBe(0);
    expect(result.errors).toHaveLength(0);

    // A Ventas file was written to the in-memory FS
    const ventasKey = [...fs.keys()].find((k) => k.includes('Ventas_') && k.endsWith('.xlsx'));
    expect(ventasKey).toBeDefined();

    // The file contains exactly 1 row with the correct client RFC
    const rows = await readDailyRows(fs.get(ventasKey!)!);
    expect(rows).toHaveLength(1);
    expect(rows[0].rfc).toBe(CLIENT_DAILY.rfc);
    expect(rows[0].total).toBe(50);
    expect(rows[0].status).toBe('pendiente_timbrar');
  });
});

// ===========================================================================
// Case 4: Weekly client -- 5 notas accumulate in Pendientes_<RFC>.xlsx
// ===========================================================================

describe('E2E Case 4: cliente semanal -> 5 notas acumulan en Pendientes_<RFC>.xlsx', () => {
  it('cada nota append_pending_client_sale acumula en el archivo de pendientes', async () => {
    // Simulate 5 separate email runs (Mon-Fri), each with 1 nota for the weekly client.
    // We verify the Pendientes file accumulates across runs using the shared in-memory FS.

    const adapter = new MockBillingAdapter({
      clients: [CLIENT_WEEKLY],
      products: [PRODUCT_TORTILLA],
    });

    // Reset once at the start so fs persists across the 5 iterations
    resetAndWire();

    for (let day = 1; day <= 5; day++) {
      const emailId = `email-week-day${day}`;
      const emailRow = makeEmailRow({ id: emailId });

      // Re-wire mocks but keep same fs so data accumulates
      mockSnapshot.mockResolvedValue(`snap-day${day}`);
      mockSendBillingMail.mockResolvedValue({ messageId: `<mail-day${day}@centinelia>` });
      mockReplyToInboundEmail.mockResolvedValue({ messageId: `<reply-day${day}@centinelia>` });
      setupSupabaseChain(mockSupabaseFrom, emailRow);

      // Ensure Dropbox still wired to the same fs (survives vi.clearAllMocks? No --
      // we do NOT clearAllMocks between days, only in beforeEach)
      // Re-wire because we cleared in the previous iteration approach, but actually
      // we only clear once in resetAndWire(). Here we just setup supabase and mails.
      // But mockDropboxRead/Write were set up in resetAndWire above.

      mockMessagesCreate.mockResolvedValueOnce(
        llmToolUse('append_pending_client_sale', {
          rfc: CLIENT_WEEKLY.rfc,
          fecha: `2026-08-1${day}`,
          productos: `${day} kg tortilla`,
          total: day * 100,
          metodo: 'transferencia',
          referencia: emailId,
        }, `tu_d${day}`),
      ).mockResolvedValueOnce(llmEndTurn());

      const employee = new BillingEmployee(adapter, BASE_CONFIG);
      const result = await employee.runOnEmail(emailId);

      expect(result.processed).toBe(1);
      expect(result.errors).toHaveLength(0);
    }

    // After 5 runs, Pendientes_<RFC>.xlsx must contain exactly 5 rows
    const pendingKey = `${BASE_CONFIG.dropboxBasePath}/Pendientes_${CLIENT_WEEKLY.rfc}.xlsx`;
    expect(fs.has(pendingKey)).toBe(true);

    const rows = await readPendingRows(fs.get(pendingKey)!);
    expect(rows).toHaveLength(5);

    // Verify cumulative totals: 100+200+300+400+500 = 1500
    const total = rows.reduce((sum, r) => sum + (typeof r.total === 'number' ? r.total : 0), 0);
    expect(total).toBe(1500);

    // No daily (Ventas_) file should exist -- weekly clients go to pending, not daily excel
    const ventasKeys = [...fs.keys()].filter((k) => k.includes('Ventas_'));
    expect(ventasKeys).toHaveLength(0);
  });
});

// ===========================================================================
// Case 5: Reassign "no facturado" -> daily + weekly clients
// ===========================================================================

describe('E2E Case 5: reasignacion de "no facturado" refleja en diario + acumulador', () => {
  it('reasignacion a cliente daily actualiza el Excel diario', async () => {
    // Seed a daily Excel with 2 rows, both "No facturado"
    const fecha = '2026-08-17';
    const dailyPath = `${BASE_CONFIG.dropboxBasePath}/Ventas_${fecha}.xlsx`;

    const seedRows = [
      { num: 1, hora: '09:00', cliente: 'Cliente Viejo', rfc: 'VIEJO0001001', productos: 'Pan', total: 120, metodo: 'efectivo', status: 'No facturado', factura: '' },
      { num: 2, hora: '10:00', cliente: 'Otro Viejo', rfc: 'OTRO00001002', productos: 'Leche', total: 80, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const seedBuf = await buildDailyExcel(seedRows);
    fs.set(dailyPath, seedBuf);

    // applyRuleToSale calls supabase.from('billing_client_rules').select...maybeSingle
    // Return null (no rule) -> decision='daily' -> no Pendientes file written
    mockSupabaseFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const adapter = new MockBillingAdapter({
      clients: [CLIENT_DAILY],
      products: [],
    });

    const result = await reassignSales({
      dailyExcelPath: dailyPath,
      saleNums: [1, 2],
      targetRFC: CLIENT_DAILY.rfc,
      ctx: { portalEmail: BASE_CONFIG.portalEmail, integrationId: BASE_CONFIG.integrationId },
      adapter,
      basePath: BASE_CONFIG.dropboxBasePath,
    });

    expect(result.reassigned).toBe(2);
    expect(result.missing).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.targetClient.rfc).toBe(CLIENT_DAILY.rfc);

    // The daily file is updated in-memory
    const updatedBuf = fs.get(dailyPath);
    expect(updatedBuf).toBeDefined();
    const updatedRows = await readDailyRows(updatedBuf!);
    expect(updatedRows).toHaveLength(2);
    // Both rows now point to the target client
    expect(updatedRows[0].rfc).toBe(CLIENT_DAILY.rfc);
    expect(updatedRows[1].rfc).toBe(CLIENT_DAILY.rfc);
    // Status changed to 'Pendiente'
    expect(updatedRows[0].status).toBe('Pendiente');
    expect(updatedRows[1].status).toBe('Pendiente');
  });

  it('reasignacion a cliente weekly acumula en Pendientes file', async () => {
    const fecha = '2026-08-17';
    const dailyPath = `${BASE_CONFIG.dropboxBasePath}/Ventas_${fecha}.xlsx`;

    const seedRows = [
      { num: 10, hora: '11:00', cliente: 'Tercero', rfc: 'TERC0001001X', productos: 'Tortillas', total: 500, metodo: 'transferencia', status: 'No facturado', factura: '' },
    ];
    const seedBuf = await buildDailyExcel(seedRows);
    fs.set(dailyPath, seedBuf);

    // applyRuleToSale: return 'weekly' rule for CLIENT_WEEKLY.rfc
    const weeklyRule = { rfc: CLIENT_WEEKLY.rfc, frequency: 'weekly', payment_method: null };
    mockSupabaseFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: weeklyRule, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const adapter = new MockBillingAdapter({
      clients: [CLIENT_WEEKLY],
      products: [],
    });

    const result = await reassignSales({
      dailyExcelPath: dailyPath,
      saleNums: [10],
      targetRFC: CLIENT_WEEKLY.rfc,
      ctx: { portalEmail: BASE_CONFIG.portalEmail, integrationId: BASE_CONFIG.integrationId },
      adapter,
      basePath: BASE_CONFIG.dropboxBasePath,
    });

    expect(result.reassigned).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Daily file updated: row reasignada a CLIENT_WEEKLY
    const updatedBuf = fs.get(dailyPath);
    const updatedRows = await readDailyRows(updatedBuf!);
    expect(updatedRows[0].rfc).toBe(CLIENT_WEEKLY.rfc);
    expect(updatedRows[0].status).toBe('Pendiente');

    // Pendientes file was created with 1 row (from applyRuleToSale weekly path)
    const pendingPath = `${BASE_CONFIG.dropboxBasePath}/Clientes_Periodicos/${CLIENT_WEEKLY.rfc}/Pendientes.xlsx`;
    expect(fs.has(pendingPath)).toBe(true);
    const pendingRows = await readPendingRows(fs.get(pendingPath)!);
    expect(pendingRows).toHaveLength(1);
    expect(pendingRows[0].total).toBe(500);
  });
});
