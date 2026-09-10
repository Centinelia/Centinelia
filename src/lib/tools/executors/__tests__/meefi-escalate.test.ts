// src/lib/tools/executors/__tests__/meefi-escalate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeMeefiEscalateToHuman } from '../meefi-escalate-to-human';

// Mock del helper canónico. Firma real:
//   sendMeerkatHtmlEmail(input: SendAsAgentInput, supabase, precomputed?) => Promise<SendAsAgentResult>
vi.mock('@/lib/email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: vi.fn().mockResolvedValue({ ok: true, provider: 'resend' }),
}));

// Mock de createAdminClient para evitar llamadas reales en tests.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';

beforeEach(() => {
  vi.clearAllMocks();
  (sendMeerkatHtmlEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, provider: 'resend' });
});

describe('meefi-escalate-to-human', () => {
  it('rutea transferencia_urgente a emilio alias', async () => {
    const r = await executeMeefiEscalateToHuman(
      { agent_id: 'nelia_meefi' } as any,
      {
        topic:           'transferencia_urgente',
        priority:        'alta',
        context_summary: 'Usuario reporta transferencia $50k retenida',
        user_id:         'usr_003',
        transcript:      'demo transcript',
      },
    );
    expect(r.ok).toBe(true);
    expect(r.sent_to).toBe('nazre20+emilio@gmail.com');
    expect(r.routed_to_name).toBe('Emilio (Operaciones)');
    expect(r.ticket_id).toMatch(/^esc_/);
  });

  it('rutea cuentas_docs a ashley alias', async () => {
    const r = await executeMeefiEscalateToHuman(
      {} as any,
      {
        topic:           'cuentas_docs',
        priority:        'media',
        context_summary: 'x',
        user_id:         'usr_001',
      },
    );
    expect(r.ok).toBe(true);
    expect(r.sent_to).toBe('nazre20+ashley@gmail.com');
    expect(r.routed_to_name).toBe('Ashley (Cuentas)');
    expect(r.ticket_id).toMatch(/^esc_/);
  });

  it('rutea recovery_2fa a ashley', async () => {
    const r = await executeMeefiEscalateToHuman(
      {} as any,
      {
        topic:           'recovery_2fa',
        priority:        'media',
        context_summary: 'x',
        user_id:         'usr_002',
      },
    );
    expect(r.ok).toBe(true);
    expect(r.sent_to).toBe('nazre20+ashley@gmail.com');
    expect(r.routed_to_name).toBe('Ashley (Cuentas)');
  });
});
