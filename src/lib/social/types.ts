// SocialAccount — mirrors the `social_accounts` DB table (Section 4.2 of design spec).
// Consumed by MetaPublisher constructor and buildPublisher factory.

export interface SocialAccount {
  id: string;
  portal_email: string;
  agent_id: string;
  provider: 'meta_instagram' | 'meta_facebook';
  external_account_id: string;
  external_username?: string;
  page_id?: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  brand_summary?: string;
  denylist_words: string[];
  paused: boolean;
  paused_reason: string | null;
  paused_at: string | null; // ISO timestamp
  status: 'active' | 'needs_reauth' | 'disconnected';
  metadata: Record<string, unknown>; // JSONB — kill-switch and audit use
}
