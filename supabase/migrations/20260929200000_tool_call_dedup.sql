-- Middleware universal de dedup para tool calls.
-- Ver spec: docs/superpowers/specs/2026-09-29-middleware-dedup-universal-design.md
-- Motivación: incidente Tortillería/Tecate Six 2026-09-29 (bug repetible en todos
-- los tools con side-effects sin dedup).

CREATE TABLE IF NOT EXISTS tool_call_dedup (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  tool_name    text NOT NULL,
  args_hash    text NOT NULL,               -- sha256 hex (64 chars)
  result_json  jsonb NOT NULL,              -- payload devuelto al modelo si hit
  channel      text NOT NULL,               -- 'voice' | 'chat' | 'email' (audit)
  tool_call_id text,                        -- de Vapi (audit), nullable
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tool_call_dedup_lookup
  ON tool_call_dedup (agent_id, tool_name, args_hash, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_call_dedup_expires
  ON tool_call_dedup (expires_at);

COMMENT ON TABLE tool_call_dedup IS
  'Dedup content-based de tool calls. Ver docs/superpowers/specs/2026-09-29-middleware-dedup-universal-design.md. Retención corta (1h post-expiry) via cron /api/cron/dedup-cleanup.';
