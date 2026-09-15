/**
 * Standalone node:test runner for CanvaProvider unit tests.
 *
 * Runs without vitest/pnpm — uses Node.js built-in `node:test`.
 * CanvaProvider has zero external dependencies, so jiti (TypeScript loader)
 * is the only runtime requirement.
 *
 * Usage from worktree root:
 *
 *   node \
 *     --import "file:///C:/Users/Nazre/centinelia/node_modules/jiti/lib/jiti-native.mjs" \
 *     src/lib/social/__tests__/run-canva-tests.mjs
 *
 * The standard sibling-directory convention: centinelia and centinelia-navi
 * are at the same level (C:/Users/Nazre/). Override with CENTINELA_ROOT env var.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worktreeRoot = path.resolve(__dirname, '..', '..', '..', '..');

// ─── Load CanvaProvider ───────────────────────────────────────────────────
// jiti is used to resolve TypeScript imports. Since this runner is invoked
// via `node --import jiti/...`, TypeScript files are already resolvable.
const require = createRequire(import.meta.url);

let CanvaProvider, CanvaApiError;
try {
  // When run with jiti loader, require() can resolve .ts files
  const mod = require(path.resolve(worktreeRoot, 'src', 'lib', 'social', 'canva.ts'));
  CanvaProvider = mod.CanvaProvider;
  CanvaApiError = mod.CanvaApiError;
} catch (e) {
  console.error('');
  console.error('ERROR: Could not load canva.ts.');
  console.error('Run this test via jiti:');
  console.error('');
  console.error('  node --import "file:///C:/Users/Nazre/centinelia/node_modules/jiti/lib/jiti-native.mjs" \\');
  console.error('    src/lib/social/__tests__/run-canva-tests.mjs');
  console.error('');
  console.error('Original error:', e.message);
  process.exit(1);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

const tokenFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures', 'canva-token.json'), 'utf8'),
);
const templatesFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures', 'canva-brand-templates.json'), 'utf8'),
);
const autofillJobFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures', 'canva-autofill-job.json'), 'utf8'),
);
const exportJobFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures', 'canva-export-job.json'), 'utf8'),
);

// ─── Mocking helpers ──────────────────────────────────────────────────────

function makeFetchResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key) => headers[key.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const ACCESS_TOKEN = 'accessTokenXYZ789';

// ─── Tests ────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Test 1: Static OAuth — exchangeCodeForToken
// ---------------------------------------------------------------------------

describe('CanvaProvider.exchangeCodeForToken', () => {
  test('exchanges authorization_code for access + refresh tokens', async () => {
    let capturedUrl, capturedInit;
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return makeFetchResponse(tokenFixture);
    };
    try {
      const result = await CanvaProvider.exchangeCodeForToken(
        'auth_code_abc',
        'https://centinelia.mx/api/auth/canva-callback',
      );

      assert.equal(result.accessToken, 'accessTokenXYZ789');
      assert.equal(result.refreshToken, 'refreshTokenABC123');
      assert.equal(result.expiresIn, 3600);
      assert.ok(capturedUrl.includes('/oauth/token'), `URL should include /oauth/token, got: ${capturedUrl}`);

      const body = new URLSearchParams(capturedInit.body);
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('code'), 'auth_code_abc');
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: Static OAuth — refreshToken
// ---------------------------------------------------------------------------

describe('CanvaProvider.refreshToken', () => {
  test('uses refresh_token to obtain a new access_token', async () => {
    let capturedUrl, capturedBody;
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      capturedUrl = url;
      capturedBody = init?.body;
      return makeFetchResponse({
        ...tokenFixture,
        access_token: 'newAccessToken999',
        refresh_token: 'newRefreshToken888',
      });
    };
    try {
      const result = await CanvaProvider.refreshToken('refreshTokenABC123');

      assert.equal(result.accessToken, 'newAccessToken999');
      assert.equal(result.refreshToken, 'newRefreshToken888');
      assert.ok(capturedUrl.includes('/oauth/token'));

      const body = new URLSearchParams(capturedBody);
      assert.equal(body.get('grant_type'), 'refresh_token');
      assert.equal(body.get('refresh_token'), 'refreshTokenABC123');
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: listBrandTemplates — happy path + category param + error
// ---------------------------------------------------------------------------

describe('CanvaProvider.listBrandTemplates', () => {
  test('returns list of brand templates from Canva API', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse(templatesFixture);
    try {
      const provider = new CanvaProvider(ACCESS_TOKEN);
      const templates = await provider.listBrandTemplates();

      assert.equal(templates.length, 2);
      assert.equal(templates[0].id, 'DAF0x7xABCDE');
      assert.equal(templates[0].title, 'Post Instagram — Promo Semanal');
      assert.equal(templates[0].previewUrl, 'https://thumbnail.canva.com/ABCDEpreview.png');
      assert.equal(templates[1].id, 'DAF0y8yFGHIJ');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('appends ?dataset=<category> when category is provided', async () => {
    let capturedUrl;
    const original = globalThis.fetch;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return makeFetchResponse({ items: [templatesFixture.items[0]] });
    };
    try {
      const provider = new CanvaProvider(ACCESS_TOKEN);
      const templates = await provider.listBrandTemplates('post');

      assert.ok(capturedUrl.includes('dataset=post'), `URL should contain dataset=post, got: ${capturedUrl}`);
      assert.equal(templates.length, 1);
      assert.equal(templates[0].id, 'DAF0x7xABCDE');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('throws CanvaApiError when API returns non-2xx', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      makeFetchResponse({ code: 'UNAUTHORIZED', message: 'Invalid token' }, 401);
    try {
      const provider = new CanvaProvider('bad-token');
      await assert.rejects(
        () => provider.listBrandTemplates(),
        (err) => {
          assert.ok(err instanceof CanvaApiError, `should be CanvaApiError, got ${err.constructor.name}`);
          assert.ok(err.message.includes('UNAUTHORIZED'), `message: ${err.message}`);
          return true;
        },
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4: Rate limit retry with exponential backoff
// ---------------------------------------------------------------------------

describe('CanvaProvider rate limit backoff', () => {
  test('retries on 429 with Retry-After header and succeeds on second attempt', async () => {
    let callCount = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return makeFetchResponse(
          { code: 'RATE_LIMITED', message: 'Too many requests' },
          429,
          { 'retry-after': '0' },
        );
      }
      return makeFetchResponse(templatesFixture);
    };
    try {
      const provider = new CanvaProvider(ACCESS_TOKEN, { retryDelayMs: 1 });
      const templates = await provider.listBrandTemplates();
      assert.equal(callCount, 2, 'should have retried exactly once');
      assert.equal(templates.length, 2);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('throws after exhausting max retries (5) on persistent 429', async () => {
    let callCount = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      callCount++;
      return makeFetchResponse(
        { code: 'RATE_LIMITED', message: 'Too many requests' },
        429,
        { 'retry-after': '0' },
      );
    };
    try {
      const provider = new CanvaProvider(ACCESS_TOKEN, { retryDelayMs: 1 });
      await assert.rejects(
        () => provider.listBrandTemplates(),
        (err) => {
          assert.ok(
            /rate limit|429|RATE_LIMITED/i.test(err.message),
            `message: ${err.message}`,
          );
          return true;
        },
      );
      // 1 initial + 5 retries = 6 total (MAX_RETRIES = 5)
      assert.equal(callCount, 6, `expected 6 calls, got ${callCount}`);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5: autofillTemplate — async job with polling + cache
// ---------------------------------------------------------------------------

describe('CanvaProvider.autofillTemplate', () => {
  test('creates autofill job, polls until success, returns designId + previewUrl', async () => {
    let callCount = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) return makeFetchResponse({ job: { id: 'jobId123abc', status: 'in_progress' } }, 202);
      if (callCount === 2) return makeFetchResponse({ job: { id: 'jobId123abc', status: 'in_progress', result: null } });
      return makeFetchResponse(autofillJobFixture);
    };
    try {
      const provider = new CanvaProvider(ACCESS_TOKEN, { pollIntervalMs: 0 });
      const result = await provider.autofillTemplate(
        'DAF0x7xABCDE',
        {
          headline: { type: 'text', text: '20% de descuento este fin de semana' },
          logo: { type: 'image', asset_id: 'assetLogoXYZ' },
        },
      );
      assert.equal(result.designId, 'DAFdesignXYZ');
      assert.equal(result.previewUrl, 'https://thumbnail.canva.com/XYZpreview.png');
      assert.equal(callCount, 3, 'expected 3 fetch calls (POST + 2 GET polls)');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('returns cached result on second call with same inputs (1 network request total)', async () => {
    let callCount = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) return makeFetchResponse({ job: { id: 'jobId123abc', status: 'in_progress' } }, 202);
      return makeFetchResponse(autofillJobFixture);
    };
    try {
      const provider = new CanvaProvider(ACCESS_TOKEN, { pollIntervalMs: 0 });
      const dataFields = { headline: { type: 'text', text: 'Oferta especial' } };

      const first = await provider.autofillTemplate('DAF0x7xABCDE', dataFields);
      const second = await provider.autofillTemplate('DAF0x7xABCDE', dataFields);

      // Same result from cache
      assert.equal(second.designId, first.designId);
      assert.equal(second.previewUrl, first.previewUrl);
      // Only 2 fetch calls for the first request; second hit cache
      assert.equal(callCount, 2, `expected 2 calls (cache hit on 2nd), got ${callCount}`);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 6: exportDesign — returns url + expiresAt
// ---------------------------------------------------------------------------

describe('CanvaProvider.exportDesign', () => {
  test('creates export job, polls until success, returns export URL + expiresAt', async () => {
    let callCount = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) return makeFetchResponse({ job: { id: 'exportJobABC', status: 'in_progress' } }, 202);
      return makeFetchResponse(exportJobFixture);
    };
    try {
      const provider = new CanvaProvider(ACCESS_TOKEN, { pollIntervalMs: 0 });
      const beforeCall = Date.now();
      const result = await provider.exportDesign('DAFdesignXYZ', 'png');
      const afterCall = Date.now();

      assert.equal(result.url, 'https://export.canva.com/DAFdesignXYZ/export_page1.png');
      // expiresAt must be a Date object
      assert.ok(result.expiresAt instanceof Date, `expiresAt should be a Date, got ${typeof result.expiresAt}`);
      // expiresAt should be ~24h from now
      const expiresMs = result.expiresAt.getTime();
      const expected24h = 24 * 60 * 60 * 1000;
      assert.ok(
        expiresMs >= beforeCall + expected24h - 100 && expiresMs <= afterCall + expected24h + 100,
        `expiresAt out of range: ${result.expiresAt.toISOString()}`,
      );
      assert.equal(callCount, 2, 'expected 2 fetch calls (POST + 1 GET poll)');
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7: uploadAsset — returns assetId + url
// ---------------------------------------------------------------------------

describe('CanvaProvider.uploadAsset', () => {
  test('uploads file buffer and returns assetId + CDN url', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      makeFetchResponse({
        asset: {
          id: 'assetUploaded001',
          name: 'logo.png',
          thumbnail: { url: 'https://thumbnail.canva.com/assetUploaded001.png' },
          created_at: 1726030000,
          updated_at: 1726030001,
        },
      });
    try {
      const provider = new CanvaProvider(ACCESS_TOKEN);
      const result = await provider.uploadAsset(
        Buffer.from('fake-png-bytes'),
        'image/png',
        'logo.png',
      );
      assert.equal(result.assetId, 'assetUploaded001');
      assert.equal(result.url, 'https://thumbnail.canva.com/assetUploaded001.png');
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 8: getDesign
// ---------------------------------------------------------------------------

describe('CanvaProvider.getDesign', () => {
  test('fetches design metadata by ID', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      makeFetchResponse({
        design: {
          id: 'DAFdesignXYZ',
          title: 'Post Instagram — Promo Semanal (autofilled)',
          url: 'https://www.canva.com/design/DAFdesignXYZ/view',
          thumbnail: { width: 595, height: 595, url: 'https://thumbnail.canva.com/XYZpreview.png' },
          created_at: 1726020000,
          updated_at: 1726020001,
        },
      });
    try {
      const provider = new CanvaProvider(ACCESS_TOKEN);
      const design = await provider.getDesign('DAFdesignXYZ');
      assert.equal(design.id, 'DAFdesignXYZ');
      assert.equal(design.title, 'Post Instagram — Promo Semanal (autofilled)');
      assert.equal(design.previewUrl, 'https://thumbnail.canva.com/XYZpreview.png');
    } finally {
      globalThis.fetch = original;
    }
  });
});
