-- F7 post-call survey dispatch — infraestructura para enviar encuestas por
-- correo después de una llamada. Cron dispatch-post-call-surveys agrupa por
-- llamada y manda link firmado a un formulario público.

-- 1) Opt-in por encuesta.
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS dispatch_via_email_post_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_delay_min           int     NOT NULL DEFAULT 30;

-- 2) Rastrea si ya se envió correo para no duplicar.
ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS survey_email_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS voice_calls_survey_pending_idx
  ON voice_calls (created_at DESC)
  WHERE survey_email_sent_at IS NULL;

-- 3) Respuestas capturadas desde el formulario público.
CREATE TABLE IF NOT EXISTS survey_responses (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id         uuid        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  call_id           uuid,                                      -- opcional; nullable si el submit vino por otro medio
  caller_number     text,
  caller_email      text,
  respuestas        jsonb       NOT NULL DEFAULT '[]',
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  ip                text,
  user_agent        text
);

CREATE INDEX IF NOT EXISTS survey_responses_survey_idx
  ON survey_responses (survey_id, submitted_at DESC);

ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON survey_responses
  USING (false)
  WITH CHECK (false);
