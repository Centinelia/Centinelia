-- Idempotency de webhooks de Stripe por event.id (fix C3 audit 2026-08-10).
--
-- Motivación: Stripe reintenta webhooks cuando no recibe 200 OK dentro del
-- timeout (~10s), o cuando manualmente reenviamos desde el Dashboard. Sin
-- dedupe por event.id, un retry de `invoice.payment_succeeded` acredita
-- minutos dos veces al ledger. Descubierto en audit exhaustivo pre-Municipio.
--
-- Diseño: tabla append-only, event.id como PK. El handler HTTP hace INSERT ON
-- CONFLICT DO NOTHING al inicio; si el insert no crea row (conflict), se sabe
-- que ya se procesó y se retorna 200 sin re-ejecutar handlers. Simple, atómico,
-- sin flags de estado (basta la existencia del row).
--
-- Retention: sin TTL. Los rows son chicos (~150 bytes) y aún con 100k eventos
-- al año = 15MB. Preservarlos permite forensics: "cuándo procesamos este
-- evento por primera vez?" — dato que auditor Municipio puede requerir.

create table if not exists stripe_webhook_events (
  event_id      text primary key,             -- Stripe event.id, e.g. "evt_1O2..."
  event_type    text not null,                -- "invoice.payment_succeeded", etc.
  processed_at  timestamptz not null default now(),
  session_id    text,                         -- checkout_session.id si aplica (útil para debugging)
  subscription_id text,                       -- stripe_subscription_id si aplica
  portal_email  text                          -- si el evento se pudo mapear a un cliente
);

create index if not exists stripe_webhook_events_processed_at_idx
  on stripe_webhook_events(processed_at desc);

create index if not exists stripe_webhook_events_type_idx
  on stripe_webhook_events(event_type);

create index if not exists stripe_webhook_events_portal_email_idx
  on stripe_webhook_events(portal_email) where portal_email is not null;

notify pgrst, 'reload schema';
