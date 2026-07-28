-- F5.2 — Batch API tracking table
-- Se aplica una vez en Supabase antes de activar los crons /api/cron/batch-eval
-- y /api/cron/batch-eval-retrieve.

CREATE TABLE IF NOT EXISTS anthropic_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     text NOT NULL UNIQUE,
  kind         text NOT NULL,                     -- 'call_eval', etc
  request_ids  text[] NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'in_progress',
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  ended_at     timestamptz
);

CREATE INDEX IF NOT EXISTS anthropic_batches_status_idx ON anthropic_batches(status);
CREATE INDEX IF NOT EXISTS anthropic_batches_kind_idx   ON anthropic_batches(kind);
