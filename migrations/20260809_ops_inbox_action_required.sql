-- Señal independiente de category: ¿este correo REQUIERE respuesta humana o es FYI?
-- Permite separar recibos/notificaciones (Vercel, Stripe, GitHub, etc.) del pipeline
-- de aprobar/rechazar en bandeja.
--
-- NULL = row antigua (retro-compat). Se interpreta en frontend como "asumir true".
-- true  = requiere acción (aparece en Pendientes)
-- false = FYI puro (aparece en Notificaciones, status='skipped')

alter table ops_inbox
  add column if not exists action_required boolean;

comment on column ops_inbox.action_required is
  'true si el correo requiere respuesta/acción del negocio, false si es FYI/notificación. NULL = row previa a la feature.';

-- Índice parcial para el query de Pendientes (excluye FYI).
create index if not exists idx_ops_inbox_action_required_pending
  on ops_inbox (agent_id, status)
  where action_required is not false;

-- ─── Backfill de action_required para rows históricas ──────────────────────
-- notificacion y spam nunca requieren acción del humano.
-- Skipped también (ya fue triado, no hay nada que hacer).
update ops_inbox
   set action_required = false
 where action_required is null
   and (category in ('spam', 'notificacion') or status = 'skipped');

update ops_inbox
   set action_required = true
 where action_required is null;
