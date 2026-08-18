/**
 * route.test.ts — unit tests for GET /api/billing/worker
 *
 * Mocks both verifyCronAuth and dequeueAndRun so this test is fully isolated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyCronAuth = vi.fn();
const mockDequeueAndRun  = vi.fn();

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: (...args: unknown[]) => mockVerifyCronAuth(...args),
}));

vi.mock('@/lib/billing/employee/queue', () => ({
  dequeueAndRun: () => mockDequeueAndRun(),
}));

// Import after mocks
import { GET } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string) {
  return new Request('http://localhost/api/billing/worker', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/billing/worker', () => {
  it('returns 401 when auth fails', async () => {
    mockVerifyCronAuth.mockReturnValue(false);

    const res = await GET(makeRequest() as any);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Unauthorized' });
    expect(mockDequeueAndRun).not.toHaveBeenCalled();
  });

  it('returns { ok: true, processed: 0 } when queue is empty', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    mockDequeueAndRun.mockResolvedValue({ processed: 0 });

    const res = await GET(makeRequest('Bearer secret') as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, processed: 0 });
  });

  it('returns { ok: true, processed: 1 } when a job was processed', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    mockDequeueAndRun.mockResolvedValue({ processed: 1 });

    const res = await GET(makeRequest('Bearer secret') as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, processed: 1 });
  });

  it('returns 500 when dequeueAndRun throws', async () => {
    mockVerifyCronAuth.mockReturnValue(true);
    mockDequeueAndRun.mockRejectedValue(new Error('DB connection refused'));

    const res = await GET(makeRequest('Bearer secret') as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: 'DB connection refused' });
  });
});
