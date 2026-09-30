import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockPending, mockLock, mockUpdate, mockSourceUpdate, mockSend, mockConsume, mockFetchAgent } = vi.hoisted(() => ({
  mockPending:      vi.fn(),
  mockLock:         vi.fn(),
  mockUpdate:       vi.fn(),
  mockSourceUpdate: vi.fn(),
  mockSend:         vi.fn(),
  mockConsume:      vi.fn(),
  mockFetchAgent:   vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'email_send_jobs') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  limit: async () => mockPending(),
                }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => mockLock(patch),
                }),
              }),
              select: () => ({
                single: async () => mockUpdate(patch),
              }),
            }),
          }),
        };
      }
      if (table === 'voice_agents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => mockFetchAgent(),
            }),
          }),
        };
      }
      // source tables (client_incidents, etc.)
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: async () => mockSourceUpdate(table, patch),
        }),
      };
    },
  }),
}));

vi.mock('@/lib/email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: (args: unknown) => mockSend(args),
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: (agentId: string, count: number, meta: unknown) => mockConsume(agentId, count, meta),
}));

beforeEach(() => {
  mockPending.mockReset();
  mockLock.mockReset();
  mockUpdate.mockReset();
  mockSourceUpdate.mockReset();
  mockSend.mockReset();
  mockConsume.mockReset();
  mockFetchAgent.mockReset();
  process.env.CRON_SECRET = 'test-secret';
  mockFetchAgent.mockResolvedValue({ data: { agent_name: 'Nia', business_name: 'Biz', email_from: null, email_domain_verified: false } });
});

function makeReq() {
  return new NextRequest('http://localhost/api/cron/process-email-jobs', {
    method: 'GET',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('process-email-jobs cron', () => {
  it('sin auth → 401', async () => {
    const { GET } = await import('../route');
    const res = await GET(new NextRequest('http://localhost/api/cron/process-email-jobs', {
      method: 'GET',
    }));
    expect(res.status).toBe(401);
  });

  it('sin pending → picked=0, done=0', async () => {
    mockPending.mockResolvedValue({ data: [], error: null });
    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, picked: 0, done: 0, retried: 0, failed: 0 });
  });

  it('1 pending + send OK → status=done, charge invocada, source_table actualizada', async () => {
    const job = {
      id: 'job-1', agent_id: 'a', portal_email: 'p@x.mx',
      to_addr: 'e@x.mx', subject: 's', html: 'h',
      reply_to: null, from_addr: null,
      attachment_url: null, attachment_name: null, attachment_mime: null,
      source: 'incidencia_notif', reference_id: 'inc-1',
      charge_source: 'incidencia_notif', charge_label: 'Aviso',
      source_table: 'client_incidents', source_row_id: 'inc-1',
      attempts: 0, max_attempts: 5,
    };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockSend.mockResolvedValue({ ok: true, provider: 'resend', meta: { message_id: 'x' } });
    mockUpdate.mockResolvedValue({ data: job, error: null });
    mockSourceUpdate.mockResolvedValue({ data: null, error: null });
    mockConsume.mockResolvedValue({ ok: true });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, picked: 1, done: 1, retried: 0, failed: 0 });
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockConsume).toHaveBeenCalledWith('a', 1, expect.objectContaining({
      source:       'incidencia_notif',
      reference_id: 'inc-1',
      label:        'Aviso',
    }));
    expect(mockSourceUpdate).toHaveBeenCalledWith('client_incidents', expect.objectContaining({
      email_sent_at: expect.any(String),
    }));
    const doneUpdates = mockUpdate.mock.calls.filter(c => (c[0] as { status?: string }).status === 'done');
    expect(doneUpdates).toHaveLength(1);
  });

  it('lock race: otro cron ya tomó → mockLock devuelve null → skip', async () => {
    const job = { id: 'job-1', agent_id: 'a', attempts: 0, max_attempts: 5, source: 'x', charge_source: null, source_table: null, source_row_id: null, portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, reference_id: null, charge_label: null };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({ picked: 1, done: 0, retried: 0, failed: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sin charge_source → no llama consumeAiOp aunque send sea OK', async () => {
    const job = { id: 'job-1', agent_id: 'a', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: null, charge_source: null, charge_label: null, source_table: null, source_row_id: null, attempts: 0, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockSend.mockResolvedValue({ ok: true, provider: 'resend' });
    mockUpdate.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    await GET(makeReq());

    expect(mockConsume).not.toHaveBeenCalled();
  });

  it('sin source_table → no llama update en tabla source', async () => {
    const job = { id: 'job-1', agent_id: 'a', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: null, charge_source: null, charge_label: null, source_table: null, source_row_id: null, attempts: 0, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockSend.mockResolvedValue({ ok: true, provider: 'resend' });
    mockUpdate.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    await GET(makeReq());

    expect(mockSourceUpdate).not.toHaveBeenCalled();
  });

  it('agent_id inválido (eliminado entre enqueue y pick) → send lanza, retry pipeline lo maneja', async () => {
    const job = { id: 'job-1', agent_id: 'ghost', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: null, charge_source: null, charge_label: null, source_table: null, source_row_id: null, attempts: 0, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockFetchAgent.mockResolvedValue({ data: null });
    mockSend.mockRejectedValue(new Error('agent not found for job'));
    mockUpdate.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, picked: 1, done: 0 });
  });
});
