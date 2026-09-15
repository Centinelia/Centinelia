import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CanvaProvider } from '../canva';
import tokenFixture from './fixtures/canva-token.json';
import templatesFixture from './fixtures/canva-brand-templates.json';
import autofillJobFixture from './fixtures/canva-autofill-job.json';
import exportJobFixture from './fixtures/canva-export-job.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret';
const ACCESS_TOKEN = 'accessTokenXYZ789';

// ---------------------------------------------------------------------------
// Test 1: OAuth token exchange (authorization_code → access + refresh tokens)
// ---------------------------------------------------------------------------

describe('CanvaProvider.exchangeToken', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('exchanges authorization_code for access + refresh tokens', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(tokenFixture),
    );

    const provider = new CanvaProvider({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    const result = await provider.exchangeToken({
      code: 'auth_code_abc',
      redirectUri: 'https://centinelia.mx/api/auth/canva-callback',
    });

    expect(result.accessToken).toBe('accessTokenXYZ789');
    expect(result.refreshToken).toBe('refreshTokenABC123');
    expect(result.expiresIn).toBe(3600);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/oauth/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth_code_abc');
  });
});

// ---------------------------------------------------------------------------
// Test 2: OAuth token refresh
// ---------------------------------------------------------------------------

describe('CanvaProvider.refreshAccessToken', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('uses refresh_token to obtain a new access_token', async () => {
    const refreshedToken = {
      ...tokenFixture,
      access_token: 'newAccessToken999',
      refresh_token: 'newRefreshToken888',
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(refreshedToken),
    );

    const provider = new CanvaProvider({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    const result = await provider.refreshAccessToken('refreshTokenABC123');

    expect(result.accessToken).toBe('newAccessToken999');
    expect(result.refreshToken).toBe('newRefreshToken888');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/oauth/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refreshTokenABC123');
  });
});

// ---------------------------------------------------------------------------
// Test 3: listBrandTemplates — happy path
// ---------------------------------------------------------------------------

describe('CanvaProvider.listBrandTemplates', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns list of brand templates from Canva API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(templatesFixture),
    );

    const provider = new CanvaProvider({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    const templates = await provider.listBrandTemplates(ACCESS_TOKEN);

    expect(templates).toHaveLength(2);
    expect(templates[0].id).toBe('DAF0x7xABCDE');
    expect(templates[0].title).toBe('Post Instagram — Promo Semanal');
    expect(templates[0].previewUrl).toBe('https://thumbnail.canva.com/ABCDEpreview.png');
    expect(templates[1].id).toBe('DAF0y8yFGHIJ');
  });

  it('throws CanvaApiError when API returns non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse({ code: 'UNAUTHORIZED', message: 'Invalid token' }, 401),
    );

    const provider = new CanvaProvider({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    await expect(provider.listBrandTemplates('bad-token')).rejects.toThrow('UNAUTHORIZED');
  });
});

// ---------------------------------------------------------------------------
// Test 4: Rate limit retry with exponential backoff
// ---------------------------------------------------------------------------

describe('CanvaProvider rate limit backoff', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries on 429 with Retry-After header and succeeds on second attempt', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        makeFetchResponse(
          { code: 'RATE_LIMITED', message: 'Too many requests' },
          429,
          { 'retry-after': '1' },
        ),
      )
      .mockResolvedValueOnce(
        makeFetchResponse(templatesFixture),
      );

    const provider = new CanvaProvider({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      // Use minimal delay for tests (provider multiplies by retryDelayMs)
      retryDelayMs: 10,
    });

    const listPromise = provider.listBrandTemplates(ACCESS_TOKEN);
    // Advance timers past the retry delay
    await vi.runAllTimersAsync();
    const templates = await listPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(templates).toHaveLength(2);
  });

  it('throws after exhausting max retries (5) on persistent 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(
        { code: 'RATE_LIMITED', message: 'Too many requests' },
        429,
        { 'retry-after': '1' },
      ),
    );

    const provider = new CanvaProvider({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      retryDelayMs: 10,
    });

    const listPromise = provider.listBrandTemplates(ACCESS_TOKEN);
    await vi.runAllTimersAsync();

    await expect(listPromise).rejects.toThrow(/rate limit|429|RATE_LIMITED/i);
  });
});

// ---------------------------------------------------------------------------
// Test 5: autofillTemplate — async job with polling
// ---------------------------------------------------------------------------

describe('CanvaProvider.autofillTemplate', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('creates autofill job, polls until success, returns designId + previewUrl', async () => {
    // Polling: first call returns 'in_progress', second returns 'success'
    const inProgressJob = {
      job: {
        id: 'jobId123abc',
        status: 'in_progress',
        result: null,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      // POST /brandtemplates/{templateId}/autofill → job created (202)
      .mockResolvedValueOnce(makeFetchResponse({ job: { id: 'jobId123abc', status: 'in_progress' } }, 202))
      // GET /brandtemplates/autofill/{jobId} → still in_progress
      .mockResolvedValueOnce(makeFetchResponse(inProgressJob))
      // GET /brandtemplates/autofill/{jobId} → success
      .mockResolvedValueOnce(makeFetchResponse(autofillJobFixture));

    const provider = new CanvaProvider({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      pollIntervalMs: 0,
    });

    const result = await provider.autofillTemplate(
      ACCESS_TOKEN,
      'DAF0x7xABCDE',
      [
        { name: 'headline', type: 'text', text: '20% de descuento este fin de semana' },
        { name: 'logo', type: 'image', asset_id: 'assetLogoXYZ' },
      ],
    );

    expect(result.designId).toBe('DAFdesignXYZ');
    expect(result.previewUrl).toBe('https://thumbnail.canva.com/XYZpreview.png');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Test 6: exportDesign — async job with polling
// ---------------------------------------------------------------------------

describe('CanvaProvider.exportDesign', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('creates export job, polls until success, returns export URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      // POST /exports → job created
      .mockResolvedValueOnce(makeFetchResponse({ job: { id: 'exportJobABC', status: 'in_progress' } }, 202))
      // GET /exports/{jobId} → success
      .mockResolvedValueOnce(makeFetchResponse(exportJobFixture));

    const provider = new CanvaProvider({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      pollIntervalMs: 0,
    });

    const result = await provider.exportDesign(ACCESS_TOKEN, 'DAFdesignXYZ', 'png');

    expect(result.url).toBe('https://export.canva.com/DAFdesignXYZ/export_page1.png');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [postUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(postUrl).toContain('/exports');
  });
});

// ---------------------------------------------------------------------------
// Test 7: uploadAsset
// ---------------------------------------------------------------------------

describe('CanvaProvider.uploadAsset', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('uploads file buffer and returns assetId', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse({
        asset: {
          id: 'assetUploaded001',
          name: 'logo.png',
          created_at: 1726030000,
          updated_at: 1726030001,
        },
      }, 200),
    );

    const provider = new CanvaProvider({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    const fakeBuffer = Buffer.from('fake-png-bytes');
    const result = await provider.uploadAsset(ACCESS_TOKEN, fakeBuffer, 'image/png', 'logo.png');

    expect(result.assetId).toBe('assetUploaded001');
  });
});

// ---------------------------------------------------------------------------
// Test 8: getDesign
// ---------------------------------------------------------------------------

describe('CanvaProvider.getDesign', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('fetches design metadata by ID', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse({
        design: {
          id: 'DAFdesignXYZ',
          title: 'Post Instagram — Promo Semanal (autofilled)',
          url: 'https://www.canva.com/design/DAFdesignXYZ/view',
          thumbnail: {
            width: 595,
            height: 595,
            url: 'https://thumbnail.canva.com/XYZpreview.png',
          },
          created_at: 1726020000,
          updated_at: 1726020001,
        },
      }),
    );

    const provider = new CanvaProvider({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    const design = await provider.getDesign(ACCESS_TOKEN, 'DAFdesignXYZ');

    expect(design.id).toBe('DAFdesignXYZ');
    expect(design.title).toBe('Post Instagram — Promo Semanal (autofilled)');
    expect(design.previewUrl).toBe('https://thumbnail.canva.com/XYZpreview.png');
  });
});
