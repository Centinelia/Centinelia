/**
 * setup.ts -- Shared fixtures and mock helpers for billing-employee E2E tests.
 *
 * All tests in this directory wire up:
 *   - vi.mock for @anthropic-ai/sdk (prefabricated LLM responses)
 *   - vi.mock for @/lib/supabase/admin (in-memory store)
 *   - vi.mock for @/lib/billing/storage/dropbox (in-memory file system)
 *   - vi.mock for @/lib/billing/storage/snapshot (no-op)
 *   - vi.mock for @/lib/billing/mail/send (captured calls)
 *   - MockBillingAdapter parametrizable via MOCK_DATA
 *
 * Each test file imports the shared mock refs exposed here. The vi.mock()
 * declarations must live in each test file (Vitest hoisting requirement), but
 * this module centralises fixtures and per-test reset helpers.
 */

import { vi } from 'vitest';
import type { BillingClient, BillingProduct, BillingAdapterHealth } from '@/lib/billing/adapter';
import type { BillingEmployeeConfig } from '@/lib/billing/employee/loop';
import { ExcelWorkbook } from '@/lib/billing/excel/workbook';
import { DailySalesSchema, PendingClientSchema } from '@/lib/billing/excel/schemas';

// ---------------------------------------------------------------------------
// Shared mock function refs -- re-exported for test files to import
// ---------------------------------------------------------------------------

export const mockMessagesCreate = vi.fn();
export const mockSupabaseFrom = vi.fn();
export const mockDropboxRead = vi.fn();
export const mockDropboxWrite = vi.fn();
export const mockSnapshot = vi.fn();
export const mockReplyToInboundEmail = vi.fn();
export const mockSendBillingMail = vi.fn();

// ---------------------------------------------------------------------------
// Catalog fixtures
// ---------------------------------------------------------------------------

export const CLIENT_DAILY: BillingClient = {
  rfc: 'XAXX010101000',
  adapterId: 'cli-daily',
  razonSocial: 'Publico en General',
  usoCFDI: 'G03',
  regimen: '616',
  codigoPostal: '64000',
};

export const CLIENT_WEEKLY: BillingClient = {
  rfc: 'MASC850101ABC',
  adapterId: 'cli-weekly',
  razonSocial: 'Maria Sanchez Catering',
  usoCFDI: 'G01',
  regimen: '612',
  codigoPostal: '64010',
};

/** Two clients with similar names to trigger ambiguity. */
export const CLIENT_AMBIGUOUS_A: BillingClient = {
  rfc: 'GOCA800101AAA',
  adapterId: 'cli-goca-a',
  razonSocial: 'Gonzalez Castillo',
  usoCFDI: 'G03',
  regimen: '612',
  codigoPostal: '64020',
};

export const CLIENT_AMBIGUOUS_B: BillingClient = {
  rfc: 'GOCA800101BBB',
  adapterId: 'cli-goca-b',
  razonSocial: 'Gonzalez Castillo Norte',
  usoCFDI: 'G03',
  regimen: '612',
  codigoPostal: '64030',
};

export const PRODUCT_TORTILLA: BillingProduct = {
  sku: 'TORT-001',
  nombre: 'Tortilla de maiz 1kg',
  unidad: 'kg',
  precio: 25,
  claveSAT: '50171500',
  ivaTasa: 0,
};

// ---------------------------------------------------------------------------
// Shared BillingEmployee config
// ---------------------------------------------------------------------------

export const BASE_CONFIG: BillingEmployeeConfig = {
  portalEmail: 'empresa@example.com',
  integrationId: 'integ-e2e-001',
  dropboxToken: 'dbx-mock-token',
  dropboxBasePath: '/Facturacion',
  escalationEmail: 'contadora@example.com',
  orgName: 'Empresa E2E Test',
};

// ---------------------------------------------------------------------------
// In-memory file system for MockDropboxClient
// ---------------------------------------------------------------------------

export type InMemoryFS = Map<string, Buffer>;

export function createInMemoryFS(): InMemoryFS {
  return new Map();
}

/**
 * Configures the Dropbox mock fns to read/write against an in-memory Map.
 *
 * IMPORTANT: Pass the local `mockDropboxRead` / `mockDropboxWrite` refs from
 * the test file (created via vi.hoisted), not the exported ones from this
 * module. This ensures the correct mock instance is wired.
 *
 * Usage in test files:
 *   wireDropboxToFS(fs, mockDropboxRead, mockDropboxWrite)
 */
export function wireDropboxToFS(
  fs: InMemoryFS,
  readFn: ReturnType<typeof vi.fn>,
  writeFn: ReturnType<typeof vi.fn>,
) {
  readFn.mockImplementation(async (path: string) => {
    const buf = fs.get(path);
    if (!buf) throw new Error(`File not found in mock FS: ${path}`);
    return buf;
  });
  writeFn.mockImplementation(async (path: string, buf: Buffer) => {
    fs.set(path, buf);
    return path;
  });
}

// ---------------------------------------------------------------------------
// Supabase chain helpers
// ---------------------------------------------------------------------------

/**
 * Simple supabase mock that handles all common query patterns:
 *   - Returns emailRow for select().eq().maybeSingle() (billing_incoming_emails).
 *   - Returns [] for limit() calls (rules, aliases queries).
 *   - Returns { error: null } for insert() calls (activity log, etc.).
 *   - Handles contains() for alias lookups.
 *
 * IMPORTANT: Pass the local `fromFn` ref from the test file (created via vi.hoisted),
 * not the exported mockSupabaseFrom from this module.
 */
export function setupSupabaseChain(
  fromFn: ReturnType<typeof vi.fn>,
  emailRow: Record<string, unknown> | null = null,
) {
  fromFn.mockImplementation((_table: string) => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: emailRow, error: null });
    const single = vi.fn().mockResolvedValue({ data: emailRow, error: null });
    const limitFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const containsFn = vi.fn();
    const eqFn = vi.fn();

    containsFn.mockReturnValue({ maybeSingle });
    eqFn.mockReturnValue({
      maybeSingle,
      single,
      limit: limitFn,
      eq: eqFn,
      contains: containsFn,
    });

    const selectResult = {
      eq: eqFn,
      maybeSingle,
      limit: limitFn,
      contains: containsFn,
    };

    return {
      select: vi.fn().mockReturnValue(selectResult),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// LLM response builders
// ---------------------------------------------------------------------------

/** LLM stops invoking tools -- end of loop. */
export function llmEndTurn(text = 'Proceso completado.') {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
  };
}

/** LLM invokes a single tool. */
export function llmToolUse(name: string, input: object, id = 'tu_001') {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id, name, input }],
  };
}

/** LLM invokes multiple tools in one turn. */
export function llmMultiToolUse(tools: Array<{ name: string; input: object; id?: string }>) {
  return {
    stop_reason: 'tool_use',
    content: tools.map((t, i) => ({
      type: 'tool_use',
      id: t.id ?? `tu_${i.toString().padStart(3, '0')}`,
      name: t.name,
      input: t.input,
    })),
  };
}

// ---------------------------------------------------------------------------
// Email row factory
// ---------------------------------------------------------------------------

export function makeEmailRow(overrides: Partial<{
  id: string;
  from_address: string;
  subject: string;
  body_text: string;
  attachments_meta: unknown[];
  received_at: string;
  message_id: string;
}> = {}) {
  return {
    id: 'email-e2e-001',
    from_address: 'cliente@tortilleria.com',
    subject: 'Notitas del dia',
    body_text: 'Le mando las notitas de hoy.',
    attachments_meta: [{ filename: 'nota1.jpg', contentType: 'image/jpeg' }],
    received_at: new Date().toISOString(),
    message_id: '<msg-001@tortilleria.com>',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Default adapter freshness (healthy)
// ---------------------------------------------------------------------------

export const HEALTHY_FRESHNESS: BillingAdapterHealth = {
  lastSyncAt: new Date().toISOString(),
  minutesStale: 0,
  healthy: true,
};

export const STALE_FRESHNESS: BillingAdapterHealth = {
  lastSyncAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  minutesStale: 35,
  healthy: false,
  message: 'Scheduled task has not run in 35 minutes',
};

export const CRITICAL_FRESHNESS: BillingAdapterHealth = {
  lastSyncAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
  minutesStale: 480,
  healthy: false,
  message: 'Conexion perdida con adaptador',
};

// ---------------------------------------------------------------------------
// Excel helpers
// ---------------------------------------------------------------------------

/** Build a DailySales Excel buffer with given rows. */
export async function buildDailyExcel(rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = ExcelWorkbook.empty(DailySalesSchema);
  for (const row of rows) {
    wb.appendRow('Ventas', row);
  }
  return wb.toBuffer();
}

/** Build a PendingClient Excel buffer with given rows. */
export async function buildPendingExcel(rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = ExcelWorkbook.empty(PendingClientSchema);
  for (const row of rows) {
    wb.appendRow('Pendientes', row);
  }
  return wb.toBuffer();
}

/** Read all rows from a DailySales Buffer. */
export async function readDailyRows(buf: Buffer): Promise<Record<string, unknown>[]> {
  const wb = await ExcelWorkbook.fromBuffer(buf, DailySalesSchema);
  return wb.getRows('Ventas');
}

/** Read all rows from a PendingClient Buffer. */
export async function readPendingRows(buf: Buffer): Promise<Record<string, unknown>[]> {
  const wb = await ExcelWorkbook.fromBuffer(buf, PendingClientSchema);
  return wb.getRows('Pendientes');
}

/** Fake image buffer -- any Buffer works; vision AI is mocked. */
export const FAKE_IMAGE_BUFFER = Buffer.from('fake-image-data');
