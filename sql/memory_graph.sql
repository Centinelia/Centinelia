-- F9.1 — Memory graph (iniciativa context engineering, día 1).
-- Aplicar una vez en Supabase.
--
-- Modelo: entities son nodos, facts son edges (subject → predicate → object).
-- Timestamps (valid_from, valid_to) dan memoria temporal: puedes preguntar
-- "¿qué sabemos de Juan al día de hoy?" y solo trae facts vigentes.
--
-- La abstracción de src/lib/memory/store.ts permite migrar a Neo4j después
-- sin tocar el resto de la app.

CREATE TABLE IF NOT EXISTS memory_entities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  entity_type    text NOT NULL,                    -- 'customer' | 'business' | 'employee' | 'place' | 'other'
  name           text NOT NULL,                     -- "Juan Pérez"
  canonical_name text NOT NULL,                     -- "juan perez" (lowercase, sin acentos)
  attributes     jsonb NOT NULL DEFAULT '{}'::jsonb,-- { phone_number, email, rfc, address, ... }
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, canonical_name, entity_type)
);

CREATE INDEX IF NOT EXISTS memory_entities_agent_type_idx ON memory_entities(agent_id, entity_type);
CREATE INDEX IF NOT EXISTS memory_entities_canonical_idx  ON memory_entities(agent_id, canonical_name);
CREATE INDEX IF NOT EXISTS memory_entities_phone_idx      ON memory_entities USING GIN ((attributes -> 'phone_number'));
CREATE INDEX IF NOT EXISTS memory_entities_email_idx      ON memory_entities USING GIN ((attributes -> 'email'));

CREATE TABLE IF NOT EXISTS memory_facts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  subject_id        uuid NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  predicate         text NOT NULL,                  -- 'owes' | 'promised_to_pay_on' | 'lives_at' | ...
  object_text       text,                            -- valor libre si el object no es entity/number/date
  object_entity_id  uuid REFERENCES memory_entities(id) ON DELETE CASCADE,
  object_number     numeric,                         -- monto, cantidad
  object_date       timestamptz,                     -- fecha del objeto (ej. día prometido de pago)
  valid_from        timestamptz NOT NULL DEFAULT NOW(),
  valid_to          timestamptz,                     -- NULL = todavía válido
  source_call_id    uuid REFERENCES voice_calls(id) ON DELETE SET NULL,
  confidence        real NOT NULL DEFAULT 1.0,       -- 0..1 — extractor puede reportar incertidumbre
  created_at        timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memory_facts_subject_idx   ON memory_facts(agent_id, subject_id, predicate);
CREATE INDEX IF NOT EXISTS memory_facts_valid_idx     ON memory_facts(agent_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS memory_facts_source_idx    ON memory_facts(source_call_id) WHERE source_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memory_facts_object_ent_idx ON memory_facts(object_entity_id) WHERE object_entity_id IS NOT NULL;
