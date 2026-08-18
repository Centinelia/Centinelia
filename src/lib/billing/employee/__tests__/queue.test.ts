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

// Import AFTER the mock is registered so the module receives the mock.
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
    mockClient.from = vi.fn().mockReturnValue({ update: updateMock });

    const [first, second] = await Promise.all([dequeueAndRun(), dequeueAndRun()]);

    expect(first).toEqual({ processed: 1 });
    expect(second).toEqual({ processed: 0 });
  });
});
