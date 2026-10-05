/**
 * Tests para verifyIntegrationUpsert — asegura que:
 *  - action exitosa → ok:true
 *  - action con error → ok:false + alerta programada
 *  - action que throw → ok:false + alerta programada
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyIntegrationUpsert } from '../verify-integration';

const afterPromises: Promise<unknown>[] = [];
const { mockAfter, mockSendEmail } = vi.hoisted(() => {
  const promises: Promise<unknown>[] = [];
  return {
    mockAfter: vi.fn((fn: () => Promise<void>) => {
      const p = Promise.resolve(fn()).catch(() => {});
      promises.push(p);
      return p;
    }),
    mockSendEmail: vi.fn(() => Promise.resolve({ ok: true })),
  };
});
async function flushAfter() {
  await Promise.allSettled((mockAfter.mock.results ?? []).map(r => r.value));
}

vi.mock('next/server', () => ({
  after: mockAfter,
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: mockSendEmail,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyIntegrationUpsert', () => {
  it('action exitosa → ok:true, no alerta', async () => {
    const result = await verifyIntegrationUpsert({
      integrationLabel: 'TestProvider',
      portalEmail:      'test@x.mx',
      table:            'test_table',
      action: () => Promise.resolve({ error: null }),
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    // after() no se llamó (sin fallo = sin alerta)
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('action con error → ok:false, alerta programada', async () => {
    const result = await verifyIntegrationUpsert({
      integrationLabel: 'TestProvider',
      portalEmail:      'test@x.mx',
      table:            'test_table',
      action: () => Promise.resolve({ error: { message: 'DB write failed', code: '23505' } }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('DB write failed');
    expect(mockAfter).toHaveBeenCalledTimes(1);
    await flushAfter();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendEmail.mock.calls[0][0] as { subject: string; html: string };
    expect(emailCall.subject).toContain('TestProvider');
    expect(emailCall.subject).toContain('URGENTE');
    expect(emailCall.html).toContain('test@x.mx');
    expect(emailCall.html).toContain('DB write failed');
  });

  it('action que throw → ok:false, alerta programada', async () => {
    const result = await verifyIntegrationUpsert({
      integrationLabel: 'TestProvider',
      portalEmail:      null,
      table:            'test_table',
      action: () => { throw new Error('Network boom'); },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Network boom');
    expect(mockAfter).toHaveBeenCalledTimes(1);
    await flushAfter();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('acepta PromiseLike (PostgrestBuilder-style)', async () => {
    // Simula el patrón del PostgrestBuilder — thenable sin ser Promise.
    const thenable = {
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    };
    const result = await verifyIntegrationUpsert({
      integrationLabel: 'TestProvider',
      portalEmail:      null,
      table:            'test_table',
      action: () => thenable as PromiseLike<{ error: null }>,
    });
    expect(result.ok).toBe(true);
  });
});
