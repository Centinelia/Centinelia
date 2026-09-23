-- Fix: Supabase advisor flagged `rls_disabled_in_public` +
-- `sensitive_columns_exposed` en el schema public. Sin RLS, cualquiera con la
-- URL del proyecto + anon key puede leer datos fiscales (RFC, correo, monto),
-- OAuth tokens de Meta y bitácora operativa.
--
-- Estrategia: ENABLE ROW LEVEL SECURITY sin CREATE POLICY.
--   - `service_role` en Supabase tiene el atributo BYPASSRLS por default, así
--     que las rutas API de Next.js (que usan SUPABASE_SERVICE_ROLE_KEY vía
--     createAdminClient) siguen leyendo/escribiendo sin cambios.
--   - `anon` y `authenticated` reciben 0 filas (default deny) porque no hay
--     policy.
--
-- Idempotente: salta tablas que no existan (drift local vs prod). Reporta
-- aplicadas y saltadas via RAISE NOTICE.
--
-- Verificado (2026-09-23):
--   - HistorialConsumoSection y OpsLedgerSection son Server Components y usan
--     createAdminClient (service_role), no browser client.
--   - Grep SUPABASE_SERVICE_ROLE_KEY en src/app/portal: cero usos de anon
--     client contra estas tablas.
--
-- Alineado con centinelia-portal-security invariante 1: reads siempre son
-- server-side con service_role + .eq('org_id', session.org_id).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Alta prioridad: PII/fiscal + OAuth tokens
    'centinelia_clientes',
    'centinelia_billing',
    'centinelia_facturas_recibidas',
    'social_accounts',
    -- Portal media + interacciones sociales
    'user_media_uploads',
    'social_interactions',
    'content_drafts',
    'brand_templates',
    'editorial_calendars',
    'editorial_calendar_slots',
    'social_metrics',
    -- Ops internas
    'client_incidents',
    'account_ops',
    'cron_runs',
    'module_activations',
    'ops_ledger',
    'routing_transitions',
    'sheets_mappings'
  ];
  aplicadas int := 0;
  saltadas  int := 0;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'OK: RLS habilitado en public.%', t;
      aplicadas := aplicadas + 1;
    ELSE
      RAISE NOTICE 'SKIP: public.% no existe en este ambiente', t;
      saltadas := saltadas + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Resumen: % aplicadas, % saltadas', aplicadas, saltadas;
END $$;

DO $$
BEGIN
  IF to_regclass('public.centinelia_clientes') IS NOT NULL THEN
    EXECUTE 'COMMENT ON TABLE public.centinelia_clientes IS ''RLS habilitado 2026-09-23. Access solo via service_role (createAdminClient).''';
  END IF;
  IF to_regclass('public.social_accounts') IS NOT NULL THEN
    EXECUTE 'COMMENT ON TABLE public.social_accounts IS ''RLS habilitado 2026-09-23. Contiene OAuth access_token/refresh_token de Meta. Access solo via service_role.''';
  END IF;
END $$;
