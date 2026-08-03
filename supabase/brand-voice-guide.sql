-- brand-voice-guide: guía de tono por organización, extraída de muestras reales
-- del cliente. Se inyecta en el system prompt de todos los meerkats no-coordinadores
-- para que hablen como la marca del negocio, no con un tono genérico.
--
-- Naia (Onboarding) puede llamar la tool `extraer_tono_de_marca` durante la
-- conversación con el dueño para poblarla. También se puede editar desde el
-- portal.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_voice_guide       text,
  ADD COLUMN IF NOT EXISTS brand_voice_updated_at  timestamptz;
