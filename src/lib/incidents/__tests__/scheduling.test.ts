import { describe, it, expect, vi } from 'vitest';
import { upsertFollowupContactForIncident } from '../scheduling';

// Builds a chainable mock supabase where the lookup returns `lookupResult`
// and the insert / update leaf resolves to `leafResult`.
function makeMock(lookupResult: any, leafResult: any) {
  const insertCalls: any[] = [];
  const updateCalls: any[] = [];

  const lookupChain: any = {
    select: vi.fn(() => lookupChain),
    eq:     vi.fn(() => lookupChain),
    order:  vi.fn(() => lookupChain),
    limit:  vi.fn(() => lookupChain),
    maybeSingle: vi.fn(() => Promise.resolve(lookupResult)),
  };

  const insertChain: any = {
    insert: vi.fn((row: any) => { insertCalls.push(row); return insertChain; }),
    select: vi.fn(() => insertChain),
    single: vi.fn(() => Promise.resolve(leafResult)),
  };

  const updateChain: any = {
    update: vi.fn((patch: any) => { updateCalls.push(patch); return updateChain; }),
    eq:     vi.fn(() => Promise.resolve(leafResult)),
  };

  let fromCall = 0;
  const supabase: any = {
    from: vi.fn(() => {
      fromCall++;
      // First .from() is the lookup; second is either insert or update depending on lookup.
      if (fromCall === 1) return lookupChain;
      return lookupResult.data ? updateChain : insertChain;
    }),
  };

  return { supabase, insertCalls, updateCalls };
}

describe('upsertFollowupContactForIncident', () => {
  it('inserts new row with source=auto_incident_verification when no existing contact', async () => {
    const { supabase, insertCalls } = makeMock(
      { data: null, error: null },
      { data: { id: 'oc-new' }, error: null },
    );
    const result = await upsertFollowupContactForIncident(supabase as any, {
      incidentId: 'inc-1',
      agentId: 'agent-1',
      telefono: '+528112345678',
      motivo: 'Reportó que no recibió pedido',
      scheduledAt: '2026-08-30T10:00:00Z',
    });
    expect(result.outbound_contact_id).toBe('oc-new');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].source).toBe('auto_incident_verification');
    expect(insertCalls[0].external_source).toBe('client_incident');
    expect(insertCalls[0].external_id).toBe('inc-1');
    expect(insertCalls[0].status).toBe('pending');
  });

  it('updates existing row (reset status + new external_id) when contact already exists', async () => {
    const { supabase, updateCalls, insertCalls } = makeMock(
      { data: { id: 'oc-existing' }, error: null },
      { data: null, error: null },
    );
    const result = await upsertFollowupContactForIncident(supabase as any, {
      incidentId: 'inc-2',
      agentId: 'agent-1',
      telefono: '+528112345678',
      motivo: 'Nueva incidencia',
      scheduledAt: '2026-08-30T10:00:00Z',
    });
    expect(result.outbound_contact_id).toBe('oc-existing');
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].source).toBe('auto_incident_verification');
    expect(updateCalls[0].external_id).toBe('inc-2');
    expect(updateCalls[0].status).toBe('pending');
    expect(updateCalls[0].fail_count).toBe(0);
  });

  it('throws when insert fails', async () => {
    const { supabase } = makeMock(
      { data: null, error: null },
      { data: null, error: { message: 'boom' } },
    );
    await expect(upsertFollowupContactForIncident(supabase as any, {
      incidentId: 'inc-1', agentId: 'a', telefono: '+521', motivo: 'x',
      scheduledAt: '2026-08-30T10:00:00Z',
    })).rejects.toThrow(/boom/);
  });
});
