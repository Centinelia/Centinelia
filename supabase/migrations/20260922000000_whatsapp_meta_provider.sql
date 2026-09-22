-- Extiende whatsapp_agents para soportar Meta Cloud API como provider adicional
-- a Twilio. Twilio sigue funcionando sin cambios (default provider = 'twilio').
-- Meta se activa por agent seteando provider='meta' + meta_phone_number_id.
--
-- Diseño:
--   - Nunca dos rows con el mismo meta_phone_number_id → UNIQUE. Meta Cloud API
--     enforces que cada numero tiene 1 sola app conectada; nuestro modelo lo
--     refleja igual.
--   - CHECK cross-column: si provider='meta', meta_phone_number_id NOT NULL.
--     Evita rows huérfanas.
--   - meta_business_account_id (WABA id) se guarda para debug/reintentos
--     (algunos endpoints Meta lo requieren aparte del phone_number_id).

ALTER TABLE whatsapp_agents
  ADD COLUMN IF NOT EXISTS provider                  TEXT NOT NULL DEFAULT 'twilio',
  ADD COLUMN IF NOT EXISTS meta_phone_number_id      TEXT,
  ADD COLUMN IF NOT EXISTS meta_business_account_id  TEXT,
  ADD COLUMN IF NOT EXISTS handoff_phone             TEXT;

ALTER TABLE whatsapp_agents DROP CONSTRAINT IF EXISTS whatsapp_agents_provider_check;
ALTER TABLE whatsapp_agents
  ADD CONSTRAINT whatsapp_agents_provider_check
  CHECK (provider IN ('twilio', 'meta'));

ALTER TABLE whatsapp_agents DROP CONSTRAINT IF EXISTS whatsapp_agents_meta_requires_id;
ALTER TABLE whatsapp_agents
  ADD CONSTRAINT whatsapp_agents_meta_requires_id
  CHECK (provider <> 'meta' OR meta_phone_number_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_agents_meta_phone_number_id
  ON whatsapp_agents (meta_phone_number_id)
  WHERE meta_phone_number_id IS NOT NULL;

COMMENT ON COLUMN whatsapp_agents.provider IS
  'twilio (default, sandbox o numero MX propio) | meta (Meta Cloud API, requiere WABA verify)';
COMMENT ON COLUMN whatsapp_agents.meta_phone_number_id IS
  'Meta Cloud API phone_number_id (Graph API param, distinto al display E.164). Requerido si provider=meta.';
COMMENT ON COLUMN whatsapp_agents.meta_business_account_id IS
  'Meta WABA id (Business Account). Necesario para endpoints administrativos aparte del phone_number_id.';
COMMENT ON COLUMN whatsapp_agents.handoff_phone IS
  'Numero MX +52... al que este agent transfiere cuando dispara solicitar_handoff. Modo 1 (transferencia dura al humano fijo del cliente).';
