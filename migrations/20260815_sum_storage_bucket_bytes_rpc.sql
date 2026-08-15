-- RPC used by cron infra-alerts to monitor Supabase Storage quota per bucket.
-- Buckets vigilados: csd, cfdi, cfdi-cancellations.
-- storage.objects.metadata JSONB tiene {size: bytes} para cada blob.
-- Alerta @ 50 GB (early) / 80 GB (crítico) sobre plan Pro (100 GB incluidos).
--
-- Apply manually in Supabase SQL editor if not already applied via MCP.

create or replace function sum_storage_bucket_bytes(p_bucket_id text)
returns table (total_bytes bigint, total_objects bigint)
language sql stable as $$
  select
    coalesce(sum((metadata->>'size')::bigint), 0)::bigint as total_bytes,
    count(*)::bigint as total_objects
  from storage.objects
  where bucket_id = p_bucket_id;
$$;
