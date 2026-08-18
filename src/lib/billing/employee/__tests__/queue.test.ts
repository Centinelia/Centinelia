/**
 * queue.test.ts — unit tests for src/lib/billing/employee/queue.ts
 *
 * Mocks @/lib/supabase/admin so no real DB connection is needed.
 * Covers: enqueue, dequeue atomic claim, complete, fail, retry up to 3 attempts.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin before importing queue functions
// ---------------------------------------------------------------------------

const mockSingle   = vi.fn();
const mockSelect   = vi.fn();
const mockInsert   = vi.fn();
const mockUpdate   = vi.fn();
const mockEq       = vi.fn();
const mockRpc      = vi.fn();

/** Build a chainable Supabase-like builder */
function makeBuilder(terminal: Mock) {
  const builder: Record<string, unknown> = {};
  builder.select   = vi.fn().mockReturnValue(builder);
  builder.eq       = vi.fn().mockReturnValue(builder);
  builder.single   = terminal;
  builder.insert   = mockInsert;
  builder.update   = mockUpdate;
  return builder;
}

// The mock factory returns a client whose methods we can configure per test.
const mockClient = {
  from: vi.fn(),
  rpc:  mockRpc,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockClient,
}));

// Mock sendEmail so integration tests do not hit real Resend API.
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

// Hoisted mocks: declared before vi.mock() factory hoisting so references are valid.
const { mockBuildAdapter, mockRunOnEmail } = vi.hoisted(() => ({
  mockBuildAdapter: vi.fn(),
  mockRunOnEmail:   vi.fn(),
}));

// Mock buildAdapter so process_notes tests don't need a real adapter.
vi.mock('@/lib/billing/adapters', () => ({
  buildAdapter: (...args: unknown[]) => mockBuildAdapter(...args),
}));

// Mock BillingEmployee so process_notes tests don't run the real LLM loop.
vi.mock('@/lib/billing/employee/loop', () => ({
  BillingEmployee: vi.fn().mockImplementation(() => ({
    runOnEmail: mockRunOnEmail,
  })),
}));

// retryWithBackoff mock: a vi.fn() wrapping a configurable implementation.
// Default behaviour is a zero-delay pass-through (calls fn() once, no sleep).
// Individual tests can override with mockImplementationOnce to test retry logic.
const mockRetryWithBackoff = vi.fn(async <T>(fn: () => Promise<T>, _opts?: unknown): Promise<T> => fn());

vi.mock('@/lib/billing/util/retry', () => ({
  retryWithBackoff: (...args: Parameters<typeof mockRetryWithBackoff>) => mockRetryWithBackoff(...args),
}));

// Import AFTER the mocks are registered so the module receives the mocks.
import { enqueueBillingEmail, dequeueAndRun } from '../queue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  emailId:       'email-abc',
  kind:          'process_notes' as const,
  portalEmail:   'test@example.com',
  integrationId: 'integ-uuid-123',
};

function setupFromChain({
  insertResult = { data: { id: 'job-1' }, error: null },
  updateResult = { error: null },
}: {
  insertResult?: unknown;
  updateResult?: unknown;
} = {}) {
  // Each call to from() returns an object with .insert() and .update() chains
  const fromMock = vi.fn().mockReturnValue({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(insertResult),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(updateResult),
    }),
  });
  mockClient.from = fromMock;
  return fromMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: adapter stub that satisfies BillingAdapter shape (not called in most tests).
  mockBuildAdapter.mockReturnValue({});
  // Default: successful runOnEmail result.
  mockRunOnEmail.mockResolvedValue({ processed: 1, escalated: 0, consulted: 0, errors: [] });
  // Default: pass-through (calls fn() once, no sleep).
  mockRetryWithBackoff.mockImplementation(async <T>(fn: () => Promise<T>, _opts?: unknown): Promise<T> => fn());
});

// ---------------------------------------------------------------------------
// enqueueBillingEmail
// ---------------------------------------------------------------------------

describe('enqueueBillingEmail', () => {
  it('inserts a row with status=pending and returns jobId', async () => {
    const fromMock = setupFromChain({ insertResult: { data: { id: 'job-xyz' }, error: null } });

    const result = await enqueueBillingEmail(BASE_PARAMS);

    expect(result).toEqual({ jobId: 'job-xyz' });

    // Verify insert was called with correct payload
    const insertCall = fromMock().insert.mock.calls[0][0];
    expect(insertCall).toMatchObject({
      portal_email:   BASE_PARAMS.portalEmail,
      integration_id: BASE_PARAMS.integrationId,
      kind:           'process_notes',
      payload:        { email_id: BASE_PARAMS.emailId },
      status:         'pending',
    });
  });

  it('throws when supabase returns an error', async () => {
    setupFromChain({ insertResult: { data: null, error: { message: 'insert error' } } });

    await expect(enqueueBillingEmail(BASE_PARAMS)).rejects.toThrow('enqueue failed');
  });
});

// ---------------------------------------------------------------------------
// dequeueAndRun — RPC claim
// ---------------------------------------------------------------------------

describe('dequeueAndRun', () => {
  it('returns { processed: 0 } when no pending jobs', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    setupFromChain();

    const result = await dequeueAndRun();

    expect(result).toEqual({ processed: 0 });
    expect(mockRpc).toHaveBeenCalledWith('claim_billing_job');
  });

  it('throws when claim RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } });

    await expect(dequeueAndRun()).rejects.toThrow('claim_billing_job RPC failed');
  });

  it('returns { processed: 1 } and marks done on successful handler', async () => {
    const job = {
      id:             'job-1',
      portal_email:   'test@example.com',
      integration_id: 'integ-1',
      kind:           'reply_missing_attachments', // simpler handler — no DB lookup needed
      payload:        { email_id: 'e1' },
      status:         'running',
      attempts:       1,
      last_error:     null,
      created_at:     new Date().toISOString(),
      started_at:     new Date().toISOString(),
      finished_at:    null,
    };

    mockRpc.mockResolvedValue({ data: [job], error: null });

    // reply_missing_attachments calls replyToInboundEmail which calls supabase select.
    // Mock from() to support both select and update chains.
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock   = vi.fn().mockReturnValue({ eq: updateEqMock });
    const maybeSingle  = vi.fn().mockResolvedValue({
      data: { from_address: 'from@test.com', subject: 'Test', message_id: null },
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ maybeSingle });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    mockClient.from = vi.fn().mockReturnValue({
      update: updateMock,
      select: selectMock,
    });

    const result = await dequeueAndRun();

    expect(result).toEqual({ processed: 1 });
    // Should have updated to done
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done' }),
    );
  });

  it('marks failed with last_error when handler throws and attempts >= MAX_ATTEMPTS', async () => {
    const job = {
      id:             'job-fail',
      portal_email:   'test@example.com',
      integration_id: 'integ-1',
      kind:           'unknown_kind_to_force_error',
      payload:        { email_id: 'e2' },
      status:         'running',
      attempts:       3, // at max — should permanently fail
      last_error:     null,
      created_at:     new Date().toISOString(),
      started_at:     new Date().toISOString(),
      finished_at:    null,
    };

    mockRpc.mockResolvedValue({ data: [job], error: null });

    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock   = vi.fn().mockReturnValue({ eq: updateEqMock });
    mockClient.from = vi.fn().mockReturnValue({ update: updateMock });

    const result = await dequeueAndRun();

    expect(result).toEqual({ processed: 1 });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('reverts to pending (not failed) when attempts < MAX_ATTEMPTS and handler throws', async () => {
    const job = {
      id:             'job-retry',
      portal_email:   'test@example.com',
      integration_id: 'integ-1',
      kind:           'unknown_kind_to_force_error',
      payload:        { email_id: 'e3' },
      status:         'running',
      attempts:       1, // below max — should retry
      last_error:     null,
      created_at:     new Date().toISOString(),
      started_at:     new Date().toISOString(),
      finished_at:    null,
    };

    mockRpc.mockResolvedValue({ data: [job], error: null });

    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock   = vi.fn().mockReturnValue({ eq: updateEqMock });
    mockClient.from = vi.fn().mockReturnValue({ update: updateMock });

    const result = await dequeueAndRun();

    expect(result).toEqual({ processed: 1 });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('does not double-process: second concurrent call returns 0 when first claimed the only job', async () => {
    // Simulate two concurrent callers: first gets the job, second gets empty set.
    mockRpc
      .mockResolvedValueOnce({ data: [{
        id:             'job-concurrent',
        portal_email:   'test@example.com',
        integration_id: 'integ-1',
        kind:           'process_notes',
        payload:        { email_id: 'e4' },
        status:         'running',
        attempts:       1,
        last_error:     null,
        created_at:     new Date().toISOString(),
        started_at:     new Date().toISOString(),
        finished_at:    null,
      }], error: null })
      .mockResolvedValueOnce({ data: [], error: null }); // second caller

    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock   = vi.fn().mockReturnValue({ eq: updateEqMock });

    // process_notes now reads organization_integrations — set up select chain + update.
    const mockConfig = { type: 'mock' };
    const integSingle = vi.fn().mockResolvedValue({
      data: { config: mockConfig },
      error: null,
    });
    const integEq = vi.fn().mockReturnValue({ single: integSingle });
    const integSelect = vi.fn().mockReturnValue({ eq: integEq });

    mockClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'organization_integrations') {
        return { select: integSelect };
      }
      return { update: updateMock };
    });

    const [first, second] = await Promise.all([dequeueAndRun(), dequeueAndRun()]);

    expect(first).toEqual({ processed: 1 });
    expect(second).toEqual({ processed: 0 });
  });
});

// ---------------------------------------------------------------------------
// handleProcessNotes — adapter registry integration
// ---------------------------------------------------------------------------

describe('handleProcessNotes — adapter registry', () => {
  function makeProcessNotesJob(integrationId = 'integ-registry-1') {
    return {
      id:             'job-pn-1',
      portal_email:   'factory@example.com',
      integration_id: integrationId,
      kind:           'process_notes' as const,
      payload:        { email_id: 'email-pn-1' },
      status:         'running',
      attempts:       1,
      last_error:     null,
      created_at:     new Date().toISOString(),
      started_at:     new Date().toISOString(),
      finished_at:    null,
    };
  }

  function setupProcessNotesFromChain(
    integConfig: Record<string, unknown>,
    integError: { message: string } | null = null,
  ) {
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock   = vi.fn().mockReturnValue({ eq: updateEqMock });

    const integSingle = vi.fn().mockResolvedValue({
      data: integError ? null : { config: integConfig },
      error: integError,
    });
    const integEq     = vi.fn().mockReturnValue({ single: integSingle });
    const integSelect = vi.fn().mockReturnValue({ eq: integEq });

    mockClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'organization_integrations') {
        return { select: integSelect };
      }
      return { update: updateMock };
    });

    return { updateMock, integSelect, integEq, integSingle };
  }

  it('reads integration config from organization_integrations and calls buildAdapter', async () => {
    const mockConfig = { type: 'mock' };
    const job = makeProcessNotesJob('integ-registry-1');

    mockRpc.mockResolvedValue({ data: [job], error: null });
    const { integEq } = setupProcessNotesFromChain(mockConfig);

    await dequeueAndRun();

    // Verify DB lookup used the correct integration_id.
    expect(integEq).toHaveBeenCalledWith('id', 'integ-registry-1');
    // Verify buildAdapter was called with the config from the DB row.
    expect(mockBuildAdapter).toHaveBeenCalledWith(mockConfig);
  });

  it('retryWithBackoff: fn falla en primer intento y tiene exito en segundo — callCount=2', async () => {
    // Verifies that queue.ts passes a callable `fn` to retryWithBackoff, and that
    // when retryWithBackoff invokes fn() a second time (after the first throws), the
    // second call succeeds and the result propagates correctly.
    //
    // Strategy: replace mockRetryWithBackoff with a minimal real-retry implementation
    // (no sleep) that calls fn() up to twice. The underlying Supabase .single() mock
    // throws on the first call and resolves on the second. We assert callCount===2
    // and that the integration config from the second call reaches buildAdapter.
    const job = makeProcessNotesJob('integ-retry');
    mockRpc.mockResolvedValue({ data: [job], error: null });

    const mockConfig = { type: 'mock' };
    let fnCallCount = 0;
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock   = vi.fn().mockReturnValue({ eq: updateEqMock });

    mockClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'organization_integrations') {
        const singleMock = vi.fn().mockImplementation(() => {
          fnCallCount++;
          if (fnCallCount === 1) {
            // First call: throw so retryWithBackoff retries.
            return Promise.reject(new Error('ECONNRESET'));
          }
          // Second call: success — resolves with integration config.
          return Promise.resolve({ data: { config: mockConfig }, error: null });
        });
        const eqMock = vi.fn().mockReturnValue({ single: singleMock });
        return { select: vi.fn().mockReturnValue({ eq: eqMock }) };
      }
      return { update: updateMock };
    });

    // For this test: replace pass-through with a real 2-attempt retry loop (no sleep).
    // This isolates the retry behaviour without needing to run BillingEmployee.
    mockRetryWithBackoff.mockImplementationOnce(async <T>(fn: () => Promise<T>) => {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await fn();
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    });

    // dequeueAndRun will fail further down (BillingEmployee constructor) because we're
    // replacing the retry but not the full LLM loop. We capture markFailed's update instead.
    const result = await dequeueAndRun();

    // The retry executed fn() exactly twice: fail then succeed.
    expect(fnCallCount).toBe(2);
    // retryWithBackoff was called once (for the integration lookup).
    expect(mockRetryWithBackoff).toHaveBeenCalledTimes(1);
    // buildAdapter was called with the config returned by the second (successful) fn() call.
    expect(mockBuildAdapter).toHaveBeenCalledWith(mockConfig);
    // dequeueAndRun always returns { processed: 1 } when a job was claimed.
    expect(result).toEqual({ processed: 1 });
  });

  it('throws and marks job failed when integration row is not found', async () => {
    const job = makeProcessNotesJob('integ-missing');

    mockRpc.mockResolvedValue({ data: [job], error: null });
    setupProcessNotesFromChain({}, { message: 'row not found' });

    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock   = vi.fn().mockReturnValue({ eq: updateEqMock });
    // Override from so the update path also works after the handler throws.
    mockClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'organization_integrations') {
        const s = vi.fn().mockResolvedValue({ data: null, error: { message: 'row not found' } });
        const e = vi.fn().mockReturnValue({ single: s });
        return { select: vi.fn().mockReturnValue({ eq: e }) };
      }
      return { update: updateMock };
    });

    const result = await dequeueAndRun();

    // dequeueAndRun catches the error and calls markFailed — returns processed: 1.
    expect(result).toEqual({ processed: 1 });
    // The job should be marked pending (attempt 1 < MAX_ATTEMPTS=3) with the integration error.
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status:     'pending',
        last_error: expect.stringContaining('integration not found'),
      }),
    );
  });
});
