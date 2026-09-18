/**
 * landing-demo unit tests — mock triggerOutboundCall, Supabase y callback-store
 *
 * Verifica que triggerLandingDemoCall:
 * - Pasa el agente demo, numero con prefijo +52, campaignInstructions con nombre de industria
 * - Guarda el vapiCallId en callback-store
 * - Propaga errores de triggerOutboundCall correctamente
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock triggerOutboundCall ─────────────────────────────────────────────────

const mockTriggerOutboundCall = vi.fn().mockResolvedValue({ ok: true, callId: 'MOCK_VAPI_ID' });

vi.mock('../outbound', () => ({
  triggerOutboundCall: (...args: unknown[]) => mockTriggerOutboundCall(...args),
}));

// ─── Mock Supabase admin ──────────────────────────────────────────────────────

const mockSingle = vi.fn().mockResolvedValue({
  data: {
    id:            '00000000-0000-0000-0000-000000000001',
    vapi_agent_id: 'vapi-x',
    business_name: 'Centinelia',
    role:          'nia',
    features:      { outbound_calls: true, meerkat_role_id: 'nia' },
  },
  error: null,
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  })),
}));

// ─── Mock callback-store ──────────────────────────────────────────────────────

const mockSetVapiCall = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/landing/callback-store', () => ({
  setVapiCall: (...args: unknown[]) => mockSetVapiCall(...args),
}));

import { triggerLandingDemoCall } from '../landing-demo';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('triggerLandingDemoCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTriggerOutboundCall.mockResolvedValue({ ok: true, callId: 'MOCK_VAPI_ID' });
    mockSingle.mockResolvedValue({
      data: {
        id:            '00000000-0000-0000-0000-000000000001',
        vapi_agent_id: 'vapi-x',
        business_name: 'Centinelia',
        role:          'nia',
        features:      { outbound_calls: true },
      },
      error: null,
    });
  });

  it('retorna ok:true y vapiCallId cuando triggerOutboundCall tiene exito', async () => {
    const res = await triggerLandingDemoCall({
      phone:     '8112345678',
      industry:  'tortilleria_abarrotes',
      requestId: 'req-1',
    });
    expect(res.ok).toBe(true);
    expect(res.vapiCallId).toBe('MOCK_VAPI_ID');
  });

  it('prefija +52 al numero', async () => {
    await triggerLandingDemoCall({ phone: '8112345678', industry: 'otro', requestId: 'req-2' });
    expect(mockTriggerOutboundCall).toHaveBeenCalledWith(
      expect.objectContaining({ customerNumber: '+528112345678' }),
    );
  });

  it('incluye campaignInstructions con el nombre de industria tortillera', async () => {
    await triggerLandingDemoCall({ phone: '8112345678', industry: 'tortilleria_abarrotes', requestId: 'req-3' });
    expect(mockTriggerOutboundCall).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignInstructions: expect.stringContaining('tortiller'),
      }),
    );
  });

  it('incluye campaignInstructions con construccion para industria construccion', async () => {
    await triggerLandingDemoCall({ phone: '8112345678', industry: 'construccion', requestId: 'req-4' });
    expect(mockTriggerOutboundCall).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignInstructions: expect.stringContaining('constructora'),
      }),
    );
  });

  it('pasa externalSource=landing_demo y externalId=requestId', async () => {
    await triggerLandingDemoCall({ phone: '8112345678', industry: 'otro', requestId: 'req-5' });
    expect(mockTriggerOutboundCall).toHaveBeenCalledWith(
      expect.objectContaining({
        externalSource: 'landing_demo',
        externalId:     'req-5',
      }),
    );
  });

  it('llama setVapiCall con el callId retornado', async () => {
    await triggerLandingDemoCall({ phone: '8112345678', industry: 'otro', requestId: 'req-6' });
    expect(mockSetVapiCall).toHaveBeenCalledWith('req-6', 'MOCK_VAPI_ID', 'dialing');
  });

  it('retorna ok:false y error si triggerOutboundCall falla', async () => {
    mockTriggerOutboundCall.mockResolvedValueOnce({ ok: false, error: 'no phone number' });
    const res = await triggerLandingDemoCall({ phone: '8112345678', industry: 'otro', requestId: 'req-7' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('no phone number');
  });

  it('retorna ok:false si el agente demo no esta seeded', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await triggerLandingDemoCall({ phone: '8112345678', industry: 'otro', requestId: 'req-8' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('landing_demo_agent_not_seeded');
  });
});
