-- Atomic ops consumption.
-- Uses a transaction-level advisory lock keyed to the account email so that
-- two concurrent requests from the same account serialize here in Postgres,
-- not in application code.
-- Run once in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION consume_ai_ops(p_agent_id uuid, p_count integer)
RETURNS TABLE(
  ok            boolean,
  ops_used      integer,
  ops_limit     integer,
  account_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $consume_ai_ops$
DECLARE
  v_portal_email  text;
  v_total_used    integer;
  v_total_limit   integer;
BEGIN
  SELECT va.portal_email
  INTO   v_portal_email
  FROM   voice_agents va
  WHERE  va.id = p_agent_id;

  IF v_portal_email IS NULL THEN
    RETURN QUERY SELECT false::boolean, 0::integer, 0::integer, NULL::text;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_portal_email));

  SELECT
    COALESCE(SUM(va.ai_ops_used),  0)::integer,
    COALESCE(SUM(va.ai_ops_limit), 0)::integer
  INTO v_total_used, v_total_limit
  FROM voice_agents va
  WHERE va.portal_email = v_portal_email;

  IF v_total_limit = 0 OR (v_total_used + p_count) > v_total_limit THEN
    RETURN QUERY SELECT false::boolean, v_total_used, v_total_limit, v_portal_email;
    RETURN;
  END IF;

  UPDATE voice_agents
  SET    ai_ops_used = ai_ops_used + p_count
  WHERE  id = p_agent_id;

  RETURN QUERY SELECT true::boolean, (v_total_used + p_count)::integer, v_total_limit, v_portal_email;
END;
$consume_ai_ops$;
