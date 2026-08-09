-- Admin-only tables: accessed only via service_role (createAdminClient()).
-- Enabling RLS with no policies denies anon + authenticated access; service_role bypasses RLS.
ALTER TABLE public.platform_incidents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_balances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_topups     ENABLE ROW LEVEL SECURITY;
