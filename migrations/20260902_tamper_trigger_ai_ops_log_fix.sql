-- 2026-09-02: parche prevent_ledger_tamper para soportar ai_ops_log.
--
-- Bug latente: el trigger prevent_tamper (2026-09-01) se aplicó también a
-- ai_ops_log pero la función solo conoce las columnas de minutes_ledger /
-- ops_ledger (amount, kind). ai_ops_log usa (count, source). Cualquier
-- UPDATE legítimo a ai_ops_log fallaba con "record old has no field amount".
--
-- Detectado 2026-09-02 al intentar backfill de portal_email typo huérfano.
-- El backfill se resolvió via SET session_replication_role=replica pero el
-- bug del trigger seguía latente para cualquier futuro UPDATE.
--
-- Fix: bifurca por TG_TABLE_NAME. En ai_ops_log el value billing es
-- (count, source, portal_email) — count cero-o-más, source es el 'kind' semántico.

CREATE OR REPLACE FUNCTION public.prevent_ledger_tamper()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_allow text;
begin
  if tg_op = 'UPDATE' then
    if TG_TABLE_NAME = 'ai_ops_log' then
      if (old.count is distinct from new.count)
         or (old.source is distinct from new.source)
         or (old.portal_email is distinct from new.portal_email) then
        raise exception 'ai_ops_log row immutable: cannot change count/source/portal_email post-insert. Use reconciliacion row en ops_ledger.'
          using errcode = 'P0001';
      end if;
    else
      if (old.amount is distinct from new.amount)
         or (old.kind is distinct from new.kind)
         or (old.portal_email is distinct from new.portal_email) then
        raise exception 'Ledger row immutable: cannot change amount/kind/portal_email post-insert. Use reconciliacion row instead.'
          using errcode = 'P0001';
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    v_allow := current_setting('ledger.allow_delete', true);
    if v_allow is null or v_allow <> 'true' then
      raise exception 'Ledger row immutable: DELETE requires session variable ledger.allow_delete=true.'
        using errcode = 'P0001';
    end if;
  end if;
  return coalesce(old, new);
end;
$function$;
