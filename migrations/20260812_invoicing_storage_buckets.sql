-- migrations/20260812_invoicing_storage_buckets.sql
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('csd', 'csd', false, 1048576),        -- 1 MB max por blob CSD
  ('cfdi', 'cfdi', false, 5242880),      -- 5 MB max
  ('cfdi-cancellations', 'cfdi-cancellations', false, 1048576)
on conflict (id) do nothing;

-- Sin políticas RLS públicas: solo service_role puede leer/escribir
-- (Supabase por default niega si no hay policy y bucket es private).
