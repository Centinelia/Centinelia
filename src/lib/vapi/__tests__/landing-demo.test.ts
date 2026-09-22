/**
 * Tests del wrapper triggerLandingDemoCall + buildCampaignInstructions.
 *
 * Bugs que estos tests capturan:
 *   (1) Habla lento sin ritmo → voice override con speed >= 1.0 debe llegar
 *       al outbound (Nia base es 0.91, adecuado para clientes reales pero
 *       demasiado lento para el demo).
 *   (2) Pregunta "cuál es tu puesto en la empresa" → el prompt viejo decía
 *       "actúa como empleada contratada por el negocio del prospect" y el
 *       LLM inferia que el user era alguien del negocio (jefe, RH). El
 *       framing correcto: el user es un cliente potencial que llamó al
 *       negocio; Nia es la recepcionista virtual que atiende.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockTriggerOutbound,
  mockSelectSingle,
  mockSetVapiCall,
} = vi.hoisted(() => ({
  mockTriggerOutbound: vi.fn(),
  mockSelectSingle:    vi.fn(),
  mockSetVapiCall:     vi.fn(),
}));

vi.mock('../outbound', () => ({
  triggerOutboundCall: (...args: unknown[]) => mockTriggerOutbound(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockSelectSingle(),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/landing/callback-store', () => ({
  setVapiCall: (...args: unknown[]) => mockSetVapiCall(...args),
}));

vi.mock('@/lib/landing/constants', () => ({
  LANDING_DEMO_AGENT_ID: 'landing-demo-agent-id',
}));

import { triggerLandingDemoCall, buildCampaignInstructions } from '../landing-demo';

beforeEach(() => {
  vi.clearAllMocks();
  mockTriggerOutbound.mockResolvedValue({ ok: true, callId: 'vapi-call-1' });
  mockSelectSingle.mockResolvedValue({
    data: { id: 'landing-demo-agent-id', vapi_agent_id: 'vapi-agent-1', phone_number: '+52555' },
    error: null,
  });
  mockSetVapiCall.mockResolvedValue(undefined);
});

describe('buildCampaignInstructions — framing del user', () => {
  it('aclara que el USER que llama es cliente/prospecto del negocio (no dueño ni empleado)', () => {
    const prompt = buildCampaignInstructions({
      orgName:        'Café Luna',
      orgDescription: 'Cafetería especializada en café de origen',
      expectation:    'Quiero probar si me atiende para hacer un pedido',
    });
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/cliente|prospecto|persona que (te )?llama|quien (te )?habla/);
  });

  it('NO dice "actúa como empleada contratada por el negocio" (framing viejo que causaba pregunta de puesto)', () => {
    const prompt = buildCampaignInstructions({
      orgName: 'X', orgDescription: 'Y', expectation: 'Z',
    });
    expect(prompt).not.toMatch(/empleada.{0,20}contratada.{0,30}negocio/i);
    expect(prompt).not.toMatch(/actua como si fueras.{0,50}empleada.{0,30}contratada/i);
  });

  it('instruye a Nia a atender AL USUARIO por el motivo declarado (no interrogarlo)', () => {
    const prompt = buildCampaignInstructions({
      orgName: 'Café Luna', orgDescription: 'Cafetería', expectation: 'Pedido para llevar',
    });
    expect(prompt).toMatch(/recepcionista|asistente/i);
    expect(prompt.toLowerCase()).toContain('pedido para llevar');
  });

  it('instruye EXPLÍCITAMENTE a NO preguntar el puesto/rol del usuario', () => {
    const prompt = buildCampaignInstructions({
      orgName: 'X', orgDescription: 'Y', expectation: 'Z',
    });
    expect(prompt).toMatch(/(nunca|no le).{0,25}pregunt.{0,30}(puesto|rol)/i);
  });

  it('el saludo inicial arranca abierto sin asumir que el user es del negocio', () => {
    const prompt = buildCampaignInstructions({
      orgName: 'Café Luna', orgDescription: 'X', expectation: 'Y',
    });
    expect(prompt).toMatch(/café luna/i);
  });
});

describe('buildCampaignInstructions — preserva guardrails duros', () => {
  it('mantiene la regla de no mencionar IA/GPT/chatbot', () => {
    const prompt = buildCampaignInstructions({
      orgName: 'X', orgDescription: 'Y', expectation: 'Z',
    });
    expect(prompt).toMatch(/nunca menciones.{0,20}IA/i);
  });

  it('sanitiza campos user-provided (sin ángulos, sin newlines)', () => {
    const prompt = buildCampaignInstructions({
      orgName:        'Pizzeria<script>alert(1)</script>',
      orgDescription: 'Servicio\ncon\nnewlines',
      expectation:    'Test',
    });
    expect(prompt).not.toContain('<script>');
    expect(prompt).not.toContain('\nnewlines');
  });
});

describe('triggerLandingDemoCall — voice override', () => {
  it('pasa voiceOverride con speed >= 1.0 al outbound (Nia base es 0.91, demo debe hablar con ritmo normal)', async () => {
    await triggerLandingDemoCall({
      phone: '5551234567',
      orgName: 'X', orgDescription: 'Y', expectation: 'Z',
      requestId: 'req-1',
    });

    expect(mockTriggerOutbound).toHaveBeenCalledTimes(1);
    const arg = mockTriggerOutbound.mock.calls[0][0] as { voiceOverride?: { speed?: number } };
    expect(arg.voiceOverride).toBeDefined();
    expect(arg.voiceOverride!.speed).toBeGreaterThanOrEqual(1.0);
  });

  it('propaga campaignInstructions con el orgName sanitizado', async () => {
    await triggerLandingDemoCall({
      phone: '5551234567',
      orgName: 'Café Luna',
      orgDescription: 'Cafetería',
      expectation: 'Hacer pedido',
      requestId: 'req-1',
    });

    const arg = mockTriggerOutbound.mock.calls[0][0] as { campaignInstructions: string };
    expect(arg.campaignInstructions).toContain('Café Luna');
    expect(arg.campaignInstructions).toContain('Hacer pedido');
  });
});
