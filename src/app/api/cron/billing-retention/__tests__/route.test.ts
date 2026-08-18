/**
 * route.test.ts -- Unit tests for GET /api/cron/billing-retention
 *
 * Covers:
 * 1. 401 when cron auth fails
 * 2. No active billing integrations: skip silently, processed=0
 * 3. Files older than threshold are moved to _Historico
 * 4. Files younger than threshold are ignored
 * 5. Integration with folder not found in Dropbox: skip that integration
 * 6. End-of-year run (month=1): rotation is skipped, mail still sent
 * 7. Report mail sent with correct counts
 * 8. Per-integration errors do not abort the entire loop
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock refs
// ---------------------------------------------------------------------------

const {
  mockVerifyCronAuth,
  mockSupabaseFrom,
  mockDropboxListFolder,
  mockDropboxMoveFile,
  mockSendBillingMail,
} = vi.hoisted(() => ({
  mockVerifyCronAuth:    vi.fn(),
  mockSupabaseFrom:      vi.fn(),
  mockDropboxListFolder: vi.fn(),
  mockDropboxMoveFile:   vi.fn(),
  mockSendBillingMail:   vi.fn(),
}));

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: (...args: unknown[]) => mockVerifyCronAuth(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockSupabaseFrom }),
}));

vi.mock('@/lib/billing/storage/dropbox', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DropboxClient: vi.fn().mockImplementation(function (this: any) {
    this.listFolder = mockDropboxListFolder;
    this.moveFile   = mockDropboxMoveFile;
  }),
}));

vi.mock('@/lib/billing/mail/send', () => ({
  sendBillingMail: (...args: unknown[]) => mockSendBillingMail(...args),
}));

import { GET } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/billing-retention', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

function makeIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id:           'integ-uuid-1',
    portal_email: 'cliente@empresa.mx',
    config: {
      dropbox_token:              'tok-abc',
      dropbox_base_path:          '/Facturacion',
      diarios_active_months:       6,
      importables_processed_days:  30,
    },
    ...overrides,
  };
}

/** Build a fake DropboxEntry with serverModified set to daysAgo days ago. */
function makeEntry(name: string, daysAgo: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    name,
    path: `/Facturacion/folder/${name}`,
    isFile: true,
    serverModified: d.toISOString(),
  };
}

function setupSupabase(integrations: unknown[]) {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'organization_integrations') {
      return {
        select:  vi.fn().mockReturnThis(),
        eq:      vi.fn().mockReturnThis(),
        in:      vi.fn().mockReturnThis(),
        not:     vi.fn().mockResolvedValue({ data: integrations, error: null }),
      };
    }
    return { select: vi.fn().mockReturnThis() };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDropboxMoveFile.mockResolvedValue(undefined);
  mockSendBillingMail.mockResolvedValue({ messageId: '<test@centinelia.internal>' });
  process.env.BILLING_ESCALATION_EMAIL = 'ops@centinelia.mx';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/billing-retention', () => {

  it('returns 401 when cron auth fails', async () => {
    mockVerifyCronAuth.mockReturnValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'unauthorized' });
  });

  it('returns processed=0 and skips mail when no active billing integrations', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    setupSupabase([]);

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.results).toHaveLength(0);
    // No mail when nothing was processed
    expect(mockSendBillingMail).not.toHaveBeenCalled();
  });

  it('moves files older than threshold and ignores young files', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    const integ = makeIntegration({
      config: {
        dropbox_token:             'tok-abc',
        dropbox_base_path:         '/Facturacion',
        diarios_active_months:      6,
        importables_processed_days: 30,
      },
    });
    setupSupabase([integ]);

    // Diarios folder: one old file (200 days), one fresh file (10 days)
    // Importables/procesados folder: one old file (40 days), one fresh (5 days)
    mockDropboxListFolder.mockImplementation(async (path: string) => {
      if (path.includes('Diarios') && !path.includes('_Historico')) {
        return [
          makeEntry('Diario_old.txt',  200),
          makeEntry('Diario_new.txt',   10),
        ];
      }
      if (path.includes('Importables_CONTPAQi/procesados')) {
        return [
          makeEntry('Importable_old.xml', 40),
          makeEntry('Importable_new.xml',  5),
        ];
      }
      return [];
    });

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.results[0].diariosRotated).toBe(1);
    expect(body.results[0].importablesRotated).toBe(1);

    // Two moves total: one diario + one importable
    expect(mockDropboxMoveFile).toHaveBeenCalledTimes(2);

    // Report mail sent
    expect(mockSendBillingMail).toHaveBeenCalledTimes(1);
  });

  it('ignores all files when all are within threshold', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    setupSupabase([makeIntegration()]);

    mockDropboxListFolder.mockImplementation(async (path: string) => {
      if (path.includes('Diarios') && !path.includes('_Historico')) {
        return [makeEntry('Diario_new.txt', 10)];
      }
      if (path.includes('Importables_CONTPAQi/procesados')) {
        return [makeEntry('Importable_new.xml', 5)];
      }
      return [];
    });

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].diariosRotated).toBe(0);
    expect(body.results[0].importablesRotated).toBe(0);
    expect(mockDropboxMoveFile).not.toHaveBeenCalled();
  });

  it('skips integration when folder does not exist in Dropbox', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    setupSupabase([makeIntegration()]);

    // listFolder throws "folder not found" for Diarios
    mockDropboxListFolder.mockRejectedValue(new Error('path not found'));

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.results[0].skipped).toBe('folder_not_found');
    expect(mockDropboxMoveFile).not.toHaveBeenCalled();
  });

  it('does not rotate on month=1 (January) -- year-end protection', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    // Pin system time to January 1st so nowMonth === 1
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T03:00:00Z'));

    setupSupabase([makeIntegration()]);

    // Would have old files available, but should not be rotated
    mockDropboxListFolder.mockImplementation(async () => [
      makeEntry('Diario_old.txt', 200),
    ]);

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].skipped).toBe('year_end');
    expect(mockDropboxMoveFile).not.toHaveBeenCalled();
    expect(mockSendBillingMail).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('surfaces per-integration errors without aborting the loop', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    const integ1 = makeIntegration({
      id:           'integ-1',
      portal_email: 'ok@empresa.mx',
      config: {
        dropbox_token:              'tok-ok',
        dropbox_base_path:          '/Facturacion/ok',
        diarios_active_months:       6,
        importables_processed_days:  30,
      },
    });
    const integ2 = makeIntegration({
      id:           'integ-2',
      portal_email: 'fail@empresa.mx',
      config: {
        dropbox_token:              'tok-fail',
        dropbox_base_path:          '/Facturacion/fail',
        diarios_active_months:       6,
        importables_processed_days:  30,
      },
    });
    setupSupabase([integ1, integ2]);

    // ok integration: list returns old files; fail integration: list returns old files too
    // but moveFile throws for the fail integration's path (destination contains 'fail')
    mockDropboxListFolder.mockImplementation(async (path: string) => {
      if (path.includes('Importables_CONTPAQi/procesados')) return [];
      // Return an entry whose path reflects the calling integration's base
      const basePath = path.replace('/Diarios', '');
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 200);
      return [{
        name: 'Diario_old.txt',
        path: `${basePath}/Diarios/Diario_old.txt`,
        isFile: true,
        serverModified: d.toISOString(),
      }];
    });

    // moveFile throws when the destination path contains 'fail' base
    mockDropboxMoveFile.mockImplementation(async (_src: string, dst: string) => {
      if (dst.includes('/Facturacion/fail/')) {
        throw new Error('Dropbox API move error');
      }
    });

    const res = await GET(makeRequest('Bearer secret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(2);
    const okResult   = body.results.find((r: { portal_email: string }) => r.portal_email === 'ok@empresa.mx');
    const failResult = body.results.find((r: { portal_email: string }) => r.portal_email === 'fail@empresa.mx');
    expect(okResult.diariosRotated).toBeDefined();
    expect(failResult.error).toBeDefined();
  });

  it('sends report mail with per-integration counts', async () => {
    mockVerifyCronAuth.mockReturnValue(true);

    setupSupabase([makeIntegration()]);

    mockDropboxListFolder.mockImplementation(async (path: string) => {
      if (path.includes('Diarios') && !path.includes('_Historico')) {
        return [makeEntry('Diario_old.txt', 200)];
      }
      if (path.includes('Importables_CONTPAQi/procesados')) {
        return [makeEntry('Importable_old.xml', 40)];
      }
      return [];
    });

    await GET(makeRequest('Bearer secret'));

    expect(mockSendBillingMail).toHaveBeenCalledTimes(1);
    const callArgs = mockSendBillingMail.mock.calls[0][0];
    expect(callArgs.to).toBe('ops@centinelia.mx');
    expect(callArgs.subject).toContain('retencion');
    expect(callArgs.body).toContain('cliente@empresa.mx');
  });

});
