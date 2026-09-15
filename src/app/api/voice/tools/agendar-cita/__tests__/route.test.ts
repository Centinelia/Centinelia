// Regression test para feat/pool-work-based-billing (2026-09-15).
// agendar_cita cobra tarea base según acción:
//   agendar   → appointment_registered
//   modificar → appointment_modified
//   cancelar  → appointment_cancelled (solo si canceló ≥1 row)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/vapi/auth', () => ({
  requireVapiAuth: vi.fn(() => true),
}));

const conflictRows = { data: [], error: null };
const cancelledRowsRef: { current: Array<{ id: string }> } = { current: [{ id: 'apt-cancel-1' }] };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    const chain: any = {
      from: vi.fn(() => chain),
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve({
        data: { business_name: 'X', calendar_url: null, transfer_whatsapp: null, timezone: 'America/Monterrey' },
        error: null,
      })),
      then: (resolve: any) => resolve(conflictRows),
    };
    // Override chain.insert().select().single() to return apt id for the appointment insert
    let insertCount = 0;
    chain.insert = vi.fn(() => {
      insertCount++;
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: `apt-new-${insertCount}` }, error: null }),
        }),
      };
    });
    // Override update() chain for cancel branch to return .select() cancelled rows
    chain.update = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: () => Promise.resolve({ data: cancelledRowsRef.current, error: null }),
          })),
        })),
      })),
    }));
    return chain;
  }),
}));

vi.mock('@/lib/services/connector-tools', () => ({
  executeListCalendarEvents: vi.fn(() => Promise.resolve({ ok: false, events: [] })),
  executeCreateCalendarEvent: vi.fn(() => Promise.resolve({ ok: false, error: 'no calendar' })),
}));

const consumeAiOpMock = vi.fn(() => Promise.resolve({ ok: true, aiOpsUsed: 1, aiOpsLimit: 1000 }));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: consumeAiOpMock,
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsApp: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/lib/observability/voice-trace', () => ({
  traceVoiceCall: vi.fn(),
}));

async function buildReq(body: unknown, agentId = 'agent-1') {
  return new NextRequest(`http://x/api/voice/tools/agendar-cita?agent_id=${agentId}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cancelledRowsRef.current = [{ id: 'apt-cancel-1' }];
});

describe('agendar-cita route (work-based billing)', () => {
  it('cobra appointment_registered al agendar con datos completos', async () => {
    const { POST } = await import('../route');
    const req = await buildReq({
      accion: 'agendar',
      nombre: 'Cliente Y', servicio: 'revisión',
      fecha_iso: '2026-11-30', hora: '10:00',
      telefono: '+528112345678', duracion_min: 30,
    });
    await POST(req);
    const sources = consumeAiOpMock.mock.calls.map(c => (c[2] as any)?.source);
    expect(sources).toContain('appointment_registered');
    expect(sources).not.toContain('appointment_modified');
    expect(sources).not.toContain('calendar_event_created');
  });

  it('cobra appointment_modified con accion=modificar', async () => {
    const { POST } = await import('../route');
    const req = await buildReq({
      accion: 'modificar',
      nombre: 'Cliente Y',
      fecha_iso: '2026-11-30', hora: '11:00',
      telefono: '+528112345678',
    });
    await POST(req);
    const sources = consumeAiOpMock.mock.calls.map(c => (c[2] as any)?.source);
    expect(sources).toContain('appointment_modified');
  });

  it('cobra appointment_cancelled solo si canceló ≥1 cita', async () => {
    const { POST } = await import('../route');
    const req = await buildReq({
      accion: 'cancelar',
      telefono: '+528112345678',
    });
    await POST(req);
    const sources = consumeAiOpMock.mock.calls.map(c => (c[2] as any)?.source);
    expect(sources).toContain('appointment_cancelled');
  });

  it('cancelar sin filas cancelladas no cobra', async () => {
    cancelledRowsRef.current = [];
    const { POST } = await import('../route');
    const req = await buildReq({
      accion: 'cancelar',
      telefono: '+528112345678',
    });
    await POST(req);
    const sources = consumeAiOpMock.mock.calls.map(c => (c[2] as any)?.source);
    expect(sources).not.toContain('appointment_cancelled');
  });
});
