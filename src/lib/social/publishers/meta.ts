// MetaPublisher — Instagram Graph API v18.0 adapter implementing SocialPublisher.
//
// Endpoints used:
//   POST /{ig-user-id}/media           — create media container (image/reel/carousel/story)
//   GET  /{container-id}?fields=status_code — poll container status
//   POST /{ig-user-id}/media_publish   — publish container
//   GET  /{media-id}?fields=permalink  — fetch permalink after publish
//   GET  /{media-id}/insights          — fetch post metrics
//   POST /{comment-id}/replies         — reply to a comment
//   POST /me/messages                  — reply to DM thread (Messaging API)
//   GET  /{media-id}/comments          — list recent comments
//   GET  /me/conversations             — list recent DM threads
//
// Env vars consumed: META_APP_ID, META_APP_SECRET (OAuth app-level; per-user
// access_token is held on the SocialAccount row passed to the constructor).
//
// Poll interval is injectable via opts.pollIntervalMs (default 5 000 ms).
// This makes the class testable without real delays.

import type { SocialAccount, SocialPublisher, MediaInput, PostMetrics, Comment, Dm } from './index';

const GRAPH = 'https://graph.facebook.com/v18.0';

// ─── MetaPublisher ────────────────────────────────────────────────────────────

export class MetaPublisher implements SocialPublisher {
  // Use explicit class-body field declaration (private account: SocialAccount)
  // instead of constructor parameter shorthand. Node's strip-only TS loader
  // does not support the shorthand.
  private account: SocialAccount;
  private pollIntervalMs: number;

  provider: 'meta_instagram' | 'meta_facebook';

  constructor(account: SocialAccount, opts: { pollIntervalMs?: number } = {}) {
    this.account = account;
    this.pollIntervalMs = opts.pollIntervalMs ?? 5_000;
    this.provider = account.provider as 'meta_instagram' | 'meta_facebook';
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private igUserId(): string {
    return this.account.external_account_id;
  }

  private token(): string {
    return this.account.access_token;
  }

  /**
   * POST to Graph API. All params are sent as query-string (standard for Meta Graph API).
   */
  private async graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${GRAPH}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', this.token());
    const res = await fetch(url.toString(), { method: 'POST' });
    if (!res.ok) {
      throw new Error(`Meta POST ${path}: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * GET from Graph API. All params are sent as query-string.
   */
  private async graphGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${GRAPH}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', this.token());
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Meta GET ${path}: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── SocialPublisher implementation ─────────────────────────────────────────

  /**
   * Creates a media container on Instagram.
   * For carousel: creates one container per child URL first, then wraps them.
   */
  async createMediaContainer(input: MediaInput): Promise<{ containerId: string }> {
    const params: Record<string, string> = {};

    if (input.caption) {
      params.caption = input.caption;
    }

    if (input.mediaType === 'reel') {
      params.media_type = 'REELS';
      params.video_url = input.mediaUrls[0];
      if (input.coverUrl) params.cover_url = input.coverUrl;
      if (input.shareToFeed !== undefined) params.share_to_feed = String(input.shareToFeed);

    } else if (input.mediaType === 'image') {
      params.image_url = input.mediaUrls[0];

    } else if (input.mediaType === 'carousel') {
      // Each child item must be created as a separate container first
      const childIds: string[] = [];
      for (const imageUrl of input.mediaUrls) {
        const child = await this.graphPost<{ id: string }>(`/${this.igUserId()}/media`, {
          is_carousel_item: 'true',
          image_url: imageUrl,
        });
        childIds.push(child.id);
      }
      params.media_type = 'CAROUSEL';
      params.children = childIds.join(',');

    } else if (input.mediaType === 'story') {
      params.media_type = 'STORIES';
      params.image_url = input.mediaUrls[0];
    }

    const r = await this.graphPost<{ id: string }>(`/${this.igUserId()}/media`, params);
    return { containerId: r.id };
  }

  /**
   * Polls container status until FINISHED, ERROR, EXPIRED, or timeout.
   * Returns 'ready' on FINISHED, 'error' on all failure / timeout cases.
   * Default timeout: 5 minutes (300 000 ms).
   */
  async waitForContainerReady(containerId: string, timeoutMs = 300_000): Promise<'ready' | 'error'> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const r = await this.graphGet<{ status_code: string }>(`/${containerId}`, {
        fields: 'status_code',
      });
      if (r.status_code === 'FINISHED') return 'ready';
      if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') return 'error';
      // IN_PROGRESS or unknown — keep polling
      if (this.pollIntervalMs > 0) {
        await this.sleep(this.pollIntervalMs);
      }
    }
    return 'error';
  }

  /**
   * Publishes a previously-created container. Returns mediaId + permalink.
   */
  async publishContainer(containerId: string): Promise<{ mediaId: string; permalink: string }> {
    const r = await this.graphPost<{ id: string }>(`/${this.igUserId()}/media_publish`, {
      creation_id: containerId,
    });
    const meta = await this.graphGet<{ permalink: string }>(`/${r.id}`, {
      fields: 'permalink',
    });
    return { mediaId: r.id, permalink: meta.permalink };
  }

  /**
   * Fetches lifetime insights for a post and maps them to PostMetrics.
   * Metric name mapping: 'saved' → saves (Meta uses 'saved' not 'saves').
   */
  async fetchMetrics(mediaId: string): Promise<PostMetrics> {
    const metric = 'impressions,reach,likes,comments,shares,saved,plays';
    const r = await this.graphGet<{
      data: Array<{ name: string; values: Array<{ value: number }> }>;
    }>(`/${mediaId}/insights`, { metric });

    const map: Record<string, number> = {};
    for (const m of r.data) {
      map[m.name] = m.values[0]?.value ?? 0;
    }

    return {
      impressions: map.impressions,
      reach: map.reach,
      likes: map.likes,
      comments: map.comments,
      shares: map.shares,
      saves: map.saved, // Meta API key is 'saved'; interface key is 'saves'
      plays: map.plays,
      rawResponse: r,
    };
  }

  /**
   * Replies to a comment using POST /{comment-id}/replies.
   */
  async replyToComment(commentId: string, message: string): Promise<void> {
    await this.graphPost<{ id: string }>(`/${commentId}/replies`, { message });
  }

  /**
   * Replies to a DM thread via the Instagram Messaging API (POST /me/messages).
   * recipient is a JSON-encoded object with the thread id.
   */
  async replyToDm(threadId: string, message: string): Promise<void> {
    await this.graphPost<{ message_id: string }>(`/me/messages`, {
      recipient: JSON.stringify({ id: threadId }),
      message: JSON.stringify({ text: message }),
    });
  }

  /**
   * Lists comments on a media object created within the last `sinceMs` ms.
   * Uses the `since` Unix timestamp parameter to filter server-side.
   */
  async listRecentComments(mediaId: string, sinceMs: number): Promise<Comment[]> {
    const since = Math.floor((Date.now() - sinceMs) / 1000);
    const r = await this.graphGet<{
      data: Array<{ id: string; text: string; username: string; timestamp: string }>;
    }>(`/${mediaId}/comments`, {
      since: String(since),
      fields: 'id,text,username,timestamp',
    });

    return r.data.map(c => ({
      id: c.id,
      from: c.username,
      text: c.text,
      createdAt: new Date(c.timestamp),
    }));
  }

  /**
   * Lists DMs received within the last `sinceMs` ms, across all conversations.
   * Filters messages client-side using the cutoff timestamp.
   */
  async listRecentDms(sinceMs: number): Promise<Dm[]> {
    const cutoff = Date.now() - sinceMs;
    const r = await this.graphGet<{
      data: Array<{
        id: string;
        messages?: {
          data: Array<{
            id: string;
            message: string;
            from?: { username?: string; id?: string };
            created_time: string;
          }>;
        };
      }>;
    }>(`/me/conversations`, {
      platform: 'instagram',
      fields: 'participants,messages{id,message,from,created_time}',
    });

    const out: Dm[] = [];
    for (const conv of r.data) {
      for (const m of conv.messages?.data ?? []) {
        const ts = new Date(m.created_time).getTime();
        if (ts >= cutoff) {
          out.push({
            id: m.id,
            threadId: conv.id,
            from: m.from?.username ?? m.from?.id ?? '',
            text: m.message,
            createdAt: new Date(m.created_time),
          });
        }
      }
    }
    return out;
  }
}
