// Regression tests para el drift detector de colisiones de reference_id.
// Hallazgo investigación 2026-10-01 (Tortillería Estrella):
// 6 rows en ai_ops_log con count=0 y context=rpc_error "duplicate key"
// marcaban que incidencia_notif chocaba con incident_registered. El fix
// agregó sufijo :notif al reference_id del cobro secundario. Este detector
// debería prender bandera roja la próxima vez que alguien introduzca el
// mismo patrón de bug.

import { describe, it, expect } from 'vitest';
import {
  detectReferenceIdCollisions,
  REF_COLLISION_WINDOW_HOURS,
  REF_COLLISION_WARN_THRESHOLD,
} from '../reference-id-collision-drift';

interface Row {
  portal_email: string;
  source:       string;
  reference_id: string | null;
  context:      string | null;
  created_at:   string;
}

function mockSupabase(rows: Row[], nowMs: number) {
  return {
    from(_table: string) {
      // Chain: .select().eq('count', 0).gte('created_at', since).ilike('context', '%duplicate key%').limit(500)
      const chain: Record<string, unknown> = {};
      const match: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => { match[col] = val; return chain; };
      chain.gte = (col: string, val: unknown) => { match[`${col}_gte`] = val; return chain; };
      chain.ilike = (col: string, val: string) => { match[`${col}_ilike`] = val; return chain; };
      chain.limit = () => {
        // Simular el filtro: count=0, created_at >= since, context ilike '%duplicate key%'
        const since = match.created_at_gte as string;
        const filtered = rows.filter(r =>
          r.created_at >= since &&
          r.context?.includes('duplicate key'),
        );
        return Promise.resolve({ data: filtered });
      };
      return chain;
    },
  } as unknown as Parameters<typeof detectReferenceIdCollisions>[0];
}

const NOW = Date.parse('2026-10-01T12:00:00Z');
const inWindow = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

describe('detectReferenceIdCollisions', () => {
  it('devuelve level=ok cuando no hay rows', async () => {
    const supa = mockSupabase([], NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.level).toBe('ok');
    expect(result.total).toBe(0);
    expect(result.byOrg).toEqual([]);
  });

  it('ignora rows fuera de la ventana de 24h', async () => {
    const supa = mockSupabase([
      {
        portal_email: 'test@x.mx',
        source:       'incidencia_notif',
        reference_id: 'inc-1:notif',
        context:      '{"rpc_error":"duplicate key value violates unique constraint"}',
        created_at:   inWindow(48), // 48h atrás, fuera de la ventana
      },
    ], NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.level).toBe('ok');
    expect(result.total).toBe(0);
  });

  it('ignora rows sin "duplicate key" en context (otros rpc_errors legítimos)', async () => {
    const supa = mockSupabase([
      {
        portal_email: 'test@x.mx',
        source:       'incidencia_notif',
        reference_id: 'inc-1',
        context:      '{"rpc_error":"connection timeout"}',
        created_at:   inWindow(1),
      },
    ], NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.level).toBe('ok');
    expect(result.total).toBe(0);
  });

  it('detecta 1 colisión en 24h → level=warn', async () => {
    const supa = mockSupabase([
      {
        portal_email: 'servicioalcliente@tortillasestrella.com.mx',
        source:       'incidencia_notif',
        reference_id: 'inc-abc',
        context:      '{"rpc_error":"duplicate key value violates unique constraint ops_ledger_portal_ref_kind_uniq"}',
        created_at:   inWindow(2),
      },
    ], NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.level).toBe('warn');
    expect(result.total).toBe(1);
    expect(result.byOrg).toHaveLength(1);
    expect(result.byOrg[0].portal_email).toBe('servicioalcliente@tortillasestrella.com.mx');
    expect(result.byOrg[0].source).toBe('incidencia_notif');
    expect(result.byOrg[0].count).toBe(1);
  });

  it('agrupa múltiples rows por portal+source', async () => {
    const supa = mockSupabase([
      {
        portal_email: 'cliente-a@x.mx',
        source:       'incidencia_notif',
        reference_id: 'inc-1',
        context:      '{"rpc_error":"duplicate key"}',
        created_at:   inWindow(1),
      },
      {
        portal_email: 'cliente-a@x.mx',
        source:       'incidencia_notif',
        reference_id: 'inc-2',
        context:      '{"rpc_error":"duplicate key"}',
        created_at:   inWindow(2),
      },
      {
        portal_email: 'cliente-a@x.mx',
        source:       'ticket_email_notify',
        reference_id: 'TCK-010',
        context:      '{"rpc_error":"duplicate key"}',
        created_at:   inWindow(3),
      },
    ], NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.total).toBe(3);
    expect(result.byOrg).toHaveLength(2);
    const notifGroup = result.byOrg.find(g => g.source === 'incidencia_notif');
    expect(notifGroup?.count).toBe(2);
    expect(notifGroup?.sample_refs).toEqual(['inc-1', 'inc-2']);
  });

  it('escala a level=critical cuando total >= 10× threshold', async () => {
    const manyRows: Row[] = Array.from({ length: 10 }, (_, i) => ({
      portal_email: 'cliente-a@x.mx',
      source:       'incidencia_notif',
      reference_id: `inc-${i}`,
      context:      '{"rpc_error":"duplicate key"}',
      created_at:   inWindow(i + 1),
    }));
    const supa = mockSupabase(manyRows, NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.level).toBe('critical');
    expect(result.total).toBe(10);
  });

  it('limita sample_refs a 3 por grupo', async () => {
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({
      portal_email: 'cliente-a@x.mx',
      source:       'incidencia_notif',
      reference_id: `inc-${i}`,
      context:      '{"rpc_error":"duplicate key"}',
      created_at:   inWindow(i + 1),
    }));
    const supa = mockSupabase(rows, NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.byOrg[0].sample_refs).toHaveLength(3);
  });

  it('orden descendente por count', async () => {
    const supa = mockSupabase([
      { portal_email: 'org-a@x.mx', source: 'src-A', reference_id: 'r1', context: '{"rpc_error":"duplicate key"}', created_at: inWindow(1) },
      { portal_email: 'org-b@x.mx', source: 'src-B', reference_id: 'r2', context: '{"rpc_error":"duplicate key"}', created_at: inWindow(1) },
      { portal_email: 'org-b@x.mx', source: 'src-B', reference_id: 'r3', context: '{"rpc_error":"duplicate key"}', created_at: inWindow(1) },
      { portal_email: 'org-b@x.mx', source: 'src-B', reference_id: 'r4', context: '{"rpc_error":"duplicate key"}', created_at: inWindow(1) },
    ], NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.byOrg[0].count).toBe(3);
    expect(result.byOrg[1].count).toBe(1);
  });
});

describe('constantes exportadas', () => {
  it('umbrales esperados', () => {
    expect(REF_COLLISION_WINDOW_HOURS).toBe(24);
    expect(REF_COLLISION_WARN_THRESHOLD).toBe(1);
  });
});
