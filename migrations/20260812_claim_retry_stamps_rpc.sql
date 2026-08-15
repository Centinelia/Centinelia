-- RPC used by cron retry-failed-stamps (Task 31).
-- Atomically claims up to p_limit rows from factura_requests where:
--   status = 'stamping'          (still in flight / not resolved)
--   stamp_last_error IS NOT NULL  (at least one failure recorded)
--   stamp_attempts < 3            (have retries left)
--   backoff elapsed               (exponential: 1min / 5min / 30min)
--
-- Uses FOR UPDATE SKIP LOCKED so overlapping cron runs do not
-- double-process the same row.
--
-- The soft-reserve (bumping stamp_last_error_at = now()) prevents a
-- second concurrent cron run from picking the same rows even before the
-- outer transaction commits.
--
-- Apply manually in Supabase SQL editor before enabling the cron.

create or replace function claim_retry_stamps_batch(p_limit int)
returns table (id uuid)
language plpgsql as $$
begin
  return query
    with claimed as (
      select f.id
      from factura_requests f
      where f.status = 'stamping'
        and f.stamp_last_error is not null
        and f.stamp_attempts < 3
        and f.stamp_last_error_at < now() - (
          case
            when f.stamp_attempts = 1 then interval '1 minute'
            when f.stamp_attempts = 2 then interval '5 minutes'
            else interval '30 minutes'
          end
        )
      order by f.stamp_last_error_at asc
      limit p_limit
      for update skip locked
    )
    update factura_requests f
    set stamp_last_error_at = now()   -- soft reserve
    from claimed
    where f.id = claimed.id
    returning f.id;
end;
$$;
