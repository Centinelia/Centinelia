import { describe, it, expect } from 'vitest';
import {
  detectHighVelocityConsumption,
  detectRepeatedSender,
  detectRecursivePrefixes,
  RECURSIVE_PREFIX_RX,
  VELOCITY_SPIKE_MULTIPLIER,
  VELOCITY_MIN_ABSOLUTE_OPS,
  REPEATED_SENDER_WARN,
  REPEATED_SENDER_CRITICAL,
} from '../consumption-anomaly';

type Row = Record<string, unknown>;

// Minimal Supabase mock — supports .from().select().eq().gte().lt().not()
function makeSb(tables: Record<string, Row[]>) {
  const build = (rows: Row[]) => {
    const filters: Array<(r: Row) => boolean> = [];
    const apply = () => rows.filter(r => filters.every(f => f(r)));
    const api: any = {
      select: (_cols: string) => api,
      eq:  (col: string, val: unknown) => { filters.push(r => r[col] === val); return api; },
      neq: (col: string, val: unknown) => { filters.push(r => r[col] !== val); return api; },
      gte: (col: string, val: unknown) => { filters.push(r => (r[col] as string) >= (val as string)); return api; },
      lt:  (col: string, val: unknown) => { filters.push(r => (r[col] as string) <  (val as string)); return api; },
      lte: (col: string, val: unknown) => { filters.push(r => (r[col] as string) <= (val as string)); return api; },
      not: (col: string, _op: string, val: unknown) => { filters.push(r => r[col] !== val); return api; },
      then: (resolve: (v: any) => void) => resolve({ data: apply(), error: null }),
    };
    return api;
  };
  return {
    from: (name: string) => build(tables[name] ?? []),
  } as any;
}

const nowIso = () => new Date().toISOString();
const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

describe('detectHighVelocityConsumption', () => {
  it('flagea org con 10× del baseline', async () => {
    // 14 días baseline: 14 ops total → ~1/día
    // 24h window: 150 ops (≥ MIN_ABSOLUTE y > 5× baseline)
    const rows: Row[] = [];
    for (let i = 0; i < 14; i++) {
      rows.push({ kind: 'consumption', portal_email: 'bursty@test.com', amount: -1, created_at: hoursAgoIso(24 + i * 24) });
    }
    for (let i = 0; i < 150; i++) {
      rows.push({ kind: 'consumption', portal_email: 'bursty@test.com', amount: -1, created_at: hoursAgoIso(2) });
    }
    const sb = makeSb({ ops_ledger: rows });
    const out = await detectHighVelocityConsumption(sb);
    expect(out).toHaveLength(1);
    expect(out[0].portal_email).toBe('bursty@test.com');
    expect(out[0].ops_24h).toBe(150);
    expect(out[0].multiplier).toBeGreaterThanOrEqual(VELOCITY_SPIKE_MULTIPLIER);
  });

  it('ignora orgs debajo del umbral absoluto', async () => {
    const rows: Row[] = [];
    for (let i = 0; i < VELOCITY_MIN_ABSOLUTE_OPS - 10; i++) {
      rows.push({ kind: 'consumption', portal_email: 'slow@test.com', amount: -1, created_at: hoursAgoIso(2) });
    }
    const sb = makeSb({ ops_ledger: rows });
    const out = await detectHighVelocityConsumption(sb);
    expect(out).toHaveLength(0);
  });

  it('flagea org nueva con muchas ops sin baseline', async () => {
    const rows: Row[] = [];
    for (let i = 0; i < 300; i++) {
      rows.push({ kind: 'consumption', portal_email: 'new@test.com', amount: -1, created_at: hoursAgoIso(2) });
    }
    const sb = makeSb({ ops_ledger: rows });
    const out = await detectHighVelocityConsumption(sb);
    expect(out).toHaveLength(1);
    expect(out[0].baseline_avg).toBe(0);
    expect(out[0].multiplier).toBe(Infinity);
  });
});

describe('detectRepeatedSender', () => {
  it('flagea mismo remitente >= REPEATED_SENDER_WARN', async () => {
    const agent = { id: 'a1', portal_email: 'client@test.com' };
    const rows: Row[] = [];
    for (let i = 0; i < REPEATED_SENDER_WARN + 5; i++) {
      rows.push({ agent_id: 'a1', email_from: 'spammer@x.com', item_type: 'email', created_at: hoursAgoIso(2) });
    }
    const sb = makeSb({ voice_agents: [agent], ops_inbox: rows });
    const out = await detectRepeatedSender(sb);
    expect(out).toHaveLength(1);
    expect(out[0].sender).toBe('spammer@x.com');
    expect(out[0].count).toBe(REPEATED_SENDER_WARN + 5);
    expect(out[0].level).toBe('warn');
  });

  it('marca critical cuando >= REPEATED_SENDER_CRITICAL', async () => {
    const agent = { id: 'a1', portal_email: 'client@test.com' };
    const rows: Row[] = [];
    for (let i = 0; i < REPEATED_SENDER_CRITICAL + 1; i++) {
      rows.push({ agent_id: 'a1', email_from: 'bulk@x.com', item_type: 'email', created_at: hoursAgoIso(2) });
    }
    const sb = makeSb({ voice_agents: [agent], ops_inbox: rows });
    const out = await detectRepeatedSender(sb);
    expect(out[0].level).toBe('critical');
  });

  it('ignora remitente debajo del umbral', async () => {
    const agent = { id: 'a1', portal_email: 'client@test.com' };
    const rows: Row[] = [{ agent_id: 'a1', email_from: 'normal@x.com', item_type: 'email', created_at: hoursAgoIso(2) }];
    const sb = makeSb({ voice_agents: [agent], ops_inbox: rows });
    const out = await detectRepeatedSender(sb);
    expect(out).toHaveLength(0);
  });
});

describe('detectRecursivePrefixes', () => {
  it('regex matchea 3+ niveles de prefijos', () => {
    expect(RECURSIVE_PREFIX_RX.test('[Factura] [Factura] [Factura] algo')).toBe(true);
    expect(RECURSIVE_PREFIX_RX.test('[Factura] [Factura] algo')).toBe(false);
    expect(RECURSIVE_PREFIX_RX.test('[Factura] algo')).toBe(false);
    expect(RECURSIVE_PREFIX_RX.test('[Proveedor] [Factura] [Aviso] mix')).toBe(true);
    expect(RECURSIVE_PREFIX_RX.test('Sin prefijos')).toBe(false);
    expect(RECURSIVE_PREFIX_RX.test('[Notificación] [Notificación] [Notificación] con acento')).toBe(true);
  });

  it('reporta deepest level y sample', async () => {
    const agent = { id: 'a1', portal_email: 'ac@test.com' };
    const rows: Row[] = [
      { agent_id: 'a1', email_subject: '[Factura] [Factura] [Factura] A', item_type: 'email', created_at: hoursAgoIso(1) },
      { agent_id: 'a1', email_subject: '[Factura] [Factura] [Factura] [Factura] [Factura] B', item_type: 'email', created_at: hoursAgoIso(2) },
      { agent_id: 'a1', email_subject: '[Factura] solo uno', item_type: 'email', created_at: hoursAgoIso(3) },
    ];
    const sb = makeSb({ voice_agents: [agent], ops_inbox: rows });
    const out = await detectRecursivePrefixes(sb);
    expect(out).toHaveLength(1);
    expect(out[0].portal_email).toBe('ac@test.com');
    expect(out[0].count).toBe(2);
    expect(out[0].deepest_level).toBe(5);
    expect(out[0].sample_subject).toContain('[Factura] [Factura] [Factura] [Factura] [Factura]');
  });

  it('vacío cuando no hay anidación recursiva', async () => {
    const agent = { id: 'a1', portal_email: 'clean@test.com' };
    const rows: Row[] = [
      { agent_id: 'a1', email_subject: '[Factura] subject normal', item_type: 'email', created_at: hoursAgoIso(1) },
      { agent_id: 'a1', email_subject: '[Factura] [Factura] casi', item_type: 'email', created_at: hoursAgoIso(2) },
    ];
    const sb = makeSb({ voice_agents: [agent], ops_inbox: rows });
    const out = await detectRecursivePrefixes(sb);
    expect(out).toHaveLength(0);
  });
});
