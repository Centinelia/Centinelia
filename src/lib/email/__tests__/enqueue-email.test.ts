import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueEmailJob } from '../enqueue-email';

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
