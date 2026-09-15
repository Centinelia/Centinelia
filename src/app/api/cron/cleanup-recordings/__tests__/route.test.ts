/**
 * Tests para GET /api/cron/cleanup-recordings.
 *
 * Regression: antes retenía 7 días y solo NULLificaba recording_url en la
 * tabla (que ya nadie leía). Ahora retiene 90 días, purga objetos del bucket
 * call-recordings y limpia también recording_storage_path.
 *
 * Cubre:
 *  - 401 sin CRON_SECRET Bearer.
 *  - Happy path: lista folders del bucket, borra objetos > 90d, ignora nuevos,
 *    limpia voice_calls (recording_storage_path + recording_url).
 *  - Bucket vacío: expected=0, processed=0, sin error.
 *  - list() de un folder falla: se acumula en errors pero no aborta el cron.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  makeCronRequest,
  makeCronRequestUnauthorized,
  setCronSecret,
} from '@/lib/cron/__tests__/test-utils';

const {
  mockCreateAdminClient,
  mockAlertPartialFailure,
  mockStorageList,
  mockStorageRemove,
} = vi.hoisted(() => ({
  mockCreateAdminClient:   vi.fn(),
  mockAlertPartialFailure: vi.fn(),
  mockStorageList:         vi.fn(),
  mockStorageRemove:       vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/cron/alert-partial-failure', () => ({
  alertCronPartialFailure: mockAlertPartialFailure,
  errorMessage: (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
    return String(err);
  },
}));

import { GET } from '../route';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Mock supabase con .storage y .from combinados. Genera un chainable que soporta
 * los métodos que usa el wrapper `defineCron` (from().insert().select().maybeSingle(),
 * from().update().eq(), from().update().lt().or()) y siempre resuelve exitoso.
 * No necesitamos aserciones sobre la tabla, así que un stub uniforme es suficiente.
 */
function makeCombinedSupabase() {
  const chainable: Record<string, unknown> = {};
  const returnSelf = () => chainable;
  Object.assign(chainable, {
    select: returnSelf,
    insert: returnSelf,
    update: returnSelf,
    delete: returnSelf,
    eq:     returnSelf,
    neq:    returnSelf,
    in:     returnSelf,
    lt:     returnSelf,
    gt:     returnSelf,
    or:     returnSelf,
    not:    returnSelf,
    is:     returnSelf,
    order:  returnSelf,
    limit:  returnSelf,
    maybeSingle: async () => ({ data: { id: 'run-1' }, error: null }),
    single:      async () => ({ data: { id: 'run-1' }, error: null }),
    then: <TR>(onfulfilled: (v: { data: unknown; error: unknown }) => TR) =>
      Promise.resolve({ data: null, error: null }).then(onfulfilled),
  });
  const from = vi.fn().mockReturnValue(chainable);
  const storage = {
    from: vi.fn().mockReturnValue({
      list:   mockStorageList,
      remove: mockStorageRemove,
    }),
  };
  return { from, storage };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
  setCronSecret();
  mockAlertPartialFailure.mockResolvedValue(undefined);
});

// ─── Auth ───────────────────────────────────────────────────────────────────

describe('cleanup-recordings — auth', () => {
  it('401 sin Authorization header', async () => {
    const supabase = makeCombinedSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const res = await GET(makeCronRequestUnauthorized());
    expect(res.status).toBe(401);
  });
});

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('cleanup-recordings — purge', () => {
  it('borra objetos > 90d y respeta los nuevos', async () => {
    const supabase = makeCombinedSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    // Root list: dos agent folders
    mockStorageList.mockImplementation(async (prefix: string) => {
      if (prefix === '') {
        return {
          data: [
            { name: 'agent-a', id: null, updated_at: null, created_at: null },
            { name: 'agent-b', id: null, updated_at: null, created_at: null },
          ],
          error: null,
        };
      }
      if (prefix === 'agent-a') {
        return {
          data: [
            { name: 'call-old.mp3',   updated_at: daysAgo(120), created_at: daysAgo(120) },
            { name: 'call-fresh.mp3', updated_at: daysAgo(3),   created_at: daysAgo(3)   },
          ],
          error: null,
        };
      }
      if (prefix === 'agent-b') {
        return {
          data: [
            { name: 'call-older.mp3', updated_at: daysAgo(400), created_at: daysAgo(400) },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    });

    mockStorageRemove.mockResolvedValue({ error: null });

    const res = await GET(makeCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(body.expected).toBe(2);

    // Verificamos qué paths se pidieron borrar
    const removed = mockStorageRemove.mock.calls.flatMap(c => c[0]);
    expect(removed).toEqual(expect.arrayContaining([
      'agent-a/call-old.mp3',
      'agent-b/call-older.mp3',
    ]));
    expect(removed).not.toContain('agent-a/call-fresh.mp3');
  });

  it('bucket vacío: expected=0, processed=0, sin error', async () => {
    const supabase = makeCombinedSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    mockStorageList.mockResolvedValue({ data: [], error: null });

    const res = await GET(makeCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expected).toBe(0);
    expect(body.processed).toBe(0);
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('list() de un agent folder falla: acumula error pero no aborta', async () => {
    const supabase = makeCombinedSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    mockStorageList.mockImplementation(async (prefix: string) => {
      if (prefix === '') {
        return {
          data: [
            { name: 'agent-broken' },
            { name: 'agent-ok' },
          ],
          error: null,
        };
      }
      if (prefix === 'agent-broken') {
        return { data: null, error: { message: 'unauthorized' } };
      }
      if (prefix === 'agent-ok') {
        return {
          data: [{ name: 'stale.mp3', updated_at: daysAgo(120) }],
          error: null,
        };
      }
      return { data: [], error: null };
    });
    mockStorageRemove.mockResolvedValue({ error: null });

    const res = await GET(makeCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    // La otra folder sí procesó (1 archivo viejo).
    expect(body.processed).toBe(1);
    // El error de list() se propaga como errors_count>0.
    expect(body.errors_count).toBeGreaterThan(0);
  });

});
