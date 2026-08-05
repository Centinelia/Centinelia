# Google Workspace unificado + integración Sheets — Diseño

**Fecha:** 2026-08-04
**Driver:** AC Proyectos (piloto). Ana lleva clientes en Sheets, Ángeles probablemente bitácoras en Sheets.
**Decisión:** Sheets es must-have de plataforma. Se aprovecha para consolidar Gmail + Drive + Sheets bajo una sola tarjeta "Google Workspace" en IntegrationsHub.

## Resumen

Dos cambios en un solo scope:

1. **Refactor UI de IntegrationsHub:** cards separadas de Gmail y Drive se fusionan en una tarjeta unificada "Google Workspace" que muestra qué scopes están concedidos.
2. **Feature nueva Google Sheets:** OAuth (scope añadido al mismo consent), tabla de mapping, servicio, 4 tools registradas en 3 canales, config UI por agente, sync opcional de `crear_lead`.

Fuera de v1 (explícito): sync bidireccional Sheets → tablas Centinelia, templates de sheets al onboarding, formulas/formato/merged cells, Sheets como fuente de campañas outbound.

## Arquitectura

### OAuth

Un solo grant Google con scopes:
- `gmail.modify` / `gmail.send` (ya existentes)
- `drive.file` (ya existente)
- `spreadsheets` (nuevo)

Nuevos usuarios: consent único cubre todo.
Usuarios existentes: al abrir IntegrationsHub verán badge "Nuevo: Hojas de cálculo" en la tarjeta Google Workspace. Botón "Reconectar" dispara re-consent solo si faltan scopes (compara scopes concedidos vs esperados).

### Base de datos

Reutiliza `integration_accounts` existente (una fila por org por provider). Ya guarda scopes concedidos en JSON. La UI agrega el status de scopes para pintar la tarjeta unificada.

Tabla nueva `sheets_mappings`:

```sql
CREATE TABLE sheets_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'clientes','leads','bitacoras','oc','cajas_chicas','custom'
  )),
  custom_purpose_label TEXT, -- required if purpose='custom'
  spreadsheet_id TEXT NOT NULL,
  tab_name TEXT NOT NULL,
  headers JSONB NOT NULL, -- ['Nombre','Telefono',...] detectado de fila 1
  headers_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON sheets_mappings (org_id, purpose)
  WHERE purpose != 'custom';
CREATE UNIQUE INDEX ON sheets_mappings (org_id, custom_purpose_label)
  WHERE purpose = 'custom';
```

Un mapping por (org, propósito) para los reservados; múltiples customs distinguidos por label.

### Servicio

`lib/services/sheets.ts`:

- `getMapping(orgId, purpose)` — retorna la fila o null
- `refreshHeaders(mappingId)` — llama Sheets API `values.get` en `{tab}!1:1`, actualiza `headers` y `headers_synced_at`
- `appendRow(mappingId, data: Record<string,any>)` — mapea `data` a array según `headers` (columnas faltantes → celda vacía; keys de `data` que no matchean header → warning log, no error), llama `values.append`
- `updateRow(mappingId, matchBy: string, matchValue: any, data: Record<string,any>)` — lee todo el tab, encuentra fila donde columna `matchBy = matchValue`, hace `values.update` en esa fila
- `readRange(mappingId, range?)` — default lee todo el tab, retorna array de objects usando headers como keys
- `searchInTab(mappingId, query)` — lee todo el tab, filtra rows donde cualquier valor contenga `query` (case-insensitive)

Todas las funciones capturan errores de Google API y retornan `{ok:true, data}` o `{ok:false, reason, detail}`.

## Tools (registradas en `executor.ts` para voz + chat + correo)

Regla `[[feedback-3channel-tools]]`: toda tool nueva en los 3 canales desde el inicio.

### `sheets_agregar_fila`

```typescript
{
  purpose: 'clientes'|'leads'|'bitacoras'|'oc'|'cajas_chicas'|'custom',
  custom_purpose_label?: string, // required si purpose='custom'
  data: Record<string, any> // ej. { nombre: "Juan", telefono: "555" }
}
```

Retorna `{ok:true, row_number}` o `{ok:false, reason:"sheet_no_configurado"|"headers_mismatch"|...}`.

### `sheets_actualizar_fila`

```typescript
{
  purpose, custom_purpose_label?,
  match_by: string, // columna
  match_value: string,
  data: Record<string, any>
}
```

Retorna `{ok:true, row_number}` o `{ok:false, reason:"row_not_found"|...}`.

### `sheets_leer`

```typescript
{ purpose, custom_purpose_label?, range?: string }
```

Retorna `{ok:true, rows: Record<string,any>[]}`.

### `sheets_buscar`

```typescript
{ purpose, custom_purpose_label?, query: string }
```

Retorna `{ok:true, rows: Record<string,any>[]}`.

### Sync opcional de `crear_lead`

Nuevo bool `voice_agents.sync_leads_to_sheets` (default false). Cuando true y existe mapping con `purpose='leads'` en la org, el executor de `crear_lead` dispara `sheets_agregar_fila` en fire-and-forget después de escribir en `leads_voice`. Fallo se loguea a `agent_learnings` pero no rompe `crear_lead`.

## UI portal

### IntegrationsHub — tarjeta unificada Google Workspace

Reemplaza cards separadas actuales de Gmail y Drive.

```
┌───────────────────────────────────────────┐
│ [G]  Google Workspace         ● Conectado │
│      nazre20@gmail.com                    │
│                                           │
│      ✓ Correo (Gmail)                     │
│      ✓ Archivos (Drive)                   │
│        Almacena documentos generados por  │
│        el agente en formato Word, Excel y │
│        PowerPoint.                        │
│      ✓ Hojas de cálculo (Sheets) — NUEVO  │
│                                           │
│      [Reconectar]  [Desconectar]          │
└───────────────────────────────────────────┘
```

Estados de línea:
- ✓ verde: scope concedido
- ⚠ gris con "Habilitar": scope pendiente (dispara re-consent)
- ● amarillo: token expirado, requiere reconnect

Migración de datos: sin migración necesaria. `integration_accounts` ya tiene filas por (org, provider='google') con scopes concedidos. La UI lee scopes y pinta las líneas.

Deprecación de cards antiguas: eliminar componentes `GmailCard` y `DriveCard` de `IntegrationsHub` reemplazándolos por `GoogleWorkspaceCard`. Un solo commit incluye el swap.

**Patrón replicado para futuro (fuera de v1 pero deja el diseño listo):** tarjeta única "Microsoft 365" agrupará Outlook + OneDrive cuando se implementen scopes múltiples.

### Config del agente — sección "Sheets del negocio"

Nueva subsección en el panel de configuración del agente (mismo panel donde se define KB, horarios, integraciones).

Layout:

- Header: "Sheets del negocio"
- 5 tarjetas fijas (Clientes, Leads, Bitácoras, Órdenes de Compra, Cajas Chicas) + botón "Agregar personalizado"
- Cada tarjeta:
  - Dropdown 1: spreadsheet (poblado con Drive API `files.list?q=mimeType='application/vnd.google-apps.spreadsheet'`)
  - Dropdown 2: tab del spreadsheet elegido (poblado con Sheets API `spreadsheets.get?fields=sheets.properties.title`)
  - Al elegir tab: se llama `refreshHeaders`, se muestran los headers como chips read-only
  - Botón "Re-detectar headers" (invalida cache si el negocio cambió la estructura del sheet)
  - Botón "Desconectar" (borra el mapping)
- Toggle al final: "Sync automático de leads capturados → Sheets" (habilita `sync_leads_to_sheets`)

## Policy engine

Nuevas capabilities registradas en el policy engine (patrón sesión 6):

- `sheets.read` — default `allow`. Read no expone al owner a riesgo material.
- `sheets.write` — default `requires_approval`. Puede bajar a `allow` en el config del agente post-piloto AC. Respeta niveles de autonomía del agente: Observador solo informa, Supervisado avisa cada write, Autónomo ejecuta directo.

Cada tool declara su capability en el registry para que el policy engine intercepte antes de ejecutar.

## Error handling

| Escenario | Comportamiento |
|-----------|----------------|
| Mapping no configurado para `purpose` | Tool retorna `{ok:false, reason:"sheet_no_configurado", purpose}`. LLM le dice al usuario: "Necesitas configurar el sheet de X en el portal." |
| Scope Sheets no concedido | Tool retorna `{ok:false, reason:"scope_missing", scope:"spreadsheets"}`. Bandeja del owner: "Reconecta Google Workspace para habilitar Sheets." |
| Token expirado | Refresh silencioso vía existente. Si refresh falla, marca `integration_accounts.status='expired'`, banner reconnect en portal. Tool retorna `{ok:false, reason:"auth_expired"}`. |
| Headers cambiaron (append falla por count mismatch) | Auto-`refreshHeaders` una vez + retry. Si sigue fallando, retorna `{ok:false, reason:"headers_mismatch"}` y notifica al owner por bandeja. |
| Rate limit Google (Sheets API: 300 read + 300 write / min / project, 60 / user / min) | Retry exponencial (3 intentos: 1s, 3s, 9s). Si sostenido, cae a bandeja `sheets_rate_limit`. |
| Fila no encontrada en `updateRow` | Retorna `{ok:false, reason:"row_not_found", match_by, match_value}`. LLM sugiere al usuario alternativas o crear nueva. |

## Testing

- **Unit** — `lib/services/sheets.ts` con mocks del cliente Google. Cubrir: append con headers exactos, append con keys extra (warning), append con headers faltantes (celda vacía), update por match, search case-insensitive, refresh de headers.
- **Integration** — 1 org de prueba con sheet real de Google. Los 4 flows: append → leer → update → buscar.
- **E2E manual** — config UI (conectar Sheets, mapear "Clientes" a un sheet real, verificar headers detectados) + llamada real a Sofia con "agrega a Fulano de Tal a mi lista de clientes con teléfono 555" y verificar la fila.
- **Piloto controlado** — Ana (AC Proyectos) con su sheet real de clientes en producción.

## Deprecaciones y refactors incluidos

- Componentes `GmailCard` y `DriveCard` en `IntegrationsHub` → borrar
- Nuevo componente `GoogleWorkspaceCard` que consulta scopes de `integration_accounts` y renderiza líneas por capability
- OAuth callback existente sigue funcionando; solo se amplía `expectedScopes` para incluir `spreadsheets`

## Rollout

1. Migration `sheets_mappings` en Supabase
2. Servicio + tools + registro en executor (feature flag off)
3. Refactor de UI: `GoogleWorkspaceCard` reemplaza cards separadas (sin flag — refactor visual limpio)
4. Config UI por agente
5. Feature flag on para org de prueba (Pneuma Studio → Sofia con sheet real)
6. E2E manual completo
7. Feature flag on para AC Proyectos + Ana conecta su sheet real

## Trabajo fuera de scope (para futuro)

- Sync bidireccional Sheets → tablas Centinelia
- Templates de sheets al onboarding (crear sheets pre-llenos por giro)
- Sheets como fuente de campañas outbound
- Google Docs y Slides nativos (crear/editar, no solo generar .docx/.pptx locales)
- Espejo Microsoft 365 (Outlook + OneDrive unificado)
- Formulas, formato condicional, merged cells

## Referencias

- Handoff previo: `handoff_google_sheets_integration.md` en memory
- Handoff piloto: `project_centinelia_ac_proyectos_pilot.md` en memory
- Patrón OAuth multi-tenant: sesión 29 (QuickBooks)
- Patrón capability-centric IntegrationsHub: sesión 6, 33
- Regla 3-canales: `feedback_3channel_tools.md`
