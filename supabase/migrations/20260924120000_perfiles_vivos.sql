-- Pack perfiles_vivos — memoria persistente por contacto/deudor/cliente del
-- negocio. Cada meerkat client-facing lo consulta al inicio de la interacción
-- para operar con continuidad histórica, y lo actualiza al final con lo nuevo.
--
-- Casos de uso multi-vertical:
--   - Cobranza: cada deudor tiene historial de promesas, monto adeudado, mora
--   - Ventas B2B: cada prospecto tiene stage, contactos previos, objeciones
--   - Customer success: cada cuenta con retos, wins, hitos
--   - Servicios recurrentes: historial del paciente/cliente
--
-- Feature flag `perfiles_vivos` en organizations.features. Se activa
-- automáticamente al importar la primera cartera desde el portal.
--
-- Cobro:
--   - 1 tarea por consulta exitosa (consultar_contacto)
--   - 1 tarea por interacción registrada (registrar_interaccion)
--   - Import batched: N contactos en 1 cobro count=N

-- 1. Tabla principal: perfil vivo de cada contacto del negocio
CREATE TABLE IF NOT EXISTS contactos_vivos (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email              TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,

  external_id               TEXT,
  nombre                    TEXT NOT NULL,
  telefono                  TEXT,
  correo                    TEXT,

  datos_operacionales       JSONB NOT NULL DEFAULT '{}'::jsonb,

  estado_actual             TEXT NOT NULL DEFAULT 'activo',
  ultima_interaccion_at     TIMESTAMPTZ,
  ultima_interaccion_tipo   TEXT,
  proxima_accion_at         TIMESTAMPTZ,
  proxima_accion_tipo       TEXT,

  total_interacciones       INT NOT NULL DEFAULT 0,
  promesas_hechas           INT NOT NULL DEFAULT 0,
  promesas_cumplidas        INT NOT NULL DEFAULT 0,
  sentimiento_ultimo        TEXT,
  capacidad_pago_detectada  TEXT,

  notas                     TEXT,
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,

  uploaded_by               TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (portal_email, external_id)
);

-- Índice canónico para consulta por teléfono (sufijo 10 dígitos para
-- tolerancia a formatos mixtos: +52..., 52..., 10 dígitos raw).
CREATE INDEX IF NOT EXISTS idx_contactos_vivos_telefono_suffix
  ON contactos_vivos(portal_email, right(regexp_replace(telefono, '[^0-9]', '', 'g'), 10));

CREATE INDEX IF NOT EXISTS idx_contactos_vivos_correo
  ON contactos_vivos(portal_email, lower(correo)) WHERE correo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contactos_vivos_external_id
  ON contactos_vivos(portal_email, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contactos_vivos_estado
  ON contactos_vivos(portal_email, estado_actual);

CREATE INDEX IF NOT EXISTS idx_contactos_vivos_proxima_accion
  ON contactos_vivos(portal_email, proxima_accion_at) WHERE proxima_accion_at IS NOT NULL;

-- GIN multi-columna requiere opclass en cada columna TEXT. Preferimos índice
-- GIN sólo sobre `nombre` (trigram para búsqueda fuzzy); el filtro por
-- `portal_email` lo resuelve el planner combinando con el B-tree implícito.
CREATE INDEX IF NOT EXISTS idx_contactos_vivos_nombre_trgm
  ON contactos_vivos USING gin (nombre gin_trgm_ops);

COMMENT ON TABLE contactos_vivos IS
  'Perfil vivo por contacto del negocio (deudor, prospecto, paciente, cuenta). El meerkat lo consulta al inicio de la interacción y lo actualiza al final. Análogo a fichas_informativas pero para personas en vez de documentos.';

-- 2. Tabla de interacciones (append-only, una fila por conversación registrada)
CREATE TABLE IF NOT EXISTS contactos_interacciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id       UUID NOT NULL REFERENCES contactos_vivos(id) ON DELETE CASCADE,
  portal_email      TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,

  tipo              TEXT NOT NULL,
  canal_ref_id      TEXT,
  meerkat_id        UUID,

  fecha             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duracion_seg      INT,

  resumen           TEXT,
  sentimiento       TEXT,
  temas             TEXT[],

  promesa_monto     NUMERIC(15, 2),
  promesa_fecha     DATE,
  proxima_accion    TEXT,
  escalado_a        TEXT,

  raw_transcript    TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contactos_interacciones_contacto
  ON contactos_interacciones(contacto_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_contactos_interacciones_portal
  ON contactos_interacciones(portal_email, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_contactos_interacciones_promesa_pendiente
  ON contactos_interacciones(portal_email, promesa_fecha)
  WHERE promesa_fecha IS NOT NULL AND promesa_monto IS NOT NULL;

COMMENT ON TABLE contactos_interacciones IS
  'Log append-only de cada interacción con un contacto vivo. Post-llamada webhook llena una fila con resumen + acciones capturadas por LLM.';

-- 3. Trigger updated_at en contactos_vivos
CREATE OR REPLACE FUNCTION contactos_vivos_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contactos_vivos_updated_at ON contactos_vivos;
CREATE TRIGGER trg_contactos_vivos_updated_at
  BEFORE UPDATE ON contactos_vivos
  FOR EACH ROW EXECUTE FUNCTION contactos_vivos_touch_updated_at();

-- 4. Trigger para mantener denormalización: cuando se inserta una interacción,
-- actualiza contadores + ultima_interaccion en contactos_vivos.
CREATE OR REPLACE FUNCTION contactos_interacciones_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contactos_vivos
  SET
    total_interacciones     = total_interacciones + 1,
    promesas_hechas         = promesas_hechas + CASE WHEN NEW.promesa_monto IS NOT NULL THEN 1 ELSE 0 END,
    ultima_interaccion_at   = NEW.fecha,
    ultima_interaccion_tipo = NEW.tipo,
    sentimiento_ultimo      = COALESCE(NEW.sentimiento, sentimiento_ultimo)
  WHERE id = NEW.contacto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contactos_interacciones_after_insert ON contactos_interacciones;
CREATE TRIGGER trg_contactos_interacciones_after_insert
  AFTER INSERT ON contactos_interacciones
  FOR EACH ROW EXECUTE FUNCTION contactos_interacciones_after_insert();

-- 5. Extensión pg_trgm ya creada al inicio? Se asegura por si esta migración
-- corre standalone. CREATE IF NOT EXISTS es idempotente.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
