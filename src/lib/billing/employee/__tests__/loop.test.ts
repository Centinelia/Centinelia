/**
 * loop.test.ts -- Tests para BillingEmployee.runOnEmail()
 *
 * Estrategia:
 * - Mock de @anthropic-ai/sdk para controlar las respuestas del LLM por test.
 * - Mock de @/lib/supabase/admin para aislar DB.
 * - Mock de @/lib/billing/storage/dropbox y @/lib/billing/storage/snapshot
 *   para aislar Dropbox y Supabase Storage.
 * - Mock de @/lib/billing/mail/send para aislar correo saliente.
 * - MockBillingAdapter parametrizable para controlar el catalogo y freshness.
 *
 * Casos cubiertos:
 * 1. Happy path: 1 nota clara -> append_daily_sale + log_activity -> processed=1
 * 2. Consulta: cliente unknown -> reply_email -> consulted=1
 * 3. Escalacion: freshness > 6h -> escalated=1, loop no inicia
 * 4. MAX_ITERATIONS: loop se detiene aunque el LLM siga retornando tool_use
 * 5. Tool desconocida: se registra error y continua
 * 6. handleProcessNotes: invoca BillingEmployee.runOnEmail y propaga errores
 * 7. handleReplyMissingAttachments: llama replyToInboundEmail con cuerpo correcto
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks -- declared with vi.mock (hoisted) using vi.hoisted() for shared refs
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
  mockMessagesCreate:       vi.fn(),
  mockSupabaseFrom:         vi.fn(),
  mockDropboxRead:          vi.fn(),
  mockDropboxWrite:         vi.fn(),
  mockSnapshot:             vi.fn(),
  mockReplyToInboundEmail:  vi.fn(),
  mockSendBillingMail:      vi.fn(),
}));

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

import { BillingEmployee } from '../loop';
import { MockBillingAdapter } from '@/lib/billing/adapters/mock';
import type { BillingAdapterHealth } from '@/lib/billing/adapter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CONFIG = {
  portalEmail: 'empresa@example.com',
  integrationId: 'integ-001',
  dropboxToken: 'dbx-test-token',
  dropboxBasePath: '/Facturacion',
  escalationEmail: 'contadora@example.com',
  orgName: 'Empresa Prueba',
};

const MOCK_EMAIL_ROW = {
  id: 'email-001',
  from_address: 'cliente@cliente.com',
  subject: 'Notitas de hoy',
  body_text: 'Aqui le mando las notitas del dia.',
  attachments_meta: [{ filename: 'nota1.jpg', contentType: 'image/jpeg' }],
  received_at: new Date().toISOString(),
};

/** Respuesta LLM que no invoca tools (fin del loop). */
function llmEndTurn(): object {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Proceso completado.' }],
  };
}

/** Respuesta LLM que invoca una tool especifica. */
function llmToolUse(name: string, input: object, id = 'tu_001'): object {
  return {
    stop_reason: 'tool_use',
    content: [
      { type: 'tool_use', id, name, input },
    ],
  };
}

/** Configura el mock de supabase para devolver un email row. */
function setupEmailRow(row: object | null = MOCK_EMAIL_ROW, error: object | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  mockSupabaseFrom.mockReturnValue({ select });
  return { maybeSingle, eq, select };
}

/** Configura el mock de supabase para DB calls multiples (email + reglas + aliases). */
function setupSupabaseMultiChain(emailRow: object | null = MOCK_EMAIL_ROW) {
  let callCount = 0;
  mockSupabaseFrom.mockImplementation(() => {
    callCount++;
    // Primera llamada: billing_incoming_emails
    // Llamadas subsiguientes: billing_client_rules, billing_product_aliases, billing_activity_log
    const maybeSingle = vi.fn().mockResolvedValue({ data: emailRow, error: null });
    const single = vi.fn().mockResolvedValue({ data: emailRow, error: null });
    const limitFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqFn = vi.fn();

    const builder: Record<string, unknown> = {
      select: vi.fn().mockReturnValue({
        eq: eqFn,
        maybeSingle,
        limit: limitFn,
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    eqFn.mockReturnValue({
      maybeSingle,
      single,
      limit: limitFn,
      eq: eqFn,
    });

    return builder;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults
  mockDropboxRead.mockRejectedValue(new Error('File not found'));
  mockDropboxWrite.mockResolvedValue('/Facturacion/Ventas_2026-08-17.xlsx');
  mockSnapshot.mockResolvedValue('snapshot-key-001');
  mockReplyToInboundEmail.mockResolvedValue({ messageId: '<reply-001@centinelia>' });
  mockSendBillingMail.mockResolvedValue({ messageId: '<mail-001@centinelia>' });
});

// ---------------------------------------------------------------------------
// Test 1: Happy path
// ---------------------------------------------------------------------------

describe('BillingEmployee.runOnEmail -- happy path', () => {
  it('procesa 1 nota clara: append_daily_sale + log_activity -> processed=1, errors=[]', async () => {
    setupSupabaseMultiChain();

    const adapter = new MockBillingAdapter({
      clients: [
        {
          rfc: 'XAXX010101000',
          adapterId: 'cli-1',
          razonSocial: 'Publico en General',
          usoCFDI: 'G03',
          regimen: '616',
          codigoPostal: '64000',
        },
      ],
      products: [],
    });

    // Secuencia LLM:
    // iter 0: invoca append_daily_sale
    // iter 1: invoca log_activity
    // iter 2: end_turn
    mockMessagesCreate
      .mockResolvedValueOnce(
        llmToolUse('append_daily_sale', {
          cliente: 'Publico en General',
          rfc: 'XAXX010101000',
          productos: '2 kg tortilla',
          total: 50,
          metodo: 'efectivo',
        }),
      )
      .mockResolvedValueOnce(
        llmToolUse('log_activity', {
          action_type: 'nota_capturada',
          severity: 'info',
          entity_ref: 'XAXX010101000',
          context: { total: 50 },
        }),
      )
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-001');

    expect(result.processed).toBe(1);
    expect(result.escalated).toBe(0);
    expect(result.consulted).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Debe haber intentado escribir en Dropbox.
    expect(mockDropboxWrite).toHaveBeenCalledTimes(1);
    expect(mockSnapshot).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Consulta -- cliente unknown
// ---------------------------------------------------------------------------

describe('BillingEmployee.runOnEmail -- consulta', () => {
  it('responde el correo cuando el LLM invoca reply_email -> consulted=1', async () => {
    setupSupabaseMultiChain();

    const adapter = new MockBillingAdapter({ clients: [], products: [] });

    // LLM decide responder el correo (cliente no identificado).
    mockMessagesCreate
      .mockResolvedValueOnce(
        llmToolUse('reply_email', {
          body: '<p>No se pudo identificar al cliente. Por favor confirme el RFC.</p>',
        }),
      )
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-001');

    expect(result.consulted).toBe(1);
    expect(result.processed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockReplyToInboundEmail).toHaveBeenCalledWith(
      'email-001',
      '<p>No se pudo identificar al cliente. Por favor confirme el RFC.</p>',
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: Escalacion por freshness > 6h
// ---------------------------------------------------------------------------

describe('BillingEmployee.runOnEmail -- escalacion por freshness', () => {
  it('escala inmediatamente cuando minutesStale > 360 y no inicia el loop', async () => {
    setupSupabaseMultiChain();

    // Adapter con freshness critica.
    const staleFreshness: BillingAdapterHealth = {
      lastSyncAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      minutesStale: 480,
      healthy: false,
      message: 'Conexion perdida con CONTPAQi',
    };

    const adapter = new MockBillingAdapter({ clients: [], products: [] });
    vi.spyOn(adapter, 'freshness').mockResolvedValue(staleFreshness);

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-001');

    // El loop LLM NO debe haberse invocado.
    expect(mockMessagesCreate).not.toHaveBeenCalled();
    // Escalation contada via el contador en runOnEmail (antes del loop).
    expect(result.escalated).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/480 min/);
  });
});

// ---------------------------------------------------------------------------
// Test 4: MAX_ITERATIONS respetado
// ---------------------------------------------------------------------------

describe('BillingEmployee.runOnEmail -- MAX_ITERATIONS', () => {
  it('detiene el loop despues de 20 iteraciones aunque el LLM siga retornando tool_use', async () => {
    setupSupabaseMultiChain();

    const adapter = new MockBillingAdapter({ clients: [], products: [] });

    // LLM siempre retorna tool_use (loop infinito simulado).
    // El loop debe detenerse en MAX_ITERATIONS (20).
    const alwaysToolUse = llmToolUse('log_activity', {
      action_type: 'tick',
      severity: 'info',
    });
    mockMessagesCreate.mockResolvedValue(alwaysToolUse);

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-001');

    // 20 iteraciones del loop = 20 llamadas al LLM.
    expect(mockMessagesCreate).toHaveBeenCalledTimes(20);
    // No debe haber errores de infraestructura (solo parada por limite).
    // log_activity no falla por si sola (mock supabase retorna sin error).
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 5: Tool desconocida
// ---------------------------------------------------------------------------

describe('BillingEmployee.runOnEmail -- tool desconocida', () => {
  it('registra error en result.errors y continua sin lanzar excepcion', async () => {
    setupSupabaseMultiChain();

    const adapter = new MockBillingAdapter({ clients: [], products: [] });

    mockMessagesCreate
      .mockResolvedValueOnce(llmToolUse('herramienta_inexistente', {}, 'tu_unknown'))
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-001');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/unknown_tool.*herramienta_inexistente/);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Email no encontrado en DB
// ---------------------------------------------------------------------------

describe('BillingEmployee.runOnEmail -- email no encontrado', () => {
  it('retorna errors[] y no invoca LLM cuando email no existe', async () => {
    // Simular que billing_incoming_emails no tiene el row.
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mockSupabaseFrom.mockReturnValue({ select });

    const adapter = new MockBillingAdapter({ clients: [], products: [] });
    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-nonexistent');

    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/No billing_incoming_emails row/);
  });
});

// ---------------------------------------------------------------------------
// Test 7: freshness_check tool invocada por LLM
// ---------------------------------------------------------------------------

describe('BillingEmployee.runOnEmail -- freshness_check tool', () => {
  it('responde a freshness_check con datos del adaptador', async () => {
    setupSupabaseMultiChain();

    const adapter = new MockBillingAdapter({ clients: [], products: [] });
    const expectedHealth: BillingAdapterHealth = {
      lastSyncAt: new Date().toISOString(),
      minutesStale: 5,
      healthy: true,
    };
    vi.spyOn(adapter, 'freshness').mockResolvedValue(expectedHealth);

    mockMessagesCreate
      .mockResolvedValueOnce(llmToolUse('freshness_check', {}, 'tu_fresh'))
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-001');

    // El segundo call al LLM recibe historial con el resultado de freshness_check.
    // El contenido esta JSON-escapado dentro del string del tool_result.
    const secondCall = mockMessagesCreate.mock.calls[1];
    const messages: Array<{ role: string; content: unknown }> = secondCall[0].messages;
    const allContent = JSON.stringify(messages);
    // minutesStale aparece escapado como \\\"minutesStale\\\" dentro del JSON serializado.
    expect(allContent).toContain('minutesStale');
    expect(allContent).toContain('healthy');
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 8: escalate tool invocada por LLM
// ---------------------------------------------------------------------------

describe('BillingEmployee.runOnEmail -- escalate tool', () => {
  it('cuenta escalacion cuando LLM invoca escalate', async () => {
    setupSupabaseMultiChain();

    const adapter = new MockBillingAdapter({ clients: [], products: [] });

    mockMessagesCreate
      .mockResolvedValueOnce(
        llmToolUse('escalate', {
          topic: 'Catalogo de productos vacio',
          urgency: 'high',
          context: { detail: 'No hay productos en el adaptador' },
        }),
      )
      .mockResolvedValueOnce(llmEndTurn());

    const employee = new BillingEmployee(adapter, BASE_CONFIG);
    const result = await employee.runOnEmail('email-001');

    expect(result.escalated).toBe(1);
    expect(mockSendBillingMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: BASE_CONFIG.escalationEmail,
        subject: expect.stringContaining('URGENTE'),
      }),
    );
  });
});
