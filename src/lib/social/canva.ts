// CanvaProvider — adapter for the Canva Connect API (OAuth 2.0 + brand templates).
//
// OAuth 2.0 scopes required:
//   design:content:read, design:content:write
//   asset:read, asset:write
//   brandtemplate:content:read, brandtemplate:meta:read
//
// Rate limiting: retries with exponential backoff on 429, respects Retry-After header.
// Max retries: 5.
//
// Async jobs (autofill, export): polls until status = 'success' | 'failed'.
//
// preview_url cache: in-memory Map, TTL 24h, keyed by templateId+dataFields.
//
// Static OAuth methods: exchangeCodeForToken / refreshToken do NOT need an instance
// (they use clientId/clientSecret from env, not the per-user access token).
//
// Env vars:
//   CANVA_CLIENT_ID     — OAuth client ID from Canva Developer Portal
//   CANVA_CLIENT_SECRET — OAuth client secret from Canva Developer Portal

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';
// Verified against https://www.canva.dev/docs/connect/api-reference/authentication/generate-access-token/
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

const MAX_RETRIES = 5;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ─── Types ──────────────────────────────────────────────────────────────────

export type BrandTemplateCategory = 'post' | 'reel' | 'story' | 'carousel';

export interface BrandTemplate {
  id: string;
  title: string;
  viewUrl: string;
  previewUrl: string;
}

export interface Design {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
}

export interface CanvaTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export type CanvaDataFieldType = 'text' | 'image';

export interface CanvaDataField {
  name: string;
  type: CanvaDataFieldType;
  /** For type='text' */
  text?: string;
  /** For type='image' — Canva asset ID already uploaded */
  asset_id?: string;
}

export type CanvaExportFormat = 'png' | 'jpg' | 'mp4' | 'pdf';

export interface CanvaExportResult {
  url: string;
  expiresAt: Date;
}

export interface CanvaUploadAssetResult {
  assetId: string;
  url: string;
}

// ─── Internal cache entry ────────────────────────────────────────────────────

interface CacheEntry {
  designId: string;
  previewUrl: string;
  expiresAt: number; // Date.now() ms
}

// ─── Error class ────────────────────────────────────────────────────────────

export class CanvaApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(`${code}: ${message}`);
    this.name = 'CanvaApiError';
    this.code = code;
    this.status = status;
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) return null;
  const seconds = parseFloat(retryAfterHeader);
  if (isNaN(seconds)) return null;
  return Math.ceil(seconds * 1000);
}

// ─── CanvaProvider class ─────────────────────────────────────────────────────

export class CanvaProvider {
  // Node strip-only TS mode cannot handle `constructor(private token: string)` shorthand.
  // Use the explicit class-body declaration + constructor assignment form instead.
  private token: string;
  private pollIntervalMs: number;
  private retryDelayMs: number;

  // In-memory cache for autofill preview_url results. Key: templateId+JSON(dataFields).
  // TTL: 24h (same as export URL lifetime per Canva docs).
  private autofillCache: Map<string, CacheEntry>;

  constructor(token: string, opts: { pollIntervalMs?: number; retryDelayMs?: number } = {}) {
    this.token = token;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
    this.autofillCache = new Map();
  }

  // ─── Static OAuth methods ──────────────────────────────────────────────────

  /**
   * Exchanges an authorization_code from the Canva OAuth callback for
   * access + refresh tokens. Static — no instance/token needed.
   */
  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const clientId = process.env.CANVA_CLIENT_ID ?? '';
    const clientSecret = process.env.CANVA_CLIENT_SECRET ?? '';

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const json = await res.json() as Record<string, unknown>;
    return CanvaProvider.parseTokenResponse(json, res.status);
  }

  /**
   * Uses a refresh_token to obtain a new access_token. Static — no instance needed.
   */
  static async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const clientId = process.env.CANVA_CLIENT_ID ?? '';
    const clientSecret = process.env.CANVA_CLIENT_SECRET ?? '';

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const json = await res.json() as Record<string, unknown>;
    return CanvaProvider.parseTokenResponse(json, res.status);
  }

  private static parseTokenResponse(
    json: Record<string, unknown>,
    status: number,
  ): { accessToken: string; refreshToken: string; expiresIn: number } {
    if (status >= 400) {
      const code = String(json.code ?? json.error ?? 'TOKEN_ERROR');
      const msg = String(json.message ?? json.error_description ?? 'Token request failed');
      throw new CanvaApiError(code, msg, status);
    }
    return {
      accessToken: String(json.access_token ?? ''),
      refreshToken: String(json.refresh_token ?? ''),
      expiresIn: Number(json.expires_in ?? 3600),
    };
  }

  // ─── Brand templates ───────────────────────────────────────────────────────

  /**
   * Lists all brand templates accessible to the user.
   * Optional category filter appends ?dataset=<category> to the request.
   */
  async listBrandTemplates(category?: BrandTemplateCategory): Promise<BrandTemplate[]> {
    const path = category
      ? `/brand-templates?dataset=${encodeURIComponent(category)}`
      : '/brand-templates';

    const res = await this.apiGet(path);
    const json = await res.json() as Record<string, unknown>;
    this.assertOk(json, res.status);

    const items = Array.isArray(json.items) ? (json.items as Record<string, unknown>[]) : [];
    return items.map(item => this.parseBrandTemplate(item));
  }

  private parseBrandTemplate(item: Record<string, unknown>): BrandTemplate {
    const thumbnail = (item.thumbnail ?? {}) as Record<string, unknown>;
    return {
      id: String(item.id ?? ''),
      title: String(item.title ?? ''),
      viewUrl: String(item.view_url ?? ''),
      previewUrl: String(thumbnail.url ?? ''),
    };
  }

  // ─── Autofill ─────────────────────────────────────────────────────────────

  /**
   * Fills a brand template with data fields, then polls until the async
   * autofill job completes. Returns the new designId and its preview URL.
   * Results are cached in-memory for 24h (keyed by templateId + dataFields).
   */
  async autofillTemplate(
    templateId: string,
    dataFields: Record<string, unknown>,
  ): Promise<{ designId: string; previewUrl: string }> {
    // Check cache first
    const cacheKey = `${templateId}:${JSON.stringify(dataFields)}`;
    const cached = this.autofillCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { designId: cached.designId, previewUrl: cached.previewUrl };
    }

    // POST to create the autofill job
    const body = { data: dataFields };
    const res = await this.apiPost(
      `/brand-templates/${encodeURIComponent(templateId)}/autofill`,
      body,
    );
    const initial = await res.json() as Record<string, unknown>;
    this.assertOk(initial, res.status);

    const jobId = this.extractJobId(initial);
    const result = await this.pollAutofillJob(jobId);

    // Store in cache
    this.autofillCache.set(cacheKey, {
      designId: result.designId,
      previewUrl: result.previewUrl,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
  }

  private async pollAutofillJob(
    jobId: string,
  ): Promise<{ designId: string; previewUrl: string }> {
    for (;;) {
      if (this.pollIntervalMs > 0) {
        await sleep(this.pollIntervalMs);
      }

      const res = await this.apiGet(
        `/brand-templates/autofill/${encodeURIComponent(jobId)}`,
      );
      const json = await res.json() as Record<string, unknown>;
      this.assertOk(json, res.status);

      const job = (json.job ?? {}) as Record<string, unknown>;
      const status = String(job.status ?? '');

      if (status === 'failed') {
        throw new CanvaApiError('AUTOFILL_FAILED', `Autofill job ${jobId} failed`, 500);
      }

      if (status === 'success') {
        const result = (job.result ?? {}) as Record<string, unknown>;
        const design = (result.design ?? {}) as Record<string, unknown>;
        const thumbnail = (design.thumbnail ?? {}) as Record<string, unknown>;
        return {
          designId: String(design.id ?? ''),
          previewUrl: String(thumbnail.url ?? ''),
        };
      }
      // status === 'in_progress' — keep polling
    }
  }

  // ─── Get design ──────────────────────────────────────────────────────────

  /**
   * Fetches metadata for a single design by ID.
   */
  async getDesign(designId: string): Promise<Design> {
    const res = await this.apiGet(
      `/designs/${encodeURIComponent(designId)}`,
    );
    const json = await res.json() as Record<string, unknown>;
    this.assertOk(json, res.status);

    const design = (json.design ?? {}) as Record<string, unknown>;
    const thumbnail = (design.thumbnail ?? {}) as Record<string, unknown>;
    return {
      id: String(design.id ?? ''),
      title: String(design.title ?? ''),
      url: String(design.url ?? ''),
      previewUrl: String(thumbnail.url ?? ''),
    };
  }

  // ─── Export design ────────────────────────────────────────────────────────

  /**
   * Creates an export job for a design, polls until complete, and returns
   * the export URL plus its expiry (Canva export URLs expire after 24h).
   */
  async exportDesign(
    designId: string,
    format: CanvaExportFormat,
  ): Promise<CanvaExportResult> {
    const body = {
      design_id: designId,
      format: format.toUpperCase(),
    };

    const res = await this.apiPost('/exports', body);
    const initial = await res.json() as Record<string, unknown>;
    this.assertOk(initial, res.status);

    const jobId = this.extractJobId(initial);
    return this.pollExportJob(jobId);
  }

  private async pollExportJob(
    jobId: string,
  ): Promise<CanvaExportResult> {
    for (;;) {
      if (this.pollIntervalMs > 0) {
        await sleep(this.pollIntervalMs);
      }

      const res = await this.apiGet(
        `/exports/${encodeURIComponent(jobId)}`,
      );
      const json = await res.json() as Record<string, unknown>;
      this.assertOk(json, res.status);

      const job = (json.job ?? {}) as Record<string, unknown>;
      const status = String(job.status ?? '');

      if (status === 'failed') {
        throw new CanvaApiError('EXPORT_FAILED', `Export job ${jobId} failed`, 500);
      }

      if (status === 'success') {
        const result = (job.result ?? {}) as Record<string, unknown>;
        const urls = Array.isArray(result.urls) ? result.urls : [];
        return {
          url: String(urls[0] ?? ''),
          // Canva export URLs expire 24h after creation (per Canva Connect docs)
          expiresAt: new Date(Date.now() + CACHE_TTL_MS),
        };
      }
      // status === 'in_progress' — keep polling
    }
  }

  // ─── Upload asset ─────────────────────────────────────────────────────────

  /**
   * Uploads a file buffer as a Canva asset (image, video, etc.).
   * Returns the assetId (for use in autofill data fields) and the CDN thumbnail URL.
   */
  async uploadAsset(
    fileBuffer: Buffer,
    mimeType: string,
    name: string = 'upload',
  ): Promise<CanvaUploadAssetResult> {
    const res = await this.withRetry(() =>
      fetch(`${CANVA_API_BASE}/assets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': mimeType,
          'Asset-Name': encodeURIComponent(name),
        },
        body: fileBuffer,
      }),
    );

    const json = await res.json() as Record<string, unknown>;
    this.assertOk(json, res.status);

    const asset = (json.asset ?? {}) as Record<string, unknown>;
    const thumbnail = (asset.thumbnail ?? {}) as Record<string, unknown>;
    return {
      assetId: String(asset.id ?? ''),
      // CDN thumbnail URL returned by Canva after upload
      url: String(thumbnail.url ?? String(asset.url ?? '')),
    };
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  private async apiGet(path: string): Promise<Response> {
    return this.withRetry(() =>
      fetch(`${CANVA_API_BASE}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
      }),
    );
  }

  private async apiPost(
    path: string,
    body: unknown,
  ): Promise<Response> {
    return this.withRetry(() =>
      fetch(`${CANVA_API_BASE}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
  }

  /**
   * Wraps a fetch call with exponential backoff retry logic for 429 responses.
   * Respects the Retry-After header. Max retries: 5.
   */
  private async withRetry(fn: () => Promise<Response>): Promise<Response> {
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fn();

      if (res.status !== 429) {
        return res;
      }

      lastResponse = res;

      if (attempt === MAX_RETRIES) {
        break;
      }

      const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
      const backoffMs = retryAfterMs ?? this.retryDelayMs * Math.pow(2, attempt);
      await sleep(backoffMs);
    }

    // Exhausted retries — throw with the last 429 response info
    const json = await lastResponse!.json().catch(() => ({})) as Record<string, unknown>;
    const code = String(json.code ?? 'RATE_LIMITED');
    const message = String(json.message ?? 'Rate limit exceeded after max retries');
    throw new CanvaApiError(code, message, 429);
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private assertOk(json: Record<string, unknown>, status: number): void {
    if (status >= 400) {
      const code = String(json.code ?? 'CANVA_ERROR');
      const message = String(json.message ?? `Canva API error (${status})`);
      throw new CanvaApiError(code, message, status);
    }
  }

  private extractJobId(response: Record<string, unknown>): string {
    const job = (response.job ?? {}) as Record<string, unknown>;
    const id = job.id;
    if (!id) {
      throw new CanvaApiError('MISSING_JOB_ID', 'Canva API response missing job.id', 500);
    }
    return String(id);
  }

  // ─── Authorization URL helper (for OAuth flow initiation) ─────────────────

  /**
   * Constructs the Canva OAuth authorization URL to redirect the user to.
   * clientId is read from CANVA_CLIENT_ID env var.
   */
  static buildAuthorizationUrl(opts: {
    redirectUri: string;
    state: string;
    codeChallenge?: string;
  }): string {
    const scopes = [
      'design:content:read',
      'design:content:write',
      'asset:read',
      'asset:write',
      'brandtemplate:content:read',
      'brandtemplate:meta:read',
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.CANVA_CLIENT_ID ?? '',
      redirect_uri: opts.redirectUri,
      scope: scopes,
      state: opts.state,
    });

    if (opts.codeChallenge) {
      params.set('code_challenge', opts.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `https://www.canva.com/api/oauth/authorize?${params.toString()}`;
  }
}
