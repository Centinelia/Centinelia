-- outbound-rate-limit: límite de llamadas outbound por día para cuentas nuevas.
-- El límite de 50/día aplica los primeros 30 días después del registro.
-- Correr después de organizations.sql y account-status.sql.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS outbound_daily_limit  integer      NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS outbound_limit_until  timestamptz;

-- Establece outbound_limit_until = 30 días desde created_at para cuentas existentes
-- (retroactivo: solo aplica si aún están dentro de los primeros 30 días)
UPDATE organizations
SET outbound_limit_until = created_at + interval '30 days'
WHERE outbound_limit_until IS NULL
  AND created_at > now() - interval '30 days';

-- Para cuentas con más de 30 días no aplicamos límite (NULL = sin límite)
-- (este UPDATE ya las deja con NULL correctamente)

-- Actualizar ensure_organization para incluir outbound_limit_until en nuevas cuentas
CREATE OR REPLACE FUNCTION ensure_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $ensure_organization$
BEGIN
  IF NEW.portal_email IS NOT NULL THEN
    INSERT INTO organizations (portal_email, name, plan, stripe_customer_id, outbound_limit_until)
    VALUES (
      NEW.portal_email,
      COALESCE(NEW.business_name, NEW.portal_email),
      COALESCE(NEW.plan, 'starter'),
      NEW.stripe_customer_id,
      now() + interval '30 days'
    )
    ON CONFLICT (portal_email) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$ensure_organization$;
