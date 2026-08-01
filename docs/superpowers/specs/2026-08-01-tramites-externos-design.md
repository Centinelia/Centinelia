# Sistema genérico de trámites externos

**Fecha:** 2026-08-01
**Trigger:** Cita con Gobierno de Monterrey pidiendo integración para pre-registro de útiles escolares vía voz + correo. En vez de hardcodear una tool `mty_pre_registrar_utiles`, se decide construir infra reusable para futuras integraciones con gobierno/empresas que expongan APIs de captura de datos.
**Estado:** Diseño aprobado, listo para implementación.

## Contexto

El municipio de Monterrey nos pidió que nuestros empleados digitales puedan hacer el pre-registro del Programa de Útiles Escolares 2026 llamando a una API que ellos van a exponer. El flujo tiene 6 pasos: selección de sede, CURP del estudiante (autocompleta desde padrón), escuela + grado, CURP del adulto (autocompleta), domicilio + contacto, confirmación con folio.

Este patrón (padrón lookup + catálogos + form submission) se va a repetir con otros municipios y otros programas del mismo municipio. También aplica a integraciones con empresas grandes que quieran que Centinelia capture datos por voz/correo.

Hardcodear `mty_pre_registrar_utiles` funciona para un piloto pero:
- En 6 meses tendríamos 8+ tools casi idénticas
- Los LLMs degradan en selección de tool cuando pasan de ~20; Nia ya está en ~15
- 80% del código sería duplicado

Ya tenemos un patrón similar funcionando: encuestas telefónicas (sesión 11) usa una tool `registrar_encuesta` + config por row en DB. La reusamos como referencia arquitectural.

## Objetivos

1. **1 tool genérica en 3 canales** para enviar trámites externos, en vez de N tools por trámite.
2. **Catálogo en DB** de trámites configurables (nombre, endpoints, schema, auth, aviso privacidad, reglas).
3. **Prompt injection dinámico** que muestra al agente solo los trámites activos de SU org, con descripción rica para que sepa cuándo invocarla.
4. **Protocolo de captura crítica** reutilizable para campos sensibles (CURP, email) que reduce la tasa de errores actuales.
5. **Escalación temprana** cuando el endpoint del cliente responde con validación fallida (schema desincronizado).
6. **Path claro a Fase 2**: UI en admin para que Nazre (y eventualmente el cliente) pueda crear trámites sin tocar código.

## No objetivos

- **UI de admin en Fase 1**: la config del primer trámite se hace por migración SQL directa. UI viene después.
- **Múltiples versiones vivas del schema al mismo tiempo**: si el cliente cambia el schema, aplicamos update in-place con detección de errores en submit y escalación.
- **Marketplace público de trámites**: cada trámite es privado del `org_id` que lo posee.
- **Portal del municipio en este spec**: crear la organización + agente Nia dedicada del municipio es paso operativo separado que se hace después de mergear esto.

## Diseño

### Esquema de datos

Tres tablas nuevas.

**`external_tramites`** — catálogo de trámites configurables:

```sql
CREATE TABLE external_tramites (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug                   text NOT NULL,
  nombre_publico         text NOT NULL,
  descripcion_agente     text NOT NULL,
  activo                 boolean NOT NULL DEFAULT true,
  schema_version         integer NOT NULL DEFAULT 1,
  endpoint_base          text NOT NULL,
  auth_config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  campos                 jsonb NOT NULL,
  catalogos              jsonb NOT NULL DEFAULT '[]'::jsonb,
  lookups                jsonb NOT NULL DEFAULT '[]'::jsonb,
  submit                 jsonb NOT NULL,
  reglas_negocio         jsonb NOT NULL DEFAULT '{}'::jsonb,
  aviso_privacidad_texto text,
  aviso_privacidad_url   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX idx_external_tramites_org_active ON external_tramites(org_id, activo);
```

**`external_secrets`** — secrets encriptados vía Supabase Vault:

```sql
CREATE TABLE external_secrets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             text NOT NULL,
  vault_secret_id uuid NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_rotated_at timestamptz,
  UNIQUE (org_id, key)
);
```

**`external_tramites_audit`** — log de cambios al schema (para detección de "quién movió qué"):

```sql
CREATE TABLE external_tramites_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id   uuid NOT NULL REFERENCES external_tramites(id) ON DELETE CASCADE,
  changed_by   text,
  change_type  text NOT NULL,
  before_json  jsonb,
  after_json   jsonb,
  changed_at   timestamptz NOT NULL DEFAULT now()
);
```

**`external_tramites_submissions`** — log de todos los envíos (auditoría + idempotencia):

```sql
CREATE TABLE external_tramites_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id         uuid NOT NULL REFERENCES external_tramites(id),
  org_id             uuid NOT NULL REFERENCES organizations(id),
  agent_id           uuid REFERENCES voice_agents(id),
  call_id            uuid,
  channel            text NOT NULL,
  idempotency_hash   text NOT NULL,
  payload            jsonb NOT NULL,
  response_status    integer,
  response_body      jsonb,
  folio              text,
  status             text NOT NULL,
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tramite_id, idempotency_hash)
);
```

### Formato de `campos` (JSONB)

Array ordenado. Ejemplo para el trámite de Monterrey:

```json
[
  {"key": "sede_id", "tipo": "catalogo_pick", "catalogo": "sedes", "required": true, "orden": 1, "prompt_captura": "Ofrece las sedes disponibles y confirma la elección."},
  {"key": "curp_estudiante", "tipo": "curp", "required": true, "orden": 2, "autocompleta_desde": "padron_estudiante", "prompt_captura": "Captura CURP con protocolo crítico. Si el padrón regresa datos, confírmalos."},
  {"key": "nombre_estudiante", "tipo": "string", "required": true, "orden": 3, "source": "padron_estudiante.nombre"},
  {"key": "apellido_paterno_estudiante", "tipo": "string", "required": true, "orden": 4, "source": "padron_estudiante.apellido_paterno"},
  {"key": "apellido_materno_estudiante", "tipo": "string", "required": true, "orden": 5, "source": "padron_estudiante.apellido_materno"},
  {"key": "fecha_nacimiento_estudiante", "tipo": "fecha", "required": true, "orden": 6, "source": "padron_estudiante.fecha_nacimiento"},
  {"key": "escuela_id", "tipo": "catalogo_search", "catalogo": "escuelas", "required": true, "orden": 7},
  {"key": "grado_id", "tipo": "catalogo_pick", "catalogo": "grados", "depende_de": "escuela_id", "required": true, "orden": 8},
  {"key": "curp_adulto", "tipo": "curp", "required": true, "orden": 9, "autocompleta_desde": "padron_adulto"},
  {"key": "nombre_adulto", "tipo": "string", "required": true, "orden": 10, "source": "padron_adulto.nombre"},
  {"key": "apellido_paterno_adulto", "tipo": "string", "required": true, "orden": 11, "source": "padron_adulto.apellido_paterno"},
  {"key": "apellido_materno_adulto", "tipo": "string", "required": true, "orden": 12, "source": "padron_adulto.apellido_materno"},
  {"key": "calle", "tipo": "string", "required": true, "orden": 13},
  {"key": "numero", "tipo": "string", "required": true, "orden": 14},
  {"key": "codigo_postal", "tipo": "cp", "required": true, "orden": 15, "prompt_captura": "Pide CP primero para acotar colonias."},
  {"key": "municipio_id", "tipo": "catalogo_search", "catalogo": "municipios", "required": true, "orden": 16},
  {"key": "colonia_id", "tipo": "catalogo_pick", "catalogo": "colonias", "depende_de": "codigo_postal", "required": true, "orden": 17},
  {"key": "telefono", "tipo": "telefono_mx", "required": true, "orden": 18},
  {"key": "correo", "tipo": "email", "required": false, "orden": 19, "prompt_captura": "Ofrece opción de recibir el folio por correo. Si acepta, captura con confirmación letra por letra o pide que el ciudadano lo mande por WhatsApp/SMS desde su teléfono."},
  {"key": "parentesco", "tipo": "catalogo_pick", "catalogo": "parentescos", "required": true, "orden": 20},
  {"key": "acepta_aviso_privacidad", "tipo": "consentimiento", "required": true, "orden": 21}
]
```

Tipos soportados: `string`, `curp`, `cp`, `email`, `telefono_mx`, `fecha`, `catalogo_pick`, `catalogo_search`, `consentimiento`. Cada uno tiene handler específico en el protocolo de captura.

Valores válidos para `not_found_action` en `lookups`: `"reject"` (termina el flujo educadamente si el CURP no está en padrón) o `"continue_manual"` (permite al agente capturar los datos a mano; requiere `reglas_negocio.allow_manual_capture_on_padron_miss: true`).

### Formato de `catalogos` (JSONB)

```json
[
  {"key": "sedes", "endpoint": "/sedes", "method": "GET", "response_items_path": "data", "item_fields": {"id": "id", "label": "nombre", "extra": ["direccion", "fechas", "horario"]}},
  {"key": "escuelas", "endpoint": "/escuelas", "method": "GET", "query_param": "q", "min_query_length": 3, "response_items_path": "data", "item_fields": {"id": "id", "label": "nombre", "extra": ["turno", "nivel"]}},
  {"key": "grados", "endpoint": "/escuelas/{escuela_id}/grados", "method": "GET", "response_items_path": "data", "item_fields": {"id": "id", "label": "nombre"}},
  {"key": "municipios", "endpoint": "/catalogos/municipios", "method": "GET", "response_items_path": "data", "item_fields": {"id": "id", "label": "nombre"}},
  {"key": "colonias", "endpoint": "/catalogos/colonias", "method": "GET", "query_param": "cp", "response_items_path": "data", "item_fields": {"id": "id", "label": "nombre"}},
  {"key": "parentescos", "endpoint": "/catalogos/parentescos", "method": "GET", "response_items_path": "data", "item_fields": {"id": "id", "label": "nombre"}}
]
```

### Formato de `lookups` (JSONB)

```json
[
  {"key": "padron_estudiante", "endpoint": "/padron/estudiante", "method": "GET", "query_param": "curp", "response_fields": {"nombre": "nombre", "apellido_paterno": "apellido_paterno", "apellido_materno": "apellido_materno", "fecha_nacimiento": "fecha_nacimiento"}, "not_found_action": "reject"},
  {"key": "padron_adulto", "endpoint": "/padron/adulto", "method": "GET", "query_param": "curp", "response_fields": {"nombre": "nombre", "apellido_paterno": "apellido_paterno", "apellido_materno": "apellido_materno"}, "not_found_action": "reject"}
]
```

### Formato de `submit` (JSONB)

```json
{
  "endpoint": "/pre-solicitud",
  "method": "POST",
  "response_folio_path": "folio",
  "response_success_status": [200, 201]
}
```

### Formato de `reglas_negocio` (JSONB)

```json
{
  "allow_manual_capture_on_padron_miss": false,
  "max_registros_por_sesion": 1,
  "ventana_atencion": {"desde": "07:00", "hasta": "20:00", "tz": "America/Monterrey"}
}
```

### Formato de `auth_config` (JSONB)

```json
{"type": "bearer", "secret_key": "mty_utiles_api_key"}
```

Tipos soportados: `bearer`, `api_key_header` (con `header_name`), `oauth_client_credentials` (con `token_endpoint`), `none`.

### Tools expuestas al agente

Tres tools nuevas, todas registradas en voz + chat + correo desde day 1 (regla `feedback_3channel_tools`):

**1. `consultar_catalogo_externo(tramite_id, catalogo_key, filtros?)`**

Para dropdowns y búsquedas (sedes, escuelas por texto, colonias por CP, etc.).

Regresa lista de items con `{id, label, extra}`. Máximo 20 items para no saturar el LLM. Si hay más, retorna `truncated: true` y sugiere refinar filtros.

**2. `buscar_en_padron_externo(tramite_id, lookup_key, valor)`**

Para autocompletar por CURP u otro identificador.

Regresa `{found: boolean, data: {...}}`. Si no encontrado, `data: null` y el agente decide según `reglas_negocio.allow_manual_capture_on_padron_miss`.

**3. `enviar_tramite_externo(tramite_id, campos)`**

Envío final. Valida contra `campos` requeridos, calcula idempotency hash, ejecuta POST al endpoint.

Regresa `{success: boolean, folio?: string, error?: string, retry_field?: string}`.

Si `error` es de validación, `retry_field` indica qué campo pedir de nuevo. Si es otro error (5xx, timeout), tras 1 reintento con backoff escala a `pedir_a_humano` con contexto completo.

### Prompt injection dinámico

Al build-time del system prompt (en `buildSystemPrompt` o su equivalente), para cada org se hace:

```typescript
const tramites = await getActiveTramitesForOrg(orgId);
if (tramites.length > 0) {
  const section = renderTramitesSection(tramites);
  systemPrompt += "\n\n" + section;
}
```

`renderTramitesSection` genera markdown tipo:

```markdown
## Trámites externos que puedes gestionar

Cuando el ciudadano solicite uno de estos servicios, síguelo paso a paso.

### {nombre_publico} (id: {id})
{descripcion_agente}

Aviso de privacidad: lee al ciudadano el siguiente texto ANTES de capturar cualquier dato personal, y confirma que acepta:
"{aviso_privacidad_texto}"

Si pide el documento completo, envíalo: {aviso_privacidad_url}

Pasos de captura (en orden):
1. {campos[0].prompt_captura || descripción auto-generada del tipo/catalogo}
2. ...

Si algún CURP no se encuentra en padrón: {según reglas_negocio}

Al terminar la captura completa, llama `enviar_tramite_externo` con tramite_id="{id}" y todos los campos capturados. Comunica el folio al ciudadano.
```

Para orgs sin trámites activos, la sección no se agrega (cero overhead de tokens).

### Protocolo de captura crítica de CURP

Reglas cargadas al system prompt cuando el trámite requiere tipo `curp`:

1. **Dictado en 3 bloques**: 4 letras / 6 números (fecha AAMMDD) / 8 alfanuméricos
2. **Alfabeto fonético mexicano** para letras confusas: B como Barcelona, V como Venezuela, M como México, N como Norte, D como Delta, T como Tango, P como Papá, F como Francia, S como Sierra, C como Carlos, Z como Zapato, G como Guadalajara, J como José
3. **Doble lectura obligatoria** antes de confirmar cada bloque
4. **TTS con parámetros ajustados** en modo captura: `speed: 0.85`, `stability: 0.75` (via Vapi assistantOverrides o inline directive en prompt)
5. **Validación local** del formato CURP (regex: `^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$`) antes de mandarlo al padrón

Similar aplica para `email` (deletreo con dominio conocido) y `telefono_mx` (agrupación 3-3-4).

### Manejo de errores en submit

Cuando `enviar_tramite_externo` recibe error del endpoint del cliente:

| Status del endpoint | Acción |
|---|---|
| 422 validación de schema | Tool responde al agente con `retry_field` o "hay un problema con los datos, un compañero humano toma el caso"; se registra en `external_tramites_submissions` con `status='schema_mismatch'`; se dispara `pedir_a_humano` |
| 429 rate limit | Backoff exponencial, 2 reintentos, si falla escala |
| 5xx server error | 1 reintento con backoff, si falla escala |
| Timeout (>10s) | 1 reintento, si falla escala |
| 200/201 pero sin `folio` | Escala inmediato (respuesta inesperada) |

En cualquier escalación, el humano ve en el ticket: qué trámite, qué campos se capturaron, qué respondió el endpoint, transcript de la llamada.

Notificación automática al owner de la org cuando hay 3+ fallos de schema en 24h (posible cambio del schema del cliente sin avisarnos).

### Idempotencia

`idempotency_hash = sha256(tramite_id + curp_estudiante + sede_id + fecha_YYYYMMDD)` (o los campos que definan unicidad en `reglas_negocio.idempotency_fields`).

Antes de POST al endpoint del cliente, verificamos en `external_tramites_submissions`. Si ya existe una row con ese hash y `status='success'`, regresamos el folio existente sin re-invocar. Esto protege contra llamadas cortadas + reintento.

### Testing

**Modo mock**: variable env `EXTERNAL_TRAMITES_MOCK_MODE=true` en dev/preview. En vez de llamar al endpoint real, cargan fixtures desde `fixtures/tramites/{slug}/`. Estructura:

```
fixtures/tramites/mty-utiles-2026/
├── catalogos/
│   ├── sedes.json
│   ├── escuelas.json
│   └── ...
├── lookups/
│   ├── padron_estudiante_HIT.json
│   ├── padron_estudiante_MISS.json
│   └── ...
└── submit/
    ├── success.json
    └── validation_error.json
```

**Golden tests**: 5 escenarios en el framework de pilar 4:
1. Feliz path completo (todos los CURPs en padrón)
2. CURP estudiante mal dictado 2 veces, corregido al tercer intento
3. CURP no encontrado en padrón, agente escala según reglas
4. Ciudadano pide registrar 2 estudiantes (según `max_registros_por_sesion`)
5. Endpoint 5xx en submit, agente escala vía `pedir_a_humano`

Rubric mide: tasa de captura correcta por campo, tasa de completion, latencia de cierre, si escaló apropiadamente.

### Paridad 3 canales

**Voz**: flujo conversacional guiado. Protocolo de captura crítica activo. Confirmación por voz al final.

**Chat**: mismo tool. No aplica protocolo de voz (hay pantalla). El agente confirma con card visual antes de submit.

**Correo**: el agente parsea el correo entrante, extrae los campos que pueda con regex + LLM. Si le faltan datos, responde pidiendo los específicos. Si tiene todo, ejecuta submit y responde con el folio.

## Path a Fase 2

Post-piloto (después de validar con Monterrey):

- UI en admin (`/admin/tramites`) para CRUD de trámites con form builder
- UI para gestionar `external_secrets` con rotación
- Endpoint del cliente configurable como "prueba" antes de activar (call endpoints, valida responses)
- Métricas por trámite: tasa de éxito, tasa de escalación, campo más problemático
- Eventual exposición al portal del cliente: "conecta tu propio sistema en 10 minutos"

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Municipio cambia schema sin avisar | Detección temprana en submit + alerta al 3er fallo + escalación inmediata |
| Endpoint del municipio lento (>500ms) | Los catálogos se pueden cachear en memoria por 5 min (Redis o in-process); lookups no se cachean (datos personales) |
| Secrets filtrados en logs | Nunca serializar `auth_config` con secret resuelto; siempre por referencia + resolución en runtime del backend |
| LLM alucina un `tramite_id` inexistente | El tool valida que el `tramite_id` esté en la lista de trámites activos de la org del agente; si no, error inmediato con mensaje al agente |
| CURP capturado mal se envía a padrón real | Validación local de formato + doble lectura + protocolo fonético reducen el riesgo, pero no lo eliminan. El endpoint del padrón regresa "not found" en la mayoría de casos con typos y ahí re-captura |
| Idempotencia falla si el ciudadano llama 2 veces el mismo día | Hash incluye fecha, así llamadas del mismo día se dedupean; llamadas de días distintos son legítimas (padre re-registra por corrección) |

## Migración inicial (piloto Monterrey)

Una vez implementada la infra:

1. Crear org del municipio en admin (paso operativo separado, no cubierto por este spec)
2. Crear agente Nia dedicado para el municipio con número asignado
3. Correr migración SQL con la row inicial de `external_tramites`:
   - `slug: 'mty-pre-registro-utiles-2026'`
   - `endpoint_base` de test/sandbox del municipio
   - `campos`, `catalogos`, `lookups`, `submit` según lo que el municipio nos entregue en su documentación
   - `auth_config` con `secret_key: 'mty_utiles_api_key'`
   - `activo: false` inicialmente
4. Cargar secret vía CLI o script directo al vault
5. Probar en modo `EXTERNAL_TRAMITES_MOCK_MODE=true` con Sofía primero
6. Golden tests calibrados
7. Prueba end-to-end contra sandbox del municipio con Nazre + Sergio haciendo llamadas de prueba
8. Activar (`activo: true`) y liberar el número al municipio para que ellos hagan pruebas
9. Ir al piloto real
