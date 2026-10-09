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
  count?:       number;
}

function mockSupabase(rows: Row[], _nowMs: number) {
  return {
    from(_table: string) {
      // El detector hace 2 queries secuenciales:
      //   Q1: .select().eq('count', 0).gte('created_at', since).ilike('context', '%duplicate key%').limit(500)
      //        → devuelve rechazos por UNIQUE constraint (count=0, duplicate_key).
      //   Q2: .select().in('reference_id', [...refs]).gte('created_at', since).limit(500)
      //        → devuelve TODAS las filas (incluyendo count>0) para esos refs,
      //          para contar sources distintos y descartar same-source retries.
      const match: Record<string, unknown> = {};
      let inRefs: string[] | null = null;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => { match[col] = val; return chain; };
      chain.gte = (col: string, val: unknown) => { match[`${col}_gte`] = val; return chain; };
      chain.ilike = (col: string, val: string) => { match[`${col}_ilike`] = val; return chain; };
      chain.in = (col: string, vals: string[]) => { if (col === 'reference_id') inRefs = vals; return chain; };
      chain.limit = () => {
        const since = match.created_at_gte as string;
        let filtered = rows.filter(r => r.created_at >= since);
        if (match.count === 0) filtered = filtered.filter(r => (r.count ?? 0) === 0);
        if (match.context_ilike === '%duplicate key%') filtered = filtered.filter(r => r.context?.includes('duplicate key'));
        if (inRefs) filtered = filtered.filter(r => r.reference_id && inRefs!.includes(r.reference_id));
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

  // 2026-10-09 Falso positivo real observado en producción:
  // AC Proyectos (camila@acproyectos.com) acumuló 15 rechazos duplicate_key
  // en 24h, todos del mismo source=inbox_processor sobre 12 correos únicos.
  // Causa: orphan recovery / dedup fallbacks re-llaman consumeAiOp con el
  // mismo reference_id "<messageId>:processed". El UNIQUE constraint
  // (portal_email, reference_id, kind) rechaza el 2do intento → ai_ops_log
  // guarda count=0. Eso es IDEMPOTENCIA correcta: el primer intento cobró OK
  // en ops_ledger (−1), el 2do intento fue descartado como debe ser.
  //
  // Pero el detector contaba cada rechazo como "colisión" y alertaba a Nazre
  // 15 veces por correo real cuando no había undercharge alguno.
  //
  // Fix: solo contar como colisión si 2+ sources distintos contendieron por
  // el mismo reference_id. Un solo source con múltiples rechazos = retry
  // idempotente, no undercharge. Ver [[feedback-fixes-para-siempre]].
  it('ignora same-source retries (idempotencia correcta, no undercharge)', async () => {
    const supa = mockSupabase([
      // Intento 1: cobro exitoso. count>0 porque consumeAiOp pasó el UNIQUE.
      {
        portal_email: 'camila@acproyectos.com',
        source:       'inbox_processor',
        reference_id: 'msg-abc:processed',
        context:      '{"ok":true}',
        created_at:   inWindow(5),
        count:        1,
      },
      // Intento 2 (retry): UNIQUE rechaza. count=0 + duplicate key.
      {
        portal_email: 'camila@acproyectos.com',
        source:       'inbox_processor',
        reference_id: 'msg-abc:processed',
        context:      '{"rpc_error":"duplicate key value violates unique constraint ops_ledger_portal_ref_kind_uniq"}',
        created_at:   inWindow(4),
        count:        0,
      },
      // Intento 3 (otro retry del mismo mensaje): también rechazado.
      {
        portal_email: 'camila@acproyectos.com',
        source:       'inbox_processor',
        reference_id: 'msg-abc:processed',
        context:      '{"rpc_error":"duplicate key"}',
        created_at:   inWindow(3),
        count:        0,
      },
    ], NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.level).toBe('ok');
    expect(result.total).toBe(0);
    expect(result.byOrg).toEqual([]);
  });

  // La colisión original de Tortillería (2026-10-01) sigue debiendo alertar:
  // incident_registered cobró primero (ok), incidencia_notif intentó cobrar
  // después con el mismo reference_id → sources distintos → undercharge real.
  it('alerta cross-source collision aun con cobro previo exitoso', async () => {
    const supa = mockSupabase([
      {
        portal_email: 'servicioalcliente@tortillasestrella.com.mx',
        source:       'incident_registered',
        reference_id: 'inc-xyz',
        context:      '{"ok":true}',
        created_at:   inWindow(5),
        count:        1,
      },
      {
        portal_email: 'servicioalcliente@tortillasestrella.com.mx',
        source:       'incidencia_notif',
        reference_id: 'inc-xyz',
        context:      '{"rpc_error":"duplicate key value violates unique constraint"}',
        created_at:   inWindow(4),
        count:        0,
      },
    ], NOW);
    const result = await detectReferenceIdCollisions(supa, NOW);
    expect(result.level).toBe('warn');
    expect(result.total).toBe(1);
    expect(result.byOrg[0].source).toBe('incidencia_notif');
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
