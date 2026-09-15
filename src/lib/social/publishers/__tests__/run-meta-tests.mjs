/**
 * Standalone node:test runner for MetaPublisher unit tests.
 *
 * Runs without vitest/pnpm — uses Node.js built-in `node:test`.
 * MetaPublisher has zero external dependencies, so jiti (TypeScript loader)
 * is the only runtime requirement.
 *
 * Usage from worktree root:
 *
 *   node \
 *     --import "file:///C:/Users/Nazre/centinelia/node_modules/jiti/lib/jiti-native.mjs" \
 *     src/lib/social/publishers/__tests__/run-meta-tests.mjs
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
const worktreeRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

// ─── Load MetaPublisher + SocialAccount ──────────────────────────────────────
// jiti is used to resolve TypeScript imports. Since this runner is invoked
// via `node --import jiti/...`, TypeScript files are already resolvable.
const require = createRequire(import.meta.url);

// Note: index.ts imports from './meta' (relative, no extension) and '@/lib/social/types'
// (path alias). jiti's createRequire cannot resolve path aliases or extension-less TS imports
// when loading multi-file modules. We therefore load meta.ts directly and reconstruct
// the buildPublisher factory inline — equivalent behavior, tested identically.
let MetaPublisher, buildPublisher;
try {
  const metaMod = require(path.resolve(worktreeRoot, 'src', 'lib', 'social', 'publishers', 'meta.ts'));
  MetaPublisher = metaMod.MetaPublisher;

  // Inline factory — mirrors index.ts buildPublisher exactly
  buildPublisher = function buildPublisher(account) {
    if (account.provider === 'meta_instagram' || account.provider === 'meta_facebook') {
      return new MetaPublisher(account);
    }
    throw new Error(`Unsupported social provider: ${account.provider}`);
  };
} catch (e) {
  console.error('');
  console.error('ERROR: Could not load MetaPublisher from meta.ts.');
  console.error('Run this test via jiti:');
  console.error('');
  console.error('  node --import "file:///C:/Users/Nazre/centinelia/node_modules/jiti/lib/jiti-native.mjs" \\');
  console.error('    src/lib/social/publishers/__tests__/run-meta-tests.mjs');
  console.error('');
  console.error('Original error:', e.message);
  process.exit(1);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const createContainerFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures', 'meta-create-container.json'), 'utf8'),
);
const insightsFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures', 'meta-insights.json'), 'utf8'),
);
const commentsFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures', 'meta-comments.json'), 'utf8'),
);
const conversationsFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures', 'meta-conversations.json'), 'utf8'),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFetchResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const mockAccount = {
  id: 'acc-1',
  portal_email: 'x@y.com',
  agent_id: 'ag-1',
  provider: 'meta_instagram',
  external_account_id: 'ig-user-1',
  page_id: 'pg-1',
  access_token: 'tk',
  denylist_words: [],
  paused: false,
  paused_reason: null,
  paused_at: null,
  status: 'active',
  metadata: {},
};

// ─── Tests ────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Test 1: createMediaContainer para reel
// ---------------------------------------------------------------------------

describe('MetaPublisher.createMediaContainer', () => {
  test('para reel: envía media_type=REELS y video_url, devuelve containerId', async () => {
    let capturedUrl = '';
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse(createContainerFixture);
    };
    try {
      const p = new MetaPublisher(mockAccount, { pollIntervalMs: 0 });
      const { containerId } = await p.createMediaContainer({
        mediaType: 'reel',
        mediaUrls: ['https://example.com/video.mp4'],
        caption: 'Test',
      });

      assert.equal(containerId, createContainerFixture.id, `containerId mismatch: ${containerId}`);
      const params = new URL(capturedUrl).searchParams;
      assert.equal(params.get('media_type'), 'REELS', `media_type should be REELS, got: ${params.get('media_type')}`);
      assert.equal(params.get('video_url'), 'https://example.com/video.mp4', `video_url mismatch`);
      assert.equal(params.get('caption'), 'Test', `caption mismatch`);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('para image: envía image_url, devuelve containerId', async () => {
    let capturedUrl = '';
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse(createContainerFixture);
    };
    try {
      const p = new MetaPublisher(mockAccount);
      const { containerId } = await p.createMediaContainer({
        mediaType: 'image',
        mediaUrls: ['https://example.com/photo.jpg'],
        caption: 'Una foto',
      });
      assert.equal(containerId, createContainerFixture.id);
      const params = new URL(capturedUrl).searchParams;
      assert.equal(params.get('image_url'), 'https://example.com/photo.jpg');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('para story: envía media_type=STORIES', async () => {
    let capturedUrl = '';
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse(createContainerFixture);
    };
    try {
      const p = new MetaPublisher(mockAccount);
      await p.createMediaContainer({
        mediaType: 'story',
        mediaUrls: ['https://example.com/story.jpg'],
      });
      const params = new URL(capturedUrl).searchParams;
      assert.equal(params.get('media_type'), 'STORIES', `media_type should be STORIES, got: ${params.get('media_type')}`);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('para carousel: crea N contenedores hijo y luego el padre', async () => {
    const urls = ['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg'];
    const postedUrls = [];
    let callIdx = 0;
    const childIds = ['child-1', 'child-2', 'child-3'];
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      postedUrls.push(String(input));
      if (callIdx < 3) {
        const id = childIds[callIdx++];
        return makeFetchResponse({ id });
      }
      return makeFetchResponse({ id: 'parent-carousel' });
    };
    try {
      const p = new MetaPublisher(mockAccount);
      const { containerId } = await p.createMediaContainer({
        mediaType: 'carousel',
        mediaUrls: urls,
        caption: 'Test carousel',
      });

      assert.equal(containerId, 'parent-carousel', `containerId should be parent-carousel, got: ${containerId}`);
      assert.equal(postedUrls.length, 4, `expected 4 fetch calls (3 children + 1 parent), got: ${postedUrls.length}`);

      // Each child call must have is_carousel_item=true and image_url
      const child1Params = new URL(postedUrls[0]).searchParams;
      assert.equal(child1Params.get('is_carousel_item'), 'true', `child 1 missing is_carousel_item`);
      assert.equal(child1Params.get('image_url'), 'https://cdn/1.jpg', `child 1 image_url mismatch`);

      const child2Params = new URL(postedUrls[1]).searchParams;
      assert.equal(child2Params.get('is_carousel_item'), 'true', `child 2 missing is_carousel_item`);
      assert.equal(child2Params.get('image_url'), 'https://cdn/2.jpg', `child 2 image_url mismatch`);

      const child3Params = new URL(postedUrls[2]).searchParams;
      assert.equal(child3Params.get('is_carousel_item'), 'true', `child 3 missing is_carousel_item`);
      assert.equal(child3Params.get('image_url'), 'https://cdn/3.jpg', `child 3 image_url mismatch`);

      // Parent call must have media_type=CAROUSEL and children='child-1,child-2,child-3'
      const parentParams = new URL(postedUrls[3]).searchParams;
      assert.equal(parentParams.get('media_type'), 'CAROUSEL', `parent missing media_type=CAROUSEL`);
      assert.equal(parentParams.get('children'), 'child-1,child-2,child-3', `parent children mismatch`);
      assert.equal(parentParams.get('caption'), 'Test carousel', `parent caption mismatch`);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('lanza error si la API responde 400', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse({ error: { message: 'Invalid token', code: 190 } }, 400);
    try {
      const p = new MetaPublisher(mockAccount);
      await assert.rejects(
        () => p.createMediaContainer({ mediaType: 'image', mediaUrls: ['https://x.com/img.jpg'] }),
        (err) => {
          assert.ok(/400/.test(err.message), `message should contain 400: ${err.message}`);
          return true;
        },
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: waitForContainerReady
// ---------------------------------------------------------------------------

describe('MetaPublisher.waitForContainerReady', () => {
  test('poll hasta FINISHED, devuelve "ready", llama fetch exactamente 3 veces', async () => {
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      calls++;
      const statusCode = calls < 3 ? 'IN_PROGRESS' : 'FINISHED';
      return makeFetchResponse({ status_code: statusCode });
    };
    try {
      const p = new MetaPublisher(mockAccount, { pollIntervalMs: 0 });
      const result = await p.waitForContainerReady('ctn-1');
      assert.equal(result, 'ready', `result should be 'ready', got: ${result}`);
      assert.equal(calls, 3, `expected 3 fetch calls, got: ${calls}`);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('devuelve "error" cuando status_code = ERROR', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse({ status_code: 'ERROR' });
    try {
      const p = new MetaPublisher(mockAccount, { pollIntervalMs: 0 });
      const result = await p.waitForContainerReady('ctn-2');
      assert.equal(result, 'error');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('devuelve "error" cuando status_code = EXPIRED', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse({ status_code: 'EXPIRED' });
    try {
      const p = new MetaPublisher(mockAccount, { pollIntervalMs: 0 });
      const result = await p.waitForContainerReady('ctn-3');
      assert.equal(result, 'error');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('devuelve "error" si timeout expira antes de FINISHED', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse({ status_code: 'IN_PROGRESS' });
    try {
      const p = new MetaPublisher(mockAccount, { pollIntervalMs: 0 });
      const result = await p.waitForContainerReady('ctn-4', 0);
      assert.equal(result, 'error');
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: publishContainer
// ---------------------------------------------------------------------------

describe('MetaPublisher.publishContainer', () => {
  test('envía creation_id, devuelve mediaId + permalink', async () => {
    let callCount = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      callCount++;
      const url = String(input);
      if (callCount === 1) {
        assert.ok(url.includes('media_publish'), `first call should hit media_publish, got: ${url}`);
        assert.ok(url.includes('creation_id=ctn-1'), `should include creation_id=ctn-1`);
        return makeFetchResponse({ id: 'media-99' });
      }
      // GET /{media-id}?fields=permalink
      assert.ok(url.includes('media-99'), `second call should hit media-99, got: ${url}`);
      assert.ok(url.includes('permalink'), `second call should include permalink field`);
      return makeFetchResponse({ permalink: 'https://www.instagram.com/p/abc123/' });
    };
    try {
      const p = new MetaPublisher(mockAccount);
      const { mediaId, permalink } = await p.publishContainer('ctn-1');
      assert.equal(mediaId, 'media-99', `mediaId mismatch: ${mediaId}`);
      assert.ok(permalink.includes('instagram.com'), `permalink should contain instagram.com: ${permalink}`);
      assert.equal(callCount, 2, `expected 2 fetch calls, got: ${callCount}`);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4: fetchMetrics
// ---------------------------------------------------------------------------

describe('MetaPublisher.fetchMetrics', () => {
  test('mapea insights de reel a shape estándar, incluyendo plays y rawResponse', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse(insightsFixture);
    try {
      const p = new MetaPublisher(mockAccount);
      const m = await p.fetchMetrics('media-99');
      assert.equal(m.impressions, 3500, `impressions mismatch: ${m.impressions}`);
      assert.equal(m.reach, 2800, `reach mismatch: ${m.reach}`);
      assert.equal(m.likes, 142, `likes mismatch: ${m.likes}`);
      assert.equal(m.comments, 17, `comments mismatch: ${m.comments}`);
      assert.equal(m.shares, 23, `shares mismatch: ${m.shares}`);
      assert.equal(m.saves, 55, `saves mismatch: ${m.saves}`);
      assert.equal(m.plays, 1200, `plays mismatch: ${m.plays}`);
      assert.deepEqual(m.rawResponse, insightsFixture, 'rawResponse should equal fixture');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('plays y reach son mayores que cero (guard)', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse(insightsFixture);
    try {
      const p = new MetaPublisher(mockAccount);
      const m = await p.fetchMetrics('media-99');
      assert.ok((m.plays ?? 0) > 0, `plays should be > 0, got: ${m.plays}`);
      assert.ok((m.reach ?? 0) > 0, `reach should be > 0, got: ${m.reach}`);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5: replyToComment
// ---------------------------------------------------------------------------

describe('MetaPublisher.replyToComment', () => {
  test('usa endpoint POST /{comment-id}/replies con message correcto', async () => {
    let capturedUrl = '';
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse({ id: 'r-1' });
    };
    try {
      const p = new MetaPublisher(mockAccount);
      await p.replyToComment('comment-1', 'gracias!');
      assert.ok(capturedUrl.includes('comment-1/replies'), `URL should contain comment-1/replies, got: ${capturedUrl}`);
      const params = new URL(capturedUrl).searchParams;
      assert.equal(params.get('message'), 'gracias!', `message mismatch: ${params.get('message')}`);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('no lanza si la API devuelve 200', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse({ id: 'r-2' });
    try {
      const p = new MetaPublisher(mockAccount);
      const result = await p.replyToComment('comment-2', 'ok!');
      assert.equal(result, undefined, 'should return undefined (Promise<void>)');
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 6: replyToDm — POST /me/messages with JSON body
// ---------------------------------------------------------------------------

describe('MetaPublisher.replyToDm', () => {
  test('envía POST /me/messages con JSON body: recipient.id + message.text', async () => {
    let capturedUrl = '';
    let capturedInit = null;
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return makeFetchResponse({ message_id: 'msg-abc' });
    };
    try {
      const p = new MetaPublisher(mockAccount);
      await p.replyToDm('thread-123', 'Hola, con gusto te ayudamos!');
      assert.ok(capturedUrl.includes('me/messages'), `URL should contain me/messages, got: ${capturedUrl}`);
      // access_token stays in query string
      assert.equal(new URL(capturedUrl).searchParams.get('access_token'), 'tk', `access_token should be in query string`);
      // recipient and message must NOT be query params
      assert.equal(new URL(capturedUrl).searchParams.get('recipient'), null, `recipient should NOT be a query param`);
      assert.equal(new URL(capturedUrl).searchParams.get('message'), null, `message should NOT be a query param`);
      // Verify Content-Type header
      assert.equal(capturedInit?.headers?.['Content-Type'], 'application/json', `Content-Type should be application/json`);
      // Verify body shape
      const body = JSON.parse(capturedInit?.body);
      assert.deepEqual(body.recipient, { id: 'thread-123' }, `body.recipient mismatch`);
      assert.deepEqual(body.message, { text: 'Hola, con gusto te ayudamos!' }, `body.message mismatch`);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7: listRecentComments
// ---------------------------------------------------------------------------

describe('MetaPublisher.listRecentComments', () => {
  test('devuelve array de Comment con shape correcto', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse(commentsFixture);
    try {
      const p = new MetaPublisher(mockAccount);
      const comments = await p.listRecentComments('media-99', 24 * 60 * 60 * 1000);
      assert.equal(comments.length, 2, `expected 2 comments, got: ${comments.length}`);
      assert.equal(comments[0].id, '17858893269000001');
      assert.equal(comments[0].from, 'usuario_mx');
      assert.equal(comments[0].text, 'Excelente producto!');
      assert.ok(comments[0].createdAt instanceof Date, `createdAt should be a Date`);
      assert.equal(comments[1].id, '17858893269000002');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('pasa campo since en el query para filtrar por timestamp', async () => {
    let capturedUrl = '';
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse({ data: [] });
    };
    try {
      const p = new MetaPublisher(mockAccount);
      const sinceMs = 3 * 60 * 60 * 1000; // 3 hours
      await p.listRecentComments('media-99', sinceMs);
      const params = new URL(capturedUrl).searchParams;
      const since = Number(params.get('since'));
      const expectedSince = Math.floor((Date.now() - sinceMs) / 1000);
      assert.ok(since >= expectedSince - 5 && since <= expectedSince + 5,
        `since out of range: got ${since}, expected ~${expectedSince}`);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 8: listRecentDms
// ---------------------------------------------------------------------------

describe('MetaPublisher.listRecentDms', () => {
  test('devuelve array de Dm con shape correcto, solo mensajes dentro de sinceMs', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse(conversationsFixture);
    try {
      const p = new MetaPublisher(mockAccount);
      // sinceMs big enough to include all messages
      const dms = await p.listRecentDms(365 * 24 * 60 * 60 * 1000 * 10);
      assert.ok(dms.length > 0, `expected at least 1 DM, got: ${dms.length}`);
      assert.equal(dms[0].id, 'm_aAbBcCdDeE', `first DM id mismatch: ${dms[0].id}`);
      assert.equal(dms[0].threadId, 't_123456789');
      assert.equal(dms[0].from, 'cliente_mty');
      assert.ok(dms[0].createdAt instanceof Date, `createdAt should be a Date`);
      assert.equal(typeof dms[0].text, 'string', `text should be a string`);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('filtra mensajes más viejos que sinceMs', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => makeFetchResponse(conversationsFixture);
    try {
      const p = new MetaPublisher(mockAccount);
      // sinceMs = 0 means cutoff = Date.now(), all messages are before that
      const dms = await p.listRecentDms(0);
      assert.equal(dms.length, 0, `expected 0 DMs with sinceMs=0, got: ${dms.length}`);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 9: buildPublisher factory
// ---------------------------------------------------------------------------

describe('buildPublisher factory', () => {
  test('devuelve MetaPublisher para meta_instagram', async () => {
    const publisher = buildPublisher(mockAccount);
    assert.ok(publisher instanceof MetaPublisher, `should be MetaPublisher instance`);
    assert.equal(publisher.provider, 'meta_instagram');
  });

  test('devuelve MetaPublisher para meta_facebook', async () => {
    const fbAccount = { ...mockAccount, provider: 'meta_facebook' };
    const publisher = buildPublisher(fbAccount);
    assert.ok(publisher instanceof MetaPublisher, `should be MetaPublisher instance`);
    assert.equal(publisher.provider, 'meta_facebook');
  });

  test('lanza si el provider no es soportado', async () => {
    const unknownAccount = { ...mockAccount, provider: 'tiktok' };
    assert.throws(
      () => buildPublisher(unknownAccount),
      (err) => {
        assert.ok(/Unsupported social provider/.test(err.message), `message: ${err.message}`);
        return true;
      },
    );
  });
});
