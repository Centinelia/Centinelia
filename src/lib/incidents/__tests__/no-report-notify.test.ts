// src/lib/incidents/__tests__/no-report-notify.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyIfNoReport } from '../no-report-notify';
import { sendMeerkatHtmlEmail } from '../../email/send-as-agent';
import { consumeAiOp } from '../../ai/ops-guard';

vi.mock('../../email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: vi.fn(() => Promise.resolve({ ok: true, provider: 'resend' })),
}));

vi.mock('../../ai/ops-guard', () => ({
  consumeAiOp: vi.fn(() => Promise.resolve({ ok: true, used: 1, limit: 1000 })),
}));

// Default flag OFF → tests legacy ejercitan path inline con sendMeerkatHtmlEmail.
vi.mock('../../email/enqueue-email', () => ({
  isEmailJobsEnabled:   vi.fn(() => Promise.resolve(false)),
  enqueueEmailJobBatch: vi.fn(() => Promise.resolve([])),
}));

interface MockSupabase {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  then: (resolve: any) => any;
  _queue: Array<{ data: any; error: any }>;
}

function makeSupabase(responses: Array<{ data: any; error?: any }>): MockSupabase {
  // Cada consulta await supabase.from(...).select(...).eq(...) etc. consume
  // la siguiente respuesta de la cola. Los tests dan el orden esperado.
  const queue = responses.map(r => ({ data: r.data, error: r.error ?? null }));
  const supabase: any = {
    _queue: queue,
    from:   vi.fn(function () { return supabase; }),
    select: vi.fn(function () { return supabase; }),
    eq:     vi.fn(function () { return supabase; }),
    ilike:  vi.fn(function () { return supabase; }),
    limit:  vi.fn(function () { return supabase; }),
    then:   (resolve: any) => {
      const next = supabase._queue.shift() ?? { data: [], error: null };
      resolve(next);
    },
  };
  return supabase;
}

function baseInput(overrides: any = {}) {
  return {
    agent: {
      id: 'agent-1',
      portal_email: 'test@x.mx',
      agent_name: 'Nelia',
      business_name: 'Tortillería Estrella',
      email_from: null,
      email_domain_verified: false,
    },
    org: {
      notify_calls_without_report: true,
      directory: [
        { id: 'p1', name: 'Beatriz', phone: '+528100000000',
          email: 'beatriz@tortilleria.mx', receives_incident_reports: true },
      ],
    },
    callRow: {
      id: 'call-db-1',
      caller_number: '+528111112222',
      duration_seconds: 3,
      outcome: 'unanswered',
      summary: null,
    },
    capturedAt: new Date('2026-09-30T21:42:00Z'),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('notifyIfNoReport', () => {
  it('feature off: skips without sending', async () => {
    const supabase = makeSupabase([]);
    const input = baseInput();
    input.org.notify_calls_without_report = false;
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.skipped).toBe('flag_off');
    expect(res.sent).toBeUndefined();
    expect(sendMeerkatHtmlEmail).not.toHaveBeenCalled();
    expect(consumeAiOp).not.toHaveBeenCalled();
  });

  it('outcome=incident_registered: skips (report ya existe)', async () => {
    const supabase = makeSupabase([]);
    const input = baseInput({
      callRow: { id: 'c1', caller_number: '+528111112222', duration_seconds: 90,
                 outcome: 'incident_registered', summary: null },
    });
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.skipped).toBe('has_report');
    expect(sendMeerkatHtmlEmail).not.toHaveBeenCalled();
  });

  it('outcome=lead_created: skips (cliente nuevo ya reportado)', async () => {
    const supabase = makeSupabase([]);
    const input = baseInput({
      callRow: { id: 'c1', caller_number: '+528111112222', duration_seconds: 120,
                 outcome: 'lead_created', summary: null },
    });
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.skipped).toBe('has_report');
  });

  it('outcome=appointment_booked: skips', async () => {
    const supabase = makeSupabase([]);
    const input = baseInput({
      callRow: { id: 'c1', caller_number: '+528111112222', duration_seconds: 60,
                 outcome: 'appointment_booked', summary: null },
    });
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.skipped).toBe('has_report');
  });

  it('outcome=order_taken: skips', async () => {
    const supabase = makeSupabase([]);
    const input = baseInput({
      callRow: { id: 'c1', caller_number: '+528111112222', duration_seconds: 60,
                 outcome: 'order_taken', summary: null },
    });
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.skipped).toBe('has_report');
  });

  it('outcome=transferred: skips (fue a humano)', async () => {
    const supabase = makeSupabase([]);
    const input = baseInput({
      callRow: { id: 'c1', caller_number: '+528111112222', duration_seconds: 30,
                 outcome: 'transferred', summary: null },
    });
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.skipped).toBe('has_report');
  });

  it('caller_number vacío: skips', async () => {
    const supabase = makeSupabase([]);
    const input = baseInput({
      callRow: { id: 'c1', caller_number: '', duration_seconds: 3,
                 outcome: 'unanswered', summary: null },
    });
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.skipped).toBe('no_caller');
  });

  it('directory sin recipients: skips (nadie recibe)', async () => {
    const supabase = makeSupabase([]);
    const input = baseInput();
    input.org.directory = [];
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.skipped).toBe('no_recipients');
    expect(sendMeerkatHtmlEmail).not.toHaveBeenCalled();
  });

  it('unanswered + número desconocido: envía correo con estado "colgó antes"', async () => {
    // 1st query: outbound_contacts → vacío
    // 2nd query: leads_voice → vacío
    const supabase = makeSupabase([
      { data: [] },
      { data: [] },
    ]);
    const res = await notifyIfNoReport(baseInput(), supabase as any);
    expect(res.sent).toBe(1);
    expect(sendMeerkatHtmlEmail).toHaveBeenCalledTimes(1);
    const call = (sendMeerkatHtmlEmail as any).mock.calls[0][0];
    expect(call.to).toBe('beatriz@tortilleria.mx');
    expect(call.subject).toMatch(/Llamada sin reporte/i);
    expect(call.html).toContain('+528111112222');
    expect(call.html.toLowerCase()).toContain('colgó antes');
    expect(call.html.toLowerCase()).toContain('no identificado');
  });

  it('atendida sin reporte (outcome=other): envía correo con estado "atendida sin reporte"', async () => {
    const supabase = makeSupabase([
      { data: [] },
      { data: [] },
    ]);
    const input = baseInput({
      callRow: { id: 'c1', caller_number: '+528111112222', duration_seconds: 45,
                 outcome: 'other', summary: 'Cliente pidió información sobre horario' },
    });
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.sent).toBe(1);
    const call = (sendMeerkatHtmlEmail as any).mock.calls[0][0];
    expect(call.html.toLowerCase()).toContain('atendida sin reporte');
    expect(call.html).toContain('Cliente pidió información sobre horario');
  });

  it('info_provided también dispara aviso', async () => {
    const supabase = makeSupabase([
      { data: [] },
      { data: [] },
    ]);
    const input = baseInput({
      callRow: { id: 'c1', caller_number: '+528111112222', duration_seconds: 30,
                 outcome: 'info_provided', summary: 'Preguntó horario' },
    });
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.sent).toBe(1);
  });

  it('nombre en outbound_contacts: aparece en el correo', async () => {
    const supabase = makeSupabase([
      { data: [{ nombre: 'Abarrotes El Sol', telefono: '+528111112222' }] },
      // leads_voice no debe consultarse si outbound_contacts matcheó
    ]);
    const res = await notifyIfNoReport(baseInput(), supabase as any);
    expect(res.sent).toBe(1);
    const call = (sendMeerkatHtmlEmail as any).mock.calls[0][0];
    expect(call.html).toContain('Abarrotes El Sol');
    expect(call.subject).toContain('Abarrotes El Sol');
  });

  it('nombre solo en leads_voice (negocio prioriza sobre persona)', async () => {
    const supabase = makeSupabase([
      { data: [] }, // outbound_contacts vacío
      { data: [{ nombre: 'Doña Meche', negocio: 'Tienda Meche', whatsapp: '+528111112222' }] },
    ]);
    const res = await notifyIfNoReport(baseInput(), supabase as any);
    expect(res.sent).toBe(1);
    const call = (sendMeerkatHtmlEmail as any).mock.calls[0][0];
    // Prefiere negocio ("Tienda Meche") sobre nombre de persona ("Doña Meche")
    expect(call.html).toContain('Tienda Meche');
  });

  it('leads_voice sin negocio: usa nombre de persona', async () => {
    const supabase = makeSupabase([
      { data: [] },
      { data: [{ nombre: 'Doña Meche', negocio: null, whatsapp: '+528111112222' }] },
    ]);
    const res = await notifyIfNoReport(baseInput(), supabase as any);
    expect(res.sent).toBe(1);
    const call = (sendMeerkatHtmlEmail as any).mock.calls[0][0];
    expect(call.html).toContain('Doña Meche');
  });

  it('cobra 1 tarea batched con count=recipients cuando envía', async () => {
    const supabase = makeSupabase([
      { data: [] },
      { data: [] },
    ]);
    const input = baseInput();
    input.org.directory = [
      { id: 'p1', name: 'Beatriz', phone: '+521', email: 'b@x.mx', receives_incident_reports: true },
      { id: 'p2', name: 'Ramón',   phone: '+522', email: 'r@x.mx', receives_incident_reports: true },
    ];
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.sent).toBe(2);
    expect(sendMeerkatHtmlEmail).toHaveBeenCalledTimes(2);
    // 1 sola llamada a consumeAiOp con count=2 (batched)
    expect(consumeAiOp).toHaveBeenCalledTimes(1);
    const [agentId, count] = (consumeAiOp as any).mock.calls[0];
    expect(agentId).toBe('agent-1');
    expect(count).toBe(2);
  });

  it('si sendMeerkatHtmlEmail falla, no cobra por ese envío', async () => {
    (sendMeerkatHtmlEmail as any).mockResolvedValueOnce({ ok: false, provider: 'none', error: 'boom' });
    const supabase = makeSupabase([
      { data: [] },
      { data: [] },
    ]);
    const res = await notifyIfNoReport(baseInput(), supabase as any);
    expect(res.sent).toBe(0);
    expect(consumeAiOp).not.toHaveBeenCalled();
  });

  it('caller_number con menos de 10 dígitos: skips (número inválido)', async () => {
    const supabase = makeSupabase([]);
    const input = baseInput({
      callRow: { id: 'c1', caller_number: '911', duration_seconds: 3,
                 outcome: 'unanswered', summary: null },
    });
    const res = await notifyIfNoReport(input, supabase as any);
    expect(res.skipped).toBe('no_caller');
  });
});
