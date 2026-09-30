-- Activar aviso llamada-sin-reporte para Tortillería Estrella (pedido Ramón 2026-09-30).
-- Requiere: migration 20260930230000_add_notify_calls_without_report_flag.sql aplicada.
--
-- Aplicar en Supabase SQL editor (prod) o vía psql. Idempotente.

-- Sanity check: ver el estado actual antes de tocar
SELECT portal_email, notify_calls_without_report,
       jsonb_array_length(COALESCE(directory, '[]'::jsonb)) AS directory_size
  FROM organizations
 WHERE portal_email = 'servicioalcliente@tortillasestrella.com.mx';

-- Activar el flag
UPDATE organizations
   SET notify_calls_without_report = true
 WHERE portal_email = 'servicioalcliente@tortillasestrella.com.mx';

-- Verificar que el directorio tiene al menos 1 persona con receives_incident_reports=true.
-- Si devuelve 0, revisar el directorio en /admin porque sin recipients el aviso no envía.
SELECT jsonb_array_length(
         COALESCE(
           (SELECT jsonb_agg(p)
              FROM jsonb_array_elements(directory) p
             WHERE (p->>'receives_incident_reports')::boolean = true
               AND p->>'email' IS NOT NULL
               AND length(trim(p->>'email')) > 0),
           '[]'::jsonb
         )
       ) AS incident_recipients_count
  FROM organizations
 WHERE portal_email = 'servicioalcliente@tortillasestrella.com.mx';
