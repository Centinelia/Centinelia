-- F6 civic report attachments — el ciudadano puede subir fotos del bache /
-- alumbrado / limpieza post-reporte. Nia entrega el folio en la llamada; el
-- ciudadano abre /r/{folio}/adjuntar y sube 1-3 fotos. Se guardan en storage
-- bajo el bucket `civic-attachments` y se listan en el detalle del reporte.

CREATE TABLE IF NOT EXISTS civic_report_attachments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      uuid        NOT NULL REFERENCES civic_reports(id) ON DELETE CASCADE,
  storage_path   text        NOT NULL,          -- key dentro del bucket civic-attachments
  file_name      text        NOT NULL,
  mime_type      text        NOT NULL,
  size_bytes     int         NOT NULL,
  uploaded_ip    text,
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS civic_report_attachments_report_idx
  ON civic_report_attachments (report_id, uploaded_at DESC);

ALTER TABLE civic_report_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON civic_report_attachments
  USING (false)
  WITH CHECK (false);

-- Bucket private + client uploads via API con service_role.
-- Correr manualmente en Supabase Studio → Storage → New bucket:
--   name: civic-attachments  |  Public: false
