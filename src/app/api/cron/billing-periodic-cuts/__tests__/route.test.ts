/**
 * route.test.ts -- Unit tests for GET /api/cron/billing-periodic-cuts
 *
 * Covers:
 * 1. 401 when cron auth fails
 * 2. Friday run: processes weekly rules with cut_day='friday'
 * 3. Day-25 run: processes monthly rules with cut_day='25'
 * 4. Client with empty Pendientes.xlsx: skipped silently
 * 5. No matching rules today: processed=0
 * 6. Both weekly and monthly rules on same day: processed=2
 * 7. DB error on supabase query: 500 response
 * 8. processPeriodicCutForClient error surfaces per-rule without aborting the loop
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted shared mock refs
// ---------------------------------------------------------------------------

const {
  mockVerifyCronAuth,
  mockSupabaseFrom,
  mockDropboxRead,
  mockDropboxWrite,
  mockSnapshot,
  mockSupabaseInsert,
  mockSupabaseSelect,
} = vi.hoisted(() => ({
  mockVerifyCronAuth:   vi.fn(),
  mockSupabaseFrom:     vi.fn(),
  mockDropboxRead:      vi.fn(),
  mockDropboxWrite:     vi.fn(),
  mockSnapshot:         vi.fn(),
  mockSupabaseInsert:   vi.fn(),
  mockSupabaseSelect:   vi.fn(),
}));

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: (...args: unknown[]) => mockVerifyCronAuth(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockSupabaseFrom,
  }),
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

// ExcelJS workbook: we mock ExcelWorkbook so we do not need a real Buffer parse
vi.mock('@/lib/billing/excel/workbook', () => ({
  ExcelWorkbook: {
    empty: vi.fn(() => ({
      getRows:    vi.fn(() => []),
      appendRow:  vi.fn(),
      toBuffer:   vi.fn(async () => Buffer.from('empty')),
    })),
    fromBuffer: vi.fn(async (_buf: Buffer, _schema: unknown) => ({
      getRows:    vi.fn(() => [
        { num: 1, fecha: '2026-08-15', productos: 'Prod A', total: 100, metodo: 'efectivo', ventasSources: '1' },
        { num: 2, fecha: '2026-08-16', productos: 'Prod B', total: 200, metodo: 'efectivo', ventasSources: '2' },
      ]),
      appendRow:  vi.fn(),
      toBuffer:   vi.fn(async () => Buffer.from('new-history')),
      deleteRow:  vi.fn(() => 2),
      // Expose empty workbook for Pendientes after clearing
      emptyWorkbook: {
        getRows:   vi.fn(() => []),
        appendRow: vi.fn(),
        toBuffer:  vi.fn(async () => Buffer.from('cleared')),
      },
    })),
  },
}));

// Import the handler after all mocks are registered
import { GET } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/billing-periodic-cuts', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

/** Build a minimal billing_client_rules row. */
function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id:                     'rule-uuid-1',
    portal_email:           'cliente@empresa.mx',
    integration_id:         'integ-uuid-1',
    rfc:                    'XAXX010101000',
    frequency:              'weekly',
    cut_day:                'friday',
    default_payment_method: 'efectivo',
    ...overrides,
  };
}

/** Build a Supabase chainable query object */
function makeQuery(resolveWith: { data: unknown; error: unknown }) {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    or:     vi.fn().mockResolvedValue(resolveWith),
    // Support for the combined OR query path
    then: undefined as unknown,
  };
  return q;
}

// Simpler: builder where calling .select().eq().eq() eventually resolves via mock
function makeSbFrom(
  weeklyData: unknown[] | null,
  monthlyData: unknown[] | null,
  activityError: null | { message: string } = null,
) {
  let callCount = 0;
  return vi.fn((_table: string) => {
    callCount++;
    if (_table === 'billing_client_rules') {
      // Called twice: once for weekly, once for monthly
      const result = callCount === 1
        ? { data: weeklyData, error: null }
        : { data: monthlyData, error: null };
      return {
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        // The combined query uses a single or() call in the implementation
        // We handle it by returning the combined data on the first call
        then: vi.fn(),
      };
    }
    if (_table === 'billing_activity_log') {
      return {
        insert: vi.fn().mockResolvedValue({ error: activityError }),
      };
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: snapshot succeeds
  mockSnapshot.mockResolvedValue('snapshot-key');
  // Default: dropbox write succeeds
  mockDropboxWrite.mockResolvedValue('/written-path');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/billing-periodic-cuts', () => {

  it('returns 401 when cron auth fails', async () => {
    mockVerifyCronAuth.mockReturnValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'unauthorized' });
  });

  it('returns processed=0 when no matching rules today (no weekly, no monthly)', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    // Supabase from: billing_client_rules returns empty arrays for both queries
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      or:     vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.results).toHaveLength(0);
  });

  it('processes weekly rules when today cut_day matches (friday scenario)', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    const weeklyRule = makeRule({ frequency: 'weekly', cut_day: 'friday' });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'billing_client_rules') {
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          or:     vi.fn().mockResolvedValue({ data: [weeklyRule], error: null }),
        };
      }
      if (table === 'organization_integrations') {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'billing_activity_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    // Dropbox: file exists with 2 pending rows (fromBuffer mock returns 2 rows)
    mockDropboxRead.mockResolvedValue(Buffer.from('pendientes-data'));

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].rfc).toBe('XAXX010101000');
    expect(body.results[0].invoiced).toBe(2);
  });

  it('processes monthly rules when today cut_day matches (day 25 scenario)', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    const monthlyRule = makeRule({ frequency: 'monthly', cut_day: '25' });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'billing_client_rules') {
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          or:     vi.fn().mockResolvedValue({ data: [monthlyRule], error: null }),
        };
      }
      if (table === 'organization_integrations') {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'billing_activity_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    mockDropboxRead.mockResolvedValue(Buffer.from('pendientes-data'));

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.results[0].rfc).toBe('XAXX010101000');
    expect(body.results[0].invoiced).toBe(2);
  });

  it('skips silently when Pendientes.xlsx is empty (no rows)', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    const weeklyRule = makeRule();

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'billing_client_rules') {
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          or:     vi.fn().mockResolvedValue({ data: [weeklyRule], error: null }),
        };
      }
      if (table === 'organization_integrations') {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'billing_activity_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    // Dropbox: file not found -> triggers { skipped: 'empty' } path
    mockDropboxRead.mockRejectedValue(new Error('path not found'));

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.results[0].skipped).toBe('empty');
  });

  it('processes both weekly and monthly rules when both apply on same day', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    const weeklyRule  = makeRule({ id: 'rule-1', rfc: 'RFC001', frequency: 'weekly',  cut_day: 'friday' });
    const monthlyRule = makeRule({ id: 'rule-2', rfc: 'RFC002', frequency: 'monthly', cut_day: '17' });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'billing_client_rules') {
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          or:     vi.fn().mockResolvedValue({ data: [weeklyRule, monthlyRule], error: null }),
        };
      }
      if (table === 'organization_integrations') {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'billing_activity_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    mockDropboxRead.mockResolvedValue(Buffer.from('pendientes-data'));

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(body.results).toHaveLength(2);
  });

  it('returns 500 when billing_client_rules query fails', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'billing_client_rules') {
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          or:     vi.fn().mockResolvedValue({ data: null, error: { message: 'DB connection refused' } }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('DB connection refused');
  });

  it('surfaces per-rule errors without aborting the entire loop', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    const rule1 = makeRule({ id: 'rule-ok',  rfc: 'RFC001' });
    const rule2 = makeRule({ id: 'rule-bad', rfc: 'RFC002' });

    // Both rules return data from Dropbox but snapshot throws for RFC002
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'billing_client_rules') {
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          or:     vi.fn().mockResolvedValue({ data: [rule1, rule2], error: null }),
        };
      }
      if (table === 'organization_integrations') {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'billing_activity_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    // Both rules successfully read Pendientes.xlsx
    mockDropboxRead.mockResolvedValue(Buffer.from('pendientes-data'));

    // Snapshot fails for RFC002 (path includes RFC002), succeeds for RFC001
    mockSnapshot.mockImplementation(async (_orgKey: string, filePath: string) => {
      if (filePath.includes('RFC002')) {
        throw new Error('Storage quota exceeded');
      }
      return 'snapshot-key';
    });

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(2);
    const okResult  = body.results.find((r: { rfc: string }) => r.rfc === 'RFC001');
    const errResult = body.results.find((r: { rfc: string }) => r.rfc === 'RFC002');
    expect(okResult.invoiced).toBe(2);
    expect(errResult.error).toBeDefined();
  });

});
