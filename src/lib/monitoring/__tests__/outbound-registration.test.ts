/**
 * Regression test para el detector de outbound registration drift.
 *
 * Bug audit 2026-09-29 Nelia Tortillería: outbound calls de Vapi terminaban
 * en `voice_calls` en lugar de `outbound_calls`. Este detector cataloga
 * exactamente esa firma.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectOutboundRegistrationDrift } from '../outbound-registration';

const originalFetch = global.fetch;
const NOW = new Date('2026-09-29T18:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

interface FakeRow { table: string; row: Record<string, unknown> }

function buildSupabase(rows: FakeRow[]) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        _filter: (r: Record<string, unknown>) => r,
        select: () => chain,
        eq: (col: string, val: unknown) => {
          const prev = chain._filter as (r: Record<string, unknown>) => Record<string, unknown> | undefined;
          chain._filter = (r: Record<string, unknown>) => (prev(r) && r[col] === val ? r : undefined);
          return chain;
        },
        not: () => chain,
        in: (col: string, vals: unknown[]) => {
          const prev = chain._filter as (r: Record<string, unknown>) => Record<string, unknown> | undefined;
          chain._filter = (r: Record<string, unknown>) => (prev(r) && vals.includes(r[col]) ? r : undefined);
          return chain;
        },
        then: (resolve: (v: unknown) => unknown) => {
          const filter = chain._filter as (r: Record<string, unknown>) => Record<string, unknown> | undefined;
          const data = rows.filter(r => r.table === table).map(r => r.row).filter(r => filter(r));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return chain;
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

function mockVapiCalls(calls: Array<Record<string, unknown>>) {
  global.fetch = vi.fn(async () => {
    return new Response(JSON.stringify(calls), { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach?.(() => { global.fetch = originalFetch; });
import { afterEach } from 'vitest';

describe('detectOutboundRegistrationDrift', () => {
  it('devuelve ok cuando VAPI_API_KEY vacío', async () => {
    const supabase = buildSupabase([]);
    const r = await detectOutboundRegistrationDrift(supabase, '', NOW);
    expect(r.level).toBe('ok');
    expect(r.vapiOutboundInWindow).toBe(0);
  });

  it('devuelve ok cuando cada outbound de Vapi está correctamente en outbound_calls', async () => {
    mockVapiCalls([
      { id: 'vapi-1', type: 'outboundPhoneCall', createdAt: hoursAgo(2), customer: { number: '+521' } },
    ]);
    const supabase = buildSupabase([
      { table: 'voice_agents',   row: { vapi_agent_id: 'vapi-agent-A', active: true } },
      { table: 'outbound_calls', row: { vapi_call_id: 'vapi-1' } },
    ]);
    const r = await detectOutboundRegistrationDrift(supabase, 'key', NOW);
    expect(r.level).toBe('ok');
    expect(r.registeredCorrectly).toBe(1);
    expect(r.misregisteredInVoice).toBe(0);
  });

  it('devuelve CRITICAL cuando un outbound cayó en voice_calls (smoking gun del bug 2026-09-29)', async () => {
    mockVapiCalls([
      { id: 'vapi-bad', type: 'outboundPhoneCall', createdAt: hoursAgo(2), customer: { number: '+521' } },
    ]);
    const supabase = buildSupabase([
      { table: 'voice_agents',   row: { vapi_agent_id: 'vapi-agent-A', active: true } },
      { table: 'voice_calls',    row: { vapi_call_id: 'vapi-bad', created_at: hoursAgo(2) } },
    ]);
    const r = await detectOutboundRegistrationDrift(supabase, 'key', NOW);
    expect(r.level).toBe('critical');
    expect(r.misregisteredInVoice).toBe(1);
    expect(r.sample[0].location).toBe('voice_calls');
    expect(r.sample[0].vapi_call_id).toBe('vapi-bad');
  });

  it('devuelve WARN cuando un outbound no está en ninguna tabla', async () => {
    mockVapiCalls([
      { id: 'vapi-lost', type: 'outboundPhoneCall', createdAt: hoursAgo(2), customer: { number: '+521' } },
    ]);
    const supabase = buildSupabase([
      { table: 'voice_agents', row: { vapi_agent_id: 'vapi-agent-A', active: true } },
    ]);
    const r = await detectOutboundRegistrationDrift(supabase, 'key', NOW);
    expect(r.level).toBe('warn');
    expect(r.missing).toBe(1);
    expect(r.misregisteredInVoice).toBe(0);
  });

  it('ignora outbound calls fuera de la ventana de 24h', async () => {
    mockVapiCalls([
      { id: 'vapi-old', type: 'outboundPhoneCall', createdAt: hoursAgo(48), customer: { number: '+521' } },
    ]);
    const supabase = buildSupabase([
      { table: 'voice_agents', row: { vapi_agent_id: 'vapi-agent-A', active: true } },
    ]);
    const r = await detectOutboundRegistrationDrift(supabase, 'key', NOW);
    expect(r.level).toBe('ok');
    expect(r.vapiOutboundInWindow).toBe(0);
  });

  it('ignora inbound calls de Vapi (solo cuenta outbound)', async () => {
    mockVapiCalls([
      { id: 'vapi-in', type: 'inboundPhoneCall', createdAt: hoursAgo(2), customer: { number: '+521' } },
    ]);
    const supabase = buildSupabase([
      { table: 'voice_agents', row: { vapi_agent_id: 'vapi-agent-A', active: true } },
    ]);
    const r = await detectOutboundRegistrationDrift(supabase, 'key', NOW);
    expect(r.level).toBe('ok');
    expect(r.vapiOutboundInWindow).toBe(0);
  });
});
