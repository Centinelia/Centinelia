// src/lib/nox/__tests__/brief-deliverer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { deliverBrief } from '../brief-deliverer';

vi.mock('@/lib/email/send', () => ({
  sendEmail:        vi.fn(async () => true),
  shell:            (body: string) => body,
  heading:          (t: string, s: string) => `<h1>${t}</h1><p>${s}</p>`,
  infoCard:         (body: string) => `<div>${body}</div>`,
  mdToEmailHtml:    (md: string) => `<html>${md}</html>`,
  agentBrandedFrom: (name: string | null) => `${name ?? 'Centinelia'} <no-reply@centinelia.mx>`,
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsApp: vi.fn(async () => true),
}));

function mockSupabase() {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'brief-1' }, error: null }) }) }),
    }),
  } as any;
}

describe('deliverBrief', () => {
  it('envía email + WA + guarda en DB cuando todos los canales están activos', async () => {
    const { sendEmail } = await import('@/lib/email/send');
    const { sendWhatsApp } = await import('@/lib/whatsapp/send');
    const status = await deliverBrief(
      { markdown: '## Test', buckets: { accion: [], prep: [], fyi: [] } },
      { id: 'a1', agent_name: 'Nox', business_name: 'Test', client_email: 'owner@x.com', transfer_whatsapp: '+521234567890', portal_email: 'owner@x.com', timezone: 'America/Monterrey' },
      { email: true, whatsapp: true, portal: true },
      'cron',
      mockSupabase(),
    );
    expect(status.email).toBe('sent');
    expect(status.wa).toBe('sent');
    expect(status.portal).toBe('sent');
    expect(status.brief_id).toBe('brief-1');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
  });

  it('skip email si client_email es null', async () => {
    const status = await deliverBrief(
      { markdown: '## Test', buckets: { accion: [], prep: [], fyi: [] } },
      { id: 'a1', agent_name: 'Nox', business_name: 'Test', client_email: null, transfer_whatsapp: null, portal_email: 'owner@x.com', timezone: 'America/Monterrey' },
      { email: true, whatsapp: true, portal: true },
      'cron',
      mockSupabase(),
    );
    expect(status.email).toBe('skipped');
    expect(status.wa).toBe('skipped');
  });
});
