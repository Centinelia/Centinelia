// Regression 2026-10-01 (AC Proyectos): adapter solo buscaba token en
// integration_accounts capability='email', pero:
//   1. El flow email (Mail.*/Contacts.*) NO incluye Files.* por diseño Fase 1.
//   2. OneDrive/SharePoint require un OAuth separado capability='storage_microsoft'.
// Adapter ahora busca en orden: storage per-agent → storage org → email per-agent
// (fallback, probable 403 en SharePoint) → email org.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/crypto', () => ({ decrypt: (s: string) => `decrypted(${s})` }));
vi.mock('@/lib/email/outlook', () => ({
  outlookRefreshToken: vi.fn(async () => ({ access_token: 'FRESH-TOKEN', expires_in: 3600 })),
}));

interface MockState {
  config?:              unknown;
  perAgentStorageRow?:  { access_token: string; refresh_token: string | null; expires_at: string | null; status: string } | null;
  orgStorageRow?:       { access_token: string; refresh_token: string | null; expires_at: string | null; status: string } | null;
  emailIntRow?:         { access_token: string; refresh_token: string | null; token_expires_at: string | null } | null;
  legacyEmailRow?:      { access_token: string; refresh_token: string | null; expires_at: string | null; status: string } | null;
}

function mockSupabase(s: MockState) {
  // Call index para distinguir las diferentes queries a integration_accounts
  // dentro de resolveMicrosoftAccessToken (sin usar flags por capability porque
  // el mock chain es sincrónico y el flow puede query por agent_id O portal_email).
  let intAcctCallIdx = 0;
  return {
    from(table: string) {
      if (table === 'organizations') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { inventory_excel_config: s.config }, error: null }) }) }) };
      }
      if (table === 'integration_accounts') {
        // Orden determinístico: 1) per-agent storage, 2) org storage, 4) legacy email
        const rows = [s.perAgentStorageRow, s.orgStorageRow, s.legacyEmailRow];
        return {
          select: () => {
            const row = rows[intAcctCallIdx++] ?? null;
            return {
              eq: () => ({ eq: () => ({ neq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }), eq: () => ({ neq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }) }) }),
            };
          },
          update: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }),
        };
      }
      if (table === 'email_integrations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: s.emailIntRow ?? null }) }) }) }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        };
      }
      return {};
    },
  };
}

const VALID_CONFIG = {
  location: { scope: { type: 'me' }, itemId: 'ITEM-1' },
  sheets:   { historico: { name: 'INV', table: 'T1' }, stock: { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' } },
  columns_historico: { modelo: 'MODELO' },
  estatus_validos:   ['ALMACEN'],
  bodegas_canonicas: ['FLETEROS'],
};

const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const pastDate   = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe('resolveInventoryContext — token source resolution (prioridad por scope)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('storage_microsoft per-agent presente → se usa (prioridad 1)', async () => {
    const { resolveInventoryContext } = await import('../adapter');
    const supa = mockSupabase({
      config:             VALID_CONFIG,
      perAgentStorageRow: { access_token: 'STORAGE-TOKEN', refresh_token: null, expires_at: futureDate, status: 'active' },
      emailIntRow:        { access_token: 'EMAIL-TOKEN',   refresh_token: null, token_expires_at: futureDate },
    });
    const ctx = await resolveInventoryContext('x@y.mx', supa as never, 'agent-uuid');
    expect('error' in ctx).toBe(false);
    if ('error' in ctx) return;
    expect(ctx.token).toBe('STORAGE-TOKEN');
  });

  it('sin storage per-agent pero sí org-level storage → se usa org storage (prioridad 2)', async () => {
    const { resolveInventoryContext } = await import('../adapter');
    const supa = mockSupabase({
      config:        VALID_CONFIG,
      orgStorageRow: { access_token: 'ORG-STORAGE', refresh_token: null, expires_at: futureDate, status: 'active' },
      emailIntRow:   { access_token: 'EMAIL',       refresh_token: null, token_expires_at: futureDate },
    });
    const ctx = await resolveInventoryContext('x@y.mx', supa as never, 'agent-uuid');
    expect('error' in ctx).toBe(false);
    if ('error' in ctx) return;
    expect(ctx.token).toBe('ORG-STORAGE');
  });

  it('solo email_integrations (fallback) → se usa pero probable 403 en Graph', async () => {
    const { resolveInventoryContext } = await import('../adapter');
    const supa = mockSupabase({
      config:      VALID_CONFIG,
      emailIntRow: { access_token: 'EMAIL-ONLY', refresh_token: null, token_expires_at: futureDate },
    });
    const ctx = await resolveInventoryContext('x@y.mx', supa as never, 'agent-uuid');
    expect('error' in ctx).toBe(false);
    if ('error' in ctx) return;
    expect(ctx.token).toBe('EMAIL-ONLY');
  });

  it('token expirado + refresh → refresca y devuelve FRESH-TOKEN', async () => {
    const { resolveInventoryContext } = await import('../adapter');
    const supa = mockSupabase({
      config:             VALID_CONFIG,
      perAgentStorageRow: { access_token: 'STALE', refresh_token: 'enc-rt', expires_at: pastDate, status: 'active' },
    });
    const ctx = await resolveInventoryContext('x@y.mx', supa as never, 'agent-uuid');
    expect('error' in ctx).toBe(false);
    if ('error' in ctx) return;
    expect(ctx.token).toBe('FRESH-TOKEN');
  });

  it('ningún token → microsoft_disconnected con mensaje señalando el OAuth correcto', async () => {
    const { resolveInventoryContext } = await import('../adapter');
    const supa = mockSupabase({ config: VALID_CONFIG });
    const ctx = await resolveInventoryContext('x@y.mx', supa as never, 'agent-uuid');
    expect('error' in ctx).toBe(true);
    if (!('error' in ctx)) return;
    expect(ctx.error).toBe('microsoft_disconnected');
    expect(ctx.message).toMatch(/Almacenamiento|Microsoft|OneDrive/);
  });

  it('config sin location.itemId → not_configured (sin tocar tokens)', async () => {
    const { resolveInventoryContext } = await import('../adapter');
    const supa = mockSupabase({ config: { onedrive_share_url: 'https://x' } });
    const ctx = await resolveInventoryContext('x@y.mx', supa as never, 'agent-uuid');
    expect('error' in ctx).toBe(true);
    if (!('error' in ctx)) return;
    expect(ctx.error).toBe('not_configured');
  });
});
