import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist class definitions so they are available when vi.mock factories run
const { MockOAuth2, mockOn } = vi.hoisted(() => {
  const mockSetCredentials = vi.fn();
  const mockOn = vi.fn();
  class MockOAuth2 {
    setCredentials = mockSetCredentials;
    on = mockOn;
  }
  return { MockOAuth2, mockOn };
});

// Mock googleapis before importing the module under test
vi.mock('googleapis', () => ({
  google: {
    sheets: vi.fn(() => ({ spreadsheets: { values: {} } })),
    auth: {
      OAuth2: MockOAuth2,
    },
  },
}));

// Mock the Supabase admin client factory
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

// Mock the crypto module so decrypt/encrypt are no-ops in tests
vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((v: string) => v),
  encrypt: vi.fn((v: string) => `enc:${v}`),
}));

import { getSheetsClient, translateGoogleError } from './sheets-client';
import { createAdminClient } from '@/lib/supabase/admin';

function makeSupabaseMock(row: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const neq         = vi.fn().mockReturnValue({ maybeSingle });
  const eq2         = vi.fn().mockReturnValue({ neq });
  const eq1         = vi.fn().mockReturnValue({ eq: eq2 });
  const select      = vi.fn().mockReturnValue({ eq: eq1 });
  const from        = vi.fn().mockReturnValue({ select });
  return { from } as unknown as ReturnType<typeof createAdminClient>;
}

function makeSupabaseWriteMock() {
  const eq2   = vi.fn().mockResolvedValue({ error: null });
  const eq1   = vi.fn().mockReturnValue({ eq: eq2 });
  const update = vi.fn().mockReturnValue({ eq: eq1 });
  const from  = vi.fn().mockReturnValue({ update });
  return { from };
}

describe('getSheetsClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws sheets_no_conectado when no google account for org', async () => {
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabaseMock(null));
    await expect(getSheetsClient('org@example.com')).rejects.toThrow('sheets_no_conectado');
  });

  // NOTE: scope_missing check is NOT implemented because integration_accounts has no
  // scopes column. Scope enforcement lives at OAuth grant time (GMAIL_SCOPES).
  // If scope_missing runtime checks are needed in the future, add integration_accounts.scopes
  // and re-enable this test case.

  it('returns sheets client when account is properly configured', async () => {
    const row = {
      access_token:  'tok_access',
      refresh_token: 'tok_refresh',
      expires_at:    new Date(Date.now() + 3600 * 1000).toISOString(),
      status:        'active',
    };
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabaseMock(row));
    const client = await getSheetsClient('org@example.com');
    expect(client).toBeDefined();
    expect(client.spreadsheets).toBeDefined();
  });

  // I-1: tokens event listener persists refreshed access_token to Supabase
  it('registers a tokens listener that persists refreshed access_token', async () => {
    const row = {
      access_token:  'tok_old',
      refresh_token: 'tok_refresh',
      expires_at:    null,
      status:        'active',
    };
    const readMock  = makeSupabaseMock(row);
    const writeMock = makeSupabaseWriteMock();
    // First call (read) returns account row; second call (write inside listener) returns update mock
    let callIdx = 0;
    (createAdminClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
      return callIdx++ === 0 ? readMock : writeMock;
    });

    await getSheetsClient('org@example.com');

    // oauth2.on should have been called once with 'tokens'
    expect(mockOn).toHaveBeenCalledWith('tokens', expect.any(Function));

    // Simulate the googleapis runtime firing the tokens event
    const [[, listener]] = (mockOn as ReturnType<typeof vi.fn>).mock.calls;
    const expiryDate = Date.now() + 3600 * 1000;
    await listener({ access_token: 'tok_new', expiry_date: expiryDate });

    // Should have written the new encrypted token to integration_accounts
    expect(writeMock.from).toHaveBeenCalledWith('integration_accounts');
    const updateArg = (writeMock.from as ReturnType<typeof vi.fn>).mock.results[0].value.update;
    expect(updateArg).toHaveBeenCalledWith(expect.objectContaining({
      access_token: 'enc:tok_new',
      status: 'active',
    }));
  });

  it('tokens listener does nothing when access_token is absent', async () => {
    const row = { access_token: 'tok', refresh_token: null, expires_at: null, status: 'active' };
    const readMock = makeSupabaseMock(row);
    const writeMock = makeSupabaseWriteMock();
    let callIdx = 0;
    (createAdminClient as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callIdx++ === 0 ? readMock : writeMock,
    );

    await getSheetsClient('org@example.com');

    const [[, listener]] = (mockOn as ReturnType<typeof vi.fn>).mock.calls;
    await listener({ access_token: null });

    expect(writeMock.from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// translateGoogleError
// ---------------------------------------------------------------------------
describe('translateGoogleError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('translates invalid_grant to auth_expired and marks needs_reauth', async () => {
    const writeMock = makeSupabaseWriteMock();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(writeMock);

    const err = new Error('invalid_grant: Token has been revoked');
    await expect(translateGoogleError(err, 'org@example.com')).rejects.toThrow('auth_expired');

    // Should have updated status to needs_reauth
    expect(writeMock.from).toHaveBeenCalledWith('integration_accounts');
    const updateArg = (writeMock.from as ReturnType<typeof vi.fn>).mock.results[0].value.update;
    expect(updateArg).toHaveBeenCalledWith({ status: 'needs_reauth' });
  });

  it('re-throws non-OAuth errors unchanged', async () => {
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabaseWriteMock());

    const err = new Error('Quota exceeded for quota metric');
    await expect(translateGoogleError(err, 'org@example.com')).rejects.toThrow('Quota exceeded');
  });
});
