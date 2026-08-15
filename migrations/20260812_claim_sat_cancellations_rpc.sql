-- RPC used by cron poll-sat-cancellations (Task 30).
-- Atomically claims up to p_limit rows from cfdi_cancellations where
-- status='sent_to_sat' and not polled in the last 30 minutes, using
-- FOR UPDATE SKIP LOCKED so overlapping cron runs do not double-process.
--
-- The soft-reserve (bumping sat_status_last_check = now()) prevents a
-- second concurrent cron run from picking the same rows even before the
-- outer transaction commits.
--
-- Apply manually in Supabase SQL editor before enabling the cron.

create or replace function claim_sat_cancellations_batch(p_limit int)
returns table (
  id                   uuid,
  uuid_cancelado       text,
  organization_email   text,
  factura_request_id   uuid
)
language plpgsql as $$
begin
  return query
    with claimed as (
      select
        c.id,
        c.uuid_cancelado,
        c.organization_email,
        c.factura_request_id
      from cfdi_cancellations c
      where c.status = 'sent_to_sat'
        and (
          c.sat_status_last_check is null
          or c.sat_status_last_check < now() - interval '30 minutes'
        )
        and c.created_at > now() - interval '10 days'
      order by c.created_at asc
      limit p_limit
      for update skip locked
    )
    update cfdi_cancellations c
    set sat_status_last_check = now()   -- soft reserve
    from claimed
    where c.id = claimed.id
    returning c.id, c.uuid_cancelado, c.organization_email, c.factura_request_id;
end;
$$;
