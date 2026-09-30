-- 2026-09-30 — Banned terms per cliente
--
-- Restricción dura definida por el dueño: lista de palabras/frases que el
-- meerkat NUNCA debe usar (ej. "estimado cliente", "cordial saludo").
-- Complementa organizations.brand_voice_guide (guía suave extraída).
--
-- Se inyecta en el system prompt de los 5 canales (voice, wa-twilio, wa-meta,
-- chat portal, inbox-processor) vía buildBrandVoiceBlock(guide, bannedTerms).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS banned_terms text;

COMMENT ON COLUMN public.organizations.banned_terms IS
  'Lista de palabras/frases (una por línea) que los meerkats de esta org NUNCA deben usar. Complementa brand_voice_guide como restricción dura.';
