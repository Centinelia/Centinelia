-- Docs por cliente en centinelia_clientes (Fase A del uploader de CSF + otros
-- documentos por cliente para el equipo de Neka).
--
-- Diseño:
--   - Bucket private `centinelia-clientes-docs` para PDFs/imagenes
--     (CSF, contratos, comprobantes de pago, poderes). Solo service_role
--     lee/escribe — access controlado por API con isAdmin gate.
--   - Columna `docs JSONB` en centinelia_clientes: array append-only de metadata
--     de cada doc. La fuente de verdad del archivo es Storage; esta columna
--     es el indice + display + audit trail.
--
--   Shape de cada elemento del array docs:
--     {
--       "id":           "uuid",
--       "tipo":         "csf" | "contrato" | "comprobante_pago" | "poder_notarial" | "otro",
--       "label":        "CSF 2026",
--       "storage_path": "<cliente_id>/<doc_id>-<sanitized_filename>",
--       "mime_type":    "application/pdf",
--       "size_bytes":   12345,
--       "uploaded_at":  "2026-09-15T15:00:00Z",
--       "uploaded_by":  "nazre20@gmail.com"  (opcional, para audit)
--     }
--
-- No se agrega CHECK sobre `tipo` — validacion ocurre en el API. Facilita
-- expandir tipos sin migracion futura.

-- 1. Bucket privado (idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'centinelia-clientes-docs',
  'centinelia-clientes-docs',
  false,
  10485760,  -- 10 MB por archivo
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Columna docs en centinelia_clientes
ALTER TABLE centinelia_clientes
  ADD COLUMN IF NOT EXISTS docs JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN centinelia_clientes.docs IS
  'Array de metadata de documentos subidos por cliente. Archivos viven en bucket centinelia-clientes-docs. Ver src/lib/billing/centinelia-clientes-docs.ts';
