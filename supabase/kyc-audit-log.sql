-- kyc-audit-log: trazabilidad de quién accede a datos sensibles (RFC, CURP).
-- Correr después de kyc-fields.sql.

CREATE TABLE IF NOT EXISTS kyc_access_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_at timestamptz NOT NULL DEFAULT now(),
  admin_user  text        NOT NULL,   -- quién accedió (email del admin o 'system')
  target_email text       NOT NULL,   -- portal_email de la cuenta consultada
  action      text        NOT NULL,   -- 'view_kyc' | 'enforce_warn' | 'enforce_suspend' | 'enforce_terminate' | 'lift_rate_limit' | 'reinstate'
  notes       text
);

CREATE INDEX IF NOT EXISTS kyc_access_log_target_idx ON kyc_access_log(target_email);
CREATE INDEX IF NOT EXISTS kyc_access_log_at_idx     ON kyc_access_log(accessed_at DESC);

-- RLS: solo service_role puede insertar/leer (admin backend)
ALTER TABLE kyc_access_log ENABLE ROW LEVEL SECURITY;
