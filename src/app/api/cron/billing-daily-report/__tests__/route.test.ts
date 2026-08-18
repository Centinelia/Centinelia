/**
 * route.test.ts -- Unit tests for GET /api/cron/billing-daily-report
 *
 * Covers:
 * 1. 401 when cron auth fails
 * 2. No integrations: processed=0, no mail
 * 3. Sends report to config.report_recipients when present
 * 4. Falls back to BILLING_ESCALATION_EMAIL when no recipients configured
 * 5. Skips integration with no recipients and no fallback
 * 6. Per-integration errors do not abort the loop
 * 7. Returns processed count equal to integrations count
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock refs
// ---------------------------------------------------------------------------

const {
  mockVerifyCronAuth,
  mockSupabaseFrom,
  mockBuildDailyReport,
  mockSendDailyReport,
} = vi.hoisted(() => ({
  mockVerifyCronAuth:     vi.fn(),
  mockSupabaseFrom:       vi.fn(),
  mockBuildDailyReport:   vi.fn(),
  mockSendDailyReport:    vi.fn(),
}));

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: (...args: unknown[]) => mockVerifyCronAuth(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockSupabaseFrom }),
}));

vi.mock('@/lib/billing/reports/daily', () => ({
  buildDailyReport: (...args: unknown[]) => mockBuildDailyReport(...args),
  sendDailyReport:  (...args: unknown[]) => mockSendDailyReport(...args),
}));

import { GET } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/billing-daily-report', { method: 'GET' });
}

function makeIntegration(overrides: Partial<{
  id: string;
  portal_email: string;
  config: Record<string, unknown> | null;
}> = {}) {
  return {
    id:           'integ-uuid-1',
    portal_email: 'empresa@example.mx',
    config: {
      dropbox_token:      'tok-abc',
      dropbox_base_path:  '/Facturacion/2026',
      report_recipients:  ['contadora@empresa.mx'],
    },
    ...overrides,
  };
}

const MOCK_REPORT = {
  date: '2026-08-18',
  processed: 10,
  escalated: 0,
  consulted: 2,
  totalFacturado: 1500,
  totalNoFacturado: 0,
  requiereAtencion: [],
  dailyExcelPath: '/Facturacion/2026/diario/Ventas_2026-08-18.xlsx',
};

function setupSupabase(integrations: unknown[]) {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'organization_integrations') {
      return {
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        not:    vi.fn().mockResolvedValue({ data: integrations, error: null }),
      };
    }
    return {};
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildDailyReport.mockResolvedValue(MOCK_REPORT);
  mockSendDailyReport.mockResolvedValue({ messageId: '<msg-test@centinelia.internal>' });
  process.env.BILLING_ESCALATION_EMAIL = 'ops@centinelia.mx';
  process.env.BILLING_DROPBOX_TOKEN    = 'fallback-token';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/billing-daily-report', () => {

  it('returns 401 when cron auth fails', async () => {
    mockVerifyCronAuth.mockReturnValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'unauthorized' });
  });

  it('returns processed=0 when no integrations found', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    setupSupabase([]);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.results).toHaveLength(0);
    expect(mockBuildDailyReport).not.toHaveBeenCalled();
  });

  it('sends report to config.report_recipients', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    setupSupabase([makeIntegration()]);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockBuildDailyReport).toHaveBeenCalledTimes(1);
    expect(mockSendDailyReport).toHaveBeenCalledTimes(1);

    const sendArgs = mockSendDailyReport.mock.calls[0];
    const recipients: string[] = sendArgs[1];
    expect(recipients).toContain('contadora@empresa.mx');
  });

  it('falls back to BILLING_ESCALATION_EMAIL when no report_recipients configured', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    setupSupabase([makeIntegration({ config: { dropbox_token: 'tok', dropbox_base_path: '/F' } })]);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockSendDailyReport).toHaveBeenCalledTimes(1);

    const sendArgs = mockSendDailyReport.mock.calls[0];
    const recipients: string[] = sendArgs[1];
    expect(recipients).toContain('ops@centinelia.mx');
  });

  it('skips send and marks as skipped when no recipients and no fallback', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    delete process.env.BILLING_ESCALATION_EMAIL;
    setupSupabase([makeIntegration({ config: { dropbox_token: 'tok', dropbox_base_path: '/F' } })]);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockSendDailyReport).not.toHaveBeenCalled();
    expect(body.results[0]).toMatchObject({ skipped: 'no_recipients' });
  });

  it('isolates per-integration errors and continues to next integration', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    const integ1 = makeIntegration({ id: 'integ-1', portal_email: 'a@empresa.mx' });
    const integ2 = makeIntegration({ id: 'integ-2', portal_email: 'b@empresa.mx' });
    setupSupabase([integ1, integ2]);

    // First integration throws
    mockBuildDailyReport
      .mockRejectedValueOnce(new Error('Dropbox timeout'))
      .mockResolvedValueOnce(MOCK_REPORT);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(body.results[0]).toMatchObject({ portal_email: 'a@empresa.mx', error: 'Dropbox timeout' });
    expect(body.results[1]).toMatchObject({ portal_email: 'b@empresa.mx', sent: true });
  });

  it('returns processed count equal to integrations processed', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    const integs = [
      makeIntegration({ id: 'i1', portal_email: 'a@e.mx' }),
      makeIntegration({ id: 'i2', portal_email: 'b@e.mx' }),
      makeIntegration({ id: 'i3', portal_email: 'c@e.mx' }),
    ];
    setupSupabase(integs);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(3);
    expect(body.results).toHaveLength(3);
    expect(mockSendDailyReport).toHaveBeenCalledTimes(3);
  });

  it('passes dropboxToken and basePath from config to buildDailyReport', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    setupSupabase([makeIntegration()]);

    await GET(makeRequest());

    const buildArgs = mockBuildDailyReport.mock.calls[0];
    // arg[1] is ctx
    expect(buildArgs[1]).toMatchObject({ dropboxToken: 'tok-abc' });
    // arg[2] is basePath
    expect(buildArgs[2]).toBe('/Facturacion/2026');
  });
});
