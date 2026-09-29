/**
 * Regression test para el drift detector de outbound_contacts stuck.
 *
 * El detector protege contra el bug audit 2026-09-29 Nelia Tortillería,
 * donde 40 outbound_contacts quedaron en status='calling' sin outbound_call
 * correspondiente porque un insert fallaba silent.
 */

import { describe, it, expect } from 'vitest';
import { detectStuckOutbound, STUCK_OUTBOUND_HOURS_CRITICAL, STUCK_OUTBOUND_HOURS_WARN } from '../stuck-outbound';

interface FakeRow { table: string; row: Record<string, unknown> }

function buildSupabase(rows: FakeRow[]) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        _filter: (r: Record<string, unknown>) => r,
        select: () => chain,
        eq:    (col: string, val: unknown) => {
          const prev = chain._filter as (r: Record<string, unknown>) => Record<string, unknown> | undefined;
          chain._filter = (r: Record<string, unknown>) => (prev(r) && r[col] === val ? r : undefined);
          return chain;
        },
        lt:    (col: string, val: string) => {
          const prev = chain._filter as (r: Record<string, unknown>) => Record<string, unknown> | undefined;
          chain._filter = (r: Record<string, unknown>) => (prev(r) && String(r[col] ?? '') < val ? r : undefined);
          return chain;
        },
        in:    (col: string, vals: unknown[]) => {
          const prev = chain._filter as (r: Record<string, unknown>) => Record<string, unknown> | undefined;
          chain._filter = (r: Record<string, unknown>) => (prev(r) && vals.includes(r[col]) ? r : undefined);
          return chain;
        },
        then:  (resolve: (v: unknown) => unknown) => {
          const filter = chain._filter as (r: Record<string, unknown>) => Record<string, unknown> | undefined;
          const data = rows.filter(r => r.table === table).map(r => r.row).filter(r => filter(r));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return chain;
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

const NOW = new Date('2026-09-29T18:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe('detectStuckOutbound', () => {
  it('devuelve level=ok cuando no hay stuck', async () => {
    const supabase = buildSupabase([]);
    const result = await detectStuckOutbound(supabase, NOW);
    expect(result.level).toBe('ok');
    expect(result.totalStuck).toBe(0);
  });

  it('detecta contact stuck >2h sin outbound_call correspondiente', async () => {
    const supabase = buildSupabase([
      { table: 'outbound_contacts', row: { id: 'contact-1', agent_id: 'agent-A', status: 'calling', updated_at: hoursAgo(3), created_at: hoursAgo(3) } },
      { table: 'voice_agents', row: { id: 'agent-A', agent_name: 'Nelia' } },
    ]);
    const result = await detectStuckOutbound(supabase, NOW);
    expect(result.totalStuck).toBe(1);
    expect(result.level).toBe('warn');
    expect(result.byAgent[0].agent_name).toBe('Nelia');
  });

  it('IGNORA contact stuck si tiene outbound_call correspondiente (feliz)', async () => {
    const supabase = buildSupabase([
      { table: 'outbound_contacts', row: { id: 'contact-1', agent_id: 'agent-A', status: 'calling', updated_at: hoursAgo(3), created_at: hoursAgo(3) } },
      { table: 'outbound_calls', row: { contact_id: 'contact-1' } },
    ]);
    const result = await detectStuckOutbound(supabase, NOW);
    expect(result.totalStuck).toBe(0);
    expect(result.level).toBe('ok');
  });

  it('marca level=critical cuando algún stuck lleva >12h', async () => {
    const supabase = buildSupabase([
      { table: 'outbound_contacts', row: { id: 'c1', agent_id: 'agent-A', status: 'calling', updated_at: hoursAgo(3),  created_at: hoursAgo(3)  } },
      { table: 'outbound_contacts', row: { id: 'c2', agent_id: 'agent-A', status: 'calling', updated_at: hoursAgo(15), created_at: hoursAgo(15) } },
      { table: 'voice_agents',      row: { id: 'agent-A', agent_name: 'Nelia' } },
    ]);
    const result = await detectStuckOutbound(supabase, NOW);
    expect(result.totalStuck).toBe(2);
    expect(result.criticalStuck).toBe(1);
    expect(result.level).toBe('critical');
  });

  it('agrupa múltiples stucks por agente y ordena por count desc', async () => {
    const supabase = buildSupabase([
      { table: 'outbound_contacts', row: { id: 'a1', agent_id: 'agent-A', status: 'calling', updated_at: hoursAgo(3), created_at: hoursAgo(3) } },
      { table: 'outbound_contacts', row: { id: 'a2', agent_id: 'agent-A', status: 'calling', updated_at: hoursAgo(4), created_at: hoursAgo(4) } },
      { table: 'outbound_contacts', row: { id: 'b1', agent_id: 'agent-B', status: 'calling', updated_at: hoursAgo(3), created_at: hoursAgo(3) } },
      { table: 'voice_agents',      row: { id: 'agent-A', agent_name: 'Nelia' } },
      { table: 'voice_agents',      row: { id: 'agent-B', agent_name: 'Nia'   } },
    ]);
    const result = await detectStuckOutbound(supabase, NOW);
    expect(result.byAgent).toHaveLength(2);
    expect(result.byAgent[0].agent_id).toBe('agent-A');
    expect(result.byAgent[0].count).toBe(2);
    expect(result.byAgent[1].agent_id).toBe('agent-B');
    expect(result.byAgent[1].count).toBe(1);
  });

  it('constantes en horas coherentes: WARN < CRITICAL', () => {
    expect(STUCK_OUTBOUND_HOURS_WARN).toBeLessThan(STUCK_OUTBOUND_HOURS_CRITICAL);
  });
});
