/**
 * Tests de humo para runExcelFlow — el orquestador end-to-end del fast-path
 * Excel. Cubre: happy path (parse + insert + auto-approve + submit), idempotencia
 * por email_id, ausencia de mapping, sin adapter (skip submit).
 *
 * Usa Supabase mock chainable y adapter mock. NO toca red ni DB real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runExcelFlow } from '../excel-flow';
import type { BillingAdapter, BillingBatchResult, BillingInvoice } from '../../adapter';
import type { TortilleriaMapping } from '../types';

// --- Mock del mapping-store (getTortilleriaMapping) ---
let currentMapping: TortilleriaMapping | null = null;
vi.mock('../mapping-store', () => ({
  getTortilleriaMapping: vi.fn(async () => currentMapping),
}));

// --- Mock del sendMeerkatHtmlEmail (notif Beatriz) ---
const mockSendMeerkat = vi.fn().mockResolvedValue({ ok: true, provider: 'resend' });
vi.mock('@/lib/email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: (...args: unknown[]) => mockSendMeerkat(...args),
}));

// --- Adapter mock ---
function makeAdapter(overrides: Partial<BillingAdapter> = {}): BillingAdapter {
  const noop = async () => { throw new Error('not used'); };
  return {
    name: 'TestAdapter',
    searchClient:      noop,
    searchProduct:     noop,
    getClientByRFC:    noop,
    getProductBySKU:   noop,
    listAllClients:    async () => [],
    listAllProducts:   async () => [],
    freshness:         async () => ({ lastSyncAt: null, minutesStale: 0, healthy: true }),
    supportsAutoStamping: () => false,
    submitInvoiceBatch: async (invs: BillingInvoice[]): Promise<BillingBatchResult> => ({
      mode: 'file',
      ref:  `/mock/${invs[0]?.clientRFC ?? 'X'}.xml`,
      errors: [],
    }),
    ...overrides,
  } as BillingAdapter;
}

// --- Supabase mock chainable ---
interface DbState {
  pendingRows: Array<Record<string, unknown>>;
  emails:      Array<{ id: string; raw_payload: Record<string, unknown> | null }>;
}

function makeSupabase(state: DbState) {
  const supabase = {
    from(table: string) {
      return {
        select(_cols: string) {
          const chain = {
            _table: table,
            _filters: {} as Record<string, unknown>,
            _statuses: [] as string[],
            eq(col: string, val: unknown) {
              (this as unknown as { _filters: Record<string, unknown> })._filters[col] = val;
              return this;
            },
            in(col: string, vals: string[]) {
              if (col === 'status') (this as unknown as { _statuses: string[] })._statuses = vals;
              return this;
            },
            limit(_n: number) {
              return this._resolve();
            },
            maybeSingle() {
              const rows = this._filter();
              return Promise.resolve({ data: rows[0] ?? null, error: null });
            },
            _resolve() {
              const rows = this._filter();
              return Promise.resolve({ data: rows, error: null });
            },
            _filter() {
              const _self = this as unknown as { _table: string; _filters: Record<string, unknown>; _statuses: string[] };
              if (_self._table === 'billing_pending_review') {
                return state.pendingRows.filter(r => {
                  for (const [k, v] of Object.entries(_self._filters)) {
                    if ((r as Record<string, unknown>)[k] !== v) return false;
                  }
                  if (_self._statuses.length > 0) {
                    if (!_self._statuses.includes((r as Record<string, unknown>)['status'] as string)) return false;
                  }
                  return true;
                });
              }
              if (_self._table === 'billing_incoming_emails') {
                return state.emails.filter(e => {
                  for (const [k, v] of Object.entries(_self._filters)) {
                    if ((e as unknown as Record<string, unknown>)[k] !== v) return false;
                  }
                  return true;
                });
              }
              return [];
            },
            then(onFulfilled: (v: unknown) => unknown) {
              return this._resolve().then(onFulfilled);
            },
          };
          return chain as unknown as { eq: (c: string, v: unknown) => typeof chain; in: (c: string, v: string[]) => typeof chain; limit: (n: number) => Promise<{ data: unknown[]; error: null }>; maybeSingle: () => Promise<{ data: unknown; error: null }>; then: (fn: (v: unknown) => unknown) => Promise<unknown> };
        },
        insert(rows: Array<Record<string, unknown>>) {
          if (table === 'billing_pending_review') {
            state.pendingRows.push(...rows.map(r => ({ ...r, id: `pend-${state.pendingRows.length + rows.indexOf(r)}` })));
          }
          return Promise.resolve({ error: null });
        },
        // upsert con ignoreDuplicates: en el mock tratamos igual que insert
        // (los tests no ejercen colisiones reales; la unicidad se prueba en DB).
        upsert(rows: Array<Record<string, unknown>>, _opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          if (table === 'billing_pending_review') {
            state.pendingRows.push(...rows.map(r => ({ ...r, id: `pend-${state.pendingRows.length + rows.indexOf(r)}` })));
          }
          return Promise.resolve({ error: null });
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: (col: string, val: unknown) => {
              if (table === 'billing_incoming_emails') {
                for (const e of state.emails) {
                  if ((e as unknown as Record<string, unknown>)[col] === val) {
                    Object.assign(e, patch);
                  }
                }
              }
              if (table === 'billing_pending_review') {
                for (const r of state.pendingRows) {
                  if (r[col] === val) Object.assign(r, patch);
                }
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { supabase: supabase as unknown as Parameters<typeof runExcelFlow>[0]['supabase'], state };
}

// --- Fixture: cargar el xlsx real Cardenas para probar E2E ---
const FIXTURE = join(__dirname, '..', '..', 'parsers', '__tests__', 'fixtures', 'varios.xlsx');
const cardenasXlsx = readFileSync(FIXTURE);

// Mapping mínimo que resuelve Cardenas.
const SIMPLE_MAPPING: TortilleriaMapping = {
  version: '1.0',
  updatedAt: '2026-09-09',
  creditCodes: [],
  consolidationRules: [],
  clients: [
    { titlePattern: 'CARDENAS ALIMENTOS', codigo: '045', rfc: 'CAL960522981' },
  ],
  products: [
    { columnaPattern: 'ESTRELLA 1/2', sku: '021', claveSat: '50161509', unidadSat: 'H87' },
    { columnaPattern: 'RANCHO 1/2',   sku: '022', claveSat: '50161509', unidadSat: 'H87' },
  ],
};

const BASE_INPUT = {
  portalEmail: 'test@localhost',
  emailId:     'email-abc',
  agentId:     'agent-1',
  attachments: [{
    filename:    'varios.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer:      cardenasXlsx,
    index:       0,
  }],
  config: {
    rfcEmisor:          'TES010101ABC',
    serieDefault:       'A',
    usoCFDIDefault:     'G01',
    claveSATDefault:    '50161509',
    regimenFiscal:      '601',
    codigoPostalEmisor: '64000',
  },
};

beforeEach(() => {
  mockSendMeerkat.mockClear();
});

describe('runExcelFlow — happy path', () => {
  it('parsea, inserta cards y auto-aprueba las que pasan checks', async () => {
    currentMapping = SIMPLE_MAPPING;
    const { supabase, state } = makeSupabase({ pendingRows: [], emails: [] });
    const adapter = makeAdapter();

    const r = await runExcelFlow({ ...BASE_INPUT, supabase, adapter });

    expect(r.processed).toBe(true);
    expect(r.invoiceCount).toBeGreaterThan(0);
    expect(r.cardCount).toBe(r.invoiceCount);
    // Cardenas debe auto-aprobarse (RFC OK, total cuadra, precios > 0, SKUs OK)
    const cardenas = state.pendingRows.find(row => row['rfc_matched'] === 'CAL960522981');
    expect(cardenas).toBeDefined();
    expect(cardenas!['status']).toBe('approved');
  });

  it('adapter recibe invoices auto-aprobadas para submit', async () => {
    currentMapping = SIMPLE_MAPPING;
    const submitSpy = vi.fn().mockResolvedValue({ mode: 'file', ref: '/x.xml', errors: [] });
    const adapter = makeAdapter({ submitInvoiceBatch: submitSpy });
    const { supabase } = makeSupabase({ pendingRows: [], emails: [] });

    await runExcelFlow({ ...BASE_INPUT, supabase, adapter });

    expect(submitSpy).toHaveBeenCalled();
  });
});

describe('runExcelFlow — idempotencia', () => {
  it('segunda corrida con mismo emailId no re-parsea ni duplica cards', async () => {
    currentMapping = SIMPLE_MAPPING;
    const { supabase, state } = makeSupabase({
      pendingRows: [{
        id:            'existing-1',
        portal_email:  BASE_INPUT.portalEmail,
        email_id:      BASE_INPUT.emailId,
        status:        'pending',
        productos:     [],
        rfc_matched:   null,
        fecha:         null,
        extracted:     {},
        corrections:   null,
      }],
      emails: [],
    });
    const adapter = makeAdapter();

    const r = await runExcelFlow({ ...BASE_INPUT, supabase, adapter });

    expect(r.processed).toBe(true);
    expect(r.invoiceCount).toBe(0);
    expect(r.cardCount).toBe(0);
    expect(state.pendingRows.length).toBe(1); // no se agregaron nuevas
  });
});

describe('runExcelFlow — sin mapping', () => {
  it('retorna error si no hay tortilleria_mapping configurado', async () => {
    currentMapping = null;
    const { supabase } = makeSupabase({ pendingRows: [], emails: [] });
    const adapter = makeAdapter();

    const r = await runExcelFlow({ ...BASE_INPUT, supabase, adapter });

    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].reason).toMatch(/tortilleria_mapping/i);
  });
});

describe('runExcelFlow — sin adapter', () => {
  it('procesa cards pero no submitea (submitted vacío)', async () => {
    currentMapping = SIMPLE_MAPPING;
    const { supabase } = makeSupabase({ pendingRows: [], emails: [] });

    const r = await runExcelFlow({ ...BASE_INPUT, supabase });

    expect(r.processed).toBe(true);
    expect(r.cardCount).toBeGreaterThan(0);
    expect(r.submitted).toEqual([]);
  });
});

describe('runExcelFlow — notif email', () => {
  it('envía notif si hay pendingCount > 0 y hay clientEmail', async () => {
    currentMapping = SIMPLE_MAPPING;
    const { supabase } = makeSupabase({
      pendingRows: [],
      emails:      [{ id: BASE_INPUT.emailId, raw_payload: null }],
    });
    const adapter = makeAdapter();

    const r = await runExcelFlow({
      ...BASE_INPUT,
      supabase,
      adapter,
      clientEmail:  'beatriz@example.com',
      businessName: 'Tortillería Test',
    });

    // Debe haber pendings (Cardenas es OK pero Silla, DCA, etc. fallan checks)
    expect(r.pendingCount).toBeGreaterThan(0);
    expect(mockSendMeerkat).toHaveBeenCalledOnce();
    const call = mockSendMeerkat.mock.calls[0][0] as { subject: string; to: string };
    expect(call.to).toBe('beatriz@example.com');
    expect(call.subject).toContain('Tortillería Test');
  });

  it('NO envía notif si clientEmail está ausente', async () => {
    currentMapping = SIMPLE_MAPPING;
    const { supabase } = makeSupabase({
      pendingRows: [],
      emails:      [{ id: BASE_INPUT.emailId, raw_payload: null }],
    });
    const adapter = makeAdapter();

    await runExcelFlow({ ...BASE_INPUT, supabase, adapter });

    expect(mockSendMeerkat).not.toHaveBeenCalled();
  });
});
