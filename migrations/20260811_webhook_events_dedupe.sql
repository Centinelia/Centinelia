-- Dedupe genérico para webhooks entrantes NO-Stripe (fix Scope C3 CRITICAL 1-4).
--
-- Complementa stripe_webhook_events (2026-08-10) para los otros webhooks que
-- no tenían idempotency y sufrían efectos secundarios duplicados en retry:
--   - Twilio WhatsApp (MessageSid): 2-11 respuestas duplicadas al cliente,
--     2× cobro ops, 2× lead. Twilio reintenta hasta 11 veces si no recibe
--     200 en <15s y el endpoint hace LLM call (~2-5s).
--   - Vapi outbound end-of-call (call.id): consume_pool_minutes cobraba
--     minutos 2× en retry.
--   - MS Teams outgoing webhook (message.id): 2× reply al usuario + 2× cobro
--     ops.
--   - Email inbound SendGrid (Message-ID header): Nash procesaba el mismo
--     correo N veces, gastaba LLM 2×, potencialmente respondía 2× al cliente.
--
-- Diseño: append-only, PK compuesta (source, event_id). Handler HTTP hace
-- INSERT ON CONFLICT DO NOTHING al inicio; si no crea row → deduped → return
-- 200. Mismo patrón que stripe_webhook_events, sin flags de estado.

create table if not exists webhook_events (
  source        text not null,           -- 'twilio_wa' | 'vapi_outbound' | 'teams' | 'email_inbound'
  event_id      text not null,           -- MessageSid | call.id | teams message.id | Message-ID
  processed_at  timestamptz not null default now(),
  portal_email  text,                    -- si el evento se pudo mapear a un cliente
  metadata      jsonb,                   -- payload keys útiles para debugging
  primary key (source, event_id)
);

create index if not exists webhook_events_source_processed_idx
  on webhook_events(source, processed_at desc);

create index if not exists webhook_events_portal_email_idx
  on webhook_events(portal_email) where portal_email is not null;

notify pgrst, 'reload schema';
