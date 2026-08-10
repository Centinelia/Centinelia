-- Magic-link email OTP para /portal/[token]/setup.
--
-- Antes: cualquiera con el portal_token podía setear email + password y tomar
-- la cuenta. Con token largo (uuid) era teoricamente inviable, pero al pasar
-- a token corto (12 chars = 72 bits) y por defense-in-depth añadimos OTP
-- por correo.
--
-- Flow nuevo:
-- 1. /portal/[token]/setup muestra el correo del org (masked) y un botón
--    "Enviar código".
-- 2. POST /api/portal/auth/setup/request-code {token}
--    → server genera código de 6 dígitos, lo hashea (bcrypt-style via WebCrypto),
--      inserta row con expires_at = now() + 15min, y manda email.
-- 3. Usuario recibe código, lo pega + password, POST /api/portal/auth/setup
--    { token, code, password }
-- 4. Server verifica code (hash + expiry + attempts) y setea password.
--
-- Attempts limita a 5 intentos por code. Después de eso, hay que pedir uno nuevo.
-- Codes viejos se limpian con un cron o cleanup por row al insertar el nuevo.

create table if not exists portal_setup_codes (
  id           uuid        primary key default gen_random_uuid(),
  portal_email text        not null,
  code_hash    text        not null,
  expires_at   timestamptz not null,
  attempts     int         not null default 0,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_portal_setup_codes_email_created
  on portal_setup_codes(portal_email, created_at desc);

create index if not exists idx_portal_setup_codes_expires
  on portal_setup_codes(expires_at);

notify pgrst, 'reload schema';
