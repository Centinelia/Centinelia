-- external_tramites: catálogo de trámites externos configurables per-org
CREATE TABLE IF NOT EXISTS external_tramites (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug                   text NOT NULL,
  nombre_publico         text NOT NULL,
  descripcion_agente     text NOT NULL,
  activo                 boolean NOT NULL DEFAULT true,
  schema_version         integer NOT NULL DEFAULT 1,
  endpoint_base          text NOT NULL,
  auth_config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  campos                 jsonb NOT NULL,
  catalogos              jsonb NOT NULL DEFAULT '[]'::jsonb,
  lookups                jsonb NOT NULL DEFAULT '[]'::jsonb,
  submit                 jsonb NOT NULL,
  reglas_negocio         jsonb NOT NULL DEFAULT '{}'::jsonb,
  aviso_privacidad_texto text,
  aviso_privacidad_url   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_external_tramites_org_active
  ON external_tramites(org_id, activo);

-- external_secrets: referencia a secrets encriptados en Supabase Vault
CREATE TABLE IF NOT EXISTS external_secrets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             text NOT NULL,
  vault_secret_id uuid NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_rotated_at timestamptz,
  UNIQUE (org_id, key)
);

-- external_tramites_audit: log de cambios al schema del trámite
CREATE TABLE IF NOT EXISTS external_tramites_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id   uuid NOT NULL REFERENCES external_tramites(id) ON DELETE CASCADE,
  changed_by   text,
  change_type  text NOT NULL,
  before_json  jsonb,
  after_json   jsonb,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_tramites_audit_tramite
  ON external_tramites_audit(tramite_id, changed_at DESC);

-- external_tramites_submissions: log de todos los envíos + idempotencia
CREATE TABLE IF NOT EXISTS external_tramites_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id         uuid NOT NULL REFERENCES external_tramites(id),
  org_id             uuid NOT NULL REFERENCES organizations(id),
  agent_id           uuid REFERENCES voice_agents(id),
  call_id            uuid,
  channel            text NOT NULL,
  idempotency_hash   text NOT NULL,
  payload            jsonb NOT NULL,
  response_status    integer,
  response_body      jsonb,
  folio              text,
  status             text NOT NULL,
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tramite_id, idempotency_hash)
);

CREATE INDEX IF NOT EXISTS idx_ext_submissions_tramite_created
  ON external_tramites_submissions(tramite_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ext_submissions_status
  ON external_tramites_submissions(status);

-- Trigger para actualizar updated_at en external_tramites
CREATE OR REPLACE FUNCTION touch_external_tramites_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_tramites_updated_at ON external_tramites;
CREATE TRIGGER trg_external_tramites_updated_at
  BEFORE UPDATE ON external_tramites
  FOR EACH ROW EXECUTE FUNCTION touch_external_tramites_updated_at();

-- Trigger para audit automático de cambios en external_tramites
CREATE OR REPLACE FUNCTION audit_external_tramites_changes()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.campos IS DISTINCT FROM NEW.campos OR
    OLD.catalogos IS DISTINCT FROM NEW.catalogos OR
    OLD.lookups IS DISTINCT FROM NEW.lookups OR
    OLD.submit IS DISTINCT FROM NEW.submit OR
    OLD.reglas_negocio IS DISTINCT FROM NEW.reglas_negocio
  ) THEN
    INSERT INTO external_tramites_audit (tramite_id, change_type, before_json, after_json)
    VALUES (
      NEW.id,
      'schema_update',
      jsonb_build_object('campos', OLD.campos, 'catalogos', OLD.catalogos, 'lookups', OLD.lookups, 'submit', OLD.submit, 'reglas_negocio', OLD.reglas_negocio),
      jsonb_build_object('campos', NEW.campos, 'catalogos', NEW.catalogos, 'lookups', NEW.lookups, 'submit', NEW.submit, 'reglas_negocio', NEW.reglas_negocio)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_tramites_audit ON external_tramites;
CREATE TRIGGER trg_external_tramites_audit
  AFTER UPDATE ON external_tramites
  FOR EACH ROW EXECUTE FUNCTION audit_external_tramites_changes();
