-- Migration: landing_callback_requests
-- Tabla para solicitudes de callback desde la landing (demo / piloto)
-- Incluye: datos de contacto, OTP, estado de llamada Vapi
-- RPC increment_otp_attempts incluida aqui (Task 15 + Task 18 Step 4)

create table if not exists landing_callback_requests (
  id                  uuid primary key default gen_random_uuid(),
  phone               text not null,
  industry            text not null,
  ip                  inet,
  user_agent          text,
  consent_at          timestamptz not null default now(),
  otp_hash            text,
  otp_expires_at      timestamptz,
  otp_attempts        int not null default 0,
  otp_verified_at     timestamptz,
  vapi_call_id        text,
  call_status         text check (call_status in ('pending','dialing','answered','completed','failed','fallback_manual')),
  call_started_at     timestamptz,
  call_ended_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index landing_callback_requests_phone_created_idx
  on landing_callback_requests (phone, created_at desc);

create index landing_callback_requests_ip_created_idx
  on landing_callback_requests (ip, created_at desc);

create index landing_callback_requests_status_idx
  on landing_callback_requests (call_status)
  where call_status = 'pending';

-- RPC: incrementa otp_attempts de forma atomica y regresa el nuevo valor
-- Usado por callback-store.ts#incrementOtpAttempts
-- Tambien usado en Task 18 Step 4 (OTP verification endpoint)
create or replace function increment_otp_attempts(req_id uuid)
returns int
language sql
as $$
  update landing_callback_requests
  set
    otp_attempts = otp_attempts + 1,
    updated_at   = now()
  where id = req_id
  returning otp_attempts;
$$;
