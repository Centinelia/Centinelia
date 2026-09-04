-- writer_pac_retry_state — tracking de reintentos por basename cuando el writer
-- reporta kind=pacError. El consumer (nala-writer-inbox cron) usa esta tabla
-- para decidir si redepositar el XML en pendientes/ o escalar por retries
-- agotados.
--
-- Un basename == un lote de facturas de Nala (facturas_YYYY-MM-DD_hash).
-- Content-hash de Nala garantiza que el basename es determinístico por
-- contenido, así que re-depositar el mismo archivo es idempotente en CONTPAQi.

CREATE TABLE IF NOT EXISTS writer_pac_retry_state (
    basename          TEXT PRIMARY KEY,
    portal_email      TEXT NOT NULL,
    attempts          INTEGER NOT NULL DEFAULT 1,
    first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exhausted         BOOLEAN NOT NULL DEFAULT FALSE,
    last_reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_writer_pac_retry_state_portal
    ON writer_pac_retry_state (portal_email);

COMMENT ON TABLE  writer_pac_retry_state IS 'Tracking de reintentos de timbrado post-pacError. Un basename por lote.';
COMMENT ON COLUMN writer_pac_retry_state.basename      IS 'Nombre base del XML sin extensión, ej. facturas_2026-09-03_abc12345.';
COMMENT ON COLUMN writer_pac_retry_state.attempts      IS 'Cuántas veces el consumer ha detectado pacError para este basename.';
COMMENT ON COLUMN writer_pac_retry_state.exhausted     IS 'True cuando attempts >= cap y se escaló a operador; no más redeposits.';
COMMENT ON COLUMN writer_pac_retry_state.last_reason   IS 'humanMessage del último pacError registrado, para debug.';
