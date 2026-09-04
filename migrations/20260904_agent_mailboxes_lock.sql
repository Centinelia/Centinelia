-- agent_mailboxes_lock — mutex por agent_id para el cron /api/cron/agent-mailboxes.
--
-- Cadence del cron es cada 10min. Procesamiento típico: cap 20 correos por
-- agente, cada uno con round-trip IMAP + insert + enqueue ~500ms → ~10-20s
-- por agente. Con múltiples agentes puede acercarse al maxDuration=300s.
-- Sin lock, dos ticks solapados pueden fetch los mismos correos entre
-- fetch y markSeen → double insert (mitigado por índice único de
-- billing_incoming_emails_portal_message_uniq) y consumo doble de conexiones
-- IMAP (algunos proveedores limitan a 4-10 concurrentes por usuario).
--
-- Lease-based idéntico a writer_inbox_lock (misma prop de expiración).

CREATE TABLE IF NOT EXISTS agent_mailboxes_lock (
    agent_id        UUID PRIMARY KEY,
    locked_until    TIMESTAMPTZ NOT NULL,
    holder_id       TEXT NOT NULL,
    acquired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  agent_mailboxes_lock IS 'Mutex por agente para agent-mailboxes cron; evita solape entre ticks.';
COMMENT ON COLUMN agent_mailboxes_lock.locked_until IS 'Tiempo hasta el cual el lock es válido. Expira automático.';
COMMENT ON COLUMN agent_mailboxes_lock.holder_id    IS 'Identificador del proceso que tomó el lock (para debug).';
