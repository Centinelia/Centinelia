-- SQL final de setup para Fondo Demo del Norte.
--
-- Correr DESPUÉS de que hayas creado los 4 meerkats (Nara, Nico, Nova, Niva)
-- vía admin panel, y DESPUÉS de que hayas subido los 4 Google Sheets al Drive.
--
-- Este script:
--   1. Activa monitoreo automático (cron pilot-monitor cada 30 min → tu Gmail)
--   2. Deja demo_paused en false (org activa)
--   3. Registra el sheets_mappings de los 5 sheets (cambia los spreadsheet_id)
--   4. Da un pool generoso de minutos a Nara y Nico
--
-- Cómo correrlo: pega en Supabase SQL Editor o vía psql. Comenta las secciones
-- que no apliquen todavía (ej. si no has subido sheets, comenta esa sección).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Activar monitoreo automático + confirmar org no está pausada
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE organizations
  SET pilot_notify_email = 'nazre20@gmail.com',
      demo_paused        = FALSE
  WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';

-- Verifica que el UPDATE afectó 1 fila:
SELECT portal_email, pilot_notify_email, demo_paused
  FROM organizations
  WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Configurar vertical financiero en los 4 meerkats (para labels condicionales)
-- ═══════════════════════════════════════════════════════════════════════════

-- Después de crear los agentes vía admin, corre esto para setear vertical.
-- Si en el admin panel ya seteaste vertical=financiero al crear, salta esta sección.

UPDATE voice_agents
  SET features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{vertical}',
    '"financiero"'
  )
  WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';

-- Verifica:
SELECT agent_name, features->>'vertical' AS vertical, active
  FROM voice_agents
  WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Sheets mappings — reemplaza SPREADSHEET_ID_XXX con los IDs reales
-- ═══════════════════════════════════════════════════════════════════════════

-- El sheet_id es la parte larga de la URL de Google Sheets:
-- https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID_AQUÍ]/edit
--
-- Encuentra el `agent_id` de Nara/Nico (los que ejecutan sheets_) con esta consulta:
--   SELECT id, agent_name FROM voice_agents
--   WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';
--
-- Después reemplaza AGENT_ID_NARA_AQUI abajo con el id de Nara (o de Nox si es
-- el coordinador quien lo consulta — depende de tu setup final).

-- INSERT INTO sheets_mappings (agent_id, purpose, spreadsheet_id, tab_name, headers_row) VALUES
--   ('AGENT_ID_NARA_AQUI', 'custom_directorio_intermediarios', 'SPREADSHEET_ID_DIRECTORIO', 'Hoja 1', 1),
--   ('AGENT_ID_NARA_AQUI', 'custom_cartera_maestra',           'SPREADSHEET_ID_CARTERA',    'Hoja 1', 1),
--   ('AGENT_ID_NARA_AQUI', 'custom_reporte_uc_industrial',     'SPREADSHEET_ID_UC_IND',     'Hoja 1', 1),
--   ('AGENT_ID_NARA_AQUI', 'custom_reporte_agrofinanciera',    'SPREADSHEET_ID_AGRO',       'Hoja 1', 1),
--   ('AGENT_ID_NARA_AQUI', 'custom_reporte_cajas_solidarias',  'SPREADSHEET_ID_CAJAS',      'Hoja 1', 1);

-- Verifica:
-- SELECT agent_id, purpose, spreadsheet_id FROM sheets_mappings
--   WHERE agent_id IN (
--     SELECT id FROM voice_agents
--     WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx'
--   );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Pool de minutos y tareas generoso (13 días de exploración libre)
-- ═══════════════════════════════════════════════════════════════════════════

-- Legacy per-agent (voice_agents.minutes_included):
UPDATE voice_agents
  SET minutes_included = 500,
      minutes_used     = 0
  WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx'
    AND agent_name IN ('Nara', 'Nico');

-- Verifica pool:
SELECT agent_name, minutes_included, minutes_used
  FROM voice_agents
  WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';

-- Si usas ledger event-sourced (account_minutes), consulta el saldo:
-- SELECT * FROM account_minutes
--   WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';

-- ═══════════════════════════════════════════════════════════════════════════
-- COMANDOS ÚTILES DURANTE LOS 13 DÍAS
-- ═══════════════════════════════════════════════════════════════════════════

-- 🔴 PAUSAR TODO SI ALGO SE ROMPE (Gerardo NO recibe correo):
-- UPDATE organizations SET demo_paused = TRUE
--   WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';

-- 🟢 REANUDAR después de arreglar:
-- UPDATE organizations SET demo_paused = FALSE
--   WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';

-- 🔕 SILENCIAR ALERTAS (si son muy ruidosas los primeros días):
-- UPDATE organizations SET pilot_notify_email = NULL
--   WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';

-- 🧹 CLEANUP POST-CITA (cuando ya firmó o descartó):
-- UPDATE organizations
--   SET pilot_notify_email = NULL,
--       demo_paused        = FALSE
--   WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';
