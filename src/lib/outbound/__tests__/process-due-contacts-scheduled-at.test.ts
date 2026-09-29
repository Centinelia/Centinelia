/**
 * Regression test para bug audit 2026-09-29 Nelia Tortillería:
 *
 * processDueOutboundContacts insertaba en outbound_calls sin `scheduled_at`.
 * outbound_calls.scheduled_at es NOT NULL — el insert fallaba con:
 *
 *   Error 23502: null value in column "scheduled_at" of relation
 *   "outbound_calls" violates not-null constraint
 *
 * Sin try/catch alrededor del insert, el error se tragaba en silencio y el
 * outbound_contact quedaba atascado en 'calling' para siempre. Efecto en
 * producción con Nelia: 40 outbound_contacts stuck, 0 outbound_calls rows,
 * a pesar de que Vapi sí ejecutó 18 outbound calls reales.
 *
 * Este test falla ANTES del fix (insert sin scheduled_at) y pasa DESPUÉS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockTriggerOutboundCall,
  mockTransitionOutboundContact,
  insertCalls,
} = vi.hoisted(() => {
  const insertCalls: Array<{ table: string; row: Record<string, unknown> }> = [];
  return {
    mockTriggerOutboundCall: vi.fn(),
    mockTransitionOutboundContact: vi.fn(),
    insertCalls,
  };
});

vi.mock('@/lib/vapi/outbound', () => ({
  triggerOutboundCall: (...args: unknown[]) => mockTriggerOutboundCall(...args),
}));

vi.mock('@/lib/state-machines/outbound-contact', () => ({
  transitionOutboundContact: (...args: unknown[]) => mockTransitionOutboundContact(...args),
}));

// Contact "due" con scheduled_at explícito. Este es el value que el fix
// debe propagar al insert de outbound_calls.
const SCHEDULED_AT = '2026-09-25T15:00:00.000Z';
const CONTACT_ID   = 'contact-uuid-abc';
const AGENT_ID     = 'agent-nelia-uuid';

function buildChainedSupabase() {
  const contactRow = {
    id:              CONTACT_ID,
    agent_id:        AGENT_ID,
    telefono:        '+528181234567',
    nombre:          'Cliente Test',
    motivo:          'verificar pedido',
    scheduled_at:    SCHEDULED_AT,
    external_source: 'client_incident',
    external_id:     'incident-uuid-123',
    voice_agents: {
      id:            AGENT_ID,
      vapi_agent_id: 'vapi-nelia-assistant',
      phone_number:  '+528121887969',
      business_name: 'Tortillería Estrella',
      features:      { outbound_calls: true },
      active:        true,
    },
  };

  const client: Record<string, unknown> = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        _table: table,
        _updateData: null as Record<string, unknown> | null,
        _atomicClaimReady: false,
        select: () => chain,
        eq: () => chain,
        lte: () => chain,
        not: () => chain,
        limit: () => {
          if (table === 'outbound_contacts') {
            return Promise.resolve({ data: [contactRow], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        update: (data: Record<string, unknown>) => {
          chain._updateData = data;
          chain._atomicClaimReady = true;
          return chain;
        },
        single: () => {
          // Simula el atomic claim: la primera vez que se hace .update().eq().eq().select().single()
          // debe devolver un id (claim exitoso).
          if (chain._atomicClaimReady && table === 'outbound_contacts') {
            return Promise.resolve({ data: { id: CONTACT_ID }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert: (row: Record<string, unknown>) => {
          insertCalls.push({ table, row });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'new-outbound-call-id' }, error: null }),
            }),
          };
        },
      };
      return chain;
    },
  };
  return client;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => buildChainedSupabase(),
}));

import { processDueOutboundContacts } from '../process-due-contacts';

beforeEach(() => {
  vi.clearAllMocks();
  insertCalls.length = 0;
  mockTriggerOutboundCall.mockResolvedValue({ ok: true, callId: 'vapi-call-1' });
  mockTransitionOutboundContact.mockResolvedValue(undefined);
});

describe('processDueOutboundContacts — regression: scheduled_at (bug audit 2026-09-29)', () => {
  it('el insert a outbound_calls incluye scheduled_at (NOT NULL constraint)', async () => {
    await processDueOutboundContacts();

    const outboundInsert = insertCalls.find(c => c.table === 'outbound_calls');
    expect(outboundInsert).toBeDefined();
    expect(outboundInsert!.row).toHaveProperty('scheduled_at');
    expect(outboundInsert!.row.scheduled_at).toBe(SCHEDULED_AT);
  });

  it('el insert conserva agent_id, contact_id, vapi_call_id, telefono y status=calling', async () => {
    await processDueOutboundContacts();

    const outboundInsert = insertCalls.find(c => c.table === 'outbound_calls');
    expect(outboundInsert!.row.agent_id).toBe(AGENT_ID);
    expect(outboundInsert!.row.contact_id).toBe(CONTACT_ID);
    expect(outboundInsert!.row.vapi_call_id).toBe('vapi-call-1');
    expect(outboundInsert!.row.status).toBe('calling');
    expect(outboundInsert!.row.telefono).toBe('+528181234567');
  });
});
