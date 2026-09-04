/**
 * agent-mailboxes route.test.ts
 *
 * Tests el routing por role y el skip por config faltante. Mockea
 * fetchUnreadFromImap + Supabase; NO hace conexiones reales.
 *
 * Covers:
 *  - 401 sin auth
 *  - 200 skipped si AGENT_MAILBOXES_ENABLED != true
 *  - agent sin smtp_config → skip con reason
 *  - agent con smtp pero sin imap_host → skip
 *  - agent facturacion con correos → enqueue + markSeen
 *  - agent con role no soportado → skip sin markSeen (para no perder correos)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetchUnread, mockMarkSeen, mockEnqueue, mockDecrypt } = vi.hoisted(() => ({
  mockFetchUnread: vi.fn(),
  mockMarkSeen:    vi.fn(),
  mockEnqueue:     vi.fn(),
  mockDecrypt:     vi.fn(),
}));

vi.mock('@/lib/connectors/imap-smtp', () => ({
  fetchUnreadFromImap: mockFetchUnread,
  markSeenInImap:      mockMarkSeen,
}));
vi.mock('@/lib/billing/employee/queue', () => ({
  enqueueBillingEmail: mockEnqueue,
}));
vi.mock('@/lib/crypto', () => ({
  decrypt: mockDecrypt,
}));
vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: (req: Request) => {
    return req.headers.get('authorization') === 'Bearer valid-secret';
  },
}));

const { mockAgentsList, mockIntegrationLookup, mockEmailInsert, mockLockAcquire } = vi.hoisted(() => ({
  mockAgentsList:        vi.fn(),
  mockIntegrationLookup: vi.fn(),
  mockEmailInsert:       vi.fn(),
  mockLockAcquire:       vi.fn(),  // devuelve { data, error } para el .maybeSingle() del UPDATE / INSERT
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'voice_agents') {
        return {
          select: () => ({
            eq: () => ({
              not: () => mockAgentsList(),
            }),
          }),
        };
      }
      if (table === 'organization_integrations') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: mockIntegrationLookup,
              }),
            }),
          }),
        };
      }
      if (table === 'billing_incoming_emails') {
        const chainable: any = {
          select: () => ({ single: mockEmailInsert }),
        };
        return {
          insert: () => chainable,
          upsert: () => chainable,
        };
      }
      if (table === 'agent_mailboxes_lock') {
        // acquireAgentMailboxLock: UPDATE lock expirado → si null, INSERT nuevo.
        // El mock ejerce ambos: primero UPDATE devuelve el handle O null; si null,
        // INSERT devuelve el handle. Por simplicidad, hacemos UPDATE devolver
        // lo que mockLockAcquire retorne, e INSERT también (dev-only sanity).
        const lockRes = () => mockLockAcquire();
        return {
          update: () => ({
            eq: () => ({
              lt: () => ({
                select: () => ({ maybeSingle: lockRes }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({ maybeSingle: lockRes }),
          }),
          delete: () => ({
            eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }),
        };
      }
      return {};
    },
  }),
}));

import { GET } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AGENT_MAILBOXES_ENABLED = 'true';
  mockDecrypt.mockReturnValue('plaintext-password');
  mockIntegrationLookup.mockResolvedValue({ data: { id: 'integ-1' }, error: null });
  mockEmailInsert.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  mockEnqueue.mockResolvedValue({ jobId: 'job-1' });
  // Default: lock acquired successfully (UPDATE devuelve handle)
  mockLockAcquire.mockResolvedValue({ data: { agent_id: 'a', holder_id: 'h' }, error: null });
});

function makeReq(auth = 'Bearer valid-secret') {
  return new Request('http://localhost/api/cron/agent-mailboxes', {
    headers: { authorization: auth },
  });
}

const AGENT_FACT = {
  id: 'agent-fact', agent_name: 'Nala', role: 'facturacion', portal_email: 'cliente@ex.com',
  features: {
    smtp_config: {
      host: 'mail.ex.com', port: 465, secure: true,
      username: 'nala@ex.com', password_enc: 'enc',
      imap_host: 'mail.ex.com', imap_port: 993,
    },
  },
};

describe('GET /api/cron/agent-mailboxes', () => {
  it('401 sin auth', async () => {
    const res = await GET(makeReq('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('skipped si AGENT_MAILBOXES_ENABLED != true', async () => {
    process.env.AGENT_MAILBOXES_ENABLED = 'false';
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.skipped).toBe('disabled');
  });

  it('agent sin smtp_config → error en result, no throw', async () => {
    mockAgentsList.mockResolvedValue({
      data: [{ id: 'a1', agent_name: 'X', role: 'facturacion', portal_email: 'x@e.com', features: {} }],
      error: null,
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.results[0].error).toContain('sin smtp_config');
    expect(mockFetchUnread).not.toHaveBeenCalled();
  });

  it('agent con smtp pero sin imap_host → skip', async () => {
    mockAgentsList.mockResolvedValue({
      data: [{
        id: 'a1', agent_name: 'X', role: 'facturacion', portal_email: 'x@e.com',
        features: { smtp_config: { host: 'h', port: 465, secure: true, username: 'u', password_enc: 'e' } },
      }],
      error: null,
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.results[0].error).toContain('sin imap_host');
    expect(mockFetchUnread).not.toHaveBeenCalled();
  });

  it('facturacion con correos → enqueue + markSeen', async () => {
    mockAgentsList.mockResolvedValue({ data: [AGENT_FACT], error: null });
    mockFetchUnread.mockResolvedValue([
      {
        uid: 42, messageId: '<abc@ex>', from: 'beatriz@t.com', fromName: 'Beatriz',
        to: ['nala@ex.com'], subject: 'Notitas', bodyText: 'ver adjunto', bodyHtml: null,
        date: new Date(), attachments: [{ filename: 'nota.jpg', contentType: 'image/jpeg', size: 100, content: Buffer.from('x') }],
      },
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.results[0].enqueued).toBe(1);
    expect(body.results[0].markedSeen).toBe(1);
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'process_notes',
      portalEmail: 'cliente@ex.com',
      integrationId: 'integ-1',
    }));
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), [42]);
  });

  it('role no soportado → skip sin markSeen', async () => {
    mockAgentsList.mockResolvedValue({
      data: [{ ...AGENT_FACT, role: 'atencion_cliente' }],
      error: null,
    });
    mockFetchUnread.mockResolvedValue([
      { uid: 1, messageId: null, from: 'x@x.com', fromName: null, to: [], subject: '', bodyText: '', bodyHtml: null, date: null, attachments: [] },
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.results[0].skipped).toBe(1);
    expect(body.results[0].markedSeen).toBe(0);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('correo sin attachments → kind=reply_missing_attachments', async () => {
    mockAgentsList.mockResolvedValue({ data: [AGENT_FACT], error: null });
    mockFetchUnread.mockResolvedValue([
      { uid: 1, messageId: null, from: 'x@x.com', fromName: null, to: ['nala@ex.com'], subject: 'sin foto', bodyText: '', bodyHtml: null, date: null, attachments: [] },
    ]);

    const res = await GET(makeReq());
    await res.json();
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reply_missing_attachments' }));
  });

  it('inbox vacío → summary con fetched=0, no llama enqueue ni markSeen', async () => {
    mockAgentsList.mockResolvedValue({ data: [AGENT_FACT], error: null });
    mockFetchUnread.mockResolvedValue([]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.results[0].fetched).toBe(0);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('lock ocupado por otro tick → skip sin fetch', async () => {
    mockAgentsList.mockResolvedValue({ data: [AGENT_FACT], error: null });
    // UPDATE devuelve null (no había lock expirado) e INSERT falla con 23505
    mockLockAcquire.mockResolvedValue({ data: null, error: { code: '23505', message: 'unique_violation' } });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.results[0].lockedByOther).toBe(true);
    expect(body.summary.agents_locked).toBe(1);
    expect(mockFetchUnread).not.toHaveBeenCalled();
  });

  it('role con case distinto también matchea facturacion', async () => {
    mockAgentsList.mockResolvedValue({ data: [{ ...AGENT_FACT, role: 'Facturacion' }], error: null });
    mockFetchUnread.mockResolvedValue([
      { uid: 1, messageId: '<x>', from: 'x@x.com', fromName: null, to: ['nala@ex.com'], subject: 'x', bodyText: '', bodyHtml: null, date: null, attachments: [{ filename: 'x.jpg', contentType: 'image/jpeg', size: 1, content: Buffer.from('x') }] },
    ]);

    const res = await GET(makeReq());
    await res.json();
    expect(mockEnqueue).toHaveBeenCalled();
  });
});
