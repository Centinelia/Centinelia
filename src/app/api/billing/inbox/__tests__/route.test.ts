/**
 * route.test.ts — unit tests for POST /api/billing/inbox
 *
 * Mocks:
 *   - @/lib/supabase/admin  (no real DB)
 *   - @/lib/billing/employee/queue  (no real job insertion)
 *   - process.env.EMAIL_INBOUND_SECRET
 *
 * Covers:
 *   - happy path with attachments (200)
 *   - no attachments -> 202 + warning
 *   - no matching integration -> 404
 *   - missing / wrong secret -> 401
 *   - missing env var -> 503
 *   - DB insert error -> 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock queue ───────────────────────────────────────────────────────────────
// vi.mock factories are hoisted — do NOT reference variables declared in test
// scope inside the factory. Use vi.fn() directly and access the mock via
// vi.mocked() after import.

vi.mock('@/lib/billing/employee/queue', () => ({
  enqueueBillingEmail: vi.fn(),
}));

// ── Mock Supabase admin ──────────────────────────────────────────────────────
// vi.mock factories are hoisted — cannot reference outer-scope let/const.
// We use vi.hoisted() to create shared mocks that ARE available in the factory.

const { mockMaybeSingle, mockSingle } = vi.hoisted(() => ({
  mockMaybeSingle: vi.fn(),
  mockSingle:      vi.fn(),
}));

// Build a chainable .from() mock that supports:
//   .from('X').select('...').eq('...').maybeSingle()  (lookup)
//   .from('X').insert({...}).select('...').single()    (insert)
function buildFromMock() {
  const eqReturn = { maybeSingle: mockMaybeSingle };
  const selectReturn = {
    eq:          vi.fn().mockReturnValue(eqReturn),
    maybeSingle: mockMaybeSingle,
  };
  const insertReturn = {
    select: vi.fn().mockReturnValue({ single: mockSingle }),
  };
  return vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue(selectReturn),
    eq:     vi.fn().mockReturnValue(eqReturn),
    insert: vi.fn().mockReturnValue(insertReturn),
    maybeSingle: mockMaybeSingle,
  });
}

const mockAdminClient = { from: buildFromMock() };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}));

// ── Import route AFTER mocks ─────────────────────────────────────────────────

import { POST } from '../route';
import { enqueueBillingEmail } from '@/lib/billing/employee/queue';

const mockEnqueue = vi.mocked(enqueueBillingEmail);

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_SECRET = 'test-secret-xyz';

function makeJsonRequest(body: unknown, secret: string | null = VALID_SECRET): NextRequest {
  const url = `http://localhost/api/billing/inbox${secret !== null ? `?secret=${secret}` : ''}`;
  return new NextRequest(url, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

const BASE_BODY = {
  from:    'oficina@tortilleria.mx',
  to:      'facturacion@tortilleria.centinelia.ai',
  subject: 'Notitas',
  text:    'Ver adjuntos',
  attachments: [
    {
      filename:    'nota.jpg',
      contentType: 'image/jpeg',
      content:     Buffer.from('fake-jpg').toString('base64'),
    },
  ],
};

const INTEGRATION_ROW = {
  id:           'integ-uuid-1',
  portal_email: 'tortilleria@centinelia.mx',
};

const EMAIL_ROW = { id: 'email-uuid-1' };

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset from mock
  mockAdminClient.from = buildFromMock();
  // Default: integration found, insert succeeds, enqueue succeeds
  mockMaybeSingle.mockResolvedValue({ data: INTEGRATION_ROW, error: null });
  mockSingle.mockResolvedValue({ data: EMAIL_ROW, error: null });
  mockEnqueue.mockResolvedValue({ jobId: 'job-abc-1' });
  process.env.EMAIL_INBOUND_SECRET = VALID_SECRET;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/billing/inbox', () => {
  it('returns 200 with jobId on valid payload with attachments', async () => {
    const res  = await POST(makeJsonRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.jobId).toBe('job-abc-1');
    expect(json.warning).toBeUndefined();

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'process_notes' }),
    );
  });

  it('returns 202 with warning when no valid attachments', async () => {
    const res  = await POST(makeJsonRequest({ ...BASE_BODY, attachments: [] }));
    const json = await res.json();

    expect(res.status).toBe(202);
    expect(json.ok).toBe(true);
    expect(json.warning).toBe('no_attachments');

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reply_missing_attachments' }),
    );
  });

  it('returns 202 when all attachments have disallowed types', async () => {
    const res = await POST(makeJsonRequest({
      ...BASE_BODY,
      attachments: [
        { filename: 'data.csv', contentType: 'text/csv', content: 'abc=' },
      ],
    }));
    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json.warning).toBe('no_attachments');
  });

  it('returns 404 when to_address does not match any integration', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res  = await POST(makeJsonRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('no_integration_for_recipient');
  });

  it('returns 401 when secret is wrong', async () => {
    const res  = await POST(makeJsonRequest(BASE_BODY, 'wrong-secret'));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('unauthorized');
  });

  it('returns 401 when secret is absent', async () => {
    const res  = await POST(makeJsonRequest(BASE_BODY, null));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('unauthorized');
  });

  it('returns 503 when EMAIL_INBOUND_SECRET env var is not set', async () => {
    delete process.env.EMAIL_INBOUND_SECRET;

    const res  = await POST(makeJsonRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe('server_misconfigured');
  });

  it('returns 500 when DB insert fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } });

    const res  = await POST(makeJsonRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('db_insert_failed');
  });

  it('passes the emailId and integrationId to enqueueBillingEmail', async () => {
    await POST(makeJsonRequest(BASE_BODY));

    expect(mockEnqueue).toHaveBeenCalledWith({
      emailId:       EMAIL_ROW.id,
      kind:          'process_notes',
      portalEmail:   INTEGRATION_ROW.portal_email,
      integrationId: INTEGRATION_ROW.id,
    });
  });
});
