-- Hygiene: garantizar que voice_agents.trust_stage tenga default explícito
-- y no queden NULLs (aunque el default ya sea 3, columnas nullable pueden
-- caer a NULL si el INSERT no la incluye).
--
-- NO forzar stage=3 en cuentas con stage explícito distinto — respetar la
-- elección del usuario cuando bajó a Observador/Supervisado a propósito.

-- 1. Backfill NULLs → 3 (Autónomo)
update voice_agents
   set trust_stage = 3
 where trust_stage is null;

-- 2. Marcar la columna NOT NULL para que el problema no reaparezca
alter table voice_agents
  alter column trust_stage set not null;

-- 3. Reafirmar el default (por si alguna migración lo dropea)
alter table voice_agents
  alter column trust_stage set default 3;

comment on column voice_agents.trust_stage is
  '1=Observador (solo triage), 2=Supervisado (borrador+aprobación), 3=Autónomo (default, classifier decide). Ver [[feedback-empleados-inteligentes]].';
