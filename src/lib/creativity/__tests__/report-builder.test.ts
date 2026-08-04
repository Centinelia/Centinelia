import { describe, it, expect, vi } from 'vitest';
import { buildReport } from '../report-builder';

vi.mock('@/lib/documents/excel', () => ({
  generateExcel: vi.fn(() => Buffer.from('fake-xlsx-bytes')),
}));

function makeQueryChain(rows: unknown[]) {
  const leaf = async () => ({ data: rows, error: null });
  const ordered = () => ({ limit: leaf });
  const gte = () => ({ order: ordered });
  const inFn = () => ({ gte });
  const eq = () => ({ in: inFn, gte });
  return { eq, in: inFn, gte };
}

function mockSupabase(rowsByTable: Record<string, unknown[]> = {}) {
  const chain = (table: string) => {
    const rows = rowsByTable[table] ?? [];
    const q = makeQueryChain(rows);
    return {
      select: () => q,
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: 'doc-1' }, error: null }),
        }),
      }),
    };
  };

  return {
    from: (table: string) => {
      if (table === 'voice_agents') {
        return {
          select: () => ({
            eq: () => ({
              data:  [{ id: 'a1' }],
              error: null,
              then:  (cb: (v: { data: { id: string }[]; error: null }) => unknown) =>
                cb({ data: [{ id: 'a1' }], error: null }),
            }),
          }),
        };
      }
      return chain(table);
    },
    storage: {
      from: () => ({
        upload:          vi.fn(async () => ({ error: null })),
        createSignedUrl: vi.fn(async () => ({
          data:  { signedUrl: 'https://signed.example/rep.xlsx' },
          error: null,
        })),
      }),
    },
  } as unknown as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;
}

describe('buildReport', () => {
  it('genera reporte Excel para Noah con hojas Leads/Citas/Conversión', async () => {
    const supabase = mockSupabase({
      contact_lead:       [{ id: 'l1', nombre: 'Cliente 1', created_at: '2026-08-01T10:00:00Z' }],
      appointments_voice: [{ id: 'ap1', nombre: 'Cliente 1', fecha: '2026-08-02', hora: '10:00', status: 'confirmed', created_at: '2026-08-01T11:00:00Z' }],
    });
    const result = await buildReport(
      'noah',
      7,
      { id: 'a1', agentName: 'Noah', portalEmail: 'test@x.com' },
      supabase,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mime_type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.sheets).toContain('Leads');
    expect(result.sheets).toContain('Citas');
    expect(result.sheets).toContain('Conversión');
    expect(result.filename).toContain('reporte-noah');
    expect(result.document_id).toBe('doc-1');
  });

  it('genera reporte para Nara con hojas Tareas/Estatus', async () => {
    const supabase = mockSupabase({
      agent_tasks: [
        { id: 't1', title: 'Llamar cliente', status: 'completed', assigned_to: 'a1', created_at: '2026-08-01T10:00:00Z', completed_at: '2026-08-01T12:00:00Z' },
        { id: 't2', title: 'Enviar cotización', status: 'pending',   assigned_to: 'a1', created_at: '2026-08-02T09:00:00Z', completed_at: null },
      ],
    });
    const result = await buildReport(
      'nara',
      30,
      { id: 'a1', agentName: 'Nara', portalEmail: 'test@x.com' },
      supabase,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sheets).toContain('Tareas');
    expect(result.sheets).toContain('Estatus');
    expect(result.filename).toContain('reporte-nara');
  });

  it('genera reporte para Nelia con hojas Tickets/Escalaciones', async () => {
    const supabase = mockSupabase({
      ops_inbox:      [{ id: 'i1', email_from: 'user@x.com', email_subject: 'Ayuda', category: 'soporte', status: 'open', created_at: '2026-08-01T10:00:00Z' }],
      human_requests: [{ id: 'h1', title: 'Escalar urgente', urgency: 'high', status: 'resolved', created_at: '2026-08-01T08:00:00Z', resolved_at: '2026-08-01T09:00:00Z' }],
    });
    const result = await buildReport(
      'nelia',
      7,
      { id: 'a1', agentName: 'Nelia', portalEmail: 'test@x.com' },
      supabase,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sheets).toContain('Tickets');
    expect(result.sheets).toContain('Escalaciones');
    expect(result.filename).toContain('reporte-nelia');
  });

  it('retorna error cuando no hay agentes en la organización', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'voice_agents') {
          return {
            select: () => ({
              eq: () => ({ data: [], error: null }),
            }),
          };
        }
        return {};
      },
    } as unknown as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

    const result = await buildReport(
      'noah',
      7,
      { id: 'a1', agentName: 'Noah', portalEmail: 'empty@x.com' },
      supabase,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('agentes');
  });
});
