-- Pack hr_nomina v1 — reloj checador + cálculo de retardos para RRHH.
--
-- Contexto: AC Proyectos piloto. Lucero Longoria (operadora, ac/porteo del
-- mismo dueño) saca asistencia cada quincena desde reloj BioCheck, exporta a
-- Excel, y calcula retardos a mano. Esta migración abre la capacidad para que
-- Naia procese ese Excel y devuelva una hoja con retardos ya calculados.
--
-- Ver .brain/skills/naia-reloj-checador-ac-proyectos.md para el detalle del
-- flujo + acuerdos con el cliente.
--
-- Convenciones Centinelia aplicadas:
-- - FKs a organizations por portal_email (TEXT), ON DELETE CASCADE.
-- - RLS habilitada en todas las tablas nuevas del schema public en la misma
--   migración ([[feedback-rls-public-tables-default]]). service_role bypassea.
-- - Feature flag per-org en organizations.features.rrhh_nomina_v1 (JSONB
--   existente), activación por SKILL_PACKS.resolveOrgPackContext en runtime.
-- - rrhh_festivos_mx_lft es tabla GLOBAL (sin portal_email): calendario
--   nacional LFT Art. 74 compartido por todas las orgs.

BEGIN;

-- ─── 1. rrhh_empleados — catálogo de empleados por org ──────────────────────
CREATE TABLE IF NOT EXISTS rrhh_empleados (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email      TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  reloj_id          TEXT NOT NULL,
  nombre            TEXT NOT NULL,
  hora_entrada      TIME NOT NULL DEFAULT '08:00',
  -- Sueldo diario en pesos. Si está presente, se usa como monto de la falta de
  -- ese empleado (en MX descontar faltas = descontar 1 día de sueldo). Si está
  -- NULL, cae a rrhh_nomina_config.monto_falta (fallback global, usualmente NULL
  -- también → la tool marca "pendiente"). Captura por Lucero vía
  -- rrhh_registrar_empleado (upsert).
  sueldo_diario_mxn NUMERIC(10,2),
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  dado_baja_at      TIMESTAMPTZ,
  dado_baja_por     TEXT,
  registrado_por    TEXT NOT NULL,
  nota              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portal_email, reloj_id)
);

CREATE INDEX IF NOT EXISTS idx_rrhh_empleados_portal
  ON rrhh_empleados(portal_email);

CREATE INDEX IF NOT EXISTS idx_rrhh_empleados_portal_activo
  ON rrhh_empleados(portal_email, activo);

COMMENT ON TABLE rrhh_empleados IS
  'Catálogo de empleados administrativos por org. reloj_id es el número que el reloj checador asigna al empleado. Fuente de verdad del nombre: aquí (el Excel del reloj a veces viene sin nombre, pain point conocido del PPTX AC Proyectos 2026-10-13).';

-- ─── 2. rrhh_descansos_mensuales ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rrhh_descansos_mensuales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email    TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  empleado_id     UUID NOT NULL REFERENCES rrhh_empleados(id) ON DELETE CASCADE,
  anio            INT NOT NULL,
  mes             INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fechas          DATE[] NOT NULL,
  registrado_por  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empleado_id, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_rrhh_descansos_portal
  ON rrhh_descansos_mensuales(portal_email);

CREATE INDEX IF NOT EXISTS idx_rrhh_descansos_empleado_periodo
  ON rrhh_descansos_mensuales(empleado_id, anio, mes);

COMMENT ON TABLE rrhh_descansos_mensuales IS
  'Días de descanso autorizados por mes por empleado. En AC Proyectos los asignan los jefes de departamento y se los pasan a la operadora de nómina por mensaje al inicio del mes. 1 row por empleado-mes; sobre-escritura via UPSERT.';

-- ─── 3. rrhh_vacaciones ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rrhh_vacaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email    TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  empleado_id     UUID NOT NULL REFERENCES rrhh_empleados(id) ON DELETE CASCADE,
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  registrado_por  TEXT NOT NULL,
  nota            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_rrhh_vacaciones_portal
  ON rrhh_vacaciones(portal_email);

CREATE INDEX IF NOT EXISTS idx_rrhh_vacaciones_empleado_rango
  ON rrhh_vacaciones(empleado_id, fecha_inicio, fecha_fin);

COMMENT ON TABLE rrhh_vacaciones IS
  'Vacaciones autorizadas por empleado como rango fecha_inicio..fecha_fin inclusive. Permite N rangos por empleado.';

-- ─── 4. rrhh_festivos_mx_lft — tabla GLOBAL de festivos LFT Art. 74 ─────────
CREATE TABLE IF NOT EXISTS rrhh_festivos_mx_lft (
  fecha   DATE PRIMARY KEY,
  nombre  TEXT NOT NULL
);

COMMENT ON TABLE rrhh_festivos_mx_lft IS
  'Calendario nacional de festivos LFT Art. 74. Tabla GLOBAL (sin portal_email) compartida por todas las orgs. Seed inicial 2026-2030. Extensible por script cada 5 años.';

-- ─── 5. rrhh_nomina_config — 1 row per org ──────────────────────────────────
CREATE TABLE IF NOT EXISTS rrhh_nomina_config (
  portal_email               TEXT PRIMARY KEY REFERENCES organizations(portal_email) ON DELETE CASCADE,
  hora_entrada_default       TIME NOT NULL DEFAULT '08:00',
  umbral_retardo_doble_min   INT  NOT NULL DEFAULT 30,
  umbral_falta_min           INT  NOT NULL DEFAULT 90,
  monto_retardo_base         NUMERIC(10,2),
  monto_retardo_doble        NUMERIC(10,2),
  monto_falta                NUMERIC(10,2),
  dias_corte_quincena_antes  INT  NOT NULL DEFAULT 1,
  activo                     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rrhh_nomina_config IS
  'Configuración per-org para el cálculo de retardos. monto_retardo_base y monto_retardo_doble son fijos per-org. monto_falta es FALLBACK: lo normal es que la falta use rrhh_empleados.sueldo_diario_mxn (1 día de sueldo per empleado). monto_falta se usa solo cuando ese empleado no tiene sueldo diario capturado todavía. Las columnas monto_* son NULL mientras el cliente no proporcione datos; la tool rrhh_procesar_quincena_desde_excel genera clasificación sin montos en ese caso y notifica.';

COMMENT ON COLUMN rrhh_nomina_config.umbral_retardo_doble_min IS
  'Minutos tras hora_entrada en que el retardo pasa a doble. Default 30 (AC Proyectos: 8:30 va al doble).';

COMMENT ON COLUMN rrhh_nomina_config.umbral_falta_min IS
  'Minutos tras hora_entrada en que ya se considera falta. Default 90 (AC Proyectos: 9:30 en adelante es falta).';

COMMENT ON COLUMN rrhh_nomina_config.dias_corte_quincena_antes IS
  'Días antes del cierre que se calcula la quincena. Default 1 (AC Proyectos: calcula un día antes y el pendiente se pasa a la siguiente).';

-- ─── 6. organizations.rrhh_authorized_operators — whitelist por org ─────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS rrhh_authorized_operators JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN organizations.rrhh_authorized_operators IS
  'Array JSONB de correos autorizados a invocar tools rrhh_* para esta org. Las tools rechazan la invocación si caller_email no está aquí. Para AC Proyectos: ["lucero@porteoglobal.com"].';

-- ─── 7. RLS en las nuevas tablas ────────────────────────────────────────────
ALTER TABLE rrhh_empleados             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rrhh_descansos_mensuales   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rrhh_vacaciones            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rrhh_festivos_mx_lft       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rrhh_nomina_config         ENABLE ROW LEVEL SECURITY;

-- Festivos LFT: SELECT público (info nacional sin PII), consultable incluso
-- desde contextos sin service_role. Las otras 4 tablas quedan sin policies →
-- deny-all para anon/authenticated, service_role bypassea.
CREATE POLICY "rrhh_festivos_select_public" ON rrhh_festivos_mx_lft
  FOR SELECT USING (true);

-- ─── 8. Triggers updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rrhh_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rrhh_empleados_updated_at           ON rrhh_empleados;
DROP TRIGGER IF EXISTS trg_rrhh_descansos_mensuales_updated_at ON rrhh_descansos_mensuales;
DROP TRIGGER IF EXISTS trg_rrhh_vacaciones_updated_at          ON rrhh_vacaciones;
DROP TRIGGER IF EXISTS trg_rrhh_nomina_config_updated_at       ON rrhh_nomina_config;

CREATE TRIGGER trg_rrhh_empleados_updated_at
  BEFORE UPDATE ON rrhh_empleados
  FOR EACH ROW EXECUTE FUNCTION rrhh_touch_updated_at();

CREATE TRIGGER trg_rrhh_descansos_mensuales_updated_at
  BEFORE UPDATE ON rrhh_descansos_mensuales
  FOR EACH ROW EXECUTE FUNCTION rrhh_touch_updated_at();

CREATE TRIGGER trg_rrhh_vacaciones_updated_at
  BEFORE UPDATE ON rrhh_vacaciones
  FOR EACH ROW EXECUTE FUNCTION rrhh_touch_updated_at();

CREATE TRIGGER trg_rrhh_nomina_config_updated_at
  BEFORE UPDATE ON rrhh_nomina_config
  FOR EACH ROW EXECUTE FUNCTION rrhh_touch_updated_at();

-- ─── 9. Seed de festivos LFT 2026-2030 ──────────────────────────────────────
-- Fechas calculadas determinísticamente por _smoke/compute-lft-holidays.mjs.
INSERT INTO rrhh_festivos_mx_lft (fecha, nombre) VALUES
  ('2026-01-01', 'Año Nuevo'),
  ('2026-02-02', 'Día de la Constitución (conmem. 5 feb)'),
  ('2026-03-16', 'Natalicio de Benito Juárez (conmem. 21 mar)'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-09-16', 'Día de la Independencia'),
  ('2026-11-16', 'Día de la Revolución (conmem. 20 nov)'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-02-01', 'Día de la Constitución (conmem. 5 feb)'),
  ('2027-03-15', 'Natalicio de Benito Juárez (conmem. 21 mar)'),
  ('2027-05-01', 'Día del Trabajo'),
  ('2027-09-16', 'Día de la Independencia'),
  ('2027-11-15', 'Día de la Revolución (conmem. 20 nov)'),
  ('2027-12-25', 'Navidad'),
  ('2028-01-01', 'Año Nuevo'),
  ('2028-02-07', 'Día de la Constitución (conmem. 5 feb)'),
  ('2028-03-20', 'Natalicio de Benito Juárez (conmem. 21 mar)'),
  ('2028-05-01', 'Día del Trabajo'),
  ('2028-09-16', 'Día de la Independencia'),
  ('2028-11-20', 'Día de la Revolución (conmem. 20 nov)'),
  ('2028-12-25', 'Navidad'),
  ('2029-01-01', 'Año Nuevo'),
  ('2029-02-05', 'Día de la Constitución (conmem. 5 feb)'),
  ('2029-03-19', 'Natalicio de Benito Juárez (conmem. 21 mar)'),
  ('2029-05-01', 'Día del Trabajo'),
  ('2029-09-16', 'Día de la Independencia'),
  ('2029-11-19', 'Día de la Revolución (conmem. 20 nov)'),
  ('2029-12-25', 'Navidad'),
  ('2030-01-01', 'Año Nuevo'),
  ('2030-02-04', 'Día de la Constitución (conmem. 5 feb)'),
  ('2030-03-18', 'Natalicio de Benito Juárez (conmem. 21 mar)'),
  ('2030-05-01', 'Día del Trabajo'),
  ('2030-09-16', 'Día de la Independencia'),
  ('2030-11-18', 'Día de la Revolución (conmem. 20 nov)'),
  ('2030-12-25', 'Navidad')
ON CONFLICT (fecha) DO NOTHING;

COMMIT;
