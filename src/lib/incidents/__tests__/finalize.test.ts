import { describe, it, expect, vi } from 'vitest';
import { finalizeOrphanIncidents } from '../finalize';

function makeMock({ terminalContacts, orphanIncidents, updateResult }: {
  terminalContacts:  { data: any; error: any };
  orphanIncidents?:  { data: any; error: any };
  updateResult?:     { data: any; error: any };
}) {
  const updateCalls: any[] = [];
  let fromCall = 0;

  const contactsChain: any = {
    select: vi.fn(() => contactsChain),
    eq:     vi.fn(() => contactsChain),
    in:     vi.fn(() => Promise.resolve(terminalContacts)),
  };

  const incidentsLookupChain: any = {
    select: vi.fn(() => incidentsLookupChain),
    is:     vi.fn(() => incidentsLookupChain),
    in:     vi.fn(() => Promise.resolve(orphanIncidents ?? { data: null, error: null })),
  };

  const incidentsUpdateChain: any = {
    update: vi.fn((patch: any) => { updateCalls.push(patch); return incidentsUpdateChain; }),
    in:     vi.fn(() => Promise.resolve(updateResult ?? { data: null, error: null })),
  };

  const supabase: any = {
    from: vi.fn((table: string) => {
      fromCall++;
      if (table === 'outbound_contacts') return contactsChain;
      if (table === 'client_incidents') {
        // Second call to client_incidents (after lookup) is the update.
        return fromCall === 2 ? incidentsLookupChain : incidentsUpdateChain;
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return { supabase, updateCalls };
}

describe('finalizeOrphanIncidents', () => {
  it('returns 0 when no terminal contacts', async () => {
    const { supabase, updateCalls } = makeMock({
      terminalContacts: { data: [], error: null },
    });
    const result = await finalizeOrphanIncidents(supabase);
    expect(result.finalized).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 0 when terminal contacts exist but no orphan incidents', async () => {
    const { supabase, updateCalls } = makeMock({
      terminalContacts: { data: [{ id: 'oc-1' }, { id: 'oc-2' }], error: null },
      orphanIncidents:  { data: [], error: null },
    });
    const result = await finalizeOrphanIncidents(supabase);
    expect(result.finalized).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('finalizes orphan incidents with sin_respuesta', async () => {
    const { supabase, updateCalls } = makeMock({
      terminalContacts: { data: [{ id: 'oc-1' }, { id: 'oc-2' }], error: null },
      orphanIncidents:  { data: [{ id: 'inc-1' }, { id: 'inc-2' }], error: null },
      updateResult:     { data: null, error: null },
    });
    const result = await finalizeOrphanIncidents(supabase);
    expect(result.finalized).toBe(2);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].verification_result).toBe('sin_respuesta');
    expect(updateCalls[0].verification_result_notes).toContain('reintentos');
    expect(updateCalls[0].verification_called_at).toBeTruthy();
  });

  it('throws on contact lookup error', async () => {
    const { supabase } = makeMock({
      terminalContacts: { data: null, error: { message: 'boom' } },
    });
    await expect(finalizeOrphanIncidents(supabase)).rejects.toThrow(/boom/);
  });

  it('throws on incident lookup error', async () => {
    const { supabase } = makeMock({
      terminalContacts: { data: [{ id: 'oc-1' }], error: null },
      orphanIncidents:  { data: null, error: { message: 'incident boom' } },
    });
    await expect(finalizeOrphanIncidents(supabase)).rejects.toThrow(/incident boom/);
  });

  it('throws on update error', async () => {
    const { supabase } = makeMock({
      terminalContacts: { data: [{ id: 'oc-1' }], error: null },
      orphanIncidents:  { data: [{ id: 'inc-1' }], error: null },
      updateResult:     { data: null, error: { message: 'update boom' } },
    });
    await expect(finalizeOrphanIncidents(supabase)).rejects.toThrow(/update boom/);
  });
});
