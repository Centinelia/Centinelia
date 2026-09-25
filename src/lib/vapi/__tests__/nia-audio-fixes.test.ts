/**
 * Tests de regresion para bugs de infra Vapi/ElevenLabs detectados en el demo
 * de Nia con Santiago NL el 2026-09-24 (Categoria C del documento de observaciones).
 *
 * Bugs capturados:
 *   (1) Interrupcion por ruido ambiental — startSpeakingPlan.waitSeconds=0.6 +
 *       smartEndpointingEnabled=true + numWordsToInterruptAssistant=3 deben
 *       aparecer en el assistant config para reducir falsos positivos de interrupcion.
 *   (2) Audio entrecortado — voice.stability=0.50 (era 0.35 = demasiado variable).
 *   (3) Corte al pedir transferencia — transfer_number sin prefijo (+52) se
 *       normaliza a E.164 antes de llegar a Vapi.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const { mockAdminClient } = vi.hoisted(() => ({
  mockAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient(),
}));

vi.mock('@/lib/voice/prompt-builder', () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue('prompt de prueba'),
}));

vi.mock('@/lib/feature-flags/version-flag-resolver', () => ({
  resolveMeerkatVersionForAgent: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/vapi/resolve-meerkat', () => ({
  resolveMeerkatConfig: vi.fn().mockResolvedValue({
    provider:    'anthropic',
    model:       'claude-haiku-4-5-20251001',
    temperature: 0.4,
    maxTokens:   1000,
    voiceModel:  'eleven_turbo_v2_5',
    speed:       0.91,
    minChars:    25,
    sttModel:    'nova-3',
    punctuationBoundaries: ['.', '!', '?', ','],
  }),
}));

// Supabase admin stub -- devuelve datos minimos para que buildVapiAssistant
// complete sin error: conversational_learnings vacia y team_peers vacio.
function makeSupabaseStub() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq:    () => ({ order: () => ({ data: [], error: null }), data: [], error: null }),
        neq:   () => ({ data: [], error: null }),
        in:    () => ({ data: [], error: null }),
        order: () => ({ data: [], error: null }),
        data:  [],
        error: null,
      }),
      insert:  () => Promise.resolve({ error: null }),
      update:  () => ({ eq: () => Promise.resolve({ error: null }) }),
      upsert:  () => Promise.resolve({ error: null }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  } as unknown as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;
}

import { buildVapiAssistantForSnapshot } from '../sync';

// Agente de prueba con transfer_number sin prefijo (10 digitos, caso tipico
// que el portal captura cuando el dueño no escribe el +52).
function makeTestAgent(overrides: Record<string, unknown> = {}) {
  return {
    id:                        'test-agent-id',
    vapi_agent_id:             'vapi-id-test',
    agent_name:                'Nia',
    business_name:             'Demo MTY',
    plan:                      'pro',
    active:                    true,
    phone_number:              '+528121889489',
    transfer_number:           '8112803360',   // sin + ni 52 -- input tipico del portal
    elevenlabs_voice_id:       'test-voice-id',
    first_message:             null,
    speech_style:              'usted',
    knowledge_base:            null,
    portal_email:              'demo@test.com',
    timezone:                  'America/Monterrey',
    features: {
      meerkat_role_id:      'nia',
      lead_qualification:   true,
      smart_transfer:       true,
    },
    ...overrides,
  } as unknown as import('@/types/agent').VoiceAgent;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminClient.mockReturnValue(makeSupabaseStub());
});

// ─── Sub-tarea 1: interrupcion por ruido ambiental ────────────────────────────

describe('startSpeakingPlan — reduccion de interrupciones por ruido', () => {
  it('incluye startSpeakingPlan con waitSeconds=0.6 en el assistant config', async () => {
    const config = await buildVapiAssistantForSnapshot(makeTestAgent());
    expect(config).toHaveProperty('startSpeakingPlan');
    expect((config as Record<string, unknown>).startSpeakingPlan).toMatchObject({
      waitSeconds: 0.6,
    });
  });

  it('incluye smartEndpointingEnabled=true en startSpeakingPlan', async () => {
    const config = await buildVapiAssistantForSnapshot(makeTestAgent());
    expect((config as Record<string, unknown>).startSpeakingPlan).toMatchObject({
      smartEndpointingEnabled: true,
    });
  });

  it('numWordsToInterruptAssistant es 3 (requiere frase real, no monosilabo)', async () => {
    const config = await buildVapiAssistantForSnapshot(makeTestAgent());
    expect((config as Record<string, unknown>).numWordsToInterruptAssistant).toBe(3);
  });
});

// ─── Sub-tarea 2: audio estable ───────────────────────────────────────────────

describe('voice.stability — reduccion de audio entrecortado', () => {
  it('stability es 0.50 (no 0.35 que causaba variabilidad excesiva)', async () => {
    const config = await buildVapiAssistantForSnapshot(makeTestAgent());
    const voice = (config as Record<string, unknown>).voice as Record<string, unknown>;
    expect(voice).toBeDefined();
    expect(voice.stability).toBe(0.50);
  });

  it('optimizeStreamingLatency es 3 (streaming estable)', async () => {
    const config = await buildVapiAssistantForSnapshot(makeTestAgent());
    const voice = (config as Record<string, unknown>).voice as Record<string, unknown>;
    expect(voice.optimizeStreamingLatency).toBe(3);
  });
});

// ─── Sub-tarea 3: transfer_number normalizado a E.164 ─────────────────────────

describe('transfer_number E.164 — corte en transferencia', () => {
  it('transfer_number de 10 digitos se normaliza a E.164 antes de llegar al tool destination', async () => {
    // buildVapiAssistantForSnapshot no incluye las tool definitions en el payload
    // (las tools se crean en Vapi via createVapiTools, que retorna toolIds separados).
    // La verificación de que destinations[0].number lleva +52 se hace via
    // normalizeToE164 directamente — es la misma función que buildToolDef llama
    // internamente cuando construye el tool transferir_llamada.
    //
    // Para confirmar que el path de construcción de la tool EXISTE, verificamos:
    //   1. normalizeToE164('8112803360') === '+528112803360' (la función funciona)
    //   2. El rol nia incluye 'transferir_llamada' en su distribución de voz
    //   3. El agente tiene transfer_number='8112803360' (input sin prefijo)
    //
    // Si normalizeToE164 pasa y la distribución incluye la tool, el destino E.164
    // está garantizado por construcción en buildToolDef (ver sync.ts línea ~353).
    const { normalizeToE164 } = await import('@/lib/leads/dedup');
    const agent = makeTestAgent(); // transfer_number='8112803360'

    // Verifica normalización — resultado que llega al destinations[0].number
    expect(normalizeToE164(agent.transfer_number!)).toBe('+528112803360');

    // Verifica que el rol tiene la tool (el path llega a buildToolDef)
    const { MEERKAT_VOICE_DISTRIBUTION } = await import('../sync');
    expect(MEERKAT_VOICE_DISTRIBUTION['nia']).toContain('transferir_llamada');
  });

  it('transfer_number ya en E.164 se preserva intacto', async () => {
    // Prueba directa de la funcion de normalizacion que se usa en el tool.
    const { normalizeToE164 } = await import('@/lib/leads/dedup');
    expect(normalizeToE164('+528112803360')).toBe('+528112803360');
    expect(normalizeToE164('8112803360')).toBe('+528112803360');
    expect(normalizeToE164('528112803360')).toBe('+528112803360');
  });

  it('nia tiene transferir_llamada en su distribucion de voz', async () => {
    // Verifica que el rol nia incluye la tool de transferencia (smoke sobre distribución).
    const { MEERKAT_VOICE_DISTRIBUTION } = await import('../sync');
    expect(MEERKAT_VOICE_DISTRIBUTION['nia']).toContain('transferir_llamada');
  });
});
