-- Phase 2 de rename organizations.brand_address → business_address.
-- Ver [[project-organizations-address-rename]] para contexto completo.
--
-- Precondición: TODO el código ya lee/escribe business_address, ningún read site
-- referencia brand_address. Verificado con grep 2026-09-30 antes de esta migración.
--
-- ORDEN DE APLICACIÓN CRÍTICO:
-- 1. Deploy código de Phase 2 a Vercel (git push, verificar build LIVE).
-- 2. DESPUÉS aplicar esta migración con `supabase db push`.
--
-- Si esta migración corre antes del deploy, código viejo que hace
-- SELECT ... brand_address ... rompe con "column does not exist".

DROP TRIGGER IF EXISTS trg_sync_org_business_brand_address ON organizations;
DROP FUNCTION IF EXISTS sync_org_business_brand_address();

ALTER TABLE organizations DROP COLUMN brand_address;

COMMENT ON COLUMN organizations.business_address IS
  'Dirección física del negocio del cliente. Columna canónica desde 2026-09-30 (rename desde brand_address completado en Phase 2).';
