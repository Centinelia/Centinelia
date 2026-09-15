import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaPublisher } from '../meta';
import type { SocialAccount } from '@/lib/social/types';
import createContainerFixture from './fixtures/meta-create-container.json';
import insightsFixture from './fixtures/meta-insights.json';
import commentsFixture from './fixtures/meta-comments.json';
import conversationsFixture from './fixtures/meta-conversations.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const mockAccount: SocialAccount = {
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

// ---------------------------------------------------------------------------
// Test 1: createMediaContainer para reel
// ---------------------------------------------------------------------------

describe('MetaPublisher.createMediaContainer', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('para reel: envía media_type=REELS y video_url, devuelve containerId', async () => {
    let capturedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse(createContainerFixture);
    });

    const p = new MetaPublisher(mockAccount);
    const { containerId } = await p.createMediaContainer({
      mediaType: 'reel',
      mediaUrls: ['https://example.com/video.mp4'],
      caption: 'Test',
    });

    expect(containerId).toBe(createContainerFixture.id);

    const params = new URL(capturedUrl).searchParams;
    expect(params.get('media_type')).toBe('REELS');
    expect(params.get('video_url')).toBe('https://example.com/video.mp4');
    expect(params.get('caption')).toBe('Test');
  });

  it('para image: envía image_url, devuelve containerId', async () => {
    let capturedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse(createContainerFixture);
    });

    const p = new MetaPublisher(mockAccount);
    const { containerId } = await p.createMediaContainer({
      mediaType: 'image',
      mediaUrls: ['https://example.com/photo.jpg'],
      caption: 'Una foto',
    });

    expect(containerId).toBe(createContainerFixture.id);
    const params = new URL(capturedUrl).searchParams;
    expect(params.get('image_url')).toBe('https://example.com/photo.jpg');
  });

  it('para story: envía media_type=STORIES', async () => {
    let capturedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse(createContainerFixture);
    });

    const p = new MetaPublisher(mockAccount);
    await p.createMediaContainer({
      mediaType: 'story',
      mediaUrls: ['https://example.com/story.jpg'],
    });

    const params = new URL(capturedUrl).searchParams;
    expect(params.get('media_type')).toBe('STORIES');
  });

  it('para carousel: crea N contenedores hijo y luego el padre', async () => {
    const urls = ['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg'];
    const postedUrls: string[] = [];
    let callIdx = 0;
    const childIds = ['child-1', 'child-2', 'child-3'];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      postedUrls.push(String(input));
      if (callIdx < 3) {
        const id = childIds[callIdx++];
        return makeFetchResponse({ id });
      }
      return makeFetchResponse({ id: 'parent-carousel' });
    });

    const p = new MetaPublisher(mockAccount);
    const { containerId } = await p.createMediaContainer({
      mediaType: 'carousel',
      mediaUrls: urls,
      caption: 'Test carousel',
    });

    expect(containerId).toBe('parent-carousel');
    expect(postedUrls).toHaveLength(4); // 3 children + 1 parent

    // Each child call must have is_carousel_item=true and image_url
    const child1Params = new URL(postedUrls[0]).searchParams;
    expect(child1Params.get('is_carousel_item')).toBe('true');
    expect(child1Params.get('image_url')).toBe('https://cdn/1.jpg');

    const child2Params = new URL(postedUrls[1]).searchParams;
    expect(child2Params.get('is_carousel_item')).toBe('true');
    expect(child2Params.get('image_url')).toBe('https://cdn/2.jpg');

    const child3Params = new URL(postedUrls[2]).searchParams;
    expect(child3Params.get('is_carousel_item')).toBe('true');
    expect(child3Params.get('image_url')).toBe('https://cdn/3.jpg');

    // Parent call must have media_type=CAROUSEL and children='child-1,child-2,child-3'
    const parentParams = new URL(postedUrls[3]).searchParams;
    expect(parentParams.get('media_type')).toBe('CAROUSEL');
    expect(parentParams.get('children')).toBe('child-1,child-2,child-3');
    expect(parentParams.get('caption')).toBe('Test carousel');
  });

  it('lanza error si la API responde 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse({ error: { message: 'Invalid token', code: 190 } }, 400),
    );

    const p = new MetaPublisher(mockAccount);
    await expect(
      p.createMediaContainer({ mediaType: 'image', mediaUrls: ['https://x.com/img.jpg'] }),
    ).rejects.toThrow(/400/);
  });
});

// ---------------------------------------------------------------------------
// Test 2: waitForContainerReady — polling hasta FINISHED
// ---------------------------------------------------------------------------

describe('MetaPublisher.waitForContainerReady', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('poll hasta FINISHED, devuelve "ready", llama fetch exactamente 3 veces', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      const statusCode = calls < 3 ? 'IN_PROGRESS' : 'FINISHED';
      return makeFetchResponse({ status_code: statusCode });
    });

    const p = new MetaPublisher(mockAccount, { pollIntervalMs: 0 });
    const result = await p.waitForContainerReady('ctn-1');

    expect(result).toBe('ready');
    expect(calls).toBe(3);
  });

  it('devuelve "error" cuando status_code = ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse({ status_code: 'ERROR' }),
    );

    const p = new MetaPublisher(mockAccount, { pollIntervalMs: 0 });
    const result = await p.waitForContainerReady('ctn-2');
    expect(result).toBe('error');
  });

  it('devuelve "error" cuando status_code = EXPIRED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse({ status_code: 'EXPIRED' }),
    );

    const p = new MetaPublisher(mockAccount, { pollIntervalMs: 0 });
    const result = await p.waitForContainerReady('ctn-3');
    expect(result).toBe('error');
  });

  it('devuelve "error" si timeout expira antes de FINISHED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ status_code: 'IN_PROGRESS' }),
    );

    const p = new MetaPublisher(mockAccount, { pollIntervalMs: 0 });
    // timeoutMs = 0 means immediate timeout
    const result = await p.waitForContainerReady('ctn-4', 0);
    expect(result).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Test 3: publishContainer devuelve mediaId + permalink
// ---------------------------------------------------------------------------

describe('MetaPublisher.publishContainer', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('envía creation_id, devuelve mediaId + permalink', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      callCount++;
      const url = String(input);
      if (callCount === 1) {
        // POST /ig-user-1/media_publish
        expect(url).toContain('media_publish');
        expect(url).toContain('creation_id=ctn-1');
        return makeFetchResponse({ id: 'media-99' });
      }
      // GET /media-99?fields=permalink
      expect(url).toContain('media-99');
      expect(url).toContain('permalink');
      return makeFetchResponse({ permalink: 'https://www.instagram.com/p/abc123/' });
    });

    const p = new MetaPublisher(mockAccount);
    const { mediaId, permalink } = await p.publishContainer('ctn-1');

    expect(mediaId).toBe('media-99');
    expect(permalink).toContain('instagram.com');
    expect(callCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 4: fetchMetrics mapea insights a shape estándar
// ---------------------------------------------------------------------------

describe('MetaPublisher.fetchMetrics', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('mapea insights de reel a shape estándar, incluyendo plays y rawResponse', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(insightsFixture),
    );

    const p = new MetaPublisher(mockAccount);
    const m = await p.fetchMetrics('media-99');

    expect(m.impressions).toBe(3500);
    expect(m.reach).toBe(2800);
    expect(m.likes).toBe(142);
    expect(m.comments).toBe(17);
    expect(m.shares).toBe(23);
    expect(m.saves).toBe(55);
    expect(m.plays).toBe(1200);
    expect(m.rawResponse).toEqual(insightsFixture);
  });

  it('plays y reach son mayores que cero (guard)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(insightsFixture),
    );

    const p = new MetaPublisher(mockAccount);
    const m = await p.fetchMetrics('media-99');

    expect(m.plays).toBeGreaterThan(0);
    expect(m.reach).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 5: replyToComment — POST /{comment-id}/replies
// ---------------------------------------------------------------------------

describe('MetaPublisher.replyToComment', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('usa endpoint POST /{comment-id}/replies con message correcto', async () => {
    let capturedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse({ id: 'r-1' });
    });

    const p = new MetaPublisher(mockAccount);
    await p.replyToComment('comment-1', 'gracias!');

    expect(capturedUrl).toContain('comment-1/replies');
    const params = new URL(capturedUrl).searchParams;
    expect(params.get('message')).toBe('gracias!');
  });

  it('no lanza si la API devuelve 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeFetchResponse({ id: 'r-2' }));

    const p = new MetaPublisher(mockAccount);
    await expect(p.replyToComment('comment-2', 'ok!')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 6: replyToDm — POST /me/messages with JSON body
// ---------------------------------------------------------------------------

describe('MetaPublisher.replyToDm', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('envía POST /me/messages con JSON body: recipient.id + message.text', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return makeFetchResponse({ message_id: 'msg-abc' });
    });

    const p = new MetaPublisher(mockAccount);
    await p.replyToDm('thread-123', 'Hola, con gusto te ayudamos!');

    expect(capturedUrl).toContain('me/messages');
    // access_token stays in query string
    expect(new URL(capturedUrl).searchParams.get('access_token')).toBe('tk');
    // recipient and message must be in the JSON body, NOT query params
    expect(new URL(capturedUrl).searchParams.get('recipient')).toBeNull();
    expect(new URL(capturedUrl).searchParams.get('message')).toBeNull();
    // Verify Content-Type header
    expect((capturedInit?.headers as Record<string, string>)?.['Content-Type']).toBe('application/json');
    // Verify body shape
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.recipient).toEqual({ id: 'thread-123' });
    expect(body.message).toEqual({ text: 'Hola, con gusto te ayudamos!' });
  });
});

// ---------------------------------------------------------------------------
// Test 7: listRecentComments — shape + filtering
// ---------------------------------------------------------------------------

describe('MetaPublisher.listRecentComments', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('devuelve array de Comment con shape correcto', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(commentsFixture),
    );

    const p = new MetaPublisher(mockAccount);
    const comments = await p.listRecentComments('media-99', 24 * 60 * 60 * 1000);

    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({
      id: '17858893269000001',
      from: 'usuario_mx',
      text: 'Excelente producto!',
    });
    expect(comments[0].createdAt).toBeInstanceOf(Date);
    expect(comments[1].id).toBe('17858893269000002');
  });

  it('pasa campo since en el query para filtrar por timestamp', async () => {
    let capturedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input) => {
      capturedUrl = String(input);
      return makeFetchResponse({ data: [] });
    });

    const p = new MetaPublisher(mockAccount);
    const sinceMs = 3 * 60 * 60 * 1000; // 3 hours
    await p.listRecentComments('media-99', sinceMs);

    const params = new URL(capturedUrl).searchParams;
    const since = Number(params.get('since'));
    const expectedSince = Math.floor((Date.now() - sinceMs) / 1000);
    // Allow 5 second tolerance for test execution time
    expect(since).toBeGreaterThanOrEqual(expectedSince - 5);
    expect(since).toBeLessThanOrEqual(expectedSince + 5);
  });
});

// ---------------------------------------------------------------------------
// Test 8: listRecentDms — shape + time filtering
// ---------------------------------------------------------------------------

describe('MetaPublisher.listRecentDms', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('devuelve array de Dm con shape correcto, solo mensajes dentro de sinceMs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(conversationsFixture),
    );

    const p = new MetaPublisher(mockAccount);
    // sinceMs big enough to include the fixture messages (which are timestamped 2026-09-14)
    const sinceMs = 365 * 24 * 60 * 60 * 1000 * 10; // 10 years — all messages included
    const dms = await p.listRecentDms(sinceMs);

    expect(dms.length).toBeGreaterThan(0);
    expect(dms[0]).toMatchObject({
      id: 'm_aAbBcCdDeE',
      threadId: 't_123456789',
      from: 'cliente_mty',
    });
    expect(dms[0].createdAt).toBeInstanceOf(Date);
    expect(typeof dms[0].text).toBe('string');
  });

  it('filtra mensajes más viejos que sinceMs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeFetchResponse(conversationsFixture),
    );

    const p = new MetaPublisher(mockAccount);
    // sinceMs = 1ms means cutoff is now-1ms — fixture messages from 2026-09-14 are in the past
    // relative to "now" in tests (2026-09-14 current date), but they ARE in the past.
    // Use 0 sinceMs to exclude ALL messages (cutoff = Date.now())
    const dms = await p.listRecentDms(0);

    // All fixture messages will be before the cutoff (Date.now()), so none qualify
    expect(dms).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 9: buildPublisher factory
// ---------------------------------------------------------------------------

describe('buildPublisher factory', () => {
  it('devuelve MetaPublisher para meta_instagram', async () => {
    const { buildPublisher } = await import('../index');
    const publisher = buildPublisher(mockAccount);
    expect(publisher).toBeInstanceOf(MetaPublisher);
    expect(publisher.provider).toBe('meta_instagram');
  });

  it('devuelve MetaPublisher para meta_facebook', async () => {
    const { buildPublisher } = await import('../index');
    const fbAccount: SocialAccount = { ...mockAccount, provider: 'meta_facebook' };
    const publisher = buildPublisher(fbAccount);
    expect(publisher).toBeInstanceOf(MetaPublisher);
    expect(publisher.provider).toBe('meta_facebook');
  });

  it('lanza si el provider no es soportado', async () => {
    const { buildPublisher } = await import('../index');
    const unknownAccount = { ...mockAccount, provider: 'tiktok' } as unknown as SocialAccount;
    expect(() => buildPublisher(unknownAccount)).toThrow(/Unsupported social provider/);
  });
});
