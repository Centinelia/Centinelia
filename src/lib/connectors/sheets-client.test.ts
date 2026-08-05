import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist class definitions so they are available when vi.mock factories run
const { MockOAuth2 } = vi.hoisted(() => {
  const mockSetCredentials = vi.fn();
  class MockOAuth2 {
    setCredentials = mockSetCredentials;
  }
  return { MockOAuth2 };
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

// Mock the crypto module so decrypt is a no-op in tests
vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((v: string) => v),
}));

import { getSheetsClient } from './sheets-client';
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
});
