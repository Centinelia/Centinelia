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

const ACCESS_TOKEN = 'accessTokenXYZ789';

// ---------------------------------------------------------------------------
// Test 1: Static OAuth — exchangeCodeForToken
// ---------------------------------------------------------------------------

describe('CanvaProvider.exchangeCodeForToken', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('exchanges authorization_code for access + refresh tokens', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(tokenFixture),
    );

    const result = await CanvaProvider.exchangeCodeForToken(
      'auth_code_abc',
      'https://centinelia.mx/api/auth/canva-callback',
    );

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
// Test 2: Static OAuth — refreshToken
// ---------------------------------------------------------------------------

describe('CanvaProvider.refreshToken', () => {
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

    const result = await CanvaProvider.refreshToken('refreshTokenABC123');

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
// Test 3: listBrandTemplates — happy path + category param
// ---------------------------------------------------------------------------

describe('CanvaProvider.listBrandTemplates', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns list of brand templates from Canva API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(templatesFixture),
    );

    const provider = new CanvaProvider(ACCESS_TOKEN);
    const templates = await provider.listBrandTemplates();

    expect(templates).toHaveLength(2);
    expect(templates[0].id).toBe('DAF0x7xABCDE');
    expect(templates[0].title).toBe('Post Instagram — Promo Semanal');
    expect(templates[0].previewUrl).toBe('https://thumbnail.canva.com/ABCDEpreview.png');
    expect(templates[1].id).toBe('DAF0y8yFGHIJ');
  });

  it('appends ?dataset=<category> when category is provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse({ items: [templatesFixture.items[0]] }),
    );

    const provider = new CanvaProvider(ACCESS_TOKEN);
    const templates = await provider.listBrandTemplates('post');

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('dataset=post');
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('DAF0x7xABCDE');
  });

  it('throws CanvaApiError when API returns non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse({ code: 'UNAUTHORIZED', message: 'Invalid token' }, 401),
    );

    const provider = new CanvaProvider('bad-token');
    await expect(provider.listBrandTemplates()).rejects.toThrow('UNAUTHORIZED');
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

    const provider = new CanvaProvider(ACCESS_TOKEN, { retryDelayMs: 10 });

    const listPromise = provider.listBrandTemplates();
    // Advance timers past the retry delay
    await vi.runAllTimersAsync();
    const templates = await listPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(templates).toHaveLength(2);
  });

  it('throws after exhausting max retries (5) on persistent 429', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(
        { code: 'RATE_LIMITED', message: 'Too many requests' },
        429,
        { 'retry-after': '1' },
      ),
    );

    const provider = new CanvaProvider(ACCESS_TOKEN, { retryDelayMs: 10 });

    const listPromise = provider.listBrandTemplates();
    await vi.runAllTimersAsync();

    await expect(listPromise).rejects.toThrow(/rate limit|429|RATE_LIMITED/i);
    // 1 initial attempt + 5 retries = 6 total calls
    expect(fetchSpy).toHaveBeenCalledTimes(6);
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

    const provider = new CanvaProvider(ACCESS_TOKEN, { pollIntervalMs: 0 });

    const result = await provider.autofillTemplate(
      'DAF0x7xABCDE',
      {
        headline: { type: 'text', text: '20% de descuento este fin de semana' },
        logo: { type: 'image', asset_id: 'assetLogoXYZ' },
      },
    );

    expect(result.designId).toBe('DAFdesignXYZ');
    expect(result.previewUrl).toBe('https://thumbnail.canva.com/XYZpreview.png');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('returns cached result on second call with same inputs (1 network call total)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeFetchResponse({ job: { id: 'jobId123abc', status: 'in_progress' } }, 202))
      .mockResolvedValueOnce(makeFetchResponse(autofillJobFixture));

    const provider = new CanvaProvider(ACCESS_TOKEN, { pollIntervalMs: 0 });
    const dataFields = { headline: { type: 'text', text: 'Oferta especial' } };

    const first = await provider.autofillTemplate('DAF0x7xABCDE', dataFields);
    const second = await provider.autofillTemplate('DAF0x7xABCDE', dataFields);

    // Same result returned from cache
    expect(second.designId).toBe(first.designId);
    expect(second.previewUrl).toBe(first.previewUrl);
    // Only 2 fetch calls for the first request — second call hit cache
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Test 6: exportDesign — async job with polling, returns expiresAt
// ---------------------------------------------------------------------------

describe('CanvaProvider.exportDesign', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('creates export job, polls until success, returns export URL + expiresAt', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      // POST /exports → job created
      .mockResolvedValueOnce(makeFetchResponse({ job: { id: 'exportJobABC', status: 'in_progress' } }, 202))
      // GET /exports/{jobId} → success
      .mockResolvedValueOnce(makeFetchResponse(exportJobFixture));

    const provider = new CanvaProvider(ACCESS_TOKEN, { pollIntervalMs: 0 });

    const beforeCall = Date.now();
    const result = await provider.exportDesign('DAFdesignXYZ', 'png');
    const afterCall = Date.now();

    expect(result.url).toBe('https://export.canva.com/DAFdesignXYZ/export_page1.png');
    // expiresAt must be a Date roughly 24h from now
    expect(result.expiresAt).toBeInstanceOf(Date);
    const expiresMs = result.expiresAt.getTime();
    const expected24h = 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(beforeCall + expected24h - 100);
    expect(expiresMs).toBeLessThanOrEqual(afterCall + expected24h + 100);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [postUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(postUrl).toContain('/exports');
  });
});

// ---------------------------------------------------------------------------
// Test 7: uploadAsset — returns assetId + url
// ---------------------------------------------------------------------------

describe('CanvaProvider.uploadAsset', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('uploads file buffer and returns assetId + CDN url', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse({
        asset: {
          id: 'assetUploaded001',
          name: 'logo.png',
          thumbnail: {
            url: 'https://thumbnail.canva.com/assetUploaded001.png',
          },
          created_at: 1726030000,
          updated_at: 1726030001,
        },
      }, 200),
    );

    const provider = new CanvaProvider(ACCESS_TOKEN);
    const fakeBuffer = Buffer.from('fake-png-bytes');
    const result = await provider.uploadAsset(fakeBuffer, 'image/png', 'logo.png');

    expect(result.assetId).toBe('assetUploaded001');
    expect(result.url).toBe('https://thumbnail.canva.com/assetUploaded001.png');
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

    const provider = new CanvaProvider(ACCESS_TOKEN);
    const design = await provider.getDesign('DAFdesignXYZ');

    expect(design.id).toBe('DAFdesignXYZ');
    expect(design.title).toBe('Post Instagram — Promo Semanal (autofilled)');
    expect(design.previewUrl).toBe('https://thumbnail.canva.com/XYZpreview.png');
  });
});
