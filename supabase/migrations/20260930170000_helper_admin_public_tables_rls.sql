-- Función helper para auditoría de RLS. Retorna tablas del schema public
-- con su rowsecurity status. SECURITY DEFINER + REVOKE from public para que
-- solo service_role (createAdminClient) pueda llamarla.
--
-- Uso desde scripts/rls-audit.ts vía .rpc('admin_public_tables_rls').
-- Reusable para futuras auditorías de seguridad (Supabase advisor puede
-- reportar drift si se crean tablas nuevas sin RLS).

CREATE OR REPLACE FUNCTION public.admin_public_tables_rls()
RETURNS TABLE(tablename text, rowsecurity boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT t.tablename::text, t.rowsecurity
  FROM pg_tables t
  WHERE t.schemaname = 'public'
  ORDER BY t.rowsecurity ASC, t.tablename ASC;
$$;

REVOKE ALL ON FUNCTION public.admin_public_tables_rls() FROM public;
REVOKE ALL ON FUNCTION public.admin_public_tables_rls() FROM anon;
REVOKE ALL ON FUNCTION public.admin_public_tables_rls() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_public_tables_rls() TO service_role;

COMMENT ON FUNCTION public.admin_public_tables_rls() IS
  'Audit helper: lista tablas del schema public con status RLS. Solo callable via service_role. Ver feedback_rls_public_tables_default.md.';
