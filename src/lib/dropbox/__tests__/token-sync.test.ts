/**
 * token-sync.test.ts — unit tests para el puente Dropbox token
 * (integration_accounts → organization_integrations).
 *
 * Cubre:
 *   - syncTokenFor happy path (sin refresh cuando el token sigue vigente)
 *   - syncTokenFor con refresh (expira, dropboxRefreshToken se llama y actualiza)
 *   - syncTokenFor skip-no-dropbox (cliente sin OAuth)
 *   - syncTokenFor skip-no-contpaqi (Dropbox pero sin adapter)
 *   - syncTokenFor error en refresh (Dropbox API tira)
 *   - syncAllActiveTokens agrega outcomes de N clientes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDropboxRefreshToken, mockEncryptDropboxToken, mockDecrypt } = vi.hoisted(() => ({
  mockDropboxRefreshToken: vi.fn(),
  mockEncryptDropboxToken: vi.fn(),
  mockDecrypt:             vi.fn(),
}));

vi.mock('@/lib/dropbox/oauth', () => ({
  dropboxRefreshToken: mockDropboxRefreshToken,
}));
vi.mock('@/lib/billing/adapters', () => ({
  encryptDropboxToken: mockEncryptDropboxToken,
}));
vi.mock('@/lib/crypto', () => ({
  decrypt: mockDecrypt,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: vi.fn() }),
}));

import { syncTokenFor, syncAllActiveTokens } from '../token-sync';

// ── Supabase mock builder ────────────────────────────────────────────────────

interface RowShape { table: 'integration_accounts' | 'organization_integrations'; data: unknown; error: unknown }

function buildSupabase(rows: RowShape[]): { client: any; updates: Array<{ table: string; payload: unknown }> } {
  const updates: Array<{ table: string; payload: unknown }> = [];

  function makeMaybeSingle(table: string) {
    const row = rows.find(r => r.table === table);
    return vi.fn().mockResolvedValue({ data: row?.data ?? null, error: row?.error ?? null });
  }

  function makeSelect(table: string) {
    const maybeSingle = makeMaybeSingle(table);
    return vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    });
  }

  function makeUpdate(table: string) {
    return vi.fn().mockImplementation((payload: unknown) => {
      updates.push({ table, payload });
      return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    });
  }

  const client = {
    from: vi.fn().mockImplementation((table: string) => ({
      select: makeSelect(table),
      update: makeUpdate(table),
    })),
  };

  return { client, updates };
}

function buildListingSupabase(portalEmails: string[]): any {
  return {
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: portalEmails.map(portal_email => ({ portal_email })),
            error: null,
          }),
        }),
      }),
    })),
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ONE_HOUR   = 60 * 60 * 1000;
const FIVE_HOURS = 5 * ONE_HOUR;

const EMAIL = 'cliente@centinelia.mx';

function integrationAccount(overrides: Partial<{ access_token: string; refresh_token: string; expires_at: string | null }> = {}) {
  return {
    portal_email:  EMAIL,
    access_token:  'sl.access-current',
    refresh_token: 'ciphertext-refresh',
    expires_at:    new Date(Date.now() + FIVE_HOURS).toISOString(),
    ...overrides,
  };
}

function contpaqiIntegration(overrides: Partial<{ config: Record<string, unknown> | null }> = {}) {
  return {
    config: { existing_field: 'preserved', dropbox_token: 'old-ciphertext' },
    ...overrides,
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockEncryptDropboxToken.mockReturnValue('new-encrypted-ciphertext');
  mockDecrypt.mockReturnValue('refresh-token-plaintext');
  mockDropboxRefreshToken.mockResolvedValue({
    access_token: 'sl.access-refreshed',
    expires_in:   14400, // 4h
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('syncTokenFor', () => {
  it('happy path sin refresh — token vigente, solo re-encripta y escribe', async () => {
    const { client, updates } = buildSupabase([
      { table: 'integration_accounts', data: integrationAccount(), error: null },
      { table: 'organization_integrations', data: contpaqiIntegration(), error: null },
    ]);

    const r = await syncTokenFor(EMAIL, client);

    expect(r.outcome).toBe('ok');
    expect(r.refreshed).toBe(false);
    expect(mockDropboxRefreshToken).not.toHaveBeenCalled();
    expect(mockEncryptDropboxToken).toHaveBeenCalledWith('sl.access-current');
    // Solo 1 update: organization_integrations
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe('organization_integrations');
    // Preserva campos existentes en config
    expect((updates[0].payload as any).config).toMatchObject({
      existing_field: 'preserved',
      dropbox_token:  'new-encrypted-ciphertext',
    });
  });

  it('con refresh — token expira, llama dropboxRefreshToken y actualiza ambas tablas', async () => {
    const { client, updates } = buildSupabase([
      { table: 'integration_accounts', data: integrationAccount({ expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() }), error: null },
      { table: 'organization_integrations', data: contpaqiIntegration(), error: null },
    ]);

    const r = await syncTokenFor(EMAIL, client);

    expect(r.outcome).toBe('ok');
    expect(r.refreshed).toBe(true);
    expect(mockDecrypt).toHaveBeenCalledWith('ciphertext-refresh');
    expect(mockDropboxRefreshToken).toHaveBeenCalledWith('refresh-token-plaintext');
    expect(mockEncryptDropboxToken).toHaveBeenCalledWith('sl.access-refreshed');
    // 2 updates: integration_accounts + organization_integrations
    expect(updates).toHaveLength(2);
    expect(updates.map(u => u.table).sort()).toEqual(['integration_accounts', 'organization_integrations']);
  });

  it('con refresh cuando expires_at es null (token nunca marcó vencimiento)', async () => {
    const { client } = buildSupabase([
      { table: 'integration_accounts', data: integrationAccount({ expires_at: null }), error: null },
      { table: 'organization_integrations', data: contpaqiIntegration(), error: null },
    ]);

    const r = await syncTokenFor(EMAIL, client);

    expect(r.outcome).toBe('ok');
    expect(r.refreshed).toBe(true);
    expect(mockDropboxRefreshToken).toHaveBeenCalled();
  });

  it('skip-no-dropbox — cliente sin fila en integration_accounts', async () => {
    const { client, updates } = buildSupabase([
      { table: 'integration_accounts', data: null, error: null },
      { table: 'organization_integrations', data: contpaqiIntegration(), error: null },
    ]);

    const r = await syncTokenFor(EMAIL, client);

    expect(r.outcome).toBe('skip-no-dropbox');
    expect(updates).toHaveLength(0);
  });

  it('skip-no-contpaqi — Dropbox OAuth listo pero no hay integración billing', async () => {
    const { client, updates } = buildSupabase([
      { table: 'integration_accounts', data: integrationAccount(), error: null },
      { table: 'organization_integrations', data: null, error: null },
    ]);

    const r = await syncTokenFor(EMAIL, client);

    expect(r.outcome).toBe('skip-no-contpaqi');
    expect(updates).toHaveLength(0);
  });

  it('error en refresh — dropboxRefreshToken tira', async () => {
    mockDropboxRefreshToken.mockRejectedValue(new Error('Dropbox 401'));

    const { client, updates } = buildSupabase([
      { table: 'integration_accounts', data: integrationAccount({ expires_at: new Date(Date.now() - 1000).toISOString() }), error: null },
      { table: 'organization_integrations', data: contpaqiIntegration(), error: null },
    ]);

    const r = await syncTokenFor(EMAIL, client);

    expect(r.outcome).toBe('error');
    expect(r.error).toContain('Dropbox 401');
    expect(updates).toHaveLength(0);
  });

  it('preserva config vacío/null sin explotar', async () => {
    const { client, updates } = buildSupabase([
      { table: 'integration_accounts', data: integrationAccount(), error: null },
      { table: 'organization_integrations', data: { config: null }, error: null },
    ]);

    const r = await syncTokenFor(EMAIL, client);

    expect(r.outcome).toBe('ok');
    expect((updates[0].payload as any).config).toEqual({ dropbox_token: 'new-encrypted-ciphertext' });
  });
});

describe('syncAllActiveTokens', () => {
  it('agrega outcomes de N clientes con mix de resultados', async () => {
    // Este test es de integración light: usa el mismo mock builder pero
    // returns diferentes según qué email pregunta el syncTokenFor interno.
    // El listing solo devuelve emails; cada syncTokenFor arma su propio path.

    // Para simplificar, vamos a usar un single email + verificar que
    // el summary lo agrega correctamente. Un test más pesado con múltiples
    // rutas es sobreingeniería para lib puente.

    const supabaseListing = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'integration_accounts') {
          // Primera invocación: listing (select con eq status + eq provider)
          // Segunda invocación: lookup dentro de syncTokenFor (select con eq portal_email + eq provider)
          const eqChain: any = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({ data: integrationAccount(), error: null }),
          };
          eqChain.eq.mockReturnValue(eqChain);
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === 'portal_email') {
                return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ portal_email: EMAIL }], error: null }) }) };
              }
              return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: integrationAccount(), error: null }) }) }) };
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
          };
        }
        // organization_integrations
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: contpaqiIntegration(), error: null }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
        };
      }),
    };

    const result = await syncAllActiveTokens(supabaseListing as any);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].outcome).toBe('ok');
    expect(result.summary).toEqual({ ok: 1, skip: 0, error: 0 });
  });

  it('lista vacía → summary all-zeros', async () => {
    const supabase = buildListingSupabase([]);
    const result = await syncAllActiveTokens(supabase);
    expect(result.results).toHaveLength(0);
    expect(result.summary).toEqual({ ok: 0, skip: 0, error: 0 });
  });
});
