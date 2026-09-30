-- Feature flag por org para rollout gradual del middleware de dedup.
-- Default false → habilitar por org según rollout (spec §6).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS dedup_middleware_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.dedup_middleware_enabled IS
  'Middleware universal de dedup de tool calls (spec 2026-09-29). Cuando true, envuelve todos los handlers con withDedup(). Default false; rollout Tortillería → pilotos → global.';
