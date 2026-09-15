-- Corrective migration: scope user-media RLS policies to bucket_id
-- Fixes: the original policy in 20260914000000_navi_social_schema.sql applied
-- FOR ALL to all of storage.objects (no bucket filter), which would silently
-- block any future bucket that legitimately needs anon/authenticated access.
--
-- Pattern: matches billing_snapshots_bucket.sql (20260817200000)

drop policy if exists "user-media service access" on storage.objects;

create policy "user-media service read" on storage.objects
  for select to service_role using (bucket_id = 'user-media');

create policy "user-media service insert" on storage.objects
  for insert to service_role with check (bucket_id = 'user-media');

create policy "user-media service delete" on storage.objects
  for delete to service_role using (bucket_id = 'user-media');
