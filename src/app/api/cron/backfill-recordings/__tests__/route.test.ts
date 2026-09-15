/**
 * Tests para GET /api/cron/backfill-recordings.
 *
 * Safety net: baja mp3 a bucket propio para voice_calls que quedaron sin
 * recording_storage_path (webhook cortado, Vapi delay, etc.).
 *
 * Cubre:
 *  - 401 sin CRON_SECRET.
 *  - Happy path: 3 candidatos → 3 downloads + 3 updates → processed=3.
 *  - No candidatos: expected=0, processed=0.
 *  - Un download retorna null (Vapi aún sin mp3): NO se cuenta como error ni
 *    processed. Se re-intentará en el próximo run mientras siga en ventana.
 *  - Update falla: acumula en errors pero sigue con los demás.
 *  - Handler throw (query select falla) → 500 status=error.
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
  mockDownloadAndStore,
} = vi.hoisted(() => ({
  mockCreateAdminClient:   vi.fn(),
  mockAlertPartialFailure: vi.fn(),
  mockDownloadAndStore:    vi.fn(),
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

vi.mock('@/lib/vapi/recordings', () => ({
  downloadAndStoreVapiRecording: mockDownloadAndStore,
}));

import { GET } from '../route';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Construye un mock supabase donde `.from('voice_calls').select().not().is().gt().order().limit()`
 * termina en un thenable con el resultado inyectado, y `.from('voice_calls').update().eq()`
 * también resuelve al resultado inyectado. Un solo queue de resultados atendido en orden.
 */
function makeSupabaseMock() {
  const queue: Array<{ data?: unknown; error?: unknown }> = [];
  const consume = () => {
    const r = queue.shift();
    return { data: r?.data ?? null, error: r?.error ?? null };
  };
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
    maybeSingle: async () => consume(),
    single:      async () => consume(),
    then: <TR>(onfulfilled: (v: { data: unknown; error: unknown }) => TR) =>
      Promise.resolve(consume()).then(onfulfilled),
  });
  const from = vi.fn().mockReturnValue(chainable);
  return {
    from,
    enqueue: (r: { data?: unknown; error?: unknown }) => queue.push(r),
  };
}

function makeCandidate(id: string, agentId = `agent-${id}`) {
  return { id, agent_id: agentId, recording_url: `https://vapi/${id}.mp3` };
}

beforeEach(() => {
  vi.clearAllMocks();
  setCronSecret();
  mockAlertPartialFailure.mockResolvedValue(undefined);
});

// ─── Auth ───────────────────────────────────────────────────────────────────

describe('backfill-recordings — auth', () => {
  it('401 sin Authorization header', async () => {
    const supabase = makeSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabase);

    const res = await GET(makeCronRequestUnauthorized());
    expect(res.status).toBe(401);
  });
});

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('backfill-recordings — behavior', () => {

  it('procesa todos los candidatos: N downloads + N updates', async () => {
    const supabase = makeSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabase);

    const candidates = [makeCandidate('c1'), makeCandidate('c2'), makeCandidate('c3')];

    // cron_runs insert (returns id), luego el SELECT de candidates.
    // Ambos consumen del queue en orden. Los updates de voice_calls también.
    supabase.enqueue({ data: { id: 'run-1' }, error: null }); // cron_runs INSERT.select().maybeSingle
    supabase.enqueue({ data: candidates,      error: null }); // voice_calls SELECT (via then)
    supabase.enqueue({ error: null });                        // update c1
    supabase.enqueue({ error: null });                        // update c2
    supabase.enqueue({ error: null });                        // update c3
    supabase.enqueue({ error: null });                        // cron_runs UPDATE

    mockDownloadAndStore
      .mockResolvedValueOnce('agent-c1/c1.mp3')
      .mockResolvedValueOnce('agent-c2/c2.mp3')
      .mockResolvedValueOnce('agent-c3/c3.mp3');

    const res = await GET(makeCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expected).toBe(3);
    expect(body.processed).toBe(3);
    expect(body.errors_count).toBe(0);
    expect(mockDownloadAndStore).toHaveBeenCalledTimes(3);
  });

  it('sin candidatos: expected=0, processed=0, sin llamar download', async () => {
    const supabase = makeSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabase);
    supabase.enqueue({ data: { id: 'run-1' }, error: null });
    supabase.enqueue({ data: [],              error: null });
    supabase.enqueue({ error: null });

    const res = await GET(makeCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expected).toBe(0);
    expect(body.processed).toBe(0);
    expect(mockDownloadAndStore).not.toHaveBeenCalled();
  });

  it('download retorna null (Vapi aún sin mp3): no cuenta como error ni processed', async () => {
    const supabase = makeSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabase);

    const candidates = [makeCandidate('c1'), makeCandidate('c2')];
    supabase.enqueue({ data: { id: 'run-1' }, error: null });
    supabase.enqueue({ data: candidates,      error: null });
    supabase.enqueue({ error: null }); // update c1 (el que sí bajó)
    supabase.enqueue({ error: null }); // cron_runs UPDATE

    mockDownloadAndStore
      .mockResolvedValueOnce('agent-c1/c1.mp3')
      .mockResolvedValueOnce(null); // c2: Vapi aún no tiene mp3

    const res = await GET(makeCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expected).toBe(2);
    expect(body.processed).toBe(1);
    expect(body.errors_count).toBe(0);
  });

  it('update de voice_calls falla: acumula error pero sigue con los demás', async () => {
    const supabase = makeSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabase);

    const candidates = [makeCandidate('c1'), makeCandidate('c2')];
    supabase.enqueue({ data: { id: 'run-1' }, error: null });
    supabase.enqueue({ data: candidates,      error: null });
    supabase.enqueue({ error: { message: 'db timeout' } }); // update c1 FALLA
    supabase.enqueue({ error: null });                       // update c2 OK
    supabase.enqueue({ error: null });                       // cron_runs UPDATE

    mockDownloadAndStore
      .mockResolvedValueOnce('agent-c1/c1.mp3')
      .mockResolvedValueOnce('agent-c2/c2.mp3');

    const res = await GET(makeCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expected).toBe(2);
    expect(body.processed).toBe(1);
    expect(body.errors_count).toBe(1);
  });

  it('SELECT falla → handler throw → 500 status=error', async () => {
    const supabase = makeSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabase);

    supabase.enqueue({ data: { id: 'run-1' }, error: null });
    supabase.enqueue({ data: null, error: { message: 'connection refused' } });
    supabase.enqueue({ error: null }); // cron_runs UPDATE (still tries)

    const res = await GET(makeCronRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.error).toContain('connection refused');
    expect(mockDownloadAndStore).not.toHaveBeenCalled();
  });

});
