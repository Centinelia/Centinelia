-- Contrato de servicios a nivel organizacion (per portal_email), no per-empleado.
--
-- Antes: voice_agents.contract_accepted_at + contract_ip. Un cliente con 6
-- empleados tenia que firmar 6 veces. Peor: al contratar un empleado nuevo,
-- ese empleado nace con contract_accepted_at NULL y el banner reaparece
-- aunque el cliente ya haya firmado meses atras.
--
-- Ahora: organizations.contract_accepted_at + contract_ip + contract_signer_name.
-- Una firma por cliente cubre a todos los empleados presentes y futuros.
--
-- IMPORTANTE:
-- - voice_agents.contract_accepted_at / contract_ip NO se droppean todavia
--   (backward compat con codigo legacy). Se limpian en una migracion futura.
-- - voice_agents.contract_text (override custom del texto del contrato) SIGUE
--   siendo per-agente. No se toca.

alter table organizations
  add column if not exists contract_accepted_at timestamptz null,
  add column if not exists contract_ip          text        null,
  add column if not exists contract_signer_name text        null;

-- Backfill: por cada portal_email que ya tenga al menos un voice_agent firmado,
-- toma la firma mas temprana como la firma "oficial" de la organizacion.
-- COALESCE preserva datos existentes si la migracion se corre dos veces.
with earliest_signed as (
  select
    portal_email,
    min(contract_accepted_at) as accepted_at,
    (array_agg(contract_ip   order by contract_accepted_at asc)  filter (where contract_ip is not null))[1] as ip,
    (array_agg(client_name   order by contract_accepted_at asc)  filter (where client_name is not null))[1] as signer_name
  from voice_agents
  where portal_email is not null
    and contract_accepted_at is not null
  group by portal_email
)
update organizations o
set
  contract_accepted_at = coalesce(o.contract_accepted_at, es.accepted_at),
  contract_ip          = coalesce(o.contract_ip,          es.ip),
  contract_signer_name = coalesce(o.contract_signer_name, es.signer_name)
from earliest_signed es
where o.portal_email = es.portal_email;

-- Si la org no existe todavia (portal_email presente en voice_agents pero sin
-- fila en organizations), insertar para no perder la firma.
insert into organizations (portal_email, contract_accepted_at, contract_ip, contract_signer_name)
select
  es.portal_email,
  es.accepted_at,
  es.ip,
  es.signer_name
from (
  select
    portal_email,
    min(contract_accepted_at) as accepted_at,
    (array_agg(contract_ip   order by contract_accepted_at asc)  filter (where contract_ip is not null))[1] as ip,
    (array_agg(client_name   order by contract_accepted_at asc)  filter (where client_name is not null))[1] as signer_name
  from voice_agents
  where portal_email is not null
    and contract_accepted_at is not null
  group by portal_email
) es
on conflict (portal_email) do nothing;

notify pgrst, 'reload schema';
