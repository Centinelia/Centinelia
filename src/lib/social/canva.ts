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
// Env vars:
//   CANVA_CLIENT_ID     — OAuth client ID from Canva Developer Portal
//   CANVA_CLIENT_SECRET — OAuth client secret from Canva Developer Portal

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

const MAX_RETRIES = 5;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CanvaProviderOptions {
  clientId?: string;
  clientSecret?: string;
  /** Override poll interval in ms (used in tests). Default: 2000. */
  pollIntervalMs?: number;
  /** Base retry delay in ms before exponential backoff (used in tests). Default: 1000. */
  retryDelayMs?: number;
}

export interface CanvaTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export interface CanvaBrandTemplate {
  id: string;
  title: string;
  viewUrl: string;
  previewUrl: string;
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

export interface CanvaAutofillResult {
  designId: string;
  previewUrl: string;
}

export type CanvaExportFormat = 'png' | 'jpg' | 'mp4' | 'pdf';

export interface CanvaExportResult {
  url: string;
}

export interface CanvaDesign {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
}

export interface CanvaUploadAssetResult {
  assetId: string;
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
  // Declared without `private` so Node's strip-only TS mode can handle the file.
  // These fields are intentionally not mutated after construction.
  clientId: string;
  clientSecret: string;
  pollIntervalMs: number;
  retryDelayMs: number;

  constructor(opts: CanvaProviderOptions = {}) {
    this.clientId = opts.clientId ?? process.env.CANVA_CLIENT_ID ?? '';
    this.clientSecret = opts.clientSecret ?? process.env.CANVA_CLIENT_SECRET ?? '';
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
  }

  // ─── OAuth token exchange ──────────────────────────────────────────────────

  /**
   * Exchanges an authorization_code from the Canva OAuth callback for
   * access + refresh tokens.
   */
  async exchangeToken(opts: {
    code: string;
    redirectUri: string;
  }): Promise<CanvaTokenResult> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await this.withRetry(() =>
      fetch(CANVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
    );

    const json = await res.json() as Record<string, unknown>;
    return this.parseTokenResponse(json, res.status);
  }

  /**
   * Uses a refresh_token to obtain a new access_token (and potentially
   * a new refresh_token).
   */
  async refreshAccessToken(refreshToken: string): Promise<CanvaTokenResult> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await this.withRetry(() =>
      fetch(CANVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
    );

    const json = await res.json() as Record<string, unknown>;
    return this.parseTokenResponse(json, res.status);
  }

  private parseTokenResponse(
    json: Record<string, unknown>,
    status: number,
  ): CanvaTokenResult {
    if (status >= 400) {
      const code = String(json.code ?? json.error ?? 'TOKEN_ERROR');
      const msg = String(json.message ?? json.error_description ?? 'Token request failed');
      throw new CanvaApiError(code, msg, status);
    }
    return {
      accessToken: String(json.access_token ?? ''),
      refreshToken: String(json.refresh_token ?? ''),
      expiresIn: Number(json.expires_in ?? 3600),
      scope: String(json.scope ?? ''),
    };
  }

  // ─── Brand templates ───────────────────────────────────────────────────────

  /**
   * Lists all brand templates accessible to the user.
   * Returns a flat array (handles pagination internally if needed in future).
   */
  async listBrandTemplates(accessToken: string): Promise<CanvaBrandTemplate[]> {
    const res = await this.apiGet(accessToken, '/brand-templates');
    const json = await res.json() as Record<string, unknown>;
    this.assertOk(json, res.status);

    const items = Array.isArray(json.items) ? (json.items as Record<string, unknown>[]) : [];
    return items.map(this.parseBrandTemplate);
  }

  parseBrandTemplate = (item: Record<string, unknown>): CanvaBrandTemplate => {
    const thumbnail = (item.thumbnail ?? {}) as Record<string, unknown>;
    return {
      id: String(item.id ?? ''),
      title: String(item.title ?? ''),
      viewUrl: String(item.view_url ?? ''),
      previewUrl: String(thumbnail.url ?? ''),
    };
  };

  // ─── Autofill ─────────────────────────────────────────────────────────────

  /**
   * Fills a brand template with data fields, then polls until the async
   * autofill job completes.
   * Returns the new designId and its preview URL.
   */
  async autofillTemplate(
    accessToken: string,
    templateId: string,
    dataFields: CanvaDataField[],
  ): Promise<CanvaAutofillResult> {
    // POST to create the autofill job
    const body = { data: dataFields };
    const res = await this.apiPost(
      accessToken,
      `/brand-templates/${encodeURIComponent(templateId)}/autofill`,
      body,
    );
    const initial = await res.json() as Record<string, unknown>;
    this.assertOk(initial, res.status);

    const jobId = this.extractJobId(initial);

    // Poll until success or failure
    return this.pollAutofillJob(accessToken, jobId);
  }

  private async pollAutofillJob(
    accessToken: string,
    jobId: string,
  ): Promise<CanvaAutofillResult> {
    for (;;) {
      if (this.pollIntervalMs > 0) {
        await sleep(this.pollIntervalMs);
      }

      const res = await this.apiGet(
        accessToken,
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
  async getDesign(accessToken: string, designId: string): Promise<CanvaDesign> {
    const res = await this.apiGet(
      accessToken,
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
   * the export URL.
   */
  async exportDesign(
    accessToken: string,
    designId: string,
    format: CanvaExportFormat,
  ): Promise<CanvaExportResult> {
    const body = {
      design_id: designId,
      format: format.toUpperCase(),
    };

    const res = await this.apiPost(accessToken, '/exports', body);
    const initial = await res.json() as Record<string, unknown>;
    this.assertOk(initial, res.status);

    const jobId = this.extractJobId(initial);
    return this.pollExportJob(accessToken, jobId);
  }

  private async pollExportJob(
    accessToken: string,
    jobId: string,
  ): Promise<CanvaExportResult> {
    for (;;) {
      if (this.pollIntervalMs > 0) {
        await sleep(this.pollIntervalMs);
      }

      const res = await this.apiGet(
        accessToken,
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
        return { url: String(urls[0] ?? '') };
      }
      // status === 'in_progress' — keep polling
    }
  }

  // ─── Upload asset ─────────────────────────────────────────────────────────

  /**
   * Uploads a file buffer as a Canva asset (image, video, etc.).
   * Returns the assetId, which can then be used as a data field in autofill.
   */
  async uploadAsset(
    accessToken: string,
    fileBuffer: Buffer,
    mimeType: string,
    name: string = 'upload',
  ): Promise<CanvaUploadAssetResult> {
    const res = await this.withRetry(() =>
      fetch(`${CANVA_API_BASE}/assets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': mimeType,
          'Asset-Name': encodeURIComponent(name),
        },
        body: fileBuffer,
      }),
    );

    const json = await res.json() as Record<string, unknown>;
    this.assertOk(json, res.status);

    const asset = (json.asset ?? {}) as Record<string, unknown>;
    return { assetId: String(asset.id ?? '') };
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  private async apiGet(accessToken: string, path: string): Promise<Response> {
    return this.withRetry(() =>
      fetch(`${CANVA_API_BASE}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }),
    );
  }

  private async apiPost(
    accessToken: string,
    path: string,
    body: unknown,
  ): Promise<Response> {
    return this.withRetry(() =>
      fetch(`${CANVA_API_BASE}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
   */
  buildAuthorizationUrl(opts: {
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
      client_id: this.clientId,
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

// Singleton for use in production routes (reads from env vars).
// Lazy so it doesn't throw at module load if env vars are missing.
let _canvaProvider: CanvaProvider | null = null;
export function getCanvaProvider(): CanvaProvider {
  if (!_canvaProvider) {
    _canvaProvider = new CanvaProvider();
  }
  return _canvaProvider;
}
