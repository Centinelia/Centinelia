ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS daily_availability jsonb;

COMMENT ON COLUMN public.organizations.daily_availability IS
  'Per-day operational snapshot updated by owners/employees for industries that need it (restaurante, retail, clinica, hotel). Schema: { updated_at, updated_by, unavailable[], limited[], special, notes }. See src/lib/daily-availability.ts.';
