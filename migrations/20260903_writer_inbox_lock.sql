-- writer_inbox_lock — mutex por portal_email para el cron nala-writer-inbox.
-- Cadence es 3 min, procesamiento típico ~5s pero Dropbox 429/red podría
-- alargarlo. Sin lock, dos ticks solapados pueden entregar el mismo CFDI o
-- responder dos veces al mismo cliente.
--
-- Lease-based: locked_until en el futuro = alguien lo tiene. TTL 5 min
-- (mayor que la cadence del cron pero menor que maxDuration de Vercel).
-- Si el proceso muere, el lease expira y otro tick lo agarra.

CREATE TABLE IF NOT EXISTS writer_inbox_lock (
    portal_email    TEXT PRIMARY KEY,
    locked_until    TIMESTAMPTZ NOT NULL,
    holder_id       TEXT NOT NULL,
    acquired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  writer_inbox_lock IS 'Mutex por org para nala-writer-inbox cron; evita solape entre ticks.';
COMMENT ON COLUMN writer_inbox_lock.locked_until IS 'Tiempo hasta el cual el lock es válido. Expira automático.';
COMMENT ON COLUMN writer_inbox_lock.holder_id    IS 'Identificador del proceso que tomó el lock (para debug).';
