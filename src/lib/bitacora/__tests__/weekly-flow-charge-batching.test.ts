/**
 * Regression test: cobro batched en runEphemeralFlow + runPersistentFlow.
 *
 * Antes del fix (bug detectado en case study Tortillería Estrella 2026-10-01):
 * el `consumeAiOp` estaba DENTRO del loop por recipient, lo que cobraba 2
 * (o N) ops por cada bitácora enviada en vez de 1. Beatriz tiene 2
 * destinatarios y 3 meses de ai_ops_log mostraban 6 rows por 3 bitácoras
 * reales (y 2 rows por 1 bitácora mensual real).
 *
 * El patrón correcto es el mismo que usa registrar-incidencia: acumular
 * sentCount dentro del loop y cobrar 1 vez al final con count=sentCount.
 * Viola [[feedback-batched-consume-multi-io]]: N side-effects → 1 cobro
 * count=N. Ver también [[feedback-pool-accuracy-top-priority]].
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEphemeralFlow, runPersistentFlow, type BitacoraConfig, type TemplateConfig } from '../weekly-flow';

vi.mock('../build-excel', () => ({
  buildBitacoraExcelForAgent: vi.fn(() => Promise.resolve(Buffer.from('fake-xlsx'))),
  sanitizeBusinessName:       vi.fn((n: string) => n.replace(/\s+/g, '_').toLowerCase()),
}));

vi.mock('../live-workbook', () => ({
  updateLiveWorkbook: vi.fn(() => Promise.resolve(Buffer.from('fake-live-xlsx'))),
}));

vi.mock('../../email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: vi.fn(() => Promise.resolve({ ok: true, provider: 'resend' })),
}));

vi.mock('../../ai/ops-guard', () => ({
  consumeAiOp: vi.fn(() => Promise.resolve({ ok: true, used: 1, limit: 1200 })),
}));

// Forzar isLastWeekdayOfMonth=false para que runEphemeralFlow no entre al
// bloque monthly (que tiene su propio test aparte).
vi.mock('../schedule', async () => {
  const actual = await vi.importActual<typeof import('../schedule')>('../schedule');
  return {
    ...actual,
    isLastWeekdayOfMonth: vi.fn(() => false),
  };
});

const cfg: BitacoraConfig = {
  enabled:                       true,
  day_of_week:                   6,
  hour:                          14,
  recipients:                    ['encargado@x.mx', 'copia@x.mx'],
  include_monthly_last_saturday: false,
};

function makeSupa() {
  const supa: any = {
    from:   vi.fn(() => supa),
    select: vi.fn(() => supa),
    eq:     vi.fn(() => supa),
    gte:    vi.fn(() => supa),
    lt:     vi.fn(() => supa),
    order:  vi.fn(() => Promise.resolve({ data: [], error: null })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(() => Promise.resolve({ data: new Blob([new Uint8Array([80, 75])]), error: null })),
        upload:   vi.fn(() => Promise.resolve({ error: null })),
      })),
    },
  };
  return supa;
}

const agent = {
  id:                    'agent-nelia',
  agent_name:            'Nelia',
  business_name:         'Tortillería Estrella',
  portal_email:          'servicioalcliente@tortillasestrella.com.mx',
  email_from:            null,
  email_domain_verified: false,
};

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset default: sendMeerkatHtmlEmail OK para todos los recipients.
  const { sendMeerkatHtmlEmail } = await import('../../email/send-as-agent');
  (sendMeerkatHtmlEmail as any).mockResolvedValue({ ok: true, provider: 'resend' });
});

describe('runEphemeralFlow:cobro batched (regression Tortillería 2026-10-01)', () => {
  it('2 recipients, ambos OK → 1 llamada a consumeAiOp con count=2', async () => {
    const supa = makeSupa();
    const { consumeAiOp } = await import('../../ai/ops-guard');
    const monday = new Date('2026-09-14T00:00:00Z');
    const nextMonday = new Date('2026-09-21T00:00:00Z');
    const currentDate = new Date('2026-09-20T20:00:00Z');

    await runEphemeralFlow(supa, agent, cfg, monday, nextMonday, currentDate);

    expect(consumeAiOp).toHaveBeenCalledTimes(1);
    expect(consumeAiOp).toHaveBeenCalledWith(
      'agent-nelia',
      2,
      expect.objectContaining({
        source: 'bitacora_semanal_send',
        label:  'Bitácora semanal enviada por correo (2 recipients)',
      }),
    );
  });

  it('2 recipients, solo 1 envía OK → 1 llamada a consumeAiOp con count=1 y label singular', async () => {
    const { sendMeerkatHtmlEmail } = await import('../../email/send-as-agent');
    const { consumeAiOp } = await import('../../ai/ops-guard');
    (sendMeerkatHtmlEmail as any)
      .mockResolvedValueOnce({ ok: true, provider: 'resend' })
      .mockResolvedValueOnce({ ok: false, error: 'rejected' });
    const supa = makeSupa();
    const monday = new Date('2026-09-14T00:00:00Z');
    const nextMonday = new Date('2026-09-21T00:00:00Z');
    const currentDate = new Date('2026-09-20T20:00:00Z');

    await runEphemeralFlow(supa, agent, cfg, monday, nextMonday, currentDate);

    expect(consumeAiOp).toHaveBeenCalledTimes(1);
    expect(consumeAiOp).toHaveBeenCalledWith(
      'agent-nelia',
      1,
      expect.objectContaining({
        source: 'bitacora_semanal_send',
        label:  'Bitácora semanal enviada por correo',
      }),
    );
  });

  it('todos los recipients fallan → consumeAiOp NO se llama', async () => {
    const { sendMeerkatHtmlEmail } = await import('../../email/send-as-agent');
    const { consumeAiOp } = await import('../../ai/ops-guard');
    (sendMeerkatHtmlEmail as any).mockResolvedValue({ ok: false, error: 'rejected' });
    const supa = makeSupa();
    const monday = new Date('2026-09-14T00:00:00Z');
    const nextMonday = new Date('2026-09-21T00:00:00Z');
    const currentDate = new Date('2026-09-20T20:00:00Z');

    await runEphemeralFlow(supa, agent, cfg, monday, nextMonday, currentDate);

    expect(consumeAiOp).not.toHaveBeenCalled();
  });
});

describe('runPersistentFlow:cobro batched', () => {
  const template: TemplateConfig = {
    url:     'tmpl/weekly.xlsx',
    mapping: {} as any,
  };

  it('2 recipients, ambos OK → 1 cobro con count=2', async () => {
    const { consumeAiOp } = await import('../../ai/ops-guard');
    const supa = makeSupa();
    const currentDate = new Date('2026-09-20T20:00:00Z');

    await runPersistentFlow(supa, agent, cfg, template, currentDate);

    expect(consumeAiOp).toHaveBeenCalledTimes(1);
    expect(consumeAiOp).toHaveBeenCalledWith(
      'agent-nelia',
      2,
      expect.objectContaining({
        source: 'bitacora_semanal_send',
        label:  'Bitácora semanal enviada por correo (2 recipients)',
      }),
    );
  });
});
