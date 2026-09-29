/**
 * Regression test para bug audit 2026-09-29 Nelia Tortillería:
 *
 * triggerOutboundCall NO pasaba serverUrl en el POST a Vapi. Sin este
 * override, Vapi enrutaba el end-of-call-report al server URL del assistant
 * (típicamente /api/voice/webhook, el inbound). Efecto en producción:
 *
 *   1. 18 outbound calls de Nelia se registraron en voice_calls como si
 *      fueran inbound.
 *   2. Los minutos se cobraron con source='call' en vez de 'llamada_saliente'.
 *   3. outbound_calls quedó vacío (el outbound webhook nunca se activó).
 *   4. outbound_contacts se quedaron atascados en 'calling' sin transitionar
 *      porque el flow de completion vive en el outbound webhook.
 *
 * Este test falla ANTES del fix (body sin serverUrl) y pasa DESPUÉS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockCreateAdminClient,
  mockResolveMeerkatConfig,
  mockResolveMeerkatVersionForAgent,
  mockBuildOutboundSystemPrompt,
  fetchCalls,
} = vi.hoisted(() => {
  const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
  return {
    mockCreateAdminClient: vi.fn(),
    mockResolveMeerkatConfig: vi.fn(),
    mockResolveMeerkatVersionForAgent: vi.fn(),
    mockBuildOutboundSystemPrompt: vi.fn(),
    fetchCalls,
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

vi.mock('@/lib/vapi/resolve-meerkat', () => ({
  resolveMeerkatConfig: (...args: unknown[]) => mockResolveMeerkatConfig(...args),
}));

vi.mock('@/lib/feature-flags/version-flag-resolver', () => ({
  resolveMeerkatVersionForAgent: (...args: unknown[]) => mockResolveMeerkatVersionForAgent(...args),
}));

vi.mock('@/lib/voice/outbound-prompt-builder', () => ({
  buildOutboundSystemPrompt: (...args: unknown[]) => mockBuildOutboundSystemPrompt(...args),
}));

// Mock global fetch to capture Vapi requests.
const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  fetchCalls.length = 0;

  process.env.VAPI_API_KEY = 'test-vapi-key';
  process.env.VAPI_SERVER_SECRET = 'test-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.centinelia.mx';

  // Chained builder para supabase: from().select().eq()... termina en una promise.
  const chained: Record<string, unknown> = {
    from: () => chained,
    select: () => chained,
    eq: () => chained,
    ilike: () => chained,
    order: () => chained,
    contains: () => chained,
    limit: () => Promise.resolve({ data: [], error: null }),
    single: () => Promise.resolve({ data: { vapi_phone_number_id: 'phone-abc' }, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    update: () => chained,
    then: undefined,
  };
  // Para el Promise.all([leadRes, histRes]) branch: si features.client_memory
  // es false no entra. Nuestro test lo mantiene false.
  mockCreateAdminClient.mockReturnValue(chained);

  mockResolveMeerkatVersionForAgent.mockResolvedValue(null);
  mockResolveMeerkatConfig.mockResolvedValue({
    provider:    'anthropic',
    model:       'claude-sonnet-5-5',
    temperature: 0.3,
    maxTokens:   200,
  });
  mockBuildOutboundSystemPrompt.mockResolvedValue('Prompt de sistema outbound');

  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    fetchCalls.push({ url: urlStr, init: init ?? {} });

    // Vapi assistant fetch (para toolIds)
    if (urlStr.includes('/assistant/')) {
      return new Response(JSON.stringify({ model: { toolIds: [] } }), { status: 200 });
    }
    // Vapi POST /call
    if (urlStr.endsWith('/call')) {
      return new Response(JSON.stringify({ id: 'vapi-call-generated-id' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach?.(() => {
  global.fetch = originalFetch;
});

import { triggerOutboundCall } from '../outbound';
import { afterEach } from 'vitest';

const baseAgent = {
  id:            'agent-nelia',
  vapi_agent_id: 'vapi-nelia-assistant',
  phone_number:  '+528121887969',
  business_name: 'Tortillería Estrella',
  portal_email:  'servicioalcliente@tortillasestrella.com.mx',
  speech_style:  'usted',
  features: {
    meerkat_role_id:  'nelia',
    outbound_calls:   true,
    client_memory:    false,
    use_custom_llm:   true,
  },
} as unknown as Parameters<typeof triggerOutboundCall>[0]['agent'];

describe('triggerOutboundCall — regression: serverUrl (bug audit 2026-09-29)', () => {
  it('incluye serverUrl apuntando a /api/outbound/vapi-webhook en el body del POST /call', async () => {
    const result = await triggerOutboundCall({
      agent:          baseAgent,
      customerNumber: '+528181234567',
      customerName:   'Cliente Test',
      motivo:         'verificar pedido',
      externalSource: 'client_incident',
      externalId:     'incident-uuid-123',
    });

    expect(result.ok).toBe(true);

    const callToVapi = fetchCalls.find(c => c.url.endsWith('/call') && c.init.method === 'POST');
    expect(callToVapi).toBeDefined();

    const body = JSON.parse((callToVapi!.init.body as string) ?? '{}');
    expect(body.serverUrl).toBeDefined();
    expect(body.serverUrl).toContain('/api/outbound/vapi-webhook');
  });

  it('incluye el VAPI_SERVER_SECRET url-encoded como query param en serverUrl', async () => {
    process.env.VAPI_SERVER_SECRET = 'secret with spaces & special chars';

    await triggerOutboundCall({
      agent:          baseAgent,
      customerNumber: '+528181234567',
    });

    const callToVapi = fetchCalls.find(c => c.url.endsWith('/call') && c.init.method === 'POST');
    const body = JSON.parse((callToVapi!.init.body as string) ?? '{}');
    expect(body.serverUrl).toContain('secret=');
    expect(body.serverUrl).toContain(encodeURIComponent('secret with spaces & special chars'));
  });

  it('serverUrl arma la URL con NEXT_PUBLIC_APP_URL', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.centinelia.mx';

    await triggerOutboundCall({
      agent:          baseAgent,
      customerNumber: '+528181234567',
    });

    const callToVapi = fetchCalls.find(c => c.url.endsWith('/call') && c.init.method === 'POST');
    const body = JSON.parse((callToVapi!.init.body as string) ?? '{}');
    expect(body.serverUrl).toContain('https://staging.centinelia.mx/api/outbound/vapi-webhook');
  });
});
