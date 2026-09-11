/**
 * Tests del helper submit-approved. Cubre:
 *  - 0 approved → no-op.
 *  - N approved sin xml_path → llama adapter una vez por pending y marca extracted.xml_path.
 *  - Row con xml_path preexistente → se salta (idempotencia).
 *  - Corrections con productos/rfc_matched/fecha → overrides.
 *  - Sin RFC o sin líneas → skip con reason.
 *  - Error del adapter → error surfaced, sin marcar la row.
 */
import { describe, it, expect, vi } from 'vitest';
import { submitApprovedForEmail } from '../submit-approved';
import type { BillingAdapter, BillingBatchResult, BillingInvoice } from '../../adapter';

// -- Mock adapter (solo submitInvoiceBatch matters) -------------------------

function makeAdapter(overrides: Partial<BillingAdapter> = {}): BillingAdapter {
  const noop = async () => { throw new Error('not used in test'); };
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
      ref:  `/mock/pendientes/inv_${invs[0]?.clientRFC ?? 'X'}_${invs[0]?.date ?? 'D'}.xml`,
      errors: [],
    }),
    ...overrides,
  } as BillingAdapter;
}

// -- Supabase mock builder --------------------------------------------------

interface PendingRow {
  id:            string;
  status:        string;
  productos:     unknown;
  rfc_matched:   string | null;
  fecha:         string | null;
  extracted:     Record<string, unknown> | null;
  corrections:   Record<string, unknown> | null;
  portal_email:  string;
  email_id:      string;
}

function makeSupabase(rows: PendingRow[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const filter = { portal_email: '', email_id: '', statuses: [] as string[] };

  const selectBuilder = {
    eq(col: string, val: string) {
      if (col === 'portal_email') filter.portal_email = val;
      if (col === 'email_id')     filter.email_id = val;
      return selectBuilder;
    },
    in(col: string, vals: string[]) {
      if (col === 'status') filter.statuses = vals;
      const matched = rows.filter(r =>
        r.portal_email === filter.portal_email
          && r.email_id === filter.email_id
          && filter.statuses.includes(r.status),
      );
      // Return a thenable so `await` on the builder resolves to { data, error }.
      return Promise.resolve({ data: matched, error: null });
    },
  };

  const updateBuilder = (patch: Record<string, unknown>) => ({
    eq: async (col: string, val: string) => {
      if (col === 'id') {
        updates.push({ id: val, patch });
        const row = rows.find(r => r.id === val);
        if (row && 'extracted' in patch) row.extracted = patch['extracted'] as Record<string, unknown>;
      }
      return { error: null };
    },
  });

  const supabase = {
    from(_table: string) {
      return {
        select: (_cols: string) => selectBuilder,
        update: (patch: Record<string, unknown>) => updateBuilder(patch),
      };
    },
    // Mock de la RPC claim_pending_for_submit: siempre concede el claim
    // (los tests no ejercen concurrencia). Preserva `extracted` de la row.
    rpc: async (fn: string, args: { p_id: string; p_stale_seconds?: number }) => {
      if (fn !== 'claim_pending_for_submit') return { data: null, error: null };
      const row = rows.find(r => r.id === args.p_id);
      if (!row) return { data: [], error: null };
      const extractedWithClaim = {
        ...(row.extracted ?? {}),
        submit_started_at: new Date().toISOString(),
      };
      return { data: [{ id: row.id, extracted: extractedWithClaim }], error: null };
    },
  };

  return { supabase: supabase as unknown as Parameters<typeof submitApprovedForEmail>[0]['supabase'], updates };
}

// -- Fixtures ---------------------------------------------------------------

const basePending = (o: Partial<PendingRow> = {}): PendingRow => ({
  id:           'p1',
  status:       'approved',
  productos:    [{ sku: '045', qty: 20, unitPrice: 15 }],
  rfc_matched:  'CAL960522981',
  fecha:        '2026-09-08',
  extracted:    { metodo_pago: 'PUE', uso_cfdi: 'G03', serie: 'FTEN' },
  corrections:  null,
  portal_email: 'servicioalcliente@tortillasestrella.com.mx',
  email_id:     'e1',
  ...o,
});

const INPUT = {
  portalEmail: 'servicioalcliente@tortillasestrella.com.mx',
  emailId:     'e1',
};

// -- Tests ------------------------------------------------------------------

describe('submitApprovedForEmail', () => {
  it('sin candidates → no-op sin llamar adapter', async () => {
    const { supabase } = makeSupabase([]);
    const submit = vi.fn();
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    const r = await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    expect(r.candidateCount).toBe(0);
    expect(r.submitted).toEqual([]);
    expect(submit).not.toHaveBeenCalled();
  });

  it('N approved sin xml_path → llama adapter una vez por pending y persiste extracted.xml_path', async () => {
    const rows = [
      basePending({ id: 'p1', rfc_matched: 'AAA010101AAA' }),
      basePending({ id: 'p2', rfc_matched: 'BBB020202BBB' }),
    ];
    const { supabase, updates } = makeSupabase(rows);
    const submit = vi.fn().mockImplementation(async (invs: BillingInvoice[]) => ({
      mode: 'file' as const,
      ref:  `/dbx/pendientes/${invs[0].clientRFC}.xml`,
      errors: [],
    }));
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    const r = await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    expect(r.candidateCount).toBe(2);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(r.submitted.map(s => s.xmlPath).sort()).toEqual([
      '/dbx/pendientes/AAA010101AAA.xml',
      '/dbx/pendientes/BBB020202BBB.xml',
    ]);
    // Ambas rows marcadas.
    expect(updates).toHaveLength(2);
    expect(updates.every(u => (u.patch['extracted'] as Record<string, unknown>)['xml_path'])).toBe(true);
  });

  it('idempotencia: row con extracted.xml_path preexistente se salta', async () => {
    const rows = [
      basePending({ id: 'p1', extracted: { xml_path: '/dbx/pendientes/prev.xml', metodo_pago: 'PUE' } }),
      basePending({ id: 'p2', rfc_matched: 'BBB020202BBB' }),
    ];
    const { supabase } = makeSupabase(rows);
    const submit = vi.fn().mockResolvedValue({ mode: 'file', ref: '/dbx/new.xml', errors: [] });
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    const r = await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    expect(r.candidateCount).toBe(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('corrections aplica overrides sobre productos/rfc_matched/fecha', async () => {
    const rows = [basePending({
      id: 'p1',
      status: 'edited_approved',
      corrections: {
        rfc_matched: 'ZZZ999999ZZZ',
        fecha:       '2026-09-10',
        productos:   [{ sku: '099', cantidad: 3, precio: 100 }],
      },
    })];
    const { supabase } = makeSupabase(rows);
    const submit = vi.fn().mockResolvedValue({ mode: 'file', ref: '/dbx/x.xml', errors: [] });
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    const invs = submit.mock.calls[0][0] as BillingInvoice[];
    expect(invs[0].clientRFC).toBe('ZZZ999999ZZZ');
    expect(invs[0].date).toBe('2026-09-10');
    expect(invs[0].lines).toEqual([{ sku: '099', qty: 3, unitPrice: 100, ivaTasa: 0 }]);
  });

  it('skip: sin RFC → reason surfaced, sin llamar adapter', async () => {
    const rows = [basePending({ id: 'p1', rfc_matched: null })];
    const { supabase } = makeSupabase(rows);
    const submit = vi.fn();
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    const r = await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    expect(r.submitted).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/rfc/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it('skip: productos vacío → reason surfaced', async () => {
    const rows = [basePending({ id: 'p1', productos: [] })];
    const { supabase } = makeSupabase(rows);
    const submit = vi.fn();
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    const r = await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/líneas|productos/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it('adapter throw → error acumulado, no marca xml_path', async () => {
    const rows = [basePending({ id: 'p1' })];
    const { supabase, updates } = makeSupabase(rows);
    const submit = vi.fn().mockRejectedValue(new Error('dropbox 500'));
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    const r = await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    expect(r.submitted).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].reason).toMatch(/dropbox 500/);
    // Ninguna update debe setear xml_path (puede haber release del claim).
    expect(updates.some(u => (u.patch['extracted'] as Record<string, unknown>)?.['xml_path'])).toBe(false);
  });

  it('adapter reporta errors → surfaced sin marcar row', async () => {
    const rows = [basePending({ id: 'p1' })];
    const { supabase, updates } = makeSupabase(rows);
    const submit = vi.fn().mockResolvedValue({
      mode: 'file',
      ref: '',
      errors: [{ invoiceIndex: 0, reason: 'RFC inválido' }],
    });
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    const r = await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].reason).toMatch(/RFC inválido/);
    // Ninguna update debe setear xml_path (puede haber release del claim).
    expect(updates.some(u => (u.patch['extracted'] as Record<string, unknown>)?.['xml_path'])).toBe(false);
  });

  it('metodoPago default PUE si extracted no lo tiene', async () => {
    const rows = [basePending({ id: 'p1', extracted: {} })];
    const { supabase } = makeSupabase(rows);
    const submit = vi.fn().mockResolvedValue({ mode: 'file', ref: '/x.xml', errors: [] });
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    const invs = submit.mock.calls[0][0] as BillingInvoice[];
    expect(invs[0].metodoPago).toBe('PUE');
  });

  it('metodoPago PPD si extracted.metodo_pago=PPD (crédito)', async () => {
    const rows = [basePending({ id: 'p1', extracted: { metodo_pago: 'PPD' } })];
    const { supabase } = makeSupabase(rows);
    const submit = vi.fn().mockResolvedValue({ mode: 'file', ref: '/x.xml', errors: [] });
    const adapter = makeAdapter({ submitInvoiceBatch: submit });

    await submitApprovedForEmail({ ...INPUT, supabase, adapter });
    const invs = submit.mock.calls[0][0] as BillingInvoice[];
    expect(invs[0].metodoPago).toBe('PPD');
  });
});
