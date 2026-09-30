import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueEmailJob, enqueueEmailJobBatch, isEmailJobsEnabled, __clearEmailJobsFlagCache } from '../enqueue-email';

const mockInsert = vi.fn();
const mockSupa = {
  from: (table: string) => {
    if (table !== 'email_send_jobs') throw new Error(`unexpected table: ${table}`);
    return {
      insert: (row: unknown) => ({
        select: () => ({
          single: async () => mockInsert(row),
        }),
      }),
    };
  },
} as unknown as Parameters<typeof enqueueEmailJob>[1];

beforeEach(() => {
  mockInsert.mockReset();
});

const baseArgs = {
  agentId:     'agent-1',
  portalEmail: 'org@x.mx',
  to:          'encargado@x.mx',
  subject:     'Nueva queja',
  html:        '<p>hola</p>',
  source:      'incidencia_notif',
};

describe('enqueueEmailJob', () => {
  it('INSERT con payload completo → retorna { ok: true, job_id }', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-1' }, error: null });
    const res = await enqueueEmailJob(baseArgs, mockSupa);
    expect(res).toEqual({ ok: true, job_id: 'job-1' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      agent_id:      'agent-1',
      portal_email:  'org@x.mx',
      to_addr:       'encargado@x.mx',
      subject:       'Nueva queja',
      html:          '<p>hola</p>',
      source:        'incidencia_notif',
      status:        'pending',
    }));
  });

  it('con attachment → INSERT incluye url/name/mime', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-2' }, error: null });
    await enqueueEmailJob({
      ...baseArgs,
      attachment: { url: 'https://x/f.pdf', name: 'f.pdf', mime: 'application/pdf' },
    }, mockSupa);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      attachment_url:  'https://x/f.pdf',
      attachment_name: 'f.pdf',
      attachment_mime: 'application/pdf',
    }));
  });

  it('con source_table + source_row_id → INSERT los incluye', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-3' }, error: null });
    await enqueueEmailJob({
      ...baseArgs,
      sourceTable:  'client_incidents',
      sourceRowId:  'inc-uuid',
    }, mockSupa);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      source_table:  'client_incidents',
      source_row_id: 'inc-uuid',
    }));
  });

  it('con charge_source + charge_label → INSERT los incluye', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-4' }, error: null });
    await enqueueEmailJob({
      ...baseArgs,
      chargeSource: 'incidencia_notif',
      chargeLabel:  'Aviso de queja al encargado',
    }, mockSupa);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      charge_source: 'incidencia_notif',
      charge_label:  'Aviso de queja al encargado',
    }));
  });

  it('INSERT falla → retorna { ok: false, error }', async () => {
    mockInsert.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const res = await enqueueEmailJob(baseArgs, mockSupa);
    expect(res).toEqual({ ok: false, error: 'db down' });
  });

  it('reply_to y from_addr opcionales → NULL si no se pasan', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-5' }, error: null });
    await enqueueEmailJob(baseArgs, mockSupa);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      reply_to:  null,
      from_addr: null,
    }));
  });
});

describe('enqueueEmailJobBatch', () => {
  const mockBatchInsert = vi.fn();
  const mockBatchSupa = {
    from: () => ({
      insert: (rows: unknown[]) => ({
        select: () => mockBatchInsert(rows),
      }),
    }),
  } as unknown as Parameters<typeof enqueueEmailJobBatch>[2];

  beforeEach(() => {
    mockBatchInsert.mockReset();
  });

  it('N recipients → 1 INSERT batch con N rows', async () => {
    mockBatchInsert.mockResolvedValue({
      data: [{ id: 'job-1' }, { id: 'job-2' }],
      error: null,
    });
    const results = await enqueueEmailJobBatch(
      { agentId: 'a', portalEmail: 'p@x.mx', subject: 's', html: 'h', source: 'x' },
      [{ to: 'a@x.mx' }, { to: 'b@x.mx' }],
      mockBatchSupa,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ ok: true, job_id: 'job-1' });
    expect(results[1]).toEqual({ ok: true, job_id: 'job-2' });
    expect(mockBatchInsert).toHaveBeenCalledOnce();
    const rows = mockBatchInsert.mock.calls[0][0] as Array<{ to_addr: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].to_addr).toBe('a@x.mx');
    expect(rows[1].to_addr).toBe('b@x.mx');
  });

  it('recipients vacío → retorna [] sin INSERT', async () => {
    const results = await enqueueEmailJobBatch(
      { agentId: 'a', portalEmail: 'p@x.mx', subject: 's', html: 'h', source: 'x' },
      [],
      mockBatchSupa,
    );
    expect(results).toEqual([]);
    expect(mockBatchInsert).not.toHaveBeenCalled();
  });

  it('INSERT falla → retorna N × { ok: false } manteniendo alineación con recipients', async () => {
    mockBatchInsert.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const results = await enqueueEmailJobBatch(
      { agentId: 'a', portalEmail: 'p@x.mx', subject: 's', html: 'h', source: 'x' },
      [{ to: 'a@x.mx' }, { to: 'b@x.mx' }],
      mockBatchSupa,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ ok: false, error: 'db down' });
    expect(results[1]).toEqual({ ok: false, error: 'db down' });
  });
});

describe('isEmailJobsEnabled', () => {
  const mockFlag = vi.fn();
  const mockSupaFlag = {
    from: (table: string) => {
      if (table !== 'organizations') throw new Error(`unexpected: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => mockFlag(),
          }),
        }),
      };
    },
  } as unknown as Parameters<typeof isEmailJobsEnabled>[1];

  beforeEach(() => {
    mockFlag.mockReset();
    __clearEmailJobsFlagCache();
  });

  it('flag ON en org → retorna true', async () => {
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: true }, error: null });
    expect(await isEmailJobsEnabled('org@x.mx', mockSupaFlag)).toBe(true);
  });

  it('flag OFF en org → retorna false', async () => {
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: false }, error: null });
    expect(await isEmailJobsEnabled('org@x.mx', mockSupaFlag)).toBe(false);
  });

  it('org no existe → retorna false (fail-safe)', async () => {
    mockFlag.mockResolvedValue({ data: null, error: null });
    expect(await isEmailJobsEnabled('missing@x.mx', mockSupaFlag)).toBe(false);
  });

  it('DB throw → retorna false (fail-safe)', async () => {
    mockFlag.mockRejectedValue(new Error('db down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await isEmailJobsEnabled('org@x.mx', mockSupaFlag)).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('cache 30s → 2 lookups consecutivos = 1 DB query', async () => {
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: true }, error: null });
    await isEmailJobsEnabled('org@x.mx', mockSupaFlag);
    await isEmailJobsEnabled('org@x.mx', mockSupaFlag);
    expect(mockFlag).toHaveBeenCalledOnce();
  });

  it('cache respeta TTL — 31s después re-lookup a DB', async () => {
    vi.useFakeTimers();
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: true }, error: null });
    await isEmailJobsEnabled('org@x.mx', mockSupaFlag);
    vi.advanceTimersByTime(31_000);
    await isEmailJobsEnabled('org@x.mx', mockSupaFlag);
    expect(mockFlag).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('cache es por-org — 2 orgs distintos = 2 queries', async () => {
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: true }, error: null });
    await isEmailJobsEnabled('a@x.mx', mockSupaFlag);
    await isEmailJobsEnabled('b@x.mx', mockSupaFlag);
    expect(mockFlag).toHaveBeenCalledTimes(2);
  });
});
