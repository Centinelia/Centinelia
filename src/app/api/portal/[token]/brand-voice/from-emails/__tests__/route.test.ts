import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSupabaseMock,
  fixtureOwnerSession,
  fixtureResolvedOrg,
  makeJsonRequest,
  makeParams,
  TEST_ORG_TOKEN,
  TEST_PORTAL_EMAIL,
} from '@/lib/portal/__tests__/test-utils';

const {
  mockVerifySession,
  mockCreateAdminClient,
  mockResolveOrgFromToken,
  mockRefreshIfNeeded,
  mockFetchSentGmail,
  mockFetchSentOutlook,
  mockConsumeAiOp,
  mockExtractBrandVoice,
} = vi.hoisted(() => ({
  mockVerifySession:       vi.fn(),
  mockCreateAdminClient:   vi.fn(),
  mockResolveOrgFromToken: vi.fn(),
  mockRefreshIfNeeded:     vi.fn(),
  mockFetchSentGmail:      vi.fn(),
  mockFetchSentOutlook:    vi.fn(),
  mockConsumeAiOp:         vi.fn(),
  mockExtractBrandVoice:   vi.fn(),
}));

vi.mock('@/lib/portal/auth', () => ({
  verifySession: mockVerifySession,
  PORTAL_COOKIE: 'Centinelia_portal',
}));

vi.mock('@/lib/portal/org-token', () => ({
  resolveOrgFromToken: mockResolveOrgFromToken,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/connectors', () => ({
  refreshIfNeeded: mockRefreshIfNeeded,
}));

vi.mock('@/lib/email/fetch-recent', () => ({
  fetchSentGmailForVoice:   mockFetchSentGmail,
  fetchSentOutlookForVoice: mockFetchSentOutlook,
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: mockConsumeAiOp,
}));

vi.mock('@/lib/brand/voice-guide', () => ({
  extractBrandVoice: mockExtractBrandVoice,
}));

import { POST } from '../route';

let supabase: ReturnType<typeof createSupabaseMock>;

const LONG_BODY = 'Hola María, mil gracias por escribir. Con gusto te ayudo a agendar una visita para revisar la propuesta que te comentamos la semana pasada. Confirmamos horario en cuanto nos digas. Cualquier duda con la reunión, la agenda o el material que te enviamos, quedo pendiente. Saludos cordiales desde el equipo.';

beforeEach(() => {
  vi.clearAllMocks();
  supabase = createSupabaseMock();
  mockCreateAdminClient.mockReturnValue(supabase);
  mockVerifySession.mockResolvedValue(fixtureOwnerSession());
  mockResolveOrgFromToken.mockResolvedValue(fixtureResolvedOrg());
  mockRefreshIfNeeded.mockResolvedValue('access-token-fresh');
  mockConsumeAiOp.mockResolvedValue({ ok: true, used: 3, limit: 300 });
  mockExtractBrandVoice.mockResolvedValue({ ok: true, guide: 'Guía extraída.' });
});

describe('POST /api/portal/[token]/brand-voice/from-emails', () => {
  it('401 sin sesión', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const res = await POST(
      makeJsonRequest({}, { path: '/api/portal/x/brand-voice/from-emails' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(401);
  });

  it('404 si el token no resuelve a un portal', async () => {
    mockResolveOrgFromToken.mockResolvedValueOnce(null);
    const res = await POST(
      makeJsonRequest({}),
      { params: makeParams({ token: 'bad-token' }) },
    );
    expect(res.status).toBe(404);
  });

  it('403 si el session portalEmail no matchea el del token', async () => {
    mockVerifySession.mockResolvedValueOnce(
      fixtureOwnerSession({ portalEmail: 'otro-org@x.mx' }),
    );
    const res = await POST(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(403);
  });

  it('422 sin integración de correo conectada — no cobra', async () => {
    supabase.setNextResult({ data: null });                 // integration_accounts

    const res = await POST(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/Sin correo del negocio conectado/);
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
    expect(mockExtractBrandVoice).not.toHaveBeenCalled();
  });

  it('422 si la conexión requiere reauth — no cobra', async () => {
    supabase.setNextResult({
      data: { provider: 'gmail', account_label: 'x@y.com', access_token: 'a', status: 'needs_reauth' },
    });

    const res = await POST(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/reautorizarse/);
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });

  it('422 si hay menos de 2 samples utilizables — no cobra', async () => {
    supabase.setNextResult({
      data: { provider: 'gmail', account_label: 'x@y.com', access_token: 'a', status: 'active' },
    });
    // Un solo correo con body suficiente — no basta (mínimo 2).
    mockFetchSentGmail.mockResolvedValueOnce([
      { subject: 'x', body: LONG_BODY, snippet: 'x' },
    ]);

    const res = await POST(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.usable).toBe(1);
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
    expect(mockExtractBrandVoice).not.toHaveBeenCalled();
  });

  it('402 si el pool de tareas está agotado', async () => {
    supabase.setNextResult({
      data: { provider: 'gmail', account_label: 'x@y.com', access_token: 'a', status: 'active' },
    });
    mockFetchSentGmail.mockResolvedValueOnce([
      { subject: 'a', body: LONG_BODY, snippet: 'x' },
      { subject: 'b', body: LONG_BODY + ' más contenido', snippet: 'x' },
    ]);
    mockConsumeAiOp.mockResolvedValueOnce({ ok: false, used: 300, limit: 300 });

    const res = await POST(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(402);
    expect(mockExtractBrandVoice).not.toHaveBeenCalled();
  });

  it('happy path Gmail: cobra 3 tareas y devuelve guía', async () => {
    supabase.setNextResult({
      data: { provider: 'gmail', account_label: 'x@y.com', access_token: 'a', status: 'active' },
    });
    mockFetchSentGmail.mockResolvedValueOnce([
      { subject: 'a', body: LONG_BODY,                     snippet: 'x' },
      { subject: 'b', body: LONG_BODY + ' más contenido',  snippet: 'x' },
      { subject: 'c', body: LONG_BODY + ' aún más largo',  snippet: 'x' },
    ]);

    const res = await POST(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.guide).toBe('Guía extraída.');
    expect(body.emails_used).toBe(3);
    expect(body.total_fetched).toBe(3);

    expect(mockConsumeAiOp).toHaveBeenCalledWith(
      TEST_PORTAL_EMAIL,
      3,
      expect.objectContaining({ source: 'brand_voice_from_emails' }),
    );
    expect(mockExtractBrandVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        portalEmail: TEST_PORTAL_EMAIL,
        samples:     expect.arrayContaining([expect.stringContaining('Hola María')]),
      }),
    );
  });

  it('happy path Outlook: usa el fetcher correcto', async () => {
    supabase.setNextResult({
      data: { provider: 'outlook', account_label: 'x@y.com', access_token: 'a', status: 'active' },
    });
    mockFetchSentOutlook.mockResolvedValueOnce([
      { subject: 'a', body: LONG_BODY,                    snippet: 'x' },
      { subject: 'b', body: LONG_BODY + ' extra',         snippet: 'x' },
    ]);

    const res = await POST(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(200);
    expect(mockFetchSentGmail).not.toHaveBeenCalled();
    expect(mockFetchSentOutlook).toHaveBeenCalled();
  });

  it('500 si extractBrandVoice devuelve ok=false', async () => {
    supabase.setNextResult({
      data: { provider: 'gmail', account_label: 'x@y.com', access_token: 'a', status: 'active' },
    });
    mockFetchSentGmail.mockResolvedValueOnce([
      { subject: 'a', body: LONG_BODY, snippet: 'x' },
      { subject: 'b', body: LONG_BODY, snippet: 'x' },
    ]);
    mockExtractBrandVoice.mockResolvedValueOnce({ ok: false, error: 'LLM caído' });

    const res = await POST(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('LLM caído');
  });
});
