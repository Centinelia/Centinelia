/**
 * error-cases.e2e.test.ts
 *
 * E2E cases 2, 3, 6, 7 -- error and edge-case paths.
 *
 * Case 2: Ambiguous client (2 candidates with close scores)
 *         -> employee invokes reply_email asking for clarification.
 *
 * Case 3: Product not found
 *         -> employee invokes reply_email or escalate.
 *
 * Case 6: Illegible photo
 *         -> employee escalates without blocking the rest of the batch.
 *
 * Case 7: Scheduled task down (freshness > 30 min)
 *         -> employee alerts in daily report (escalate with freshness topic).
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
// vi.mock declarations
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
import type { BillingAdapterHealth } from '@/lib/billing/adapter';
import {
  BASE_CONFIG,
  CLIENT_DAILY,
  CLIENT_AMBIGUOUS_A,
  CLIENT_AMBIGUOUS_B,
  PRODUCT_TORTILLA,
  makeEmailRow,
  setupSupabaseChain,
  wireDropboxToFS,
  createInMemoryFS,
  llmEndTurn,
  llmToolUse,
  STALE_FRESHNESS,
  FAKE_IMAGE_BUFFER,
} from './setup';
import type { InMemoryFS } from './setup';

let fs: InMemoryFS;

beforeEach(() => {
  vi.clearAllMocks();
  fs = createInMemoryFS();
  wireDropboxToFS(fs, mockDropboxRead, mockDropboxWrite);
  mockSnapshot.mockResolvedValue('snapshot-key-001');
  mockReplyToInboundEmail.mockResolvedValue({ messageId: '<reply-001@centinelia>' });
  mockSendBillingMail.mockResolvedValue({ messageId: '<mail-001@centinelia>' });
});

// ===========================================================================
// Case 2: Ambiguous client (2 candidates with close scores) -> reply_email
// ===========================================================================

describe('E2E Case 2: cliente ambiguo (2 candidatos con score cercano) -> reply_email', () => {
  it('invoca reply_email con aclaracion cuando match_client devuelve consult', async () => {
    const emailId = 'email-case2';
    const emailRow = makeEmailRow({ id: emailId });
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    // Two clients with almost identical names -- MockBillingAdapter will return
    // scores close enough to trigger 'consult' decision in matchClient.
    const adapter = new MockBillingAdapter({
      clients: [CLIENT_AMBIGUOUS_A, CLIENT_AMBIGUOUS_B],
      products: [PRODUCT_TORTILLA],
    });

    mockMessagesCreate
      // Iter 0: LLM invokes match_client to find the ambiguous name
      .mockResolvedValueOnce(llmToolUse('match_client', { text: 'Gonzalez Castillo' }, 'tu_001'))
      // Iter 1: LLM receives consult result, decides to ask for clarification
      .mockResolvedValueOnce(
        llmToolUse('reply_email', {
          body: '<p>Encontramos dos clientes con nombres similares: Gonzalez Castillo (RFC: GOCA800101AAA) y Gonzalez Castillo Norte (RFC: GOCA800101BBB). Por favor confirme el RFC correcto.</p>',
        }, 'tu_002'),
      )
      // Iter 2: end_turn after sending reply
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail(emailId);

    // No venta fue procesada -- se pide aclaracion
    expect(result.processed).toBe(0);
    expect(result.escalated).toBe(0);
    // consulted=1 because reply_email was invoked
    expect(result.consulted).toBe(1);
    expect(result.errors).toHaveLength(0);

    // reply_email was sent with clarification body
    expect(mockReplyToInboundEmail).toHaveBeenCalledOnce();
    const [calledEmailId, calledBody] = mockReplyToInboundEmail.mock.calls[0] as [string, string];
    expect(calledEmailId).toBe(emailId);
    expect(calledBody).toMatch(/Gonzalez Castillo/);
    expect(calledBody).toMatch(/RFC/);
  });

  it('match_client tool devuelve candidatos cuando nombres son similares', async () => {
    // Direct test of matchClient via mock adapter with two similar clients.
    // Verifies the adapter fuzzy matching finds both candidates.
    const { matchClient } = await import('@/lib/billing/matching/client');

    // Override supabase to return no alias hit
    mockSupabaseFrom.mockImplementation((_table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          contains: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }));

    const adapter = new MockBillingAdapter({
      clients: [CLIENT_AMBIGUOUS_A, CLIENT_AMBIGUOUS_B],
      products: [],
    });

    const ctx = { portalEmail: BASE_CONFIG.portalEmail, integrationId: BASE_CONFIG.integrationId };
    const matchResult = await matchClient('Gonzalez Castillo', adapter, ctx);

    // At minimum: top candidate is one of the two
    expect(matchResult.top).not.toBeNull();
    expect([CLIENT_AMBIGUOUS_A.rfc, CLIENT_AMBIGUOUS_B.rfc]).toContain(matchResult.top!.rfc);
    // candidates should include both
    expect(matchResult.candidates.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// Case 3: Product not found -> reply_email or escalate
// ===========================================================================

describe('E2E Case 3: producto no encontrado -> reply_email o escalate', () => {
  it('invoca reply_email cuando match_product devuelve unknown', async () => {
    const emailId = 'email-case3-product';
    const emailRow = makeEmailRow({ id: emailId });
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    // Empty product catalog -- any search returns unknown
    const adapter = new MockBillingAdapter({
      clients: [CLIENT_DAILY],
      products: [],
    });

    mockMessagesCreate
      // Iter 0: LLM tries to match the product
      .mockResolvedValueOnce(llmToolUse('match_product', { text: 'Tamales oaxaquenos especiales' }, 'tu_001'))
      // Iter 1: LLM receives unknown result, sends reply asking for clarification
      .mockResolvedValueOnce(
        llmToolUse('reply_email', {
          body: '<p>No encontramos el producto "Tamales oaxaquenos especiales" en el catalogo. Por favor confirme el nombre exacto o el SKU del producto.</p>',
        }, 'tu_002'),
      )
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail(emailId);

    expect(result.processed).toBe(0);
    expect(result.consulted).toBe(1);
    expect(result.escalated).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockReplyToInboundEmail).toHaveBeenCalledOnce();

    const body = mockReplyToInboundEmail.mock.calls[0][1] as string;
    expect(body).toMatch(/producto/i);
    expect(body).toMatch(/catalogo/i);
  });

  it('escalate es valido cuando el producto desconocido bloquea la factura', async () => {
    const emailId = 'email-case3-escalate';
    const emailRow = makeEmailRow({ id: emailId });
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    const adapter = new MockBillingAdapter({
      clients: [CLIENT_DAILY],
      products: [],
    });

    // LLM decides to escalate (critical path: product unknown blocks billing)
    mockMessagesCreate
      .mockResolvedValueOnce(llmToolUse('match_product', { text: 'Producto Critico X9' }, 'tu_001'))
      .mockResolvedValueOnce(
        llmToolUse('escalate', {
          topic: 'Producto no registrado en catalogo: Producto Critico X9',
          urgency: 'high',
          context: { emailId, productoTexto: 'Producto Critico X9' },
        }, 'tu_002'),
      )
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail(emailId);

    expect(result.processed).toBe(0);
    expect(result.escalated).toBe(1);
    expect(result.errors).toHaveLength(0);

    expect(mockSendBillingMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: BASE_CONFIG.escalationEmail,
        subject: expect.stringContaining('Producto Critico X9'),
      }),
    );
  });
});

// ===========================================================================
// Case 6: Illegible photo -> escalate without blocking rest of batch
// ===========================================================================

describe('E2E Case 6: foto ilegible -> escala sin bloquear el resto del lote', () => {
  it('foto ilegible escala y continua procesando la nota legible del mismo batch', async () => {
    const emailId = 'email-case6-batch';
    // Email with 2 attachments: one illegible, one clear
    const emailRow = makeEmailRow({
      id: emailId,
      body_text: 'Le mando 2 notitas. Una esta un poco movida.',
      attachments_meta: [
        { filename: 'nota_borrosa.jpg', contentType: 'image/jpeg' },
        { filename: 'nota_clara.jpg', contentType: 'image/jpeg' },
      ],
    });
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    const adapter = new MockBillingAdapter({
      clients: [CLIENT_DAILY],
      products: [PRODUCT_TORTILLA],
    });

    // Vision mock response for illegible note (low confidence)
    const illegibleVisionResponse = {
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          cliente_texto: null,
          productos: [],
          metodo_pago: null,
          fecha: null,
          monto_total: null,
          confianza: { cliente: 0.1, productos: 0.1, metodo_pago: 0.1, global: 0.1 },
          notas_raw: 'Imagen ilegible, no se pueden extraer datos',
        }),
      }],
    };

    // Vision mock response for clear note
    const clearVisionResponse = {
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          cliente_texto: 'Publico en General',
          productos: [{ nombre: 'Tortilla de maiz', cantidad: 1, unidad: 'kg' }],
          metodo_pago: 'efectivo',
          fecha: null,
          monto_total: 25,
          confianza: { cliente: 0.95, productos: 0.92, metodo_pago: 0.98, global: 0.95 },
          notas_raw: 'Publico en General - 1kg tortilla - efectivo - $25',
        }),
      }],
    };

    mockMessagesCreate
      // Loop iter 0: LLM tries to extract from illegible image
      .mockResolvedValueOnce(llmToolUse('extract_note_from_image', {
        image_base64: FAKE_IMAGE_BUFFER.toString('base64'),
        mime_type: 'image/jpeg',
      }, 'tu_001'))
      // Inner vision call for illegible image -> returns low-confidence result
      .mockResolvedValueOnce(illegibleVisionResponse)
      // Loop iter 1: LLM sees low confidence, escalates the illegible note
      .mockResolvedValueOnce(llmToolUse('escalate', {
        topic: 'Imagen ilegible: nota_borrosa.jpg -- no se pueden extraer datos',
        urgency: 'high',
        context: { emailId, filename: 'nota_borrosa.jpg', confianza_global: 0.1 },
      }, 'tu_002'))
      // Loop iter 2: LLM continues to process the clear image (same batch, not blocked)
      .mockResolvedValueOnce(llmToolUse('extract_note_from_image', {
        image_base64: FAKE_IMAGE_BUFFER.toString('base64'),
        mime_type: 'image/jpeg',
      }, 'tu_003'))
      // Inner vision call for clear image
      .mockResolvedValueOnce(clearVisionResponse)
      // Loop iter 3: LLM appends the clear nota to daily excel
      .mockResolvedValueOnce(llmToolUse('append_daily_sale', {
        cliente: CLIENT_DAILY.razonSocial,
        rfc: CLIENT_DAILY.rfc,
        productos: '1 kg tortilla de maiz',
        total: 25,
        metodo: 'efectivo',
      }, 'tu_004'))
      // Loop iter 4: end_turn
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail(emailId);

    // The illegible note was escalated
    expect(result.escalated).toBe(1);
    // The clear note was processed -- batch not blocked
    expect(result.processed).toBe(1);
    // No blocking infrastructure errors
    expect(result.errors).toHaveLength(0);
    // No reply email -- escalation path used for the illegible image
    expect(mockReplyToInboundEmail).not.toHaveBeenCalled();

    // The escalation email was sent
    expect(mockSendBillingMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: BASE_CONFIG.escalationEmail,
        subject: expect.stringContaining('Imagen ilegible'),
      }),
    );

    // The clear nota was written to the daily Excel
    const ventasKey = [...fs.keys()].find((k) => k.includes('Ventas_') && k.endsWith('.xlsx'));
    expect(ventasKey).toBeDefined();

    const { ExcelWorkbook } = await import('@/lib/billing/excel/workbook');
    const { DailySalesSchema } = await import('@/lib/billing/excel/schemas');
    const wb = await ExcelWorkbook.fromBuffer(fs.get(ventasKey!)!, DailySalesSchema);
    const rows = wb.getRows('Ventas');
    expect(rows).toHaveLength(1);
    expect(rows[0].rfc).toBe(CLIENT_DAILY.rfc);
  });
});

// ===========================================================================
// Case 7: Scheduled task down (freshness > 30 min) -> employee alerts
// ===========================================================================

describe('E2E Case 7: scheduled task caido (freshness > 30 min) -> alerta en reporte', () => {
  it('freshness > 360 min bloquea el loop y retorna escalated=1 con error de frescura', async () => {
    // Per loop.ts: FRESHNESS_ESCALATE_THRESHOLD_MIN = 360 (6 hours).
    // When minutesStale >= 360, the employee escalates before processing.
    const emailRow = makeEmailRow();
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    const adapter = new MockBillingAdapter({ clients: [], products: [] });
    const criticalHealth: BillingAdapterHealth = {
      lastSyncAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      minutesStale: 420,
      healthy: false,
      message: 'Scheduled task has not run in 420 minutes',
    };
    // Use mockImplementation to avoid spyOn being cleared by vi.clearAllMocks in beforeEach
    adapter.freshness = vi.fn().mockResolvedValue(criticalHealth);

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-case7');

    // Loop never started -- escalation counted directly in runOnEmail
    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(result.escalated).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/420 min/);
  });

  it('freshness entre 30 y 359 min: el LLM recibe la advertencia en el system prompt', async () => {
    // For freshness below the auto-escalate threshold (360 min), the loop runs
    // but the system prompt includes the stale summary. The LLM can then
    // invoke escalate as part of its report.
    const emailRow = makeEmailRow();
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    const adapter = new MockBillingAdapter({ clients: [], products: [] });
    adapter.freshness = vi.fn().mockResolvedValue(STALE_FRESHNESS);

    // LLM receives context with stale warning, invokes escalate as part of its report
    mockMessagesCreate
      .mockResolvedValueOnce(llmToolUse('escalate', {
        topic: 'Adaptador de facturacion sin sincronizar: 35 minutos de retraso',
        urgency: 'high',
        context: { minutesStale: 35, threshold: 30 },
      }, 'tu_001'))
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-case7-stale');

    // The loop ran (LLM was called)
    expect(mockMessagesCreate).toHaveBeenCalled();
    // LLM escalated the freshness issue
    expect(result.escalated).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Escalation email sent to responsible party
    expect(mockSendBillingMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: BASE_CONFIG.escalationEmail,
        subject: expect.stringContaining('retraso'),
      }),
    );

    // System prompt context includes the stale warning (35 min stale)
    const firstCall = mockMessagesCreate.mock.calls[0];
    const systemPrompt = firstCall[0].system as string;
    expect(systemPrompt).toMatch(/35 min/);
  });

  it('freshness_check tool expone minutesStale al LLM cuando se invoca', async () => {
    // Direct verification: LLM can call freshness_check and receive minutesStale in response.
    const emailRow = makeEmailRow();
    setupSupabaseChain(mockSupabaseFrom, emailRow);

    const adapter = new MockBillingAdapter({ clients: [], products: [] });
    adapter.freshness = vi.fn().mockResolvedValue(STALE_FRESHNESS);

    mockMessagesCreate
      .mockResolvedValueOnce(llmToolUse('freshness_check', {}, 'tu_001'))
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-case7-check');

    // Two LLM calls: iter 0 (invokes freshness_check), iter 1 (end_turn)
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);

    // Second LLM call receives tool_result with freshness data in messages
    const secondCall = mockMessagesCreate.mock.calls[1];
    const messages = secondCall[0].messages as Array<{ role: string; content: unknown }>;
    const allContent = JSON.stringify(messages);
    expect(allContent).toContain('minutesStale');
    expect(allContent).toContain('35');

    expect(result.errors).toHaveLength(0);
  });
});
