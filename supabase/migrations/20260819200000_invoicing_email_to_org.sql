-- features.invoicing_email → organizations.invoicing_email
-- Config fiscal (a quién notificar cuando un cliente pide factura) es única
-- por org, no per-meerkat. Además executor.ts leía de organizations.invoicing_email
-- (columna inexistente) → todos los tools de creatividad usaban fallback.
--
-- Applied to prod 2026-08-19. Backfill preserva el valor del primer meerkat
-- de cada org (por created_at ASC).

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS invoicing_email TEXT;

UPDATE organizations o
SET invoicing_email = va.email
FROM (
  SELECT DISTINCT ON (portal_email)
    portal_email,
    features->>'invoicing_email' AS email
  FROM voice_agents
  WHERE features->>'invoicing_email' IS NOT NULL
    AND TRIM(features->>'invoicing_email') != ''
  ORDER BY portal_email, created_at ASC
) va
WHERE o.portal_email = va.portal_email;

-- Cleanup: eliminar el key del JSONB en voice_agents.features
UPDATE voice_agents
SET features = features - 'invoicing_email'
WHERE features ? 'invoicing_email';
