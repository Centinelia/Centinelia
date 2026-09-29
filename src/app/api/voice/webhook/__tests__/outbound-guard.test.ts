/**
 * Regression test para bug audit 2026-09-29 Nelia Tortillería:
 *
 * /api/voice/webhook estaba procesando outbound calls como si fueran
 * inbound porque el request-level serverUrl no llegaba (bug B). El guard
 * `call.type === 'outboundPhoneCall'` en el handler previene doble cobro:
 *
 *   Sin guard: outbound call cobrada 2x (una aquí como 'call', otra en
 *   outbound webhook como 'llamada_saliente').
 *   Con guard: outbound calls skipped, outbound webhook es owner único.
 *
 * Este test falla ANTES del guard (procesaría el outbound y llamaría al
 * insert) y pasa DESPUÉS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mocks minimalistas: el guard retorna ANTES de tocar cualquier dep, así
// que las mocks solo existen para que el módulo cargue. Si cualquier mock
// se llama, es señal de que el guard NO funcionó → test debe fallar.
const { supabaseFromMock } = vi.hoisted(() => ({
  supabaseFromMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: supabaseFromMock }),
}));

vi.mock('@/lib/whatsapp/send',                        () => ({ sendWhatsApp: vi.fn() }));
vi.mock('@/lib/email/send',                           () => ({
  sendEmail: vi.fn(),
  minutesAlertHtml: vi.fn(),
  appointmentConfirmationToClientHtml: vi.fn(),
  leadFollowUpToClientHtml: vi.fn(),
}));
vi.mock('@/lib/annual-contracts/pool-consume',        () => ({
  consumePoolMinutes: vi.fn(),
  fireOverageAlertIfNeeded: vi.fn(),
}));
vi.mock('@/lib/vapi/control',                         () => ({ pauseVapiAgent: vi.fn() }));
vi.mock('@/lib/vapi/outbound',                        () => ({ triggerOutboundCall: vi.fn() }));
vi.mock('@/lib/billing/auto-refill',                  () => ({ executeAutoRefill: vi.fn() }));
vi.mock('@/lib/customers',                            () => ({
  getCustomerContext: vi.fn(),
  upsertCustomer: vi.fn(),
  logInteraction: vi.fn(),
}));
vi.mock('@/lib/ai/extract-learnings',                 () => ({ extractAndSaveLearnings: vi.fn() }));
vi.mock('@/lib/ai/generate-team-message',             () => ({ generateTeamMessage: vi.fn() }));
vi.mock('@/lib/ai/self-eval',                         () => ({ selfEvalCall: vi.fn() }));
vi.mock('@/lib/ai/ces-eval',                          () => ({ cesEvalCall: vi.fn() }));
vi.mock('@/lib/memory',                               () => ({ ingestCall: vi.fn() }));
vi.mock('@/lib/goals/progress',                       () => ({ getGoalsContext: vi.fn() }));
vi.mock('@/lib/initiative/detector',                  () => ({ checkVoiceInitiative: vi.fn() }));
vi.mock('@/lib/notion/client',                        () => ({ addCallEntry: vi.fn() }));
vi.mock('@/lib/vapi/meerkat-map',                     () => ({ getMeerkatIdForAgentRow: vi.fn() }));
vi.mock('@/lib/feature-flags/version-flag-resolver',  () => ({ resolveMeerkatVersionForAgent: vi.fn() }));
vi.mock('@/lib/feature-flags/all-active',             () => ({ evaluateFlagsForOrg: vi.fn() }));
vi.mock('@/lib/portal/org-token',                     () => ({ getOrgToken: vi.fn() }));
vi.mock('@/lib/vapi/recordings',                      () => ({ downloadAndStoreVapiRecording: vi.fn() }));

const SECRET = 'test-vapi-server-secret-abcd1234';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPI_SERVER_SECRET = SECRET;
});

function makeReq(payload: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/voice/webhook', {
    method:  'POST',
    body:    JSON.stringify(payload),
    headers: {
      'content-type':  'application/json',
      'x-vapi-secret': SECRET,
    },
  });
}

describe('POST /api/voice/webhook — outbound guard (bug audit 2026-09-29)', () => {
  it('retorna early con skipped=outbound_delegated cuando call.type=outboundPhoneCall', async () => {
    const { POST } = await import('../route');
    const req = makeReq({
      message: {
        type: 'end-of-call-report',
        call: {
          id:   'vapi-out-1',
          type: 'outboundPhoneCall',
          endedAt:   '2026-09-29T10:00:30Z',
          startedAt: '2026-09-29T10:00:00Z',
        },
      },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.skipped).toBe('outbound_delegated_to_outbound_webhook');
  });

  it('NO invoca supabase.from() cuando skippea outbound (no side effects)', async () => {
    const { POST } = await import('../route');
    const req = makeReq({
      message: {
        type: 'end-of-call-report',
        call: {
          id:   'vapi-out-2',
          type: 'outboundPhoneCall',
        },
      },
    });

    await POST(req);

    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it('llamadas inbound (call.type=inboundPhoneCall) SÍ entran al flow normal (no skipped)', async () => {
    const { POST } = await import('../route');
    // Payload inbound mínimo — el resto del handler puede fallar por mocks
    // vacíos, pero el guard NO debe retornar early. Lo que importa: el
    // response NO tiene "skipped".
    const req = makeReq({
      message: {
        type: 'end-of-call-report',
        call: {
          id:   'vapi-in-1',
          type: 'inboundPhoneCall',
          endedAt:   '2026-09-29T10:00:30Z',
          startedAt: '2026-09-29T10:00:00Z',
        },
      },
    });

    // La ruta puede terminar en 200 o error dependiendo de cuán lejos llegue
    // con mocks vacíos. Solo verifico que no matchee el skipped.
    let json: Record<string, unknown> = {};
    try {
      const res = await POST(req);
      json = await res.json();
    } catch {
      // Error interno OK — significa que pasó del guard y falló en la lógica
      // subsecuente por mocks. El guard NO se activó, que es lo que quiero.
      return;
    }
    expect(json.skipped).not.toBe('outbound_delegated_to_outbound_webhook');
  });

  it('llamadas sin call.type (fallback) NO son skipped como outbound', async () => {
    const { POST } = await import('../route');
    const req = makeReq({
      message: {
        type: 'end-of-call-report',
        call: {
          id: 'vapi-notype-1',
          endedAt:   '2026-09-29T10:00:30Z',
          startedAt: '2026-09-29T10:00:00Z',
        },
      },
    });

    let json: Record<string, unknown> = {};
    try {
      const res = await POST(req);
      json = await res.json();
    } catch {
      return;
    }
    expect(json.skipped).not.toBe('outbound_delegated_to_outbound_webhook');
  });
});
