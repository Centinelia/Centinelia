-- account-status: suspensión gradual de cuentas por abuso.
-- Aplica sobre la tabla organizations existente.
-- Correr en Supabase SQL Editor.

-- 1. Nuevas columnas en organizations ─────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS account_status      text        NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'warned', 'suspended', 'terminated')),
  ADD COLUMN IF NOT EXISTS warned_at           timestamptz,
  ADD COLUMN IF NOT EXISTS warning_reason      text,
  ADD COLUMN IF NOT EXISTS suspended_at        timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_until     timestamptz,   -- NULL = indefinido
  ADD COLUMN IF NOT EXISTS suspension_reason   text,
  ADD COLUMN IF NOT EXISTS terminated_at       timestamptz,
  ADD COLUMN IF NOT EXISTS termination_reason  text;

CREATE INDEX IF NOT EXISTS organizations_account_status_idx ON organizations(account_status);

-- 2. Función helper: verificar si una cuenta puede operar ─────────────────────
-- Retorna true si la cuenta puede recibir/hacer llamadas.
-- Llamada desde el webhook de Vapi antes de procesar cada llamada.
CREATE OR REPLACE FUNCTION org_is_operational(p_email text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_status        text;
  v_until         timestamptz;
BEGIN
  SELECT account_status, suspended_until
  INTO v_status, v_until
  FROM organizations
  WHERE portal_email = p_email;

  IF NOT FOUND THEN RETURN true; END IF;   -- cuenta nueva sin fila aún
  IF v_status = 'terminated' THEN RETURN false; END IF;
  IF v_status = 'suspended' THEN
    -- suspensión temporal: se levanta sola cuando vence
    IF v_until IS NOT NULL AND v_until < now() THEN
      UPDATE organizations
        SET account_status = 'active', suspended_until = NULL
        WHERE portal_email = p_email;
      RETURN true;
    END IF;
    RETURN false;
  END IF;
  RETURN true;   -- active o warned: puede operar
END;
$$;

-- 3. Función admin: emitir advertencia ────────────────────────────────────────
CREATE OR REPLACE FUNCTION warn_organization(p_email text, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE organizations
  SET account_status  = 'warned',
      warned_at       = now(),
      warning_reason  = p_reason
  WHERE portal_email = p_email;
END;
$$;

-- 4. Función admin: suspender cuenta (temporal o indefinida) ──────────────────
CREATE OR REPLACE FUNCTION suspend_organization(
  p_email  text,
  p_reason text,
  p_until  timestamptz DEFAULT NULL   -- NULL = indefinido
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE organizations
  SET account_status     = 'suspended',
      suspended_at       = now(),
      suspended_until    = p_until,
      suspension_reason  = p_reason
  WHERE portal_email = p_email;
END;
$$;

-- 5. Función admin: rescindir contrato ────────────────────────────────────────
CREATE OR REPLACE FUNCTION terminate_organization(p_email text, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE organizations
  SET account_status      = 'terminated',
      terminated_at       = now(),
      termination_reason  = p_reason
  WHERE portal_email = p_email;

  -- Desactiva todos los agentes de la cuenta de forma inmediata
  UPDATE voice_agents
  SET active = false
  WHERE portal_email = p_email;
END;
$$;
