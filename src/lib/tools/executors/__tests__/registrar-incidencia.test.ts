// src/lib/tools/executors/__tests__/registrar-incidencia.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registrarIncidencia } from '../registrar-incidencia';
import { sendMeerkatHtmlEmail } from '../../../email/send-as-agent';
import { upsertFollowupContactForIncident } from '../../../incidents/scheduling';

vi.mock('../../../email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: vi.fn(() => Promise.resolve({ ok: true, provider: 'resend' })),
}));

vi.mock('../../../incidents/scheduling', () => ({
  upsertFollowupContactForIncident: vi.fn(() => Promise.resolve({ outbound_contact_id: 'oc-1' })),
}));

function makeCtx(overrides: any = {}) {
  const insertedRow = { id: 'inc-1' };
  // priorCandidates: array de rows { business_name, sucursal } que simula el
  // resultado del lookup para is_new_client. Default vacío = cliente nuevo.
  const priorCandidates = overrides.priorCandidates ?? [];
  const supabase: any = {
    from: vi.fn(() => supabase),
    insert: vi.fn(() => supabase),
    update: vi.fn(() => supabase),
    select: vi.fn(() => supabase),
    limit:  vi.fn(() => supabase),
    single: vi.fn(() => Promise.resolve({ data: insertedRow, error: null })),
    // eq(): terminal para el lookup (await directo) devuelve array; encadenable
    // para el flujo insert.select.eq.
    eq:     vi.fn(function (this: any) { return supabase; }),
    // Hacer supabase thenable para que `await supabase` en el lookup devuelva
    // los candidates. Los otros awaits (insert→select→single, update→eq)
    // consumen el thenable primero pero el flujo real resuelve por single()
    // que se llama al final del insert.
    then:   (resolve: any) => resolve({ data: priorCandidates, error: null }),
  };
  return {
    supabase,
    agent: {
      id: 'agent-1', portal_email: 'test@x.mx', agent_name: 'Nia',
      business_name: 'Tortillería X',
      ...overrides,
    },
    org: {
      directory: [
        { id: 'p1', name: 'Encargado Y', phone: '+528100000000',
          email: 'encargado@x.mx', receives_incident_reports: true },
      ],
    },
    channel: 'voice' as const,
    sourceCallId: 'call-1',
  };
}

beforeEach(() => vi.clearAllMocks());

describe('registrarIncidencia', () => {
  it('happy path: inserts incident, sends email, schedules callback', async () => {
    const ctx = makeCtx();
    const res = await registrarIncidencia(ctx as any, {
      business_name: 'Abarrotes X',
      contact_name:  'Doña Meche',
      contact_phone: '8112345678',
      address:       'Calle 1 #100 Col Y',
      motivo:        'No llegó vendedor esta semana',
    });
    expect(res.ok).toBe(true);
    expect(res.incident_id).toBe('inc-1');
    expect(res.email_sent).toBe(true);
    expect(new Date(res.verification_at).getTime()).toBeGreaterThan(Date.now() + 2.5*86400*1000);
  });

  it('when no encargado configured, email_sent=false but flow completes', async () => {
    const ctx = makeCtx();
    ctx.org.directory = [];
    const res = await registrarIncidencia(ctx as any, {
      business_name: 'X', contact_phone: '8112345678', address: 'Y', motivo: 'Z',
    });
    expect(res.ok).toBe(true);
    expect(res.email_sent).toBe(false);
  });

  it('throws on invalid phone', async () => {
    const ctx = makeCtx();
    await expect(registrarIncidencia(ctx as any, {
      business_name: 'X', contact_phone: '123', address: 'Y', motivo: 'Z',
    })).rejects.toThrow();
  });

  it('passes sourceCallId through to source_call_id in insert payload', async () => {
    const ctx = makeCtx();
    // Capture the payload passed to .insert()
    let capturedPayload: any = null;
    ctx.supabase.insert = vi.fn((payload: any) => {
      capturedPayload = payload;
      return ctx.supabase;
    });
    await registrarIncidencia(ctx as any, {
      business_name: 'X', contact_phone: '8112345678', address: 'Y', motivo: 'Z',
    });
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.source_call_id).toBe('call-1');
  });

  it('sets is_new_client=true when no prior incident matches business_name+sucursal', async () => {
    const ctx = makeCtx({ priorCandidates: [] });
    let capturedPayload: any = null;
    ctx.supabase.insert = vi.fn((payload: any) => {
      capturedPayload = payload;
      return ctx.supabase;
    });
    await registrarIncidencia(ctx as any, {
      business_name: 'Abarrotes Nueva', contact_phone: '8199990000', address: 'Y', motivo: 'Z',
    });
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.is_new_client).toBe(true);
  });

  it('sets is_new_client=false when same business_name+null sucursal already appears', async () => {
    const ctx = makeCtx({
      priorCandidates: [{ business_name: 'Abarrotes Recurrente', sucursal: null }],
    });
    let capturedPayload: any = null;
    ctx.supabase.insert = vi.fn((payload: any) => {
      capturedPayload = payload;
      return ctx.supabase;
    });
    await registrarIncidencia(ctx as any, {
      business_name: 'Abarrotes Recurrente', contact_phone: '8112345678', address: 'Y', motivo: 'Z',
    });
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.is_new_client).toBe(false);
  });

  it('sets is_new_client=true when same business_name but different sucursal (multi-branch)', async () => {
    const ctx = makeCtx({
      priorCandidates: [{ business_name: 'Don Dante', sucursal: 'San Nicolás' }],
    });
    let capturedPayload: any = null;
    ctx.supabase.insert = vi.fn((payload: any) => {
      capturedPayload = payload;
      return ctx.supabase;
    });
    await registrarIncidencia(ctx as any, {
      business_name: 'Don Dante', sucursal: 'Apodaca',
      contact_phone: '8112345678', address: 'Y', motivo: 'Z',
    });
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.is_new_client).toBe(true);
    expect(capturedPayload.sucursal).toBe('Apodaca');
  });

  it('normalizes business_name (accents + case) for match', async () => {
    const ctx = makeCtx({
      priorCandidates: [{ business_name: 'Abarrotes Charró', sucursal: null }],
    });
    let capturedPayload: any = null;
    ctx.supabase.insert = vi.fn((payload: any) => {
      capturedPayload = payload;
      return ctx.supabase;
    });
    await registrarIncidencia(ctx as any, {
      business_name: 'ABARROTES CHARRO',
      contact_phone: '8112345678', address: 'Y', motivo: 'Z',
    });
    expect(capturedPayload.is_new_client).toBe(false);
  });

  it('when sendMeerkatHtmlEmail returns ok=false, flow completes with email_sent=false and callback scheduled', async () => {
    (sendMeerkatHtmlEmail as any).mockResolvedValueOnce({ ok: false, provider: 'none' });
    const ctx = makeCtx();
    const res = await registrarIncidencia(ctx as any, {
      business_name: 'X', contact_phone: '8112345678', address: 'Y', motivo: 'Z',
    });
    expect(res.ok).toBe(true);
    expect(res.email_sent).toBe(false);
    // Callback must still be scheduled even though email failed.
    expect((upsertFollowupContactForIncident as any)).toHaveBeenCalledTimes(1);
    expect(res.verification_at).toBeTruthy();
    expect(new Date(res.verification_at).getTime()).toBeGreaterThan(Date.now() + 2.5*86400*1000);
  });

  it('when sendMeerkatHtmlEmail throws, flow still completes (defensive try/catch)', async () => {
    (sendMeerkatHtmlEmail as any).mockRejectedValueOnce(new Error('network boom'));
    const ctx = makeCtx();
    const res = await registrarIncidencia(ctx as any, {
      business_name: 'X', contact_phone: '8112345678', address: 'Y', motivo: 'Z',
    });
    expect(res.ok).toBe(true);
    expect(res.email_sent).toBe(false);
    expect((upsertFollowupContactForIncident as any)).toHaveBeenCalledTimes(1);
  });
});
