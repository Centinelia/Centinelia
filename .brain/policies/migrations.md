---
name: migrations
description: Reglas duras para toda migration SQL nueva en supabase/migrations. Cubre RLS por default y GRANTs explícitos (obligatorios post 30-oct-2026).
type: policy
owner: nazre
last_verified: 2026-09-23
---

# Migrations - reglas duras

Origen:
- Sesión 2026-09-23: Supabase Advisor flaggeó `centinelia_clientes`, `centinelia_billing`, `social_accounts` y 14 más por `rls_disabled_in_public` + `sensitive_columns_exposed`. Fix aplicado en migration `20260923120000_enable_rls_on_public_tables.sql`.
- Anuncio Supabase: a partir del **30-oct-2026** deja de otorgarse GRANT automático a tablas nuevas en el schema `public`. Migrations que crean tablas sin GRANT explícito quedan inaccesibles vía Data API (PostgREST, supabase-js).

---

## 1. Todo CREATE TABLE lleva ENABLE ROW LEVEL SECURITY inmediatamente después

**Por qué:** el patrón de Centinelia es que todo acceso a DB va vía `createAdminClient` (service_role) desde rutas API server-side, con filtro `.eq('org_id', session.org_id)`. `service_role` tiene `BYPASSRLS` por default, así que habilitar RLS sin policy no rompe reads server-side, pero bloquea a `anon` y `authenticated` (default deny). Sin este habilitado, cualquiera con la URL del proyecto puede leer todo vía anon key.

**Cómo aplicar:** al final del bloque `CREATE TABLE public.<tabla> (...)`, agregar:

```sql
ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;
```

Excepción: si la tabla es genuinamente pública (raro; ej. catálogo estático que el landing lee sin sesión), documentarlo con `COMMENT ON TABLE` y crear policy `FOR SELECT TO anon USING (true)` explícita.

---

## 2. Todo CREATE TABLE lleva GRANT explícito a service_role (obligatorio post 30-oct-2026)

**Por qué:** después del 30-oct-2026 Supabase deja de auto-otorgar acceso a `service_role`/`authenticated`/`anon` en tablas nuevas del schema `public`. Sin GRANT explícito, la Data API devuelve `permission denied` y las rutas API dejan de funcionar en producción. También aplica a `supabase db reset` local: tablas re-creadas sin grants quedan inaccesibles en el ambiente local.

**Cómo aplicar:** al final del `CREATE TABLE` (después del `ENABLE ROW LEVEL SECURITY`), agregar:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabla> TO service_role;
```

Esto es suficiente para el 95% de las tablas de Centinelia (acceso solo server-side via `createAdminClient`).

---

## 3. GRANT a authenticated solo si la tabla se lee client-side desde el portal

**Por qué:** el rol `authenticated` es el que usa `supabase-js` en el browser cuando el portal-user tiene sesión. La mayoría de tablas de Centinelia NO se leen así (el portal usa Server Components con `createAdminClient`). Otorgar `authenticated` sin necesidad amplía la superficie de ataque.

**Cómo aplicar:** antes de agregar `GRANT ... TO authenticated`, verificar con grep si algún Client Component (`'use client'` + `createBrowserClient`) hace `.from('<tabla>')`. Si no lo hace, no otorgar. Si lo hace, otorgar solo los verbs necesarios:

```sql
GRANT SELECT ON public.<tabla> TO authenticated;  -- solo lectura
-- o
GRANT SELECT, INSERT ON public.<tabla> TO authenticated;  -- lectura + inserción
```

Y crear policy que filtre por sesión del portal-user (ej. `USING (portal_email = auth.jwt() ->> 'email')`).

---

## 4. NUNCA GRANT a anon salvo tablas verdaderamente públicas

**Por qué:** `anon` es el rol que usa cualquiera con la URL del proyecto sin autenticarse. Otorgar acceso a anon = data pública en internet. Esto fue exactamente el bug del 19-sep-2026.

**Cómo aplicar:** default es no otorgar. Excepciones válidas: catálogo de industrias público, precios visibles en landing, etc. Documentar explícitamente el motivo con `COMMENT ON TABLE`.

---

## 5. Test local con supabase db reset antes de commitear la migration

**Por qué:** una migration que se ve bien pero rompe la re-creación local causa drift entre local y prod. Ejemplo: `cron_runs` (migration `20260914120000_cron_runs.sql`) existe local pero no en prod; obligó a hacer el fix de RLS con `to_regclass` guards. Testear localmente atrapa el error antes de mergear.

**Cómo aplicar:**

```
supabase db reset
```

Debe correr las 30+ migrations en orden sin error, incluyendo la nueva. Si falla, ajustar la migration antes de commitear.

Si `supabase db reset` no está disponible en la máquina (ej. Nazre no tiene Supabase CLI instalado), al menos leer la migration cuidadosamente y verificar que las FKs, triggers y policies referencian objetos que ya existen en migrations previas.

---

## Template mínimo para migration que crea tabla nueva

```sql
-- <YYYYMMDD>_<slug>.sql
-- Descripción: qué crea esta migration y por qué.

CREATE TABLE public.<tabla> (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  TEXT NOT NULL REFERENCES organizations(portal_email),
  -- ... columnas ...
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices típicos
CREATE INDEX idx_<tabla>_portal_email ON public.<tabla> (portal_email);

-- RLS + GRANT (obligatorios)
ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabla> TO service_role;
-- Solo si portal-client la lee via supabase-js con sesion:
-- GRANT SELECT ON public.<tabla> TO authenticated;
-- CREATE POLICY "<tabla>_portal_read" ON public.<tabla>
--   FOR SELECT TO authenticated
--   USING (portal_email = auth.jwt() ->> 'email');

-- Trigger updated_at (si aplica)
CREATE TRIGGER trg_<tabla>_updated_at
  BEFORE UPDATE ON public.<tabla>
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

COMMENT ON TABLE public.<tabla> IS
  'Acceso solo via service_role (createAdminClient).';
```

---

## Ver también

- `supabase/migrations/20260923120000_enable_rls_on_public_tables.sql` - fix retroactivo de las 18 tablas sin RLS
- `supabase/migrations/20260809010000_enable_rls_admin_tables.sql` - patrón original de RLS + service_role bypass
- `.claude/skills/centinelia-portal-security/SKILL.md` - invariantes de la capa API que asumen este patrón de DB
