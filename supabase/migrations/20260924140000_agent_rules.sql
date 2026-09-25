-- Tabla agent_rules: Reglas de operación org-level para todos los meerkats.
-- FK a organizations por portal_email (convención Centinelia — ver 20260923120000_fichas_informativas.sql:18).
-- applies_to = '{}' (default) significa "todos los meerkats del org".
-- Ver spec Sección 4.4.
--
-- NOTA: a diferencia del plan original (Task 2.1) que usaba org_id UUID,
-- este schema usa portal_email TEXT por PAC-1 (Post-Audit Correction #1).

CREATE TABLE agent_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  text NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  regla         text NOT NULL CHECK (char_length(regla) BETWEEN 1 AND 500),
  detalles      text CHECK (detalles IS NULL OR char_length(detalles) <= 2000),
  applies_to    text[] NOT NULL DEFAULT '{}',
  active        bool NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text
);

CREATE INDEX agent_rules_portal_active_idx ON agent_rules (portal_email, active);
CREATE INDEX agent_rules_applies_to_idx ON agent_rules USING GIN (applies_to);

-- Trigger para actualizar updated_at automáticamente.
CREATE OR REPLACE FUNCTION agent_rules_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agent_rules_updated_at
BEFORE UPDATE ON agent_rules
FOR EACH ROW EXECUTE FUNCTION agent_rules_touch_updated_at();

-- RPC helper para filtrado por meerkat_role_id (usado en runtime del meerkat).
-- p_meerkat_role_id = agent.features->>meerkat_role_id (PAC-2).
CREATE OR REPLACE FUNCTION get_rules_for_agent(p_portal_email text, p_meerkat_role_id text)
RETURNS SETOF agent_rules LANGUAGE sql STABLE AS $$
  SELECT * FROM agent_rules
  WHERE portal_email = p_portal_email
    AND active = true
    AND (applies_to = '{}' OR p_meerkat_role_id = ANY(applies_to))
  ORDER BY created_at DESC;
$$;

COMMENT ON TABLE agent_rules IS 'Reglas de operación org-level. applies_to vacío aplica a todos los meerkats del org. Se stufean siempre en el system prompt del meerkat en runtime (no pasan por retrieval).';
COMMENT ON FUNCTION get_rules_for_agent IS 'Retorna las reglas aplicables a un meerkat específico (portal_email, meerkat_role_id).';
