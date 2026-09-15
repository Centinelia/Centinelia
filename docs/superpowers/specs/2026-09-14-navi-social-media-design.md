# Navi — Meerkat social/creativo (Canva + Instagram)

**Fecha:** 2026-09-14
**Autor:** Nazre + Claude (brainstorming)
**Estado:** Diseño aprobado en chat, spec para review
**Cliente kickstart:** confirmado, paga setup fee

## 1. Motivación

Cliente actual pidió apoyo con proceso creativo en Canva y publicación de reels en Instagram (agendar poco a poco). Análisis de mercado interno: es un dolor genérico de PyME, no específico del cliente. Aplican las 5 reglas de [tool-bloat](../../../.claude/projects/C--Users-Nazre/memory/feedback_tool_bloat_reglas.md): rol nuevo (no sumar a Nelia/Niva), adapter pattern obligatorio, feature flag por org, filtro producto vs custom aprobado como *producto*.

Este spec define **Navi**, meerkat social/creativo con dos variantes de rol:

- **`role='navi'`** (Navi estándar) — 1 cuenta IG, preset de 14 tools. Para PyME single-brand.
- **`role='navi_agencia'`** (Navi Agencia) — multi-cuenta IG (tope 20 en v1) con guardarraíles de aislamiento, preset ampliado con `target_account_id` obligatorio. Para agencias de marketing que gestionan múltiples clientes/marcas.

Ambos comparten adapters (Canva Connect API + Meta Graph API), tablas, crons y App Review Meta. Diferencian el shape de las tools, la UI del portal, el pricing, y el feature flag de activación por org.

El **cliente kickstart es agencia**, por lo que la primera implementación usa `role='navi_agencia'`. Navi estándar sale en paralelo porque el 90% del código es compartido.

## 2. Non-goals

- **Diseño desde cero.** Navi rellena brand templates hechas por humano en Canva. No genera arte libre.
- **Edición de video con criterio artístico.** Navi no edita video. Fuentes válidas de video: (a) Canva video templates con autofill, (b) video que el cliente le manda a Navi por correo, chat o upload en portal. Programmatic video (Creatomate/Shotstack) queda para v2 si demanda lo justifica.
- **TikTok / LinkedIn / X.** v1 solo Instagram (Facebook viene gratis porque comparte Meta Graph API). Otros adapters se agregan sobre el mismo `SocialPublisher` interface.
- **Multi-cuenta por Navi estándar.** Regla: **`role='navi'` gestiona 1 cuenta IG**. Para el caso de agencia de marketing existe una variante distinta `role='navi_agencia'` que sí gestiona múltiples cuentas IG (ver Sección 5.1). No se mezclan: cliente PyME single-brand contrata Navi estándar; cliente agencia contrata Navi Agencia.
- **Publicación totalmente autónoma sin approval.** Modelo es Nivel B con toques C, definidos por slot del calendario editorial. Nunca "publica cualquier cosa sola".
- **Auto-pausa por crisis.** Cuando `sentiment=crisis` Navi NO se pausa sola. Alerta urgente al cliente y espera decisión humana. El cliente decide si pausar o no. Autonomía tiene tope: nunca acciones destructivas sin humano.

## 3. Modelo de autonomía

**Nivel B baseline** con toques de C selectivos. La granularidad de la autonomía vive en el **calendario editorial**: cada slot declara `auto_publish: true|false`.

### 3.1 Requieren aprobación humana (Level B core)

- Posts nuevos con caption o imagen custom (no recurrentes)
- Reels con contenido nuevo
- Respuestas a comentario/DM con sentiment negativo, ambiguo o crisis
- Cambios al calendario editorial (agregar/quitar/mover slots)
- Historias personalizadas fuera de plantilla

### 3.2 Autónomo con guardarraíles (Level C touches)

- Posts recurrentes cuyo slot tiene `auto_publish: true` (ej. "horarios cada lunes 8am", "recordatorio de promo activa cada viernes")
- Respuestas a comentarios positivos con templates pre-aprobados (agradecimientos, respuestas a preguntas frecuentes cuya respuesta está en KB con confianza alta)
- Respuestas a DMs de baja fricción con templates (horarios, ubicación, precios listados, "gracias por escribir")
- Snapshot de métricas + alerta si detecta anomalía (caída de engagement, spike negativo)
- Reagendar hora dentro del mismo día si detecta baja actividad histórica en el slot original (con notificación al cliente, no requiere approval)

### 3.3 Kill switch

Dos niveles de pause, según variante:

**Navi estándar (por Navi)**: campo `voice_agents.metadata.social.paused` boolean. Al setearse true:
- Cron `publish-scheduled-posts` skipea drafts scheduled de ese Navi
- Navi rechaza nuevos `publicar_ahora` / `programar_publicacion`
- Sí sigue generando drafts, respondiendo DMs con approval, y reportando métricas

**Navi Agencia (por cuenta dentro del Navi)**: campo `social_accounts.paused` boolean. Al setearse true en una cuenta específica:
- Cron skipea drafts scheduled cuya `social_account_id` está pausada
- Navi Agencia rechaza publicar en esa cuenta específica, otras cuentas del mismo Navi siguen operando
- Sí sigue trabajando en las cuentas no pausadas

Ambos toggles siempre visibles en el header del portal. Al reactivar, drafts vencidos se marcan `status=cancelled` con `error_message='Skipped during pause window'` y notifica al cliente.

Además existe un master feature toggle a nivel org: `organizations.features.social_publishing = { enabled: bool, agency_mode: bool }`. Si `enabled=false`, todos los Navis del org están inactivos (safeguard de emergencia).

Diseñado para que cliente pueda pausar en 1 clic ante crisis (mención negativa viral, evento inesperado, incidente PR). Nunca se pausa sola: cliente decide (ver Sección 7.1).

## 4. Arquitectura

### 4.1 Adapters

**`CanvaProvider`** en `src/lib/social/canva.ts`:
- OAuth 2.0 (Canva Connect API scopes: `design:content:read`, `design:content:write`, `asset:read`, `asset:write`, `brandtemplate:content:read`, `brandtemplate:meta:read`)
- Métodos: `listBrandTemplates()`, `autofillTemplate(templateId, dataFields)`, `getDesign(designId)`, `exportDesign(designId, format: 'png'|'jpg'|'mp4'|'pdf')`, `uploadAsset(fileBuffer, mimeType)`
- Rate limit: retry con backoff exponencial, cache preview_url por 24h

**`SocialPublisher`** interface en `src/lib/social/publishers/index.ts`:
```ts
interface SocialPublisher {
  provider: 'meta' | 'tiktok' | 'linkedin'
  createMediaContainer(input: MediaInput): Promise<{ containerId: string }>
  waitForContainerReady(containerId: string, timeoutMs?: number): Promise<'ready' | 'error'>
  publishContainer(containerId: string): Promise<{ mediaId: string; permalink: string }>
  fetchMetrics(mediaId: string): Promise<PostMetrics>
  replyToComment(commentId: string, message: string): Promise<void>
  replyToDm(threadId: string, message: string): Promise<void>
  listRecentComments(mediaId: string, sinceMs: number): Promise<Comment[]>
  listRecentDms(sinceMs: number): Promise<Dm[]>
}
```

**`MetaPublisher`** en `src/lib/social/publishers/meta.ts`:
- Instagram Graph API v18+
- Endpoints usados: `POST /me/media` (crea container), `GET /{container-id}?fields=status_code` (poll), `POST /me/media_publish` (publica), `GET /{ig-user-id}/media` (lista posts), `GET /{media-id}/insights` (métricas), `POST /{comment-id}/replies` (responde comentario), Messaging API `POST /me/messages` (DMs)
- Requiere: IG Business/Creator + linkeada a FB Page + App Meta con `instagram_content_publish` + `instagram_manage_comments` + `instagram_manage_insights` + `pages_show_list` + `pages_read_engagement` + `pages_manage_metadata` + `business_management` + `instagram_manage_messages`

### 4.2 Tablas Supabase nuevas

**`social_accounts`** — cuentas IG/FB conectadas por org. Patrón alineado con `integration_accounts`. Para Navi estándar, la relación con `voice_agents` es 1:1. Para Navi Agencia, es 1:N (un Navi Agencia se relaciona con hasta 20 `social_accounts`).
```sql
create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  portal_email text not null references organizations(portal_email),
  agent_id uuid references voice_agents(id) on delete set null,
  provider text not null check (provider in ('meta_instagram', 'meta_facebook')),
  external_account_id text not null,  -- IG user id / FB page id
  external_username text,              -- @handle visible
  page_id text,                        -- FB page linkeada (para IG)
  brand_summary text,                  -- resumen de brand voice para prompt LLM
  denylist_words text[] default '{}',  -- palabras bloqueadas específicas de esta cuenta
  paused boolean default false,        -- kill switch por cuenta (Navi Agencia)
  paused_reason text,
  paused_at timestamptz,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','needs_reauth','disconnected')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (portal_email, provider, external_account_id)
);
-- Constraint runtime (via trigger o validación en app):
-- Si voice_agents.role='navi', máximo 1 social_account por agent_id.
-- Si voice_agents.role='navi_agencia', máximo 20 social_accounts por agent_id.
```

**`brand_templates`** — plantillas Canva registradas por org.
```sql
create table brand_templates (
  id uuid primary key default gen_random_uuid(),
  portal_email text not null references organizations(portal_email),
  canva_template_id text not null,
  name text not null,
  category text not null check (category in ('post','reel','story','carousel')),
  data_fields jsonb not null,  -- [{name, type, required, default_value?}]
  preview_url text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (portal_email, canva_template_id)
);
```

**`content_drafts`** — posts en cualquier estado del pipeline.
```sql
create table content_drafts (
  id uuid primary key default gen_random_uuid(),
  portal_email text not null references organizations(portal_email),
  agent_id uuid not null references voice_agents(id),
  template_id uuid references brand_templates(id) on delete set null,
  social_account_id uuid not null references social_accounts(id),
  slot_id uuid references editorial_calendar_slots(id),
  media_urls text[] not null default '{}',
  caption text,
  hashtags text[] default '{}',
  media_type text not null check (media_type in ('image','carousel','reel','story')),
  scheduled_for timestamptz,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','scheduled','publishing','published','rejected','failed','cancelled')),
  auto_publish boolean default false,  -- copiado del slot al momento de crear
  navi_reasoning text,                  -- por qué Navi propuso este post
  approved_by text,                     -- email del portal_user que aprobó
  approved_at timestamptz,
  published_media_id text,              -- IG media id post-publicación
  published_permalink text,
  published_at timestamptz,
  error_message text,
  retry_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on content_drafts (portal_email, status);
create index on content_drafts (scheduled_for) where status in ('approved','scheduled');
```

**`editorial_calendars`** + **`editorial_calendar_slots`** — calendario aprobado con slots.

**Nota de orden de migración:** crear `social_accounts` → `brand_templates` → `editorial_calendars` → `editorial_calendar_slots` → `content_drafts` → `user_media_uploads` → `social_metrics` → `social_interactions`. Las FKs de `content_drafts` dependen de las 4 anteriores; `user_media_uploads` referencia `content_drafts`.

```sql
create table editorial_calendars (
  id uuid primary key default gen_random_uuid(),
  portal_email text not null references organizations(portal_email),
  month date not null,  -- primer día del mes
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz default now(),
  unique (portal_email, month)
);

create table editorial_calendar_slots (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references editorial_calendars(id) on delete cascade,
  template_id uuid references brand_templates(id) on delete set null,
  scheduled_for timestamptz not null,
  theme text,                          -- "promo lunes", "tip semanal", "recordatorio horarios"
  recurring_rule text,                 -- rrule si es recurrente
  auto_publish boolean default false,  -- Level C touch: si true, Navi publica sin approval
  data_fields_defaults jsonb default '{}'::jsonb,  -- pre-fill de campos si aplica
  created_at timestamptz default now()
);
create index on editorial_calendar_slots (scheduled_for);
```

**`social_metrics`** — snapshots temporales por post.
```sql
create table social_metrics (
  id uuid primary key default gen_random_uuid(),
  content_draft_id uuid not null references content_drafts(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  snapshot_type text not null check (snapshot_type in ('24h','7d','30d')),
  impressions int,
  reach int,
  likes int,
  comments int,
  shares int,
  saves int,
  plays int,        -- para reels
  raw_response jsonb,
  unique (content_draft_id, snapshot_type)
);
```

**`user_media_uploads`** — video/imagen que el cliente le envía a Navi por correo, chat o upload directo.
```sql
create table user_media_uploads (
  id uuid primary key default gen_random_uuid(),
  portal_email text not null references organizations(portal_email),
  agent_id uuid not null references voice_agents(id),
  source text not null check (source in ('email','chat','portal_upload')),
  source_message_id text,              -- id del correo/mensaje origen
  file_url text not null,              -- Supabase Storage signed URL
  file_type text not null,             -- video/mp4, image/jpeg, etc.
  file_size_bytes bigint,
  duration_seconds int,                -- solo video
  dimensions text,                     -- "1080x1920"
  status text not null default 'available' check (status in ('available','used','expired','deleted')),
  used_in_draft_id uuid references content_drafts(id) on delete set null,
  cliente_note text,                    -- texto que acompañó el video ("úsalo para el reel del viernes")
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '90 days')
);
create index on user_media_uploads (portal_email, status);
```

**`social_interactions`** — comentarios y DMs manejados por Navi (audit trail).
```sql
create table social_interactions (
  id uuid primary key default gen_random_uuid(),
  portal_email text not null,
  social_account_id uuid not null references social_accounts(id),
  content_draft_id uuid references content_drafts(id) on delete set null,
  interaction_type text not null check (interaction_type in ('comment','dm')),
  external_id text not null,           -- comment id o thread id
  external_from text,                   -- @handle
  incoming_text text not null,
  sentiment text check (sentiment in ('positive','neutral','negative','crisis')),
  navi_response text,
  response_status text not null check (response_status in ('auto_replied','pending_approval','escalated_to_human','ignored')),
  approved_by text,
  responded_at timestamptz,
  created_at timestamptz default now(),
  unique (external_id, interaction_type)
);
```

### 4.3 Endpoints nuevos

**Portal API:**
- `GET /api/portal/[token]/social/accounts` — lista cuentas conectadas
- `POST /api/portal/[token]/social/accounts/connect` — inicia OAuth
- `DELETE /api/portal/[token]/social/accounts/[id]` — desconecta
- `GET /api/portal/[token]/social/templates` — lista brand templates
- `POST /api/portal/[token]/social/templates/sync` — sincroniza desde Canva
- `GET /api/portal/[token]/social/drafts` — bandeja (filtro por status)
- `PATCH /api/portal/[token]/social/drafts/[id]` — aprobar/rechazar/editar
- `GET /api/portal/[token]/social/calendar/[month]` — calendario editorial
- `PUT /api/portal/[token]/social/calendar/[month]` — actualiza calendario
- `POST /api/portal/[token]/social/calendar/[month]/approve` — cliente aprueba mes
- `GET /api/portal/[token]/social/metrics` — métricas agregadas
- `POST /api/portal/[token]/social/pause` — kill switch
- `POST /api/portal/[token]/social/resume` — reanudar

**OAuth callbacks:**
- `GET /api/auth/canva-callback`
- `GET /api/auth/meta-callback`

**Voice/chat tools (todas las de Navi):**
- `POST /api/voice/tools/canva_listar_plantillas`
- `POST /api/voice/tools/canva_generar_diseño`
- `POST /api/voice/tools/canva_exportar`
- `POST /api/voice/tools/generar_caption`
- `POST /api/voice/tools/generar_hashtags`
- `POST /api/voice/tools/crear_borrador_post`
- `POST /api/voice/tools/programar_publicacion`
- `POST /api/voice/tools/publicar_ahora`
- `POST /api/voice/tools/ig_responder_comentario`
- `POST /api/voice/tools/ig_responder_dm`
- `POST /api/voice/tools/consultar_metricas_post`
- `POST /api/voice/tools/proponer_calendario_editorial`

**Crons:**
- `GET /api/cron/publish-scheduled-posts` — cada 5 min
- `GET /api/cron/refresh-social-metrics` — cada 1 h
- `GET /api/cron/monitor-social-interactions` — cada 10 min (pull nuevos comentarios/DMs, aplica sentiment gate)

## 5. Tools de Navi (detalle)

Todas gated por `social_publishing`. Todas cumplen [voice+chat+email](../../../.claude/projects/C--Users-Nazre/memory/feedback_tool_3_canales.md).

| # | Tool | Ops | Descripción |
|---|------|-----|-------------|
| 1 | `canva_listar_plantillas` | 0 | Retorna brand templates activas de la org, filtradas por categoría opcional |
| 2 | `canva_generar_diseño` | 2 | Autofill sobre `templateId` + `dataFields`, retorna `designId` + `previewUrl` |
| 3 | `canva_exportar` | 1 | Exporta `designId` a PNG/JPG/MP4/PDF, retorna URL firmada 24h |
| 4 | `generar_caption` | 1 | Usa `extraer_tono_de_marca` de Niva + KB + tema. Retorna 3 opciones |
| 5 | `generar_hashtags` | 1 | Mix branded + niche + trending. Retorna 15-30 hashtags rankeados |
| 6 | `crear_borrador_post` | 2 | Persiste en `content_drafts`. Si `slot_id` presente y `slot.auto_publish=true` → status=`approved`. Sin slot o slot con `auto_publish=false` → status=`pending_approval`. Drafts ad-hoc (sin slot) siempre requieren approval |
| 7 | `programar_publicacion` | 1 | Solo drafts approved/auto. Setea `scheduled_for` |
| 8 | `publicar_ahora` | 1 | Solo drafts approved/auto. Dispara Meta API inmediato |
| 9 | `ig_responder_comentario` | 1 | Guardarraíl sentiment obligatorio. Si negativo/crisis, escala |
| 10 | `ig_responder_dm` | 1 | Guardarraíl sentiment + template match. Fallback a escalate |
| 11 | `consultar_metricas_post` | 0 | Lee `social_metrics` cacheado, fallback a Graph API si stale |
| 12 | `proponer_calendario_editorial` | 5 | Genera propuesta mensual, retorna slots. Cliente aprueba |
| 13 | `listar_media_del_cliente` | 0 | Lista `user_media_uploads` disponibles del cliente (video/imagen enviados por correo/chat/upload) |
| 14 | `usar_media_del_cliente` | 1 | Toma un `user_media_uploads.id`, lo marca `used`, y lo mete como `media_urls` en el borrador que Navi está construyendo |

**Nota:** subimos a 14 tools. Sigue dentro del cap de 12-15 según [tool-bloat rule](../../.brain/policies/tool-completeness.md).

### 5.1 Variante `role='navi_agencia'` — tools con multi-cuenta

Navi Agencia hereda todas las tools de la Sección 5 pero con cambios:

**Tools con `target_account_id` obligatorio**: cada tool que crea, publica, programa o interactúa con una cuenta requiere `target_account_id: uuid` como parámetro. LLM está forzado por schema a especificarlo antes de cada acción. Aplica a: `canva_generar_diseño`, `crear_borrador_post`, `programar_publicacion`, `publicar_ahora`, `ig_responder_comentario`, `ig_responder_dm`, `consultar_metricas_post`, `proponer_calendario_editorial`.

**Tools nuevas exclusivas de `navi_agencia`** (2 extras, total 16):

| # | Tool | Ops | Descripción |
|---|------|-----|-------------|
| 15 | `listar_cuentas_gestionadas` | 0 | Retorna todas las cuentas IG que este Navi Agencia gestiona (nombre, @handle, estado, próxima publicación) |
| 16 | `replicar_contenido_entre_cuentas` | 3 | Toma un post publicado en cuenta A, propone variante adaptada para cuentas B, C, D. Cada variante ajusta caption/hashtags al brand de la cuenta destino. Devuelve N drafts pending_approval (uno por cuenta destino) |

**Prompt del LLM en Navi Agencia** incluye:
- Lista de cuentas gestionadas con @handle + brand summary por cuenta
- Regla explícita: "SIEMPRE especifica `target_account_id` antes de ejecutar cualquier tool. Nunca asumas una cuenta por default. Si el cliente no indicó cuenta, pregunta explícitamente."
- Contexto de brand voice por cuenta cargado dinámicamente cuando `target_account_id` es setado

**Guardarraíles de aislamiento**:
- Validación server-side: si `target_account_id` no pertenece a las `social_accounts` del `agent_id`, rechaza con error `ACCOUNT_NOT_MANAGED`
- Audit log: cada acción registra `target_account_id` prominente
- Kill switch **por cuenta dentro del Navi Agencia**: `social_accounts.paused = true` pausa publicación solo de esa cuenta, otras cuentas del mismo Navi Agencia siguen operando
- Denylist y content safety configurable por cuenta (no compartida a nivel Navi)

**Tope de cuentas por Navi Agencia**: 20 en v1. Cliente con >20 cuentas contrata un 2o Navi Agencia. Este tope evita saturación del contexto LLM y limita blast radius de un bug.

### 5.2 Ingesta de video/imagen del cliente

Fuentes de media además de Canva:
1. **Correo**: el cliente le envía correo a Navi (`navi-<slug>@<org-domain>` o su bandeja) con un video adjunto y texto tipo "úsalo para el reel del viernes 8pm". Inbox-processor detecta adjunto de tipo `video/*` o `image/*`, sube a Supabase Storage bucket `user-media`, crea row en `user_media_uploads` con `source='email'` y `cliente_note=<cuerpo del correo>`.
2. **Chat**: cliente sube video/imagen en el chat con Navi vía portal. Endpoint `POST /api/portal/[token]/agent-chat/upload` acepta multipart, sube a storage, crea row `source='chat'`.
3. **Portal upload directo**: sección `Redes → Mi media` en portal permite subir archivos sin tener chat abierto. `source='portal_upload'`.

Navi al recibir cualquier media hace 1 de 3 cosas:
- Si hay `cliente_note` con instrucción clara → crea borrador con esa media + caption sugerida según instrucción → pending_approval (o approved si slot auto).
- Si no hay instrucción → guarda como `available`, notifica en chat "Recibí tu video, ¿lo usas para algo específico?" y espera respuesta.
- Si el video es de baja calidad (resolución <720p, duración >90s para reel, formato no soportado) → responde al cliente pidiendo ajuste.

### 5.3 Registro en runtime

- **Voice**: agregar `navi: [...14 tools]` a `MEERKAT_VOICE_DISTRIBUTION` en `src/lib/vapi/sync.ts`
- **Chat**: agregar mapeos en `VOICE_TO_CHAT` en `src/app/api/portal/[token]/agent-chat/route.ts`
- **Email**: agregar tools relevantes a `BASE_EMAIL_TOOLS` en `src/lib/ops/inbox-processor.ts` (aplica la deuda existente de filtro por meerkat)
- **Registry**: cada tool en `TOOL_REGISTRY` con `gatedByRole: ['navi']` (o `['navi_agencia']` para las 2 extras + versiones con `target_account_id`), `gatedByFeature: 'social_publishing'`. Sub-flag `agency_mode` requerido para tools de `navi_agencia`.

## 6. Approval flow (diagrama)

```
[Cliente configura brand templates + conecta IG/Canva]
        ↓
[Navi propone calendario editorial del mes] ──── proponer_calendario_editorial
        ↓
[Cliente aprueba calendario en portal] ──── POST /calendar/[month]/approve
        ↓
[Loop por cada slot del calendario]
        ↓
    ┌───────────────────────────┐
    │ slot.auto_publish = true? │
    └────────┬──────────────┬───┘
           sí │           no │
             ↓               ↓
[Navi genera post]   [Navi genera post]
[status=approved]    [status=pending_approval]
[auto_publish=true]         ↓
     ↓                [Notificación in-portal + email]
     ↓                      ↓
     ↓            [Cliente en bandeja portal]
     ↓                      ↓
     ↓                 ┌────┴────┐
     ↓              aprueba   rechaza/edita
     ↓                 ↓         ↓
     ↓        [status=approved] [descarta o regenera]
     ↓                 ↓
     └────────┬────────┘
              ↓
    [programar_publicacion → status=scheduled]
              ↓
    [Cron cada 5 min: scheduled_for <= now()]
              ↓
    [MetaPublisher.createMediaContainer]
              ↓
    [Poll status hasta ready o timeout 5min]
              ↓
    [MetaPublisher.publishContainer]
              ↓
    [status=published, guarda media_id + permalink]
              ↓
    [Cron métricas: snapshot 24h, 7d, 30d]
```

## 7. Guardarraíles de moderación

### 7.1 Sentiment gate

Cron `monitor-social-interactions` cada 10 min pulls nuevos comments/DMs desde `listRecentComments`/`listRecentDms`. Para cada uno:

1. **Clasificación de sentiment** (Haiku, cache-friendly): positive/neutral/negative/crisis
2. **Detección de crisis** (regex + LLM): menciones de "demanda", "abogado", "reembolso", "denuncia", "fraude", "estafa", palabras en escalada de tono, o volumen anómalo (>10 negativos en 1h)

Reglas:
- `sentiment=positive` + template match alto → auto-reply
- `sentiment=positive` + template match bajo → pending_approval
- `sentiment=neutral` → siempre pending_approval
- `sentiment=negative` → escalated_to_human, notificación urgente al cliente
- `sentiment=crisis` → escalated_to_human + notificación URGENTE al cliente (correo con asunto "Acción requerida: posible crisis en @handle") + push a Nash para alerta interna. **Navi NO pausa sola.** El cliente decide si pausa desde el portal o continúa. Nash aparte revisa el caso y puede sugerir acciones al cliente, pero la decisión de pausar/continuar es humana

### 7.2 Content safety

Antes de publicar cualquier caption (incluso auto):
- Bloquear si contiene palabras de la denylist del cliente (configurable)
- Bloquear si contiene @menciones a cuentas no autorizadas
- Bloquear si contiene URLs a dominios no whitelisteados

## 8. Portal UI nueva

Nueva sección `Redes` en OficinaSidebar (visible solo si `social_publishing.enabled=true`).

### 8.1 Rutas — Navi estándar

- `/portal/[token]/oficina/redes` — hub: si cliente tiene 1 Navi entra directo a su dashboard; si tiene N Navis estándar, ve selector con avatar + @handle + estado + resumen métricas
- `/portal/[token]/oficina/redes/[naviId]` — dashboard de un Navi estándar
- `/portal/[token]/oficina/redes/[naviId]/calendario` — calendario editorial
- `/portal/[token]/oficina/redes/[naviId]/plantillas` — brand templates
- `/portal/[token]/oficina/redes/[naviId]/cuenta` — cuenta IG conectada
- `/portal/[token]/oficina/redes/[naviId]/interacciones` — comments/DMs pendientes
- `/portal/[token]/oficina/redes/[naviId]/media` — bandeja `user_media_uploads`
- `/portal/[token]/oficina/redes/[naviId]/consumo` — tareas consumidas por este Navi

Toggle `Pausar Navi` visible en header del dashboard.

### 8.2 Rutas — Navi Agencia

- `/portal/[token]/oficina/redes/[naviId]` — **dashboard tipo social media manager**: tabla de todas las cuentas gestionadas (columna @handle + estado + próx. publicación + engagement 7d + bandeja pendiente) + selector rápido de cuenta arriba
- `/portal/[token]/oficina/redes/[naviId]/cuenta/[socialAccountId]` — vista detalle de UNA cuenta: bandeja de esa cuenta, calendario, plantillas, interacciones, métricas
- `/portal/[token]/oficina/redes/[naviId]/cuentas` — CRUD de las cuentas IG del portfolio (agregar/eliminar hasta 20)
- `/portal/[token]/oficina/redes/[naviId]/cross-account` — vista consolidada de calendario cruzado + herramienta `replicar_contenido_entre_cuentas` accesible desde aquí
- `/portal/[token]/oficina/redes/[naviId]/consumo` — desglose de tareas por cuenta gestionada

Toggle `Pausar cuenta` visible por cada row de la tabla de cuentas. Toggle `Pausar Navi Agencia entero` en header (afecta todas las cuentas).

### 8.3 Diferenciación entre múltiples Navis del mismo cliente

Aplica cuando cliente tiene 2+ Navis (mezcla de estándar y/o agencia):

- **`agent_name` custom obligatorio** desde el 2o Navi: admin fuerza nombre distintivo ("Navi Restaurante MTY", "Navi Agencia GAV"). Sin nombre custom no se puede provisionar.
- **Etiqueta de variante visible**: chip "Estándar" o "Agencia" al lado del nombre.
- **Avatar meerkat con badge de color** (1-8) auto-asignado. Navis Agencia tienen fondo del badge distinto para diferenciarse visualmente de estándar.
- **Selector en sidebar** cuando hay 2+ Navis, agrupado por variante.
- **Alertas y notificaciones** siempre incluyen `agent_name` + variante + (si aplica) `@handle` de la cuenta destino.
- **Pool de tareas compartido a nivel org** entre todos los meerkats (no solo Navis). Vista de consumo global + desglose por Navi + para Navi Agencia también desglose por cuenta gestionada.

## 9. Feature flag, contratación, consumo de tareas

Centinelia se cobra por **tareas del pool**, no por post publicado. Este spec se alinea con ese modelo. No hay "overage por post" ni "X posts incluidos". El cliente paga (a) el empleado Navi + (b) tareas mensuales del pool. Cuando el pool se agota, Navi deja de ejecutar acciones cobradas hasta que el cliente compre más tareas o rollover al siguiente mes.

### 9.1 Feature flag

`social_publishing` en `organizations.features` JSONB es objeto:
```json
{ "enabled": true, "agency_mode": false }
```

- `enabled=false`: ninguna tool de Navi disponible, sección Redes oculta, crons skipean, meerkats `role='navi'` y `role='navi_agencia'` no pueden crearse
- `enabled=true, agency_mode=false`: solo se puede crear `role='navi'` (variante estándar)
- `enabled=true, agency_mode=true`: se puede crear ambas variantes. Admin/self-serve permite elegir al crear el meerkat

### 9.2 Contratación (patrón empleado + módulo)

**Empleado Navi**: cada Navi (estándar o agencia) es un empleado adicional. Costo según variante y plan del cliente (aplica pricing del catálogo existente — ver módulos Tier 1/2 en [handoff sesión 2026-08-31](../../../.claude/projects/C--Users-Nazre/memory/handoff_sesion_2026-08-31_modulos_tier1_tier2.md)).

**Módulo `social_publishing`**: feature flag por org. Sub-flag `agency_mode` habilita la variante Navi Agencia. Se activa 1 vez por org (aplica cobro de activación estándar del catálogo).

**Regla de contratación por variante:**
- **Cliente PyME single-brand con N cuentas IG del mismo negocio**: contrata N Navis estándar, uno por cuenta.
- **Cliente agencia de marketing con N cuentas IG de clientes distintos**: contrata 1 Navi Agencia (hasta 20 cuentas). Si supera 20, contrata 2 Navis Agencia.
- **Cliente híbrido** (agencia + su propia marca): puede contratar 1 Navi Agencia (para sus clientes) + 1 Navi estándar (para su propia marca). Ambos coexisten.

**Diferencial de pricing entre variantes**: Navi Agencia es materialmente más caro que Navi estándar (propuesta: ~3× el precio base, con el "descuento" siendo que 1 Navi Agencia = hasta 20 cuentas, versus contratar 20 Navis estándar). Cliente agencia recibe valor claro; cliente PyME single-brand no paga por complejidad que no usa.

**Kickstart del cliente 1 (agencia)**: cubre el costo del desarrollo inicial de ambas variantes (adapters compartidos + rol Navi + rol Navi Agencia + portal UI dual + crons + App Review). Es pago único no recurrente que solo aplica a este cliente. Clientes siguientes solo pagan empleado + módulo activado + tareas consumidas.

### 9.3 Consumo de tareas por acción

Alineado con [pool cost-based](../../../.claude/projects/C--Users-Nazre/memory/feedback_pool_cost_based.md) y [pool transparencia](../../../.claude/projects/C--Users-Nazre/memory/feedback_pool_transparencia.md) (event-sourced + auditable):

| Acción | Tareas | Racional |
|--------|--------|----------|
| `canva_listar_plantillas` | 0 | Lectura interna, sin costo externo |
| `canva_generar_diseño` (autofill) | 1 | 1 llamada Canva API |
| `canva_exportar` | 1 | 1 llamada Canva API |
| `generar_caption` | 1 | 1 llamada LLM (Haiku, cache-friendly) |
| `generar_hashtags` | 1 | 1 llamada LLM |
| `crear_borrador_post` (composite) | 2 | Suma de autofill + caption cuando se hacen juntos, aplica [batched-consume](../../../.claude/projects/C--Users-Nazre/memory/feedback_batched_consume_multi_io.md) |
| `programar_publicacion` | 0 | Solo escribe en DB, no llama Meta hasta cron |
| `publicar_ahora` | 1 | 1 llamada Meta (createContainer + publish batched) |
| `ig_responder_comentario` | 1 | 1 LLM sentiment + 1 Meta reply — cuenta 1 tarea batched |
| `ig_responder_dm` | 1 | Idem |
| `consultar_metricas_post` | 0 | Lee `social_metrics` cacheado |
| `proponer_calendario_editorial` | 3 | LLM extendido para plan mensual |
| `listar_media_del_cliente` | 0 | Lectura interna |
| `usar_media_del_cliente` | 0 | Solo actualiza estado en DB |
| Cron `publish-scheduled` (por post) | 1 | 1 llamada Meta publish. Cobra al momento de ejecutar, no al programar |
| Cron `refresh-social-metrics` | 0 | Background, sin cargo al cliente ([batch_eval no charge](../../../.claude/projects/C--Users-Nazre/memory/feedback_batch_eval_no_charge.md)) |
| Cron `monitor-social-interactions` sentiment scan | 0 | Background hasta que Navi actúa (responder = cobra) |
| Kill switch pause/resume | 0 | Solo config |

**Ejemplo de consumo mensual — Navi estándar** (PyME con calendario editorial normal):
- 30 posts publicados (15 con approval + 15 recurrentes auto) = 30 draft (60 tareas) + 30 publish (30 tareas) = **90 tareas**
- 60 respuestas a comments/DMs = **60 tareas**
- 1 propuesta calendario = **3 tareas**
- 20 ediciones de draft (re-generar caption) = **20 tareas**
- **Total: ~175 tareas/mes** por 1 Navi estándar con actividad estándar

**Ejemplo de consumo mensual — Navi Agencia** (10 cuentas de clientes gestionadas):
- 10 cuentas × 20 posts = 200 posts → 200 draft (400 tareas) + 200 publish (200 tareas) = **600 tareas**
- 10 cuentas × 40 respuestas = 400 respuestas = **400 tareas**
- 10 propuestas calendario (una por cuenta) = **30 tareas**
- 100 ediciones = **100 tareas**
- 20 replicas cross-account (tool #16) = **60 tareas**
- **Total: ~1,190 tareas/mes** por 1 Navi Agencia con 10 cuentas activas

Pool compartido a nivel org entre todos los meerkats. El cliente dimensiona su plan de tareas según sus meerkats totales. Si se acaban, compra más o rollover al siguiente mes según el billing existente. Cliente puede desactivar Navis o pausar cuentas específicas sin borrarlos para bajar consumo.

### 9.4 Transparencia de consumo

Cada acción cobrada de Navi escribe en `ai_ops_log` con:
- `agent_id` de Navi
- `capability` = nombre de la tool
- `tareas_consumed` = número de tareas
- `metadata` = {content_draft_id, media_id, etc.}

Portal expone `/portal/[token]/oficina/redes/consumo` con desglose diario/mensual por Navi. Auditable per la regla de [pool transparencia](../../../.claude/projects/C--Users-Nazre/memory/feedback_pool_transparencia.md).

## 10. App Review de Meta (critical path)

### 10.1 Semana 1

Crear Meta App en `developers.facebook.com`. Configurar productos:
- Facebook Login for Business
- Instagram Graph API
- Messenger Platform (para DMs)

Permisos a solicitar en App Review:
- `instagram_content_publish`
- `instagram_manage_comments`
- `instagram_manage_insights`
- `instagram_manage_messages`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_metadata`
- `business_management`

Preparar entregables de App Review:
- Política de privacidad — revisar `centinelia.mx/privacidad` cubre uso de datos IG/FB
- Terms of service — link público
- Data deletion instructions — endpoint `/api/social/data-deletion` que borre `social_accounts` + `content_drafts` + `social_interactions` de una org
- Screencasts: 1 por cada permiso solicitado, mostrando flujo real end-to-end
- Justificación por permiso: por qué Centinelia lo necesita, cómo lo usa, cómo protege datos

### 10.2 Semanas 2-4

Someter App Review. Iterar correcciones. Riesgo: Meta pide cambios de política, tomamos 1-2 semanas por ronda de iteración.

### 10.3 Durante review

Desarrollamos contra sandbox (Meta permite modo Development contra IG accounts con rol Developer/Tester). Cliente kickstart agregado como Tester para E2E antes de aprobación pública.

### 10.4 Post-approval

App pasa a modo Live. Cualquier cliente puede conectar su IG Business. Antes de eso, solo Testers.

## 11. Roadmap 6-7 semanas

| Sem | Milestone | Deliverable | Bloqueadores |
|-----|-----------|-------------|--------------|
| 1 | Setup + submit review | Meta App creada, review sometida, Canva OAuth funcional, cliente 1 agregado como Tester | Nazre configura Meta App con cuenta admin |
| 2 | Adapters | `CanvaProvider` + `MetaPublisher` con test suite contra sandbox, coverage >80% | Cliente 1 provee IG Business + FB Page |
| 3 | Schema + endpoints + Navi role | Migraciones Supabase aplicadas, CRUD endpoints, Navi registrado en runtime voice/chat/email | — |
| 4 | Tools + portal bandeja | 14 tools Navi estándar + 2 extras Navi Agencia (total 16 en `navi_agencia`), UI bandeja aprobación, calendario editorial, dashboard tipo social media manager para agencia | — |
| 5 | Crons + métricas + moderación | Publish cron + metrics cron + sentiment gate + kill switch | — |
| 6 | E2E con cliente kickstart (agencia) | Provisioning `role='navi_agencia'`, 3-5 cuentas cliente cargadas, brand templates por cuenta, calendarios mes 1 aprobados por cliente final, primeros posts publicados en cada cuenta | App Review aprobada O cliente como Tester |
| 7 | Buffer / iteración | Correcciones Meta si aplica, ajustes producto post feedback cliente | — |

**Critical path**: App Review Meta. Si rechazan duro en semana 4-5 y piden cambios grandes, roadmap se estira 4+ semanas. Mitigación: someter con screencasts muy claros día 1, política explícita.

## 12. Riesgos y mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| Meta rechaza App Review | Retrasa launch 4-8 semanas | Media | Screencasts honestos, política clara, someter día 1, cliente Tester para probar sin espera |
| Cliente sin brand templates Canva | Bloquea onboarding | Alta | Ofrecer servicio setup humano como servicio profesional puntual, o usar templates públicas de Canva ajustadas al brand del cliente |
| Video reel requiere edición real más allá de Canva | Feature gap | Baja | Cliente puede subir videos ya editados por correo, chat o portal (`user_media_uploads`). Navi los usa como media_urls. Programmatic video v2 |
| Cliente sube 100 videos y agota storage | Costo Storage | Media | `user_media_uploads.expires_at = now() + 90 days`. Cron limpia archivos vencidos. Cliente ve badge de uso de storage |
| Cliente compra 20 Navis y todos gastan del mismo pool | Confusión de consumo | Media | Portal expone consumo por Navi. Alertas cuando pool <20%. Cliente puede desactivar Navis específicos sin borrarlos |
| Rate limit Meta 50 posts/24h por cuenta | Casi imposible en PyME | Baja | No mitigación, límite es amplio |
| Canva Autofill rate limit | Puede afectar generación masiva | Baja | Cache preview_url por 24h + retry con backoff |
| Comentario tóxico auto-respondido | Daño de marca | Media | Sentiment gate + kill switch + escalate. Denylist configurable por org (Navi estándar) o por cuenta (Navi Agencia) |
| Navi Agencia se equivoca de cuenta (publica en @A lo de @B) | Daño reputacional serio para agencia | Media | (1) `target_account_id` obligatorio en schema de tool (LLM no puede omitir), (2) validación server-side que la cuenta pertenece al `agent_id`, (3) preview obligatorio antes de publicar en Agencia que muestra @handle destino grande, (4) audit log con `target_account_id`, (5) tests unitarios de aislamiento en el adapter |
| Cliente agencia tiene >20 cuentas | Necesita 2o Navi Agencia | Baja | UI en admin sugiere crear 2o Navi Agencia si cuentas se acercan al tope. Pool compartido no cambia |
| Cliente edita post directo en IG y desincroniza | Métricas incorrectas | Media | Snapshot métricas por `published_media_id`. No editamos post ya publicado |
| Token Meta expira sin refresh | Bloqueo silencioso publicación | Media | Cron refresh dedicado + notificación al cliente antes de expiración + `status=needs_reauth` visible en portal |
| Cliente cancela cuenta con posts scheduled | Publicaciones fantasma | Baja | Cron valida `organizations.account_status` antes de publicar. Si inactive, cancela drafts scheduled |

## 13. Preguntas abiertas

1. **Denylist inicial**: ¿la definimos por default en el sistema (competidores del cliente, palabras problemáticas comunes) o dejamos que cada cliente la configure de cero? *Propuesta: baseline vacía, cliente agrega.*
2. **Notificación al cliente**: ¿email + notificación in-portal (bell icon) es suficiente, o WhatsApp también? Regla de [no WhatsApp](../../../.claude/projects/C--Users-Nazre/memory/feedback_no_whatsapp.md) aplica → solo email + notificación in-portal (bell icon).
3. **Métricas históricas**: ¿guardamos snapshots 30d indefinidamente o purga después de 6 meses? *Propuesta: mantener indefinido, es storage barato.*
4. **Categoría del brand template**: `carousel` en Canva no siempre existe como tipo nativo — puede ser secuencia de designs. Confirmar durante spike de semana 2.
5. **Setup de templates humano**: ¿lo hace un designer contratado por Centinelia (add-on service) o lo hace el cliente/su designer? *Propuesta: cliente/su designer por default. Ofrecemos servicio si necesita.*
6. **v1 alcance vs v1.5**: ¿arrancamos v1 con TODO (publishing + comments + DMs) o hacemos v1 solo publishing y v1.5 agrega interactions después? *Propuesta: v1 completo porque el 30% del valor son las respuestas automatizadas. Riesgo: agrega 1-2 semanas al roadmap si Meta demora `instagram_manage_messages`. Alternativa: v1 sin DMs (más fácil de aprobar), v1.5 agrega DMs cuando Meta apruebe permiso separado.*
7. **Refresh token Meta**: Meta usa long-lived tokens (60 días) para IG Business. ¿Rotamos día 50 automático o notificamos al cliente día 55 para reconectar? *Propuesta: rotación automática vía Graph API + notificación de fallback si falla.*

## 14. Éxito medible

Al final de semana 7 con cliente kickstart (agencia) activo:
- [ ] App Review Meta aprobada (o cliente como Tester si sigue en review)
- [ ] Navi Agencia provisionado con 3-5 cuentas IG de clientes de la agencia conectadas
- [ ] Brand templates cargadas y calendarios editoriales aprobados por al menos 3 clientes finales
- [ ] ≥10 posts publicados exitosamente distribuidos entre las cuentas (mix imagen + reel)
- [ ] ≥5 comments/DMs respondidos por Navi (auto + con approval)
- [ ] Kill switch probado a nivel cuenta (pausar 1 cuenta sin afectar las demás)
- [ ] Cero incidentes de post cruzado (publicar en cuenta equivocada)
- [ ] Métricas 24h/7d capturadas en al menos 5 posts distribuidos
- [ ] Cero incidentes de auto-reply tóxico
- [ ] Cliente kickstart firma continuidad (empleado Navi Agencia + módulo activo + agency_mode habilitado)
- [ ] Cliente agencia probó subir ≥1 video por correo y por chat, Navi lo procesó correctamente
- [ ] Al menos 1 uso exitoso de `replicar_contenido_entre_cuentas`

## 15. Referencias

**Brain (fuente autoritativa, gana sobre auto-memory):**
- `.brain/README.md` — orden de fuentes y navegación
- `.brain/policies/tool-completeness.md` — 5 reglas anti-bloat
- `.brain/skills/adding-a-meerkat-tool.md` — checklist obligatorio al agregar tools
- `.brain/decisions/2026-08-18-3-canales-obligatorio.md` — por qué voz+chat+correo
- `.brain/decisions/2026-08-18-feature-flag-por-org.md` — por qué feature flag

**Código de referencia:**
- Meerkat pattern actual: `src/lib/vapi/sync.ts` `MEERKAT_VOICE_DISTRIBUTION`
- Registry pattern: `src/lib/tools/registry.ts` `TOOL_REGISTRY`
- OAuth pattern existente: `integration_accounts` + `/api/auth/email-callback`
- Adapter pattern precedente: `InvoicingProvider` (PAC/SF), `BillingAdapter` (CONTPAQi/Aspel)
- Feature flag pattern: `organizations.features` JSONB
- Cron pattern: existente en `/api/cron/*`
- Portal UI pattern: `/portal/[token]/oficina/*`

**Auto-memory (contexto complementario, no autoritativo):**
- [project-centinelia-navi-meerkat](../../../.claude/projects/C--Users-Nazre/memory/project_centinelia_navi_meerkat.md) — memoria de proyecto
- [feedback-cliente-paga-proveedores-externos](../../../.claude/projects/C--Users-Nazre/memory/feedback_cliente_paga_proveedores_externos.md) — Meta/Canva son del cliente
- [feedback-no-whatsapp](../../../.claude/projects/C--Users-Nazre/memory/feedback_no_whatsapp.md) — comunicación cliente sin WA

## 16. Nota de gobernanza

Antes de mergear el plan de implementación:
- Este spec debe crearse también como decision en `.brain/decisions/2026-09-14-navi-meerkat-social.md` con `supersedes: none` (nuevo rol, no reemplaza a nadie).
- Cualquier tool agregada a Navi debe pasar por `.brain/skills/adding-a-meerkat-tool.md`.
- Contradicciones con `project-centinelia-tool-distribution` (auto-memory 27 días) las resuelve el brain, no la memoria. Al mergear, actualizar el brain con la nueva distribución de tools de Navi.
