-- Surveys module
-- Run once in Supabase SQL editor

CREATE TABLE surveys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  descripcion text,
  activa      boolean NOT NULL DEFAULT true,
  auto_apply  boolean NOT NULL DEFAULT true,  -- inject into every call automatically
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE survey_questions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  orden     integer NOT NULL DEFAULT 1,
  texto     text NOT NULL,
  -- rating_5 | rating_10 | si_no | multiple | texto
  tipo      text NOT NULL DEFAULT 'rating_5',
  opciones  text[],          -- for tipo=multiple
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (survey_id, orden)
);

CREATE TABLE survey_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  agent_id     uuid NOT NULL REFERENCES voice_agents(id),
  caller_number text,
  vapi_call_id  text,
  -- { "question_id": "value" }
  respuestas   jsonb NOT NULL DEFAULT '{}',
  created_at   timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_surveys_agent_id        ON surveys(agent_id);
CREATE INDEX idx_survey_questions_survey ON survey_questions(survey_id, orden);
CREATE INDEX idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX idx_survey_responses_agent  ON survey_responses(agent_id);
CREATE INDEX idx_survey_responses_caller ON survey_responses(caller_number);

-- RLS (portal rows owned by the agent's portal_email, accessed via token — admin client bypasses)
ALTER TABLE surveys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
