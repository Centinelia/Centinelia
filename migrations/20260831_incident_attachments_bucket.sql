-- migrations/20260831_incident_attachments_bucket.sql
-- Bucket privado para screenshots/imágenes anexados a platform_incidents.
-- Se lee/escribe solo con service_role. URLs firmadas (24h portal, 1yr GH issue).
insert into storage.buckets (id, name, public, file_size_limit)
values ('incident-attachments', 'incident-attachments', false, 8388608)  -- 8 MB
on conflict (id) do nothing;
