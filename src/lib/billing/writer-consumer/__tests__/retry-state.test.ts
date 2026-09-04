/**
 * retry-state.test.ts — bumpAttempt / markExhausted contra un mock
 * de SupabaseClient in-memory. Verifica: primer insert, incremento,
 * markExhausted, y comportamiento cuando la BD falla.
 */
import { describe, it, expect } from 'vitest';
import { bumpAttempt, markExhausted, MAX_PAC_RETRY_ATTEMPTS } from '../retry-state';

// ---- Minimal Supabase mock -----------------------------------------------------

interface Row {
  basename:        string;
  portal_email:    string;
  attempts:        number;
  first_seen_at:   string;
  last_attempt_at: string;
  exhausted:       boolean;
  last_reason:     string | null;
}

class MockSupabase {
  rows = new Map<string, Row>();
  failNextInsert = false;
  failNextUpdate = false;

  from(_table: string) {
    return {
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            const row = this.rows.get(val);
            return row ? { data: row, error: null } : { data: null, error: null };
          },
        }),
      }),
      insert: (payload: Partial<Row>) => ({
        select: () => ({
          maybeSingle: async () => {
            if (this.failNextInsert) {
              this.failNextInsert = false;
              return { data: null, error: { message: 'insert failed' } };
            }
            const now = new Date().toISOString();
            const row: Row = {
              basename:        payload.basename!,
              portal_email:    payload.portal_email!,
              attempts:        payload.attempts ?? 1,
              first_seen_at:   now,
              last_attempt_at: now,
              exhausted:       false,
              last_reason:     payload.last_reason ?? null,
            };
            this.rows.set(row.basename, row);
            return { data: row, error: null };
          },
        }),
      }),
      update: (payload: Partial<Row>) => ({
        eq: (_col: string, val: string) => ({
          select: () => ({
            maybeSingle: async () => {
              if (this.failNextUpdate) {
                this.failNextUpdate = false;
                return { data: null, error: { message: 'update failed' } };
              }
              const existing = this.rows.get(val);
              if (!existing) return { data: null, error: null };
              const updated: Row = { ...existing, ...payload };
              this.rows.set(val, updated);
              return { data: updated, error: null };
            },
          }),
          // markExhausted no encadena .select()
          then: undefined,
        }),
      }),
    };
  }

  updateSimple(basename: string, patch: Partial<Row>) {
    const existing = this.rows.get(basename);
    if (existing) this.rows.set(basename, { ...existing, ...patch });
  }
}

// markExhausted usa .update().eq() sin .select(). Ajustamos el mock:
function bindExhaustedMock(mock: MockSupabase) {
  const orig = mock.from.bind(mock);
  mock.from = (table: string) => {
    const chain = orig(table);
    const originalUpdate = chain.update;
    chain.update = (payload: Partial<Row>) => {
      const result = originalUpdate(payload);
      return {
        ...result,
        eq: (col: string, val: string) => {
          const eqResult = result.eq(col, val);
          return {
            ...eqResult,
            then: (resolve: () => void) => { mock.updateSimple(val, payload); resolve(); },
          };
        },
      };
    };
    return chain;
  };
}

// ---- Tests --------------------------------------------------------------------

describe('bumpAttempt', () => {
  it('inserts with attempts=1 on first sight', async () => {
    const mock = new MockSupabase();
    const state = await bumpAttempt(mock as any, 'facturas_abc', 'org@x.mx', 'timeout');
    expect(state).toMatchObject({ basename: 'facturas_abc', attempts: 1, exhausted: false, lastReason: 'timeout' });
    expect(mock.rows.get('facturas_abc')?.attempts).toBe(1);
  });

  it('increments attempts on subsequent bumps', async () => {
    const mock = new MockSupabase();
    await bumpAttempt(mock as any, 'facturas_abc', 'org@x.mx', 'timeout 1');
    const s2 = await bumpAttempt(mock as any, 'facturas_abc', 'org@x.mx', 'timeout 2');
    const s3 = await bumpAttempt(mock as any, 'facturas_abc', 'org@x.mx', 'timeout 3');
    expect(s2?.attempts).toBe(2);
    expect(s3?.attempts).toBe(3);
    expect(s3?.lastReason).toBe('timeout 3');
  });

  it('reaches cap after MAX_PAC_RETRY_ATTEMPTS bumps', async () => {
    const mock = new MockSupabase();
    let last;
    for (let i = 1; i <= MAX_PAC_RETRY_ATTEMPTS + 1; i++) {
      last = await bumpAttempt(mock as any, 'facturas_x', 'org@x.mx', `attempt ${i}`);
    }
    expect(last?.attempts).toBe(MAX_PAC_RETRY_ATTEMPTS + 1);
    expect(last?.attempts > MAX_PAC_RETRY_ATTEMPTS).toBe(true);
  });

  it('returns null when insert fails (BD problem)', async () => {
    const mock = new MockSupabase();
    mock.failNextInsert = true;
    const state = await bumpAttempt(mock as any, 'facturas_bad', 'org@x.mx', 'db down');
    expect(state).toBeNull();
  });
});

describe('markExhausted', () => {
  it('sets exhausted=true for the row', async () => {
    const mock = new MockSupabase();
    bindExhaustedMock(mock);
    await bumpAttempt(mock as any, 'facturas_x', 'org@x.mx', 'r');
    await markExhausted(mock as any, 'facturas_x');
    expect(mock.rows.get('facturas_x')?.exhausted).toBe(true);
  });
});
