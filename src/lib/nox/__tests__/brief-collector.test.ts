// src/lib/nox/__tests__/brief-collector.test.ts
import { describe, it, expect, vi } from 'vitest';
import { collectBriefData } from '../brief-collector';

function mockSupabase(rows: Record<string, any[]>) {
  const chain = (table: string) => {
    const data = rows[table] ?? [];
    return {
      select: () => ({
        in: () => ({
          eq: () => ({
            in: () => ({
              gte: () => ({
                order: () => ({ limit: async () => ({ data, error: null }) }),
              }),
              order: () => ({ limit: async () => ({ data, error: null }) }),
            }),
            gte: () => ({
              order: () => ({ limit: async () => ({ data, error: null }) }),
            }),
            order: () => ({ limit: async () => ({ data, error: null }) }),
          }),
        }),
      }),
    };
  };
  return { from: (table: string) => chain(table) } as any;
}

describe('collectBriefData', () => {
  it('devuelve las 5 fuentes con truncated=false cuando hay pocos items', async () => {
    const supabase = mockSupabase({
      ops_inbox: [{ id: 'e1', email_from: 'x@y.com', email_subject: 'Urgente', category: 'urgente', created_at: '2026-08-04T10:00:00Z' }],
      agent_tasks: [{ id: 't1', title: 'Hacer X', assigned_to: 'a1', created_at: '2026-08-04T09:00:00Z', status: 'pending' }],
      human_requests: [{ id: 'h1', title: 'Aprobar Y', urgency: 'alta', created_at: '2026-08-04T08:00:00Z', agent_id: 'a1' }],
      contract_drafts: [{ id: 'c1', client_name: 'ACME', created_at: '2026-08-04T07:00:00Z' }],
    });
    const data = await collectBriefData(['a1'], 'test@x.com', 'America/Monterrey', supabase);
    expect(data.urgentEmails.items).toHaveLength(1);
    expect(data.pendingTasks.items).toHaveLength(1);
    expect(data.unresolvedEscalations.items).toHaveLength(1);
    expect(data.pendingContractDrafts.items).toHaveLength(1);
    expect(data.urgentEmails.truncated).toBe(false);
  });

  it('marca truncated=true cuando la query llega al límite', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}`, email_from: 'x@y.com', email_subject: `S${i}`, category: 'urgente', created_at: '2026-08-04T10:00:00Z' }));
    const supabase = mockSupabase({ ops_inbox: many });
    const data = await collectBriefData(['a1'], 'test@x.com', 'America/Monterrey', supabase);
    expect(data.urgentEmails.items).toHaveLength(15);
    expect(data.urgentEmails.truncated).toBe(true);
  });
});
