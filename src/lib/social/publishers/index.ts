// SocialPublisher interface + factory + supporting types.
//
// Supported providers: meta_instagram, meta_facebook.
// Factory: buildPublisher(account) → SocialPublisher
//
// Task 8 (14 Navi tools) consumes this interface.
// Future adapters: TikTokPublisher, LinkedInPublisher.

import type { SocialAccount } from '@/lib/social/types';
import { MetaPublisher } from './meta';

export type { SocialAccount } from '@/lib/social/types';

// ─── Input / output types ────────────────────────────────────────────────────

export interface MediaInput {
  mediaType: 'image' | 'carousel' | 'reel' | 'story';
  mediaUrls: string[]; // Public URLs (Supabase Storage signed URLs)
  caption?: string;
  coverUrl?: string; // Reel only
  shareToFeed?: boolean; // Reel only
}

export interface PostMetrics {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  plays?: number;
  rawResponse: unknown;
}

export interface Comment {
  id: string;
  from: string;
  text: string;
  createdAt: Date;
}

export interface Dm {
  id: string;
  threadId: string;
  from: string;
  text: string;
  createdAt: Date;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface SocialPublisher {
  provider: 'meta_instagram' | 'meta_facebook';
  createMediaContainer(input: MediaInput): Promise<{ containerId: string }>;
  waitForContainerReady(containerId: string, timeoutMs?: number): Promise<'ready' | 'error'>;
  publishContainer(containerId: string): Promise<{ mediaId: string; permalink: string }>;
  fetchMetrics(mediaId: string): Promise<PostMetrics>;
  replyToComment(commentId: string, message: string): Promise<void>;
  replyToDm(threadId: string, message: string): Promise<void>;
  listRecentComments(mediaId: string, sinceMs: number): Promise<Comment[]>;
  listRecentDms(sinceMs: number): Promise<Dm[]>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function buildPublisher(account: SocialAccount): SocialPublisher {
  if (account.provider === 'meta_instagram' || account.provider === 'meta_facebook') {
    return new MetaPublisher(account);
  }
  throw new Error(`Unsupported social provider: ${account.provider}`);
}
