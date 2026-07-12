// ── Voice / Vapi ──────────────────────────────────────────────────────────────

/** Hard cap on call duration sent to Vapi (30 min). Sync.ts and inbound route must match. */
export const VAPI_MAX_CALL_SECONDS = 1800;

/** Max Claude output tokens in the real-time voice path. Low to keep latency tight. */
export const VAPI_VOICE_MAX_TOKENS = 300;

// ── Email / Inbox ─────────────────────────────────────────────────────────────

/** Max email body chars stored in the DB. Keeps rows small; body beyond this is dropped. */
export const EMAIL_BODY_TRUNCATE_CHARS = 8000;
