-- Add multilingual toggle at org level.
-- Antes: cada voice_agent tenía features.multilingual (bool). En la práctica,
-- Deepgram con language='multi' es menos preciso que 'es' y disparaba
-- transcripciones raras (hindi, mistranscripciones de "factura" como "app")
-- en llamadas donde el cliente solo hablaba español.
--
-- Decisión producto (2026-08-04): mercado 100% MX por default. Cada org
-- controla desde /oficina/configurar si quiere activar multilingüe
-- (español + inglés). Nuevas orgs arrancan monolingüe.

alter table organizations
  add column if not exists multilingual boolean not null default false;

-- Backfill: TODAS las orgs existentes se ponen en false por consenso Nazre
-- ("nuestro mercado es puro Mexico"). Si algún cliente reclama inglés después,
-- se activa desde el portal con el toggle nuevo.
update organizations set multilingual = false;

notify pgrst, 'reload schema';
