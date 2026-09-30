-- Phase 1 de rename organizations.brand_address → business_address.
-- Zero-downtime: agrega nueva col, backfill, trigger bidireccional para
-- mantener ambas sincronizadas mientras se migran los ~15 read sites.
--
-- Phase 2 (futura): actualizar reads a business_address, drop trigger, drop brand_address.
-- Motivación: brand_address es un nombre confuso (no es del "brand", es dirección del negocio).
-- voice_agents.business_address ya usa esta convención. Consistencia across tables.

ALTER TABLE organizations ADD COLUMN business_address TEXT;

-- Backfill filas existentes
UPDATE organizations
   SET business_address = brand_address
 WHERE brand_address IS NOT NULL;

-- Trigger bidireccional: cualquier col escrita se propaga a la otra
CREATE OR REPLACE FUNCTION sync_org_business_brand_address()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.business_address IS NOT NULL THEN
      NEW.brand_address := NEW.business_address;
    ELSIF NEW.brand_address IS NOT NULL THEN
      NEW.business_address := NEW.brand_address;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.business_address IS DISTINCT FROM OLD.business_address THEN
      NEW.brand_address := NEW.business_address;
    ELSIF NEW.brand_address IS DISTINCT FROM OLD.brand_address THEN
      NEW.business_address := NEW.brand_address;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_org_business_brand_address
  BEFORE INSERT OR UPDATE OF business_address, brand_address ON organizations
  FOR EACH ROW EXECUTE FUNCTION sync_org_business_brand_address();

COMMENT ON COLUMN organizations.business_address IS
  'Dirección física del negocio del cliente. Columna canónica desde 2026-09-30. Mientras dure Phase 1 del rename, se mantiene en sync bidireccional con la col legacy brand_address vía trigger. Phase 2 dropea brand_address.';

COMMENT ON COLUMN organizations.brand_address IS
  'DEPRECATED 2026-09-30: usa business_address. Se mantiene en sync bidireccional vía trigger sync_org_business_brand_address para no romper los ~15 read sites. Se dropea en Phase 2 tras migrar reads.';
