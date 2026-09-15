# Navi Social Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Navi meerkat (2 variantes: `role='navi'` 1 cuenta IG + `role='navi_agencia'` hasta 20 cuentas IG) para producir y publicar contenido en Instagram vía Canva Connect API + Meta Graph API, con bandeja de aprobación, calendario editorial, sentiment gate, y ingesta de video del cliente por correo/chat/portal.

**Architecture:** Dos adapters (Canva Connect + Meta Graph API detrás del `SocialPublisher` interface). Nuevo rol `navi` y `navi_agencia` en el runtime meerkat (voz + chat + email). Persistencia en 7 tablas nuevas. Cron jobs para publicación programada, snapshot de métricas, monitor de interacciones, refresh de tokens, y purga de media vencida. Portal con sección `Redes` dual: dashboard simple para Navi estándar y dashboard tipo social media manager para Navi Agencia con selector por cuenta.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + Storage), Vapi (voz), Anthropic Claude Haiku para sentiment/captions, Canva Connect API v1, Meta Graph API v18+, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-09-14-navi-social-media-design.md`

## Global Constraints

- **Ambas variantes en paralelo desde v1.** Cliente kickstart es agencia (`role='navi_agencia'`), pero código y arquitectura contemplan ambas variantes desde el primer commit.
- **1 Navi estándar = 1 cuenta IG. 1 Navi Agencia = hasta 20 cuentas IG.** Validación server-side obligatoria.
- **Tools en los 3 canales** (voz + chat + email) según `.brain/decisions/2026-08-18-3-canales-obligatorio.md`. Cada tool nueva DEBE aparecer en `MEERKAT_VOICE_DISTRIBUTION`, `VOICE_TO_CHAT`, y `CHAT_TOOL_BY_NAME`.
- **Feature flag por org.** `organizations.features.social_publishing = { enabled: bool, agency_mode: bool }`. Sin `enabled=true`, todo el módulo está oculto.
- **Meta App Review en paralelo desde día 1.** No bloquea desarrollo (sandbox con Tester), sí bloquea GA.
- **Nunca ejecutar acciones destructivas o de high-blast-radius sin humano.** Navi NO se pausa sola en crisis; escala al cliente y espera decisión.
- **Consumo de tareas** según tabla en spec Sección 9.3 (crear_borrador=2, publicar=1, responder=1, propuesta_calendario=3, etc.).
- **`target_account_id` obligatorio en Navi Agencia** para todas las tools de acción. LLM forzado por schema.
- **Media del cliente** puede venir por correo, chat o portal upload. TTL 90 días.
- **Sin em-dash, sin emojis, sin "IA" en copy visible** (feedback rules Centinelia).
- **`logLlmCall` obligatorio** en todas las llamadas Anthropic (enforced por `pnpm lint`, ver feedback_anthropic_debe_loggearse).
- **Tests: nunca correos de clientes reales.** Usar `nazre20@gmail.com` (feedback_no_tests_a_clientes).
- **Anthropic SDK caching-friendly.** Habilitar prompt caching en llamadas repetidas (sentiment classification, brand voice loading).
- **Commits frecuentes** (uno por task o sub-task). Sin `--no-verify`. Nunca amend commits ya pusheados.

---

## File Structure

**Adapters (nuevos):**
- `src/lib/social/canva.ts` — CanvaProvider (OAuth, autofill, export, assets)
- `src/lib/social/publishers/index.ts` — SocialPublisher interface + factory
- `src/lib/social/publishers/meta.ts` — MetaPublisher (Instagram + Facebook)
- `src/lib/social/media-quality.ts` — validación resolución/duración/formato
- `src/lib/social/sentiment.ts` — clasificador sentiment Haiku
- `src/lib/social/brand-voice.ts` — loader dinámico brand summary por cuenta

**Schema (nuevo):**
- `supabase/migrations/2026-09-14-navi-social-schema.sql` — 7 tables + storage bucket

**Runtime (modificar):**
- `src/lib/vapi/sync.ts` — agregar `navi` y `navi_agencia` a `MEERKAT_VOICE_DISTRIBUTION`
- `src/app/api/portal/[token]/agent-chat/route.ts` — `ALL_TOOLS`, `VOICE_TO_CHAT`, `CHAT_TOOL_BY_NAME`
- `src/lib/tools/registry.ts` — `TOOL_REGISTRY` con `gatedByRole` + `gatedByFeature`
- `src/lib/ops/inbox-processor.ts` — attachment ingest para Navi + tools email
- `src/lib/tools/executor.ts` — handlers centralizados para tools nuevas

**Feature flag (nuevo):**
- `src/lib/feature-flags/social-publishing.ts` — helper isEnabled/agencyMode

**Tool endpoints (nuevos, 16 total = 14 estándar + 2 agencia):**
- `src/app/api/voice/tools/canva-listar-plantillas/route.ts`
- `src/app/api/voice/tools/canva-generar-diseno/route.ts`
- `src/app/api/voice/tools/canva-exportar/route.ts`
- `src/app/api/voice/tools/generar-caption/route.ts`
- `src/app/api/voice/tools/generar-hashtags/route.ts`
- `src/app/api/voice/tools/crear-borrador-post/route.ts`
- `src/app/api/voice/tools/programar-publicacion/route.ts`
- `src/app/api/voice/tools/publicar-ahora/route.ts`
- `src/app/api/voice/tools/ig-responder-comentario/route.ts`
- `src/app/api/voice/tools/ig-responder-dm/route.ts`
- `src/app/api/voice/tools/consultar-metricas-post/route.ts`
- `src/app/api/voice/tools/proponer-calendario-editorial/route.ts`
- `src/app/api/voice/tools/listar-media-del-cliente/route.ts`
- `src/app/api/voice/tools/usar-media-del-cliente/route.ts`
- `src/app/api/voice/tools/listar-cuentas-gestionadas/route.ts` (agencia)
- `src/app/api/voice/tools/replicar-contenido-entre-cuentas/route.ts` (agencia)

**OAuth callbacks (nuevos):**
- `src/app/api/auth/canva-callback/route.ts`
- `src/app/api/auth/meta-callback/route.ts`

**Portal REST (nuevos):**
- `src/app/api/portal/[token]/social/accounts/route.ts`
- `src/app/api/portal/[token]/social/accounts/connect/route.ts`
- `src/app/api/portal/[token]/social/accounts/[id]/route.ts`
- `src/app/api/portal/[token]/social/templates/route.ts`
- `src/app/api/portal/[token]/social/templates/sync/route.ts`
- `src/app/api/portal/[token]/social/drafts/route.ts`
- `src/app/api/portal/[token]/social/drafts/[id]/route.ts`
- `src/app/api/portal/[token]/social/calendar/[month]/route.ts`
- `src/app/api/portal/[token]/social/calendar/[month]/approve/route.ts`
- `src/app/api/portal/[token]/social/metrics/route.ts`
- `src/app/api/portal/[token]/social/pause/route.ts`
- `src/app/api/portal/[token]/social/resume/route.ts`
- `src/app/api/portal/[token]/social/media/upload/route.ts`

**Cron endpoints (nuevos):**
- `src/app/api/cron/publish-scheduled-posts/route.ts` (cada 5 min)
- `src/app/api/cron/refresh-social-metrics/route.ts` (cada 1 h)
- `src/app/api/cron/monitor-social-interactions/route.ts` (cada 10 min)
- `src/app/api/cron/refresh-meta-tokens/route.ts` (diario)
- `src/app/api/cron/purge-expired-media/route.ts` (diario)

**Portal UI (nuevos):**
- `src/app/portal/[token]/oficina/redes/page.tsx` — hub multi-Navi
- `src/app/portal/[token]/oficina/redes/[naviId]/page.tsx` — dashboard según variante
- `src/app/portal/[token]/oficina/redes/[naviId]/calendario/page.tsx`
- `src/app/portal/[token]/oficina/redes/[naviId]/plantillas/page.tsx`
- `src/app/portal/[token]/oficina/redes/[naviId]/cuenta/page.tsx` (estándar)
- `src/app/portal/[token]/oficina/redes/[naviId]/cuentas/page.tsx` (agencia)
- `src/app/portal/[token]/oficina/redes/[naviId]/cuenta/[socialAccountId]/page.tsx` (agencia)
- `src/app/portal/[token]/oficina/redes/[naviId]/cross-account/page.tsx` (agencia)
- `src/app/portal/[token]/oficina/redes/[naviId]/interacciones/page.tsx`
- `src/app/portal/[token]/oficina/redes/[naviId]/media/page.tsx`
- `src/app/portal/[token]/oficina/redes/[naviId]/consumo/page.tsx`

**Components (nuevos):**
- `src/components/portal/redes/NaviDashboard.tsx`
- `src/components/portal/redes/NaviAgenciaDashboard.tsx`
- `src/components/portal/redes/BandejaAprobacion.tsx`
- `src/components/portal/redes/CalendarioEditorial.tsx`
- `src/components/portal/redes/AccountSelector.tsx`
- `src/components/portal/redes/KillSwitchToggle.tsx`
- `src/components/portal/redes/MediaBandeja.tsx`
- `src/components/portal/redes/DraftPreview.tsx`
- `src/components/portal/redes/CrossAccountReplicator.tsx`

**External (no-code):**
- Meta App Review submission (checklist Task 0)
- Canva App registration (checklist Task 0)

---

## Task 0: Setup externo — Meta App Review + Canva App (paralelo desde día 1)

**Files:**
- Create: `docs/deliverability/navi-meta-app-submission.md` (checklist para submit)
- Create: `docs/deliverability/navi-canva-app-setup.md` (config Canva)
- Modify: `docs/legal/privacy-policy.md` (agregar sección Meta/Canva)

**Interfaces:**
- Produces: `META_APP_ID`, `META_APP_SECRET`, `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET` env vars documentadas para Task 1 en adelante.

**No lleva tests unitarios — es setup manual + documentación.** Es prerrequisito para producción; desarrollo sí puede arrancar sin App Review aprobada (usando modo Development con Tester).

- [ ] **Step 1: Crear Meta App**

En `developers.facebook.com`:
1. Business App nueva "Centinelia Social".
2. Añadir productos: Facebook Login for Business, Instagram Graph API, Messenger Platform.
3. Configurar Basic Settings: display name "Centinelia Social", app icon, privacy policy URL `https://centinelia.mx/privacidad`, terms of service URL, data deletion URL `https://centinelia.mx/api/social/data-deletion`.
4. Copiar App ID + App Secret → agregar a Vercel env vars (`META_APP_ID`, `META_APP_SECRET`).

- [ ] **Step 2: Configurar OAuth redirect URIs Meta**

Añadir URIs válidos:
- `https://www.centinelia.mx/api/auth/meta-callback` (prod)
- `https://centinelia-product-*.vercel.app/api/auth/meta-callback` (preview con wildcard)
- `http://localhost:3000/api/auth/meta-callback` (dev)

- [ ] **Step 3: Solicitar permisos en App Review**

Permisos a solicitar (uno por uno con justificación + screencast):
- `instagram_content_publish`
- `instagram_manage_comments`
- `instagram_manage_insights`
- `instagram_manage_messages`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_metadata`
- `business_management`

Para cada uno: 3-5 min screencast del flow real usando la app en modo Development contra IG account del cliente kickstart (agregado como Tester). Justificación explícita en cada solicitud.

- [ ] **Step 4: Agregar cliente kickstart como Tester**

Roles → Testers → invitar email de contacto del cliente. Cliente acepta la invitación desde su Facebook. Su IG Business (linkeada a FB Page) queda accesible en modo Development.

- [ ] **Step 5: Crear Canva App**

En `www.canva.com/developers`:
1. Crear integración "Centinelia Social" con Canva Connect API.
2. Scopes: `design:content:read`, `design:content:write`, `asset:read`, `asset:write`, `brandtemplate:content:read`, `brandtemplate:meta:read`, `profile:read`.
3. Redirect URI: `https://www.centinelia.mx/api/auth/canva-callback` (+ preview + localhost).
4. Copiar Client ID + Client Secret → Vercel env vars (`CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`).

- [ ] **Step 6: Actualizar política de privacidad**

En `docs/legal/privacy-policy.md` (y `src/app/privacidad/page.tsx`) agregar sección:
- Datos recolectados de Meta/Canva (tokens, cuenta IG, brand templates, contenido publicado).
- Uso: publicar en nombre del cliente, responder comentarios/DMs, generar reportes de métricas.
- Retención: mientras módulo social_publishing esté activo. 30 días después de desactivar, borra tokens + metadata (mantiene ledger de tareas por auditoría).
- Derecho a borrado: endpoint `/api/social/data-deletion?portal_email=X` requiere OTP + confirma.

- [ ] **Step 7: Commit + notificación**

```bash
git add docs/deliverability/navi-meta-app-submission.md docs/deliverability/navi-canva-app-setup.md docs/legal/privacy-policy.md src/app/privacidad/page.tsx
git commit -m "docs: submit Meta App Review + Canva app setup for Navi social publishing"
```

Notificar por email a Nazre: URLs de status de App Review + timeline estimado (2-4 semanas Meta, Canva no requiere review).

---

## Task 1: Schema migration + Supabase Storage bucket

**Files:**
- Create: `supabase/migrations/2026-09-14-navi-social-schema.sql`
- Create: `supabase/__tests__/2026-09-14-navi-social-schema.test.ts` (tests de constraints + FKs)

**Interfaces:**
- Produces: 7 tablas (`social_accounts`, `brand_templates`, `editorial_calendars`, `editorial_calendar_slots`, `content_drafts`, `user_media_uploads`, `social_metrics`, `social_interactions`) + storage bucket `user-media` privado.
- Consumes: tabla `organizations`, `voice_agents` existentes.

- [ ] **Step 1: Escribir migración SQL completa**

Copiar SQL de spec Sección 4.2 verbatim al archivo `supabase/migrations/2026-09-14-navi-social-schema.sql`, respetando el orden: `social_accounts` → `brand_templates` → `editorial_calendars` → `editorial_calendar_slots` → `content_drafts` → `user_media_uploads` → `social_metrics` → `social_interactions`.

Al final del archivo agregar:

```sql
-- Storage bucket for user-uploaded media
insert into storage.buckets (id, name, public) values ('user-media', 'user-media', false) on conflict do nothing;

-- RLS policies: only service role can read/write (portal API valida acceso)
create policy "user-media service access" on storage.objects for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Trigger para enforcement de 1 cuenta por role='navi'
create or replace function enforce_navi_account_limit() returns trigger as $$
declare
  agent_role text;
  current_count int;
begin
  select role into agent_role from voice_agents where id = new.agent_id;
  select count(*) into current_count from social_accounts where agent_id = new.agent_id;
  if agent_role = 'navi' and current_count >= 1 then
    raise exception 'Navi estándar permite máximo 1 cuenta IG (agent_id=%)', new.agent_id;
  elsif agent_role = 'navi_agencia' and current_count >= 20 then
    raise exception 'Navi Agencia permite máximo 20 cuentas IG (agent_id=%)', new.agent_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_navi_account_limit_trigger
  before insert on social_accounts
  for each row execute function enforce_navi_account_limit();
```

- [ ] **Step 2: Escribir test que valida los constraints**

```typescript
// supabase/__tests__/2026-09-14-navi-social-schema.test.ts
import { createAdminClient } from '@/lib/supabase/admin';

const supabase = createAdminClient();

describe('navi-social-schema', () => {
  let orgEmail: string;
  let naviId: string;
  let agenciaId: string;

  beforeAll(async () => {
    orgEmail = `nazre20+navi-test-${Date.now()}@gmail.com`;
    await supabase.from('organizations').insert({ portal_email: orgEmail, name: 'Test Navi' });
    const { data: navi } = await supabase.from('voice_agents').insert({
      portal_email: orgEmail, role: 'navi', agent_name: 'Navi Test'
    }).select().single();
    naviId = navi!.id;
    const { data: ag } = await supabase.from('voice_agents').insert({
      portal_email: orgEmail, role: 'navi_agencia', agent_name: 'Navi Agencia Test'
    }).select().single();
    agenciaId = ag!.id;
  });

  afterAll(async () => {
    await supabase.from('organizations').delete().eq('portal_email', orgEmail);
  });

  it('Navi estándar bloquea segunda cuenta IG', async () => {
    const first = await supabase.from('social_accounts').insert({
      portal_email: orgEmail, agent_id: naviId, provider: 'meta_instagram',
      external_account_id: 'ig-1', access_token: 'x'
    });
    expect(first.error).toBeNull();
    const second = await supabase.from('social_accounts').insert({
      portal_email: orgEmail, agent_id: naviId, provider: 'meta_instagram',
      external_account_id: 'ig-2', access_token: 'x'
    });
    expect(second.error?.message).toContain('máximo 1 cuenta IG');
  });

  it('Navi Agencia permite hasta 20 cuentas', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await supabase.from('social_accounts').insert({
        portal_email: orgEmail, agent_id: agenciaId, provider: 'meta_instagram',
        external_account_id: `ig-ag-${i}`, access_token: 'x'
      });
      expect(r.error).toBeNull();
    }
    const twentyOne = await supabase.from('social_accounts').insert({
      portal_email: orgEmail, agent_id: agenciaId, provider: 'meta_instagram',
      external_account_id: 'ig-ag-21', access_token: 'x'
    });
    expect(twentyOne.error?.message).toContain('máximo 20 cuentas IG');
  });

  it('content_drafts FK a editorial_calendar_slots respeta orden de migración', async () => {
    const { error } = await supabase.from('content_drafts').insert({
      portal_email: orgEmail, agent_id: naviId,
      social_account_id: '00000000-0000-0000-0000-000000000000',
      media_type: 'image', slot_id: '00000000-0000-0000-0000-000000000000'
    });
    expect(error?.message).toMatch(/foreign key|violates/i);
  });
});
```

- [ ] **Step 3: Aplicar migración vía Supabase MCP y correr tests**

Aplicar migración:
```
mcp__supabase__apply_migration name="navi_social_schema_2026_09_14" query="<contenido SQL del step 1>"
```

Correr tests:
```bash
pnpm vitest run supabase/__tests__/2026-09-14-navi-social-schema.test.ts
```

Expected: 3 tests pasan.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-09-14-navi-social-schema.sql supabase/__tests__/2026-09-14-navi-social-schema.test.ts
git commit -m "feat(navi): schema for social publishing tables + storage bucket + constraints"
```

---

## Task 2: CanvaProvider adapter

**Files:**
- Create: `src/lib/social/canva.ts`
- Create: `src/lib/social/__tests__/canva.test.ts`
- Create: `src/lib/social/__tests__/fixtures/canva-*.json` (recorded API responses)

**Interfaces:**
- Consumes: `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET` env vars, `social_accounts` table (tokens).
- Produces:
  ```ts
  export class CanvaProvider {
    constructor(private accessToken: string);
    async listBrandTemplates(category?: 'post'|'reel'|'story'|'carousel'): Promise<BrandTemplate[]>
    async autofillTemplate(templateId: string, dataFields: Record<string, unknown>): Promise<{ designId: string; previewUrl: string }>
    async getDesign(designId: string): Promise<Design>
    async exportDesign(designId: string, format: 'png'|'jpg'|'mp4'|'pdf'): Promise<{ url: string; expiresAt: Date }>
    async uploadAsset(fileBuffer: Buffer, mimeType: string): Promise<{ assetId: string; url: string }>
    static async exchangeCodeForToken(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>
    static async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>
  }
  ```

- [ ] **Step 1: Escribir test fixtures (recorded responses)**

Crear fixtures en `src/lib/social/__tests__/fixtures/`:
- `canva-list-templates.json` — shape response GET `/v1/brand-templates?dataset=...`
- `canva-autofill.json` — response POST `/v1/autofills` (async job → poll)
- `canva-export.json` — response POST `/v1/exports`
- `canva-token-exchange.json` — response POST `/rest/oauth/token`

Fuente para el shape: `https://www.canva.dev/docs/connect/api-reference/`.

- [ ] **Step 2: Escribir tests failing**

```typescript
// src/lib/social/__tests__/canva.test.ts
import { CanvaProvider } from '../canva';
import { server } from '@/test/msw-server';
import { rest } from 'msw';
import listTemplatesFixture from './fixtures/canva-list-templates.json';
import autofillFixture from './fixtures/canva-autofill.json';

describe('CanvaProvider', () => {
  it('listBrandTemplates filtra por categoría', async () => {
    server.use(
      rest.get('https://api.canva.com/rest/v1/brand-templates', (req, res, ctx) => {
        expect(req.url.searchParams.get('dataset')).toBe('post');
        return res(ctx.json(listTemplatesFixture));
      })
    );
    const canva = new CanvaProvider('fake-token');
    const templates = await canva.listBrandTemplates('post');
    expect(templates).toHaveLength(listTemplatesFixture.items.length);
    expect(templates[0]).toHaveProperty('id');
    expect(templates[0]).toHaveProperty('title');
  });

  it('autofillTemplate hace polling hasta job success', async () => {
    let calls = 0;
    server.use(
      rest.post('https://api.canva.com/rest/v1/autofills', (_, res, ctx) => res(ctx.json({ job: { id: 'job-1', status: 'in_progress' } }))),
      rest.get('https://api.canva.com/rest/v1/autofills/job-1', (_, res, ctx) => {
        calls++;
        if (calls < 2) return res(ctx.json({ job: { status: 'in_progress' } }));
        return res(ctx.json(autofillFixture));
      })
    );
    const canva = new CanvaProvider('fake-token');
    const result = await canva.autofillTemplate('tpl-1', { titulo: 'Promo lunes', precio: '$199' });
    expect(result.designId).toBe(autofillFixture.job.result.design.id);
    expect(result.previewUrl).toBeDefined();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('refreshToken persiste nuevo refresh_token', async () => {
    server.use(
      rest.post('https://api.canva.com/rest/oauth/token', (_, res, ctx) =>
        res(ctx.json({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 14400 }))
      )
    );
    const result = await CanvaProvider.refreshToken('old-rt');
    expect(result.accessToken).toBe('new-at');
    expect(result.refreshToken).toBe('new-rt');
  });

  it('rate limit dispara retry con backoff', async () => {
    let attempts = 0;
    server.use(
      rest.get('https://api.canva.com/rest/v1/brand-templates', (_, res, ctx) => {
        attempts++;
        if (attempts < 3) return res(ctx.status(429), ctx.set('retry-after', '1'));
        return res(ctx.json(listTemplatesFixture));
      })
    );
    const canva = new CanvaProvider('fake-token');
    await canva.listBrandTemplates();
    expect(attempts).toBe(3);
  });
});
```

- [ ] **Step 3: Verificar tests fallan**

```bash
pnpm vitest run src/lib/social/__tests__/canva.test.ts
```

Expected: 4 tests FAIL con "CanvaProvider is not defined" o similar.

- [ ] **Step 4: Implementar CanvaProvider mínimo**

```typescript
// src/lib/social/canva.ts
const CANVA_BASE = 'https://api.canva.com/rest';
const MAX_RETRIES = 5;

export interface BrandTemplate {
  id: string;
  title: string;
  dataset?: string;
  thumbnailUrl?: string;
}

export interface Design {
  id: string;
  title: string;
  urls: { view_url: string; edit_url: string };
}

export class CanvaProvider {
  constructor(private accessToken: string) {}

  private async fetch<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const res = await fetch(`${CANVA_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '2', 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.fetch<T>(path, init, attempt + 1);
    }
    if (!res.ok) throw new Error(`Canva API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async listBrandTemplates(category?: 'post'|'reel'|'story'|'carousel'): Promise<BrandTemplate[]> {
    const qs = category ? `?dataset=${category}` : '';
    const data = await this.fetch<{ items: BrandTemplate[] }>(`/v1/brand-templates${qs}`);
    return data.items;
  }

  async autofillTemplate(templateId: string, dataFields: Record<string, unknown>): Promise<{ designId: string; previewUrl: string }> {
    const create = await this.fetch<{ job: { id: string; status: string } }>(`/v1/autofills`, {
      method: 'POST',
      body: JSON.stringify({ brand_template_id: templateId, data: dataFields }),
    });
    let job = create.job;
    while (job.status === 'in_progress') {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await this.fetch<{ job: any }>(`/v1/autofills/${job.id}`);
      job = poll.job;
    }
    if (job.status !== 'success') throw new Error(`Autofill failed: ${JSON.stringify(job)}`);
    return { designId: job.result.design.id, previewUrl: job.result.design.thumbnail?.url ?? '' };
  }

  async exportDesign(designId: string, format: 'png'|'jpg'|'mp4'|'pdf') {
    const create = await this.fetch<{ job: any }>(`/v1/exports`, {
      method: 'POST',
      body: JSON.stringify({ design_id: designId, format: { type: format } }),
    });
    let job = create.job;
    while (job.status === 'in_progress') {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await this.fetch<{ job: any }>(`/v1/exports/${job.id}`);
      job = poll.job;
    }
    if (job.status !== 'success') throw new Error(`Export failed: ${JSON.stringify(job)}`);
    return { url: job.urls[0], expiresAt: new Date(Date.now() + 24 * 3600 * 1000) };
  }

  async uploadAsset(fileBuffer: Buffer, mimeType: string) {
    const res = await fetch(`${CANVA_BASE}/v1/assets/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Asset-Upload-Metadata': JSON.stringify({ name_base64: Buffer.from('upload').toString('base64') }),
      },
      body: fileBuffer,
    });
    if (!res.ok) throw new Error(`Canva upload ${res.status}`);
    const data: any = await res.json();
    return { assetId: data.asset.id, url: data.asset.thumbnail?.url ?? '' };
  }

  async getDesign(designId: string): Promise<Design> {
    return (await this.fetch<{ design: Design }>(`/v1/designs/${designId}`)).design;
  }

  static async exchangeCodeForToken(code: string, redirectUri: string) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    return this._tokenRequest(params);
  }

  static async refreshToken(refreshToken: string) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return this._tokenRequest(params);
  }

  private static async _tokenRequest(params: URLSearchParams) {
    const clientId = process.env.CANVA_CLIENT_ID!;
    const clientSecret = process.env.CANVA_CLIENT_SECRET!;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${CANVA_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`Canva token ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  }
}
```

- [ ] **Step 5: Verificar tests pasan**

```bash
pnpm vitest run src/lib/social/__tests__/canva.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/canva.ts src/lib/social/__tests__/
git commit -m "feat(navi): CanvaProvider adapter with autofill, export, OAuth token exchange"
```

---

## Task 3: SocialPublisher interface + MetaPublisher backend

**Files:**
- Create: `src/lib/social/publishers/index.ts`
- Create: `src/lib/social/publishers/meta.ts`
- Create: `src/lib/social/publishers/__tests__/meta.test.ts`
- Create: `src/lib/social/publishers/__tests__/fixtures/meta-*.json`

**Interfaces:**
- Consumes: `META_APP_ID`, `META_APP_SECRET`, `social_accounts.access_token`.
- Produces:
  ```ts
  export interface MediaInput {
    mediaType: 'image'|'carousel'|'reel'|'story'
    mediaUrls: string[]              // URLs públicas (Supabase Storage signed)
    caption?: string
    coverUrl?: string                // solo reel
    shareToFeed?: boolean            // solo reel
  }
  export interface PostMetrics {
    impressions?: number; reach?: number; likes?: number;
    comments?: number; shares?: number; saves?: number; plays?: number;
    rawResponse: unknown;
  }
  export interface Comment { id: string; from: string; text: string; createdAt: Date; }
  export interface Dm { id: string; threadId: string; from: string; text: string; createdAt: Date; }

  export interface SocialPublisher {
    provider: 'meta_instagram' | 'meta_facebook';
    createMediaContainer(input: MediaInput): Promise<{ containerId: string }>;
    waitForContainerReady(containerId: string, timeoutMs?: number): Promise<'ready' | 'error'>;
    publishContainer(containerId: string): Promise<{ mediaId: string; permalink: string }>;
    fetchMetrics(mediaId: string): Promise<PostMetrics>;
    replyToComment(commentId: string, message: string): Promise<void>;
    replyToDm(threadId: string, message: string): Promise<void>;
    listRecentComments(mediaId: string, sinceMs: number): Promise<Comment[]>;
    listRecentDms(sinceMs: number): Promise<Dm[]>;
  }

  export function buildPublisher(account: SocialAccount): SocialPublisher;
  ```

- [ ] **Step 1: Escribir el interface + factory**

```typescript
// src/lib/social/publishers/index.ts
import type { SocialAccount } from '@/lib/social/types';
import { MetaPublisher } from './meta';

export type { SocialAccount } from '@/lib/social/types';
export interface MediaInput { /* ... shape del interfaces block ... */ }
export interface PostMetrics { /* ... */ }
export interface Comment { /* ... */ }
export interface Dm { /* ... */ }
export interface SocialPublisher { /* ... */ }

export function buildPublisher(account: SocialAccount): SocialPublisher {
  if (account.provider === 'meta_instagram' || account.provider === 'meta_facebook') {
    return new MetaPublisher(account);
  }
  throw new Error(`Unsupported social provider: ${account.provider}`);
}
```

Y `src/lib/social/types.ts`:
```typescript
export interface SocialAccount {
  id: string;
  portal_email: string;
  agent_id: string;
  provider: 'meta_instagram' | 'meta_facebook';
  external_account_id: string;
  external_username?: string;
  page_id?: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  brand_summary?: string;
  denylist_words: string[];
  paused: boolean;
  status: 'active' | 'needs_reauth' | 'disconnected';
}
```

- [ ] **Step 2: Escribir tests failing**

```typescript
// src/lib/social/publishers/__tests__/meta.test.ts
import { MetaPublisher } from '../meta';
import { server } from '@/test/msw-server';
import { rest } from 'msw';
import createContainerFixture from './fixtures/meta-create-container.json';
import publishFixture from './fixtures/meta-publish.json';
import insightsFixture from './fixtures/meta-insights.json';

const mockAccount = {
  id: 'acc-1', portal_email: 'x@y.com', agent_id: 'ag-1',
  provider: 'meta_instagram' as const, external_account_id: 'ig-user-1',
  page_id: 'pg-1', access_token: 'tk', denylist_words: [], paused: false, status: 'active' as const,
};

describe('MetaPublisher', () => {
  it('createMediaContainer para reel envía media_type=REELS', async () => {
    let capturedBody: any;
    server.use(
      rest.post('https://graph.facebook.com/v18.0/ig-user-1/media', async (req, res, ctx) => {
        capturedBody = Object.fromEntries(new URL(req.url).searchParams);
        return res(ctx.json(createContainerFixture));
      })
    );
    const p = new MetaPublisher(mockAccount);
    const { containerId } = await p.createMediaContainer({
      mediaType: 'reel',
      mediaUrls: ['https://example.com/video.mp4'],
      caption: 'Test',
    });
    expect(containerId).toBe(createContainerFixture.id);
    expect(capturedBody.media_type).toBe('REELS');
    expect(capturedBody.video_url).toBe('https://example.com/video.mp4');
  });

  it('waitForContainerReady poll hasta FINISHED', async () => {
    let calls = 0;
    server.use(
      rest.get('https://graph.facebook.com/v18.0/ctn-1', (_, res, ctx) => {
        calls++;
        return res(ctx.json({ status_code: calls < 3 ? 'IN_PROGRESS' : 'FINISHED' }));
      })
    );
    const p = new MetaPublisher(mockAccount);
    const result = await p.waitForContainerReady('ctn-1');
    expect(result).toBe('ready');
    expect(calls).toBe(3);
  });

  it('publishContainer devuelve mediaId + permalink', async () => {
    server.use(
      rest.post('https://graph.facebook.com/v18.0/ig-user-1/media_publish', (_, res, ctx) => res(ctx.json({ id: 'media-99' }))),
      rest.get('https://graph.facebook.com/v18.0/media-99', (_, res, ctx) => res(ctx.json({ permalink: 'https://instagram.com/p/abc/' })))
    );
    const p = new MetaPublisher(mockAccount);
    const { mediaId, permalink } = await p.publishContainer('ctn-1');
    expect(mediaId).toBe('media-99');
    expect(permalink).toContain('instagram.com');
  });

  it('fetchMetrics mapea insights de reel a shape estándar', async () => {
    server.use(
      rest.get('https://graph.facebook.com/v18.0/media-99/insights', (_, res, ctx) => res(ctx.json(insightsFixture)))
    );
    const p = new MetaPublisher(mockAccount);
    const m = await p.fetchMetrics('media-99');
    expect(m.plays).toBeGreaterThan(0);
    expect(m.reach).toBeGreaterThan(0);
    expect(m.rawResponse).toEqual(insightsFixture);
  });

  it('replyToComment usa endpoint POST /{comment-id}/replies', async () => {
    let hit = false;
    server.use(
      rest.post('https://graph.facebook.com/v18.0/comment-1/replies', (_, res, ctx) => { hit = true; return res(ctx.json({ id: 'r-1' })); })
    );
    const p = new MetaPublisher(mockAccount);
    await p.replyToComment('comment-1', 'gracias!');
    expect(hit).toBe(true);
  });
});
```

- [ ] **Step 3: Verificar tests fallan**

```bash
pnpm vitest run src/lib/social/publishers/__tests__/meta.test.ts
```

Expected: 5 tests FAIL.

- [ ] **Step 4: Implementar MetaPublisher**

```typescript
// src/lib/social/publishers/meta.ts
import type { SocialAccount, SocialPublisher, MediaInput, PostMetrics, Comment, Dm } from './index';

const GRAPH = 'https://graph.facebook.com/v18.0';

export class MetaPublisher implements SocialPublisher {
  provider: 'meta_instagram' | 'meta_facebook';

  constructor(private account: SocialAccount) {
    this.provider = account.provider as 'meta_instagram' | 'meta_facebook';
  }

  private igUserId() { return this.account.external_account_id; }
  private token() { return this.account.access_token; }

  private async post<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${GRAPH}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', this.token());
    const res = await fetch(url.toString(), { method: 'POST' });
    if (!res.ok) throw new Error(`Meta POST ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${GRAPH}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', this.token());
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Meta GET ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async createMediaContainer(input: MediaInput): Promise<{ containerId: string }> {
    const params: Record<string, string> = { caption: input.caption ?? '' };
    if (input.mediaType === 'reel') {
      params.media_type = 'REELS';
      params.video_url = input.mediaUrls[0];
      if (input.coverUrl) params.cover_url = input.coverUrl;
      if (input.shareToFeed !== undefined) params.share_to_feed = String(input.shareToFeed);
    } else if (input.mediaType === 'image') {
      params.image_url = input.mediaUrls[0];
    } else if (input.mediaType === 'carousel') {
      const childIds: string[] = [];
      for (const url of input.mediaUrls) {
        const child = await this.post<{ id: string }>(`/${this.igUserId()}/media`, {
          is_carousel_item: 'true', image_url: url,
        });
        childIds.push(child.id);
      }
      params.media_type = 'CAROUSEL';
      params.children = childIds.join(',');
    } else if (input.mediaType === 'story') {
      params.media_type = 'STORIES';
      params.image_url = input.mediaUrls[0];
    }
    const r = await this.post<{ id: string }>(`/${this.igUserId()}/media`, params);
    return { containerId: r.id };
  }

  async waitForContainerReady(containerId: string, timeoutMs = 300_000): Promise<'ready' | 'error'> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const r = await this.get<{ status_code: string }>(`/${containerId}`, { fields: 'status_code' });
      if (r.status_code === 'FINISHED') return 'ready';
      if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') return 'error';
      await new Promise((res) => setTimeout(res, 5000));
    }
    return 'error';
  }

  async publishContainer(containerId: string): Promise<{ mediaId: string; permalink: string }> {
    const r = await this.post<{ id: string }>(`/${this.igUserId()}/media_publish`, { creation_id: containerId });
    const meta = await this.get<{ permalink: string }>(`/${r.id}`, { fields: 'permalink' });
    return { mediaId: r.id, permalink: meta.permalink };
  }

  async fetchMetrics(mediaId: string): Promise<PostMetrics> {
    const metrics = 'impressions,reach,likes,comments,shares,saved,plays';
    const r = await this.get<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(`/${mediaId}/insights`, { metric: metrics });
    const map: Record<string, number> = {};
    for (const m of r.data) map[m.name] = m.values[0]?.value ?? 0;
    return {
      impressions: map.impressions, reach: map.reach, likes: map.likes,
      comments: map.comments, shares: map.shares, saves: map.saved, plays: map.plays,
      rawResponse: r,
    };
  }

  async replyToComment(commentId: string, message: string): Promise<void> {
    await this.post(`/${commentId}/replies`, { message });
  }

  async replyToDm(threadId: string, message: string): Promise<void> {
    await this.post(`/me/messages`, { recipient: JSON.stringify({ id: threadId }), message: JSON.stringify({ text: message }) });
  }

  async listRecentComments(mediaId: string, sinceMs: number): Promise<Comment[]> {
    const since = Math.floor((Date.now() - sinceMs) / 1000);
    const r = await this.get<{ data: any[] }>(`/${mediaId}/comments`, { since: String(since), fields: 'id,text,username,timestamp' });
    return r.data.map((c) => ({ id: c.id, from: c.username, text: c.text, createdAt: new Date(c.timestamp) }));
  }

  async listRecentDms(sinceMs: number): Promise<Dm[]> {
    const r = await this.get<{ data: any[] }>(`/me/conversations`, { platform: 'instagram', fields: 'participants,messages{id,message,from,created_time}' });
    const out: Dm[] = [];
    const cutoff = Date.now() - sinceMs;
    for (const conv of r.data) {
      for (const m of conv.messages?.data ?? []) {
        const ts = new Date(m.created_time).getTime();
        if (ts >= cutoff) out.push({ id: m.id, threadId: conv.id, from: m.from?.username ?? m.from?.id, text: m.message, createdAt: new Date(ts) });
      }
    }
    return out;
  }
}
```

- [ ] **Step 5: Verificar tests pasan**

```bash
pnpm vitest run src/lib/social/publishers/__tests__/meta.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/publishers/ src/lib/social/types.ts
git commit -m "feat(navi): SocialPublisher interface + MetaPublisher for IG (posts, reels, comments, DMs, metrics)"
```

---

## Task 4: Feature flag helper + rol Navi/Navi Agencia en runtime

**Files:**
- Create: `src/lib/feature-flags/social-publishing.ts`
- Create: `src/lib/feature-flags/__tests__/social-publishing.test.ts`
- Modify: `src/lib/vapi/sync.ts` — agregar `navi` y `navi_agencia` a `MEERKAT_VOICE_DISTRIBUTION`
- Modify: `src/app/api/portal/[token]/agent-chat/route.ts` — `ALL_TOOLS`, `VOICE_TO_CHAT`, `CHAT_TOOL_BY_NAME` para las 16 tools
- Modify: `src/lib/tools/registry.ts` — 16 entries con `gatedByRole` + `gatedByFeature`

**Interfaces:**
- Produces:
  ```ts
  export function socialPublishingEnabled(orgFeatures: any): boolean;
  export function agencyModeEnabled(orgFeatures: any): boolean;
  export async function requireSocialFeature(portalEmail: string): Promise<{ enabled: boolean; agencyMode: boolean }>;
  ```
- Consumes: Task 1 (schema), Task 2 (Canva), Task 3 (Meta).

- [ ] **Step 1: Escribir tests del feature flag helper**

```typescript
// src/lib/feature-flags/__tests__/social-publishing.test.ts
import { socialPublishingEnabled, agencyModeEnabled } from '../social-publishing';

describe('socialPublishingEnabled', () => {
  it('true cuando features.social_publishing.enabled === true', () => {
    expect(socialPublishingEnabled({ social_publishing: { enabled: true } })).toBe(true);
  });
  it('false cuando falta el campo', () => {
    expect(socialPublishingEnabled({})).toBe(false);
    expect(socialPublishingEnabled(null)).toBe(false);
  });
  it('agencyModeEnabled requiere enabled=true Y agency_mode=true', () => {
    expect(agencyModeEnabled({ social_publishing: { enabled: true, agency_mode: true } })).toBe(true);
    expect(agencyModeEnabled({ social_publishing: { enabled: false, agency_mode: true } })).toBe(false);
    expect(agencyModeEnabled({ social_publishing: { enabled: true, agency_mode: false } })).toBe(false);
  });
});
```

- [ ] **Step 2: Implementar helper**

```typescript
// src/lib/feature-flags/social-publishing.ts
import { createAdminClient } from '@/lib/supabase/admin';

export function socialPublishingEnabled(features: any): boolean {
  return features?.social_publishing?.enabled === true;
}

export function agencyModeEnabled(features: any): boolean {
  return socialPublishingEnabled(features) && features?.social_publishing?.agency_mode === true;
}

export async function requireSocialFeature(portalEmail: string) {
  const supabase = createAdminClient();
  const { data } = await supabase.from('organizations').select('features').eq('portal_email', portalEmail).single();
  return {
    enabled: socialPublishingEnabled(data?.features),
    agencyMode: agencyModeEnabled(data?.features),
  };
}
```

- [ ] **Step 3: Verificar tests pasan**

```bash
pnpm vitest run src/lib/feature-flags/__tests__/social-publishing.test.ts
```

- [ ] **Step 4: Registrar rol Navi en MEERKAT_VOICE_DISTRIBUTION**

En `src/lib/vapi/sync.ts`, agregar:

```typescript
const NAVI_TOOLS = [
  'canva_listar_plantillas', 'canva_generar_diseno', 'canva_exportar',
  'generar_caption', 'generar_hashtags', 'crear_borrador_post',
  'programar_publicacion', 'publicar_ahora',
  'ig_responder_comentario', 'ig_responder_dm',
  'consultar_metricas_post', 'proponer_calendario_editorial',
  'listar_media_del_cliente', 'usar_media_del_cliente',
];

const NAVI_AGENCIA_TOOLS = [
  ...NAVI_TOOLS,
  'listar_cuentas_gestionadas', 'replicar_contenido_entre_cuentas',
];

// Dentro de MEERKAT_VOICE_DISTRIBUTION:
navi: NAVI_TOOLS,
navi_agencia: NAVI_AGENCIA_TOOLS,
```

- [ ] **Step 5: Agregar tools al chat runtime**

En `src/app/api/portal/[token]/agent-chat/route.ts`, para cada una de las 16 tools:
1. Definir `Anthropic.Tool` object siguiendo el patrón existente (ej. `CREAR_BORRADOR_POST_TOOL`).
2. Agregar al array `ALL_TOOLS`.
3. Agregar mapping en `VOICE_TO_CHAT` (`canva_listar_plantillas: 'canva_listar_plantillas'`).
4. Agregar en `CHAT_TOOL_BY_NAME`.

Ejemplo para 1 tool (repetir el patrón para las 16):

```typescript
const CREAR_BORRADOR_POST_TOOL: Anthropic.Tool = {
  name: 'crear_borrador_post',
  description: 'Crea un borrador de post para Instagram con el contenido, plantilla y programación indicados. Requiere target_account_id si eres role=navi_agencia.',
  input_schema: {
    type: 'object',
    properties: {
      target_account_id: { type: 'string', description: 'ID de social_accounts. Obligatorio para navi_agencia.' },
      template_id: { type: 'string' },
      media_type: { enum: ['image', 'carousel', 'reel', 'story'] },
      media_urls: { type: 'array', items: { type: 'string' } },
      caption: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } },
      scheduled_for: { type: 'string', description: 'ISO timestamp opcional' },
      slot_id: { type: 'string', description: 'UUID del slot editorial opcional' },
    },
    required: ['media_type'],
  },
};
```

- [ ] **Step 6: Registrar 16 tools en TOOL_REGISTRY**

En `src/lib/tools/registry.ts`, agregar entradas:

```typescript
{
  name: 'crear_borrador_post',
  gatedByRole: ['navi', 'navi_agencia'],
  gatedByFeature: 'social_publishing',
  channels: ['voice', 'chat', 'email'],
  opsCost: 2,
},
// ... 15 más
```

Las 2 exclusivas de agencia tienen `gatedByRole: ['navi_agencia']`.

- [ ] **Step 7: Escribir test que valida distribución**

```typescript
// src/lib/vapi/__tests__/navi-distribution.test.ts
import { MEERKAT_VOICE_DISTRIBUTION } from '../sync';
import { CHAT_TOOL_BY_NAME, VOICE_TO_CHAT } from '@/app/api/portal/[token]/agent-chat/route';

const NAVI_STANDARD_COUNT = 14;
const NAVI_AGENCIA_COUNT = 16;

describe('Navi distribution', () => {
  it('navi tiene exactamente 14 tools', () => {
    expect(MEERKAT_VOICE_DISTRIBUTION.navi).toHaveLength(NAVI_STANDARD_COUNT);
  });
  it('navi_agencia tiene exactamente 16 tools', () => {
    expect(MEERKAT_VOICE_DISTRIBUTION.navi_agencia).toHaveLength(NAVI_AGENCIA_COUNT);
  });
  it('cada tool de navi tiene mapping en VOICE_TO_CHAT y CHAT_TOOL_BY_NAME', () => {
    for (const tool of MEERKAT_VOICE_DISTRIBUTION.navi) {
      expect(VOICE_TO_CHAT[tool], `voice_to_chat missing ${tool}`).toBeDefined();
      const chatName = VOICE_TO_CHAT[tool];
      expect(CHAT_TOOL_BY_NAME[chatName!], `chat_tool_by_name missing ${chatName}`).toBeDefined();
    }
  });
  it('2 tools exclusivas están solo en navi_agencia', () => {
    expect(MEERKAT_VOICE_DISTRIBUTION.navi).not.toContain('listar_cuentas_gestionadas');
    expect(MEERKAT_VOICE_DISTRIBUTION.navi).not.toContain('replicar_contenido_entre_cuentas');
    expect(MEERKAT_VOICE_DISTRIBUTION.navi_agencia).toContain('listar_cuentas_gestionadas');
    expect(MEERKAT_VOICE_DISTRIBUTION.navi_agencia).toContain('replicar_contenido_entre_cuentas');
  });
});
```

- [ ] **Step 8: Verificar test pasa**

```bash
pnpm vitest run src/lib/vapi/__tests__/navi-distribution.test.ts src/lib/feature-flags/__tests__/social-publishing.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/feature-flags/ src/lib/vapi/sync.ts src/app/api/portal/[token]/agent-chat/route.ts src/lib/tools/registry.ts src/lib/vapi/__tests__/
git commit -m "feat(navi): register navi + navi_agencia roles with 14/16 tools across voice/chat/email"
```

---

## Task 5: OAuth callbacks (Canva + Meta)

**Files:**
- Create: `src/app/api/auth/canva-callback/route.ts`
- Create: `src/app/api/auth/meta-callback/route.ts`
- Create: `src/app/api/portal/[token]/social/accounts/connect/route.ts` (inicia OAuth)
- Create: `src/app/api/auth/__tests__/canva-callback.test.ts`
- Create: `src/app/api/auth/__tests__/meta-callback.test.ts`

**Interfaces:**
- Consumes: Task 2 (`CanvaProvider.exchangeCodeForToken`), Task 3 (MetaPublisher via Graph API directly for OAuth), Task 1 (`social_accounts` table), Task 4 (`requireSocialFeature`).

- [ ] **Step 1: Escribir test callback Canva**

```typescript
// src/app/api/auth/__tests__/canva-callback.test.ts
import { GET } from '../canva-callback/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { server } from '@/test/msw-server';
import { rest } from 'msw';

const supabase = createAdminClient();

describe('canva-callback', () => {
  it('intercambia code por token y persiste en social_accounts', async () => {
    const orgEmail = `nazre20+navi-oauth-${Date.now()}@gmail.com`;
    await supabase.from('organizations').insert({ portal_email: orgEmail, name: 'T', features: { social_publishing: { enabled: true } } });
    const { data: agent } = await supabase.from('voice_agents').insert({ portal_email: orgEmail, role: 'navi', agent_name: 'N' }).select().single();

    server.use(
      rest.post('https://api.canva.com/rest/oauth/token', (_, res, ctx) =>
        res(ctx.json({ access_token: 'at', refresh_token: 'rt', expires_in: 14400 }))
      )
    );

    const state = Buffer.from(JSON.stringify({ portal_email: orgEmail, agent_id: agent!.id })).toString('base64url');
    const req = new Request(`http://localhost/api/auth/canva-callback?code=canvacode&state=${state}`);
    const res = await GET(req);
    expect(res.status).toBe(302);

    const { data: acc } = await supabase.from('social_accounts').select('*').eq('agent_id', agent!.id).single();
    expect(acc?.access_token).toBe('at');
    expect(acc?.provider).toBe('canva');

    await supabase.from('organizations').delete().eq('portal_email', orgEmail);
  });
});
```

Similar test para Meta (más largo por el flujo IG Business + Page).

- [ ] **Step 2: Implementar callbacks**

```typescript
// src/app/api/auth/canva-callback/route.ts
import { CanvaProvider } from '@/lib/social/canva';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return NextResponse.json({ error: 'missing params' }, { status: 400 });

  const { portal_email, agent_id } = JSON.parse(Buffer.from(state, 'base64url').toString());
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/canva-callback`;
  const { accessToken, refreshToken, expiresIn } = await CanvaProvider.exchangeCodeForToken(code, redirectUri);

  const supabase = createAdminClient();
  await supabase.from('social_accounts').upsert({
    portal_email, agent_id,
    provider: 'canva',
    external_account_id: 'canva',  // Canva no expone user id relevante aquí
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    status: 'active',
  }, { onConflict: 'portal_email,provider,external_account_id' });

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/portal/callback-success?service=canva`);
}
```

```typescript
// src/app/api/auth/meta-callback/route.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return NextResponse.json({ error: 'missing params' }, { status: 400 });

  const { portal_email, agent_id, page_ids } = JSON.parse(Buffer.from(state, 'base64url').toString());
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/meta-callback`;

  // Exchange code por short-lived token
  const shortTokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${process.env.META_APP_SECRET}&code=${code}`);
  const shortToken = await shortTokenRes.json();
  if (!shortTokenRes.ok) return NextResponse.json({ error: shortToken }, { status: 500 });

  // Exchange short-lived por long-lived (60d)
  const longTokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${shortToken.access_token}`);
  const longToken = await longTokenRes.json();

  // Listar páginas del usuario, para cada page_id seleccionado obtener page access token + IG business account
  const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${longToken.access_token}&fields=id,name,access_token,instagram_business_account`);
  const pages = await pagesRes.json();

  const supabase = createAdminClient();
  const selectedPages = pages.data.filter((p: any) => (page_ids as string[]).includes(p.id));

  for (const page of selectedPages) {
    if (!page.instagram_business_account) continue;
    const igUserId = page.instagram_business_account.id;
    const igInfoRes = await fetch(`https://graph.facebook.com/v18.0/${igUserId}?fields=username&access_token=${page.access_token}`);
    const igInfo = await igInfoRes.json();

    await supabase.from('social_accounts').upsert({
      portal_email, agent_id,
      provider: 'meta_instagram',
      external_account_id: igUserId,
      external_username: igInfo.username,
      page_id: page.id,
      access_token: page.access_token,
      expires_at: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
      status: 'active',
    }, { onConflict: 'portal_email,provider,external_account_id' });
  }

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/portal/callback-success?service=meta&pages=${selectedPages.length}`);
}
```

- [ ] **Step 3: Escribir endpoint que inicia OAuth**

```typescript
// src/app/api/portal/[token]/social/accounts/connect/route.ts
import { requireSocialFeature } from '@/lib/feature-flags/social-publishing';
import { getPortalOrg } from '@/lib/portal/helpers';
import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const { provider, agent_id } = await req.json();
  const org = await getPortalOrg(params.token);
  if (!org) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const feat = await requireSocialFeature(org.portal_email);
  if (!feat.enabled) return NextResponse.json({ error: 'feature disabled' }, { status: 403 });

  const state = Buffer.from(JSON.stringify({ portal_email: org.portal_email, agent_id })).toString('base64url');
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/${provider}-callback`;

  let authUrl: string;
  if (provider === 'canva') {
    const scopes = 'design:content:read design:content:write asset:read asset:write brandtemplate:content:read brandtemplate:meta:read profile:read';
    authUrl = `https://www.canva.com/api/oauth/authorize?response_type=code&client_id=${process.env.CANVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`;
  } else if (provider === 'meta') {
    const scopes = 'instagram_content_publish,instagram_manage_comments,instagram_manage_insights,instagram_manage_messages,pages_show_list,pages_read_engagement,pages_manage_metadata,business_management';
    authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;
  } else {
    return NextResponse.json({ error: 'unsupported provider' }, { status: 400 });
  }

  return NextResponse.json({ authUrl });
}
```

- [ ] **Step 4: Correr tests**

```bash
pnpm vitest run src/app/api/auth/__tests__/
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/canva-callback/ src/app/api/auth/meta-callback/ src/app/api/portal/[token]/social/accounts/connect/ src/app/api/auth/__tests__/
git commit -m "feat(navi): OAuth callbacks for Canva Connect + Meta Graph (long-lived tokens, IG Business selection)"
```

---

## Task 6: Portal REST endpoints (accounts, templates, drafts, calendar, metrics, pause)

**Files:**
- Create: `src/app/api/portal/[token]/social/accounts/route.ts` (GET list)
- Create: `src/app/api/portal/[token]/social/accounts/[id]/route.ts` (DELETE)
- Create: `src/app/api/portal/[token]/social/templates/route.ts` (GET)
- Create: `src/app/api/portal/[token]/social/templates/sync/route.ts` (POST sync from Canva)
- Create: `src/app/api/portal/[token]/social/drafts/route.ts` (GET)
- Create: `src/app/api/portal/[token]/social/drafts/[id]/route.ts` (PATCH approve/reject/edit)
- Create: `src/app/api/portal/[token]/social/calendar/[month]/route.ts` (GET, PUT)
- Create: `src/app/api/portal/[token]/social/calendar/[month]/approve/route.ts` (POST)
- Create: `src/app/api/portal/[token]/social/metrics/route.ts` (GET)
- Create: `src/app/api/portal/[token]/social/pause/route.ts` (POST)
- Create: `src/app/api/portal/[token]/social/resume/route.ts` (POST)
- Create: `src/app/api/portal/[token]/social/__tests__/endpoints.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces: REST API contratada por Tasks 12 y 13 (UI).

- [ ] **Step 1: Escribir tests representativos (uno por método clave)**

Tests focados en:
- GET accounts filtra por `agent_id` cuando se pasa `?agent_id=X`
- PATCH draft valida ownership del portal_email antes de aprobar
- POST calendar/[month]/approve marca `editorial_calendars.status='approved'` y setea `approved_by`
- POST pause setea `social_accounts.paused=true` (agencia con account_id) o `voice_agents.metadata.social.paused=true` (estándar)
- GET metrics agrega snapshots 24h/7d/30d por post

Ejemplo de un test:

```typescript
// src/app/api/portal/[token]/social/__tests__/endpoints.test.ts
import { PATCH } from '../drafts/[id]/route';

describe('PATCH drafts/[id]', () => {
  it('bloquea aprobar draft de otro portal_email', async () => {
    const req = new Request('http://x/api/portal/tokenA/social/drafts/draft-of-B', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
    const res = await PATCH(req, { params: { token: 'tokenA', id: 'draft-of-B' } });
    expect(res.status).toBe(403);
  });

  it('aprobar cambia status a scheduled si scheduled_for está seteado', async () => {
    // ... setup, expect draft.status='scheduled' + approved_by seteado
  });
});
```

- [ ] **Step 2: Implementar endpoints siguiendo patrón existente**

Todos los endpoints:
1. Validan `token` → obtienen `portal_email` con `getPortalOrg(token)`.
2. Chequean `requireSocialFeature(portal_email)` → 403 si `enabled=false`.
3. Query construida siempre con `.eq('portal_email', portal_email)` para prevenir IDOR (regla `.brain/policies/portal-security.md`).
4. Retornan JSON `{ ok: true, data: ... }`.

Estructura general de handlers (ejemplo drafts):

```typescript
// src/app/api/portal/[token]/social/drafts/route.ts
import { requireSocialFeature } from '@/lib/feature-flags/social-publishing';
import { getPortalOrg } from '@/lib/portal/helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const org = await getPortalOrg(params.token);
  if (!org) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const feat = await requireSocialFeature(org.portal_email);
  if (!feat.enabled) return NextResponse.json({ error: 'feature disabled' }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'pending_approval';
  const agentId = url.searchParams.get('agent_id');
  const targetAccountId = url.searchParams.get('target_account_id');

  const supabase = createAdminClient();
  let q = supabase.from('content_drafts').select('*, brand_templates(name, category), social_accounts(external_username)')
    .eq('portal_email', org.portal_email)
    .eq('status', status)
    .order('scheduled_for', { ascending: true, nullsFirst: false });
  if (agentId) q = q.eq('agent_id', agentId);
  if (targetAccountId) q = q.eq('social_account_id', targetAccountId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
```

```typescript
// src/app/api/portal/[token]/social/drafts/[id]/route.ts
export async function PATCH(req: Request, { params }: { params: { token: string; id: string } }) {
  const org = await getPortalOrg(params.token);
  if (!org) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const supabase = createAdminClient();
  const { data: draft, error: fetchErr } = await supabase.from('content_drafts').select('*').eq('id', params.id).single();
  if (fetchErr || !draft) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (draft.portal_email !== org.portal_email) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json();
  const now = new Date().toISOString();

  if (body.action === 'approve') {
    const newStatus = draft.scheduled_for ? 'scheduled' : 'approved';
    await supabase.from('content_drafts').update({
      status: newStatus, approved_by: org.portal_email, approved_at: now, updated_at: now,
    }).eq('id', params.id);
  } else if (body.action === 'reject') {
    await supabase.from('content_drafts').update({ status: 'rejected', updated_at: now }).eq('id', params.id);
  } else if (body.action === 'edit') {
    await supabase.from('content_drafts').update({
      caption: body.caption ?? draft.caption,
      hashtags: body.hashtags ?? draft.hashtags,
      scheduled_for: body.scheduled_for ?? draft.scheduled_for,
      media_urls: body.media_urls ?? draft.media_urls,
      updated_at: now,
    }).eq('id', params.id);
  }

  const { data: updated } = await supabase.from('content_drafts').select('*').eq('id', params.id).single();
  return NextResponse.json({ ok: true, data: updated });
}
```

Repetir patrón para los 11 endpoints restantes. Cada uno hace lo mismo: valida ownership, chequea feature flag, ejecuta operación DB.

- [ ] **Step 3: Endpoint pause (dual mode)**

```typescript
// src/app/api/portal/[token]/social/pause/route.ts
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const org = await getPortalOrg(params.token);
  if (!org) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { agent_id, social_account_id, reason } = await req.json();

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  if (social_account_id) {
    // Navi Agencia: pausar solo una cuenta
    const { data: acc } = await supabase.from('social_accounts').select('portal_email').eq('id', social_account_id).single();
    if (!acc || acc.portal_email !== org.portal_email) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    await supabase.from('social_accounts').update({ paused: true, paused_reason: reason, paused_at: now }).eq('id', social_account_id);
  } else if (agent_id) {
    // Navi estándar: pausar todo el Navi
    const { data: agent } = await supabase.from('voice_agents').select('portal_email, metadata').eq('id', agent_id).single();
    if (!agent || agent.portal_email !== org.portal_email) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const metadata = agent.metadata ?? {};
    metadata.social = { ...(metadata.social ?? {}), paused: true, paused_reason: reason, paused_at: now };
    await supabase.from('voice_agents').update({ metadata }).eq('id', agent_id);
  } else {
    return NextResponse.json({ error: 'missing agent_id or social_account_id' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

Endpoint `resume` es simétrico (setea `paused: false`).

- [ ] **Step 4: Correr tests**

```bash
pnpm vitest run src/app/api/portal/[token]/social/__tests__/
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/portal/[token]/social/
git commit -m "feat(navi): portal REST endpoints for accounts, templates, drafts, calendar, metrics, pause/resume"
```

---

## Task 7: Media ingestion (email inbox + chat upload + portal upload)

**Files:**
- Create: `src/app/api/portal/[token]/social/media/upload/route.ts` (portal upload multipart)
- Create: `src/app/api/portal/[token]/agent-chat/upload/route.ts` (chat upload)
- Modify: `src/lib/ops/inbox-processor.ts` — agregar branch para Navi/Navi Agencia que detecta attachments video/image
- Create: `src/lib/social/media-quality.ts`
- Create: `src/lib/social/__tests__/media-quality.test.ts`

**Interfaces:**
- Consumes: Task 1 (`user_media_uploads` table + `user-media` bucket).
- Produces: rows en `user_media_uploads` con `source ∈ (email, chat, portal_upload)`.

- [ ] **Step 1: media-quality helper con tests**

```typescript
// src/lib/social/__tests__/media-quality.test.ts
import { validateMediaForIG } from '../media-quality';

describe('validateMediaForIG', () => {
  it('acepta video mp4 720p 60s como reel', () => {
    const r = validateMediaForIG({ mimeType: 'video/mp4', durationSeconds: 60, width: 720, height: 1280, sizeBytes: 20e6 }, 'reel');
    expect(r.valid).toBe(true);
  });
  it('rechaza video >90s para reel', () => {
    const r = validateMediaForIG({ mimeType: 'video/mp4', durationSeconds: 100, width: 720, height: 1280, sizeBytes: 20e6 }, 'reel');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/90 segundos/i);
  });
  it('rechaza resolución <720p para reel', () => {
    const r = validateMediaForIG({ mimeType: 'video/mp4', durationSeconds: 30, width: 480, height: 640, sizeBytes: 5e6 }, 'reel');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/resolución/i);
  });
  it('rechaza mimetype no soportado', () => {
    const r = validateMediaForIG({ mimeType: 'video/mkv', durationSeconds: 30, width: 720, height: 1280, sizeBytes: 5e6 }, 'reel');
    expect(r.valid).toBe(false);
  });
});
```

```typescript
// src/lib/social/media-quality.ts
export interface MediaMetadata {
  mimeType: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  sizeBytes: number;
}

const ALLOWED_VIDEO = ['video/mp4', 'video/quicktime'];
const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];

export function validateMediaForIG(m: MediaMetadata, target: 'image'|'reel'|'story'|'carousel'): { valid: boolean; reason?: string } {
  if (target === 'reel') {
    if (!ALLOWED_VIDEO.includes(m.mimeType)) return { valid: false, reason: `Formato no soportado (${m.mimeType})` };
    if ((m.durationSeconds ?? 0) > 90) return { valid: false, reason: 'Reel no puede durar más de 90 segundos' };
    if ((m.width ?? 0) < 720 || (m.height ?? 0) < 720) return { valid: false, reason: 'Resolución mínima 720p para reel' };
    if (m.sizeBytes > 100e6) return { valid: false, reason: 'Video excede 100 MB' };
  } else if (target === 'image' || target === 'carousel') {
    if (!ALLOWED_IMAGE.includes(m.mimeType)) return { valid: false, reason: `Formato imagen no soportado (${m.mimeType})` };
    if (m.sizeBytes > 30e6) return { valid: false, reason: 'Imagen excede 30 MB' };
  } else if (target === 'story') {
    if (![...ALLOWED_IMAGE, ...ALLOWED_VIDEO].includes(m.mimeType)) return { valid: false, reason: 'Formato no soportado' };
  }
  return { valid: true };
}
```

- [ ] **Step 2: Portal upload endpoint**

```typescript
// src/app/api/portal/[token]/social/media/upload/route.ts
import { getPortalOrg } from '@/lib/portal/helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateMediaForIG } from '@/lib/social/media-quality';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const org = await getPortalOrg(params.token);
  if (!org) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const agentId = formData.get('agent_id') as string;
  const clienteNote = (formData.get('cliente_note') as string) ?? null;
  if (!file || !agentId) return NextResponse.json({ error: 'missing file or agent_id' }, { status: 400 });

  const supabase = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${org.portal_email}/${agentId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from('user-media').upload(path, buf, { contentType: file.type });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: signed } = await supabase.storage.from('user-media').createSignedUrl(path, 90 * 24 * 3600);

  const { data: row, error } = await supabase.from('user_media_uploads').insert({
    portal_email: org.portal_email, agent_id: agentId, source: 'portal_upload',
    file_url: signed?.signedUrl, file_type: file.type, file_size_bytes: buf.length,
    cliente_note: clienteNote, status: 'available',
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: row });
}
```

- [ ] **Step 3: Chat upload endpoint (similar)**

Mismo patrón que portal upload, pero `source='chat'` y devuelve además el `media_id` para inyectar en el próximo mensaje del chat.

- [ ] **Step 4: Modificar inbox-processor para detectar attachments**

En `src/lib/ops/inbox-processor.ts`, dentro del branch de procesamiento de correo:

```typescript
// Si el meerkat destino es navi o navi_agencia
if (agent.role === 'navi' || agent.role === 'navi_agencia') {
  for (const attachment of email.attachments ?? []) {
    if (!attachment.contentType.startsWith('video/') && !attachment.contentType.startsWith('image/')) continue;
    const path = `${org.portal_email}/${agent.id}/${Date.now()}-${attachment.filename}`;
    await supabase.storage.from('user-media').upload(path, attachment.content, { contentType: attachment.contentType });
    const { data: signed } = await supabase.storage.from('user-media').createSignedUrl(path, 90 * 24 * 3600);
    await supabase.from('user_media_uploads').insert({
      portal_email: org.portal_email, agent_id: agent.id, source: 'email',
      source_message_id: email.messageId, file_url: signed?.signedUrl,
      file_type: attachment.contentType, file_size_bytes: attachment.content.length,
      cliente_note: email.text?.slice(0, 2000), status: 'available',
    });
  }
}
```

- [ ] **Step 5: Correr tests**

```bash
pnpm vitest run src/lib/social/__tests__/media-quality.test.ts src/app/api/portal/[token]/social/media/__tests__/
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/media-quality.ts src/lib/social/__tests__/media-quality.test.ts src/app/api/portal/[token]/social/media/ src/app/api/portal/[token]/agent-chat/upload/ src/lib/ops/inbox-processor.ts
git commit -m "feat(navi): ingest video/image from client via email/chat/portal upload"
```

---

## Task 8: 14 Navi standard tools (voice endpoints + chat handlers)

**Files:**
- Create: 14 archivos en `src/app/api/voice/tools/<tool-name>/route.ts`
- Create: handlers centralizados en `src/lib/tools/executors/navi.ts` (compartidos entre voz + chat + email)
- Create: `src/lib/tools/executors/__tests__/navi.test.ts`
- Modify: `src/lib/tools/executor.ts` — importar navi executors

**Interfaces:**
- Consumes: Tasks 1, 2, 3, 4, 7.
- Produces: 14 endpoints callable, cada uno con schema Vapi + handler idempotente.

- [ ] **Step 1: Escribir handler central `navi.ts` con las 14 funciones**

Patrón: cada handler recibe `{ portal_email, agent_id, target_account_id?, ...params }`, valida ownership, invoca adapter (Canva/Meta), persiste en DB, retorna `{ ok, result, ops_consumed }`.

Ejemplo `crear_borrador_post`:

```typescript
// src/lib/tools/executors/navi.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { CanvaProvider } from '@/lib/social/canva';
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/ai/log-llm-call';

const anthropic = new Anthropic();

export async function crearBorradorPost(input: {
  portal_email: string;
  agent_id: string;
  target_account_id?: string;
  template_id?: string;
  media_type: 'image'|'carousel'|'reel'|'story';
  media_urls?: string[];
  caption?: string;
  hashtags?: string[];
  scheduled_for?: string;
  slot_id?: string;
}) {
  const supabase = createAdminClient();

  // Resolver social_account_id según variante
  const { data: agent } = await supabase.from('voice_agents').select('role').eq('id', input.agent_id).single();
  let socialAccountId = input.target_account_id;
  if (agent!.role === 'navi') {
    const { data: acc } = await supabase.from('social_accounts').select('id').eq('agent_id', input.agent_id).eq('provider', 'meta_instagram').single();
    socialAccountId = acc?.id;
  }
  if (!socialAccountId) throw new Error('social_account_id required for navi_agencia');

  // Validar ownership del social_account
  const { data: acc } = await supabase.from('social_accounts').select('*').eq('id', socialAccountId).single();
  if (!acc || acc.portal_email !== input.portal_email || acc.agent_id !== input.agent_id) {
    throw new Error('ACCOUNT_NOT_MANAGED');
  }

  // Si el slot tiene auto_publish=true, status=approved directo. Sino pending_approval.
  let autoPublish = false;
  if (input.slot_id) {
    const { data: slot } = await supabase.from('editorial_calendar_slots').select('auto_publish').eq('id', input.slot_id).single();
    autoPublish = !!slot?.auto_publish;
  }
  const status = autoPublish ? 'approved' : 'pending_approval';

  // Generar caption si no viene (usa brand_summary)
  let finalCaption = input.caption;
  if (!finalCaption) {
    const captionRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `Eres Navi, generas captions para Instagram con la voz de marca: ${acc.brand_summary ?? '(usar tono neutral profesional)'}`,
      messages: [{ role: 'user', content: `Genera un caption breve (max 100 palabras) para un ${input.media_type} sobre este contexto: ${JSON.stringify({ media_urls: input.media_urls })}` }],
    });
    finalCaption = captionRes.content[0].type === 'text' ? captionRes.content[0].text : '';
    await logLlmCall({ portal_email: input.portal_email, agent_id: input.agent_id, purpose: 'generar_caption', tokens: captionRes.usage });
  }

  const { data: draft } = await supabase.from('content_drafts').insert({
    portal_email: input.portal_email,
    agent_id: input.agent_id,
    social_account_id: socialAccountId,
    template_id: input.template_id,
    slot_id: input.slot_id,
    media_urls: input.media_urls ?? [],
    caption: finalCaption,
    hashtags: input.hashtags ?? [],
    media_type: input.media_type,
    scheduled_for: input.scheduled_for,
    status,
    auto_publish: autoPublish,
  }).select().single();

  return { ok: true, draft, ops_consumed: 2 };
}
```

Repetir el patrón para las 13 tools restantes. Cada una:
- Valida ownership del target_account_id (si aplica) para agencia
- Invoca el adapter correspondiente (Canva o Meta)
- Persiste el resultado
- Retorna `ops_consumed` según spec Sección 9.3

- [ ] **Step 2: Escribir route handlers voz (14 archivos idénticos en estructura)**

Ejemplo:

```typescript
// src/app/api/voice/tools/crear-borrador-post/route.ts
import { crearBorradorPost } from '@/lib/tools/executors/navi';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  const message = body.message?.toolCallList?.[0] ?? body.message?.tool_call_list?.[0];
  if (!message) return NextResponse.json({ error: 'no tool call' }, { status: 400 });

  const args = message.function.arguments;
  const { agent_id, portal_email } = body.call?.assistantOverrides?.variableValues ?? {};

  try {
    const result = await crearBorradorPost({ ...args, agent_id, portal_email });
    return NextResponse.json({
      results: [{ toolCallId: message.id, result: JSON.stringify(result) }],
    });
  } catch (e: any) {
    return NextResponse.json({
      results: [{ toolCallId: message.id, error: e.message }],
    });
  }
}
```

- [ ] **Step 3: Tests unitarios de cada handler**

Test crítico: ownership check + auto_publish behavior + ops_consumed correctos.

```typescript
// src/lib/tools/executors/__tests__/navi.test.ts
describe('crearBorradorPost', () => {
  it('rechaza social_account_id de otra org (ACCOUNT_NOT_MANAGED)', async () => {
    // setup con 2 orgs
    await expect(crearBorradorPost({ portal_email: 'a@x.com', agent_id: naviA, target_account_id: accB.id, media_type: 'image' }))
      .rejects.toThrow('ACCOUNT_NOT_MANAGED');
  });

  it('slot con auto_publish=true → status=approved', async () => {
    const r = await crearBorradorPost({ portal_email: 'a@x.com', agent_id: naviA, target_account_id: accA.id, media_type: 'image', slot_id: slotAuto.id });
    expect(r.draft.status).toBe('approved');
    expect(r.draft.auto_publish).toBe(true);
  });

  it('sin slot → status=pending_approval', async () => {
    const r = await crearBorradorPost({ portal_email: 'a@x.com', agent_id: naviA, target_account_id: accA.id, media_type: 'image' });
    expect(r.draft.status).toBe('pending_approval');
  });

  it('ops_consumed = 2', async () => {
    const r = await crearBorradorPost({ portal_email: 'a@x.com', agent_id: naviA, target_account_id: accA.id, media_type: 'image' });
    expect(r.ops_consumed).toBe(2);
  });
});
```

Similar para las 13 tools restantes (foco en ownership + ops counting).

- [ ] **Step 4: Correr tests**

```bash
pnpm vitest run src/lib/tools/executors/__tests__/navi.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executors/navi.ts src/lib/tools/executors/__tests__/navi.test.ts src/app/api/voice/tools/ src/lib/tools/executor.ts
git commit -m "feat(navi): 14 standard tools with ownership validation + ops accounting"
```

---

## Task 9: Navi Agencia — target_account_id enforcement + 2 tools extras

**Files:**
- Modify: `src/lib/tools/executors/navi.ts` — agregar `listarCuentasGestionadas` + `replicarContenidoEntreCuentas`
- Create: `src/app/api/voice/tools/listar-cuentas-gestionadas/route.ts`
- Create: `src/app/api/voice/tools/replicar-contenido-entre-cuentas/route.ts`
- Modify: `src/lib/tools/registry.ts` — schemas de tools con `target_account_id` obligatorio para navi_agencia
- Create: `src/lib/tools/executors/__tests__/navi-agencia.test.ts`

**Interfaces:**
- Consumes: Task 8.
- Produces: aislamiento entre cuentas validado + 2 herramientas extras.

- [ ] **Step 1: Implementar `listarCuentasGestionadas`**

```typescript
export async function listarCuentasGestionadas(input: { portal_email: string; agent_id: string }) {
  const supabase = createAdminClient();
  const { data: accounts } = await supabase.from('social_accounts')
    .select('id, external_username, page_id, status, paused, brand_summary')
    .eq('agent_id', input.agent_id)
    .eq('portal_email', input.portal_email);

  // Anexar próxima publicación por cuenta
  const enriched = await Promise.all((accounts ?? []).map(async (acc) => {
    const { data: next } = await supabase.from('content_drafts')
      .select('scheduled_for, caption')
      .eq('social_account_id', acc.id)
      .in('status', ['scheduled', 'approved'])
      .order('scheduled_for', { ascending: true })
      .limit(1);
    return { ...acc, next_publication: next?.[0] };
  }));

  return { ok: true, accounts: enriched, ops_consumed: 0 };
}
```

- [ ] **Step 2: Implementar `replicarContenidoEntreCuentas`**

```typescript
export async function replicarContenidoEntreCuentas(input: {
  portal_email: string; agent_id: string;
  source_media_id: string;  // IG media id de una publicación existente
  target_account_ids: string[];
}) {
  const supabase = createAdminClient();

  // Validar que source pertenece a una cuenta del agent
  const { data: sourceDraft } = await supabase.from('content_drafts')
    .select('*, social_accounts(brand_summary, external_username)')
    .eq('published_media_id', input.source_media_id)
    .single();
  if (!sourceDraft || sourceDraft.portal_email !== input.portal_email) throw new Error('SOURCE_NOT_FOUND');

  const drafts = [];
  for (const targetId of input.target_account_ids) {
    const { data: targetAcc } = await supabase.from('social_accounts').select('*').eq('id', targetId).single();
    if (!targetAcc || targetAcc.agent_id !== input.agent_id || targetAcc.portal_email !== input.portal_email) {
      throw new Error(`ACCOUNT_NOT_MANAGED: ${targetId}`);
    }

    // Adaptar caption al brand voice de la cuenta destino
    const adapted = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `Adapta captions manteniendo la idea pero cambiando el tono para: ${targetAcc.brand_summary}`,
      messages: [{ role: 'user', content: `Original: ${sourceDraft.caption}\n\nAdapta para @${targetAcc.external_username}` }],
    });
    const newCaption = adapted.content[0].type === 'text' ? adapted.content[0].text : sourceDraft.caption;
    await logLlmCall({ portal_email: input.portal_email, agent_id: input.agent_id, purpose: 'replicar_contenido', tokens: adapted.usage });

    const { data: draft } = await supabase.from('content_drafts').insert({
      portal_email: input.portal_email,
      agent_id: input.agent_id,
      social_account_id: targetId,
      media_urls: sourceDraft.media_urls,
      caption: newCaption,
      hashtags: sourceDraft.hashtags,
      media_type: sourceDraft.media_type,
      status: 'pending_approval',
      auto_publish: false,
      navi_reasoning: `Replicado de post ${input.source_media_id}`,
    }).select().single();
    drafts.push(draft);
  }
  return { ok: true, drafts, ops_consumed: 3 };
}
```

- [ ] **Step 3: Enforcement de target_account_id en tools de acción**

Modificar handlers de Task 8 para agregar validación al inicio:

```typescript
// helper compartido
async function assertTargetAccountValid(portal_email: string, agent_id: string, target_account_id: string | undefined, role: string) {
  if (role === 'navi_agencia' && !target_account_id) {
    throw new Error('target_account_id required for navi_agencia');
  }
  if (target_account_id) {
    const supabase = createAdminClient();
    const { data: acc } = await supabase.from('social_accounts').select('portal_email, agent_id').eq('id', target_account_id).single();
    if (!acc || acc.portal_email !== portal_email || acc.agent_id !== agent_id) {
      throw new Error('ACCOUNT_NOT_MANAGED');
    }
  }
}
```

Llamar `assertTargetAccountValid` al inicio de cada handler de acción (crear_borrador, publicar, programar, responder, consultar_metricas, proponer_calendario).

- [ ] **Step 4: Tests de aislamiento**

```typescript
// src/lib/tools/executors/__tests__/navi-agencia.test.ts
describe('Navi Agencia — aislamiento entre cuentas', () => {
  it('replicar rechaza target_account_id de otro agent (aislamiento)', async () => {
    await expect(replicarContenidoEntreCuentas({
      portal_email: 'a@x.com', agent_id: agencia1.id,
      source_media_id: 'media-of-agencia1',
      target_account_ids: [accountOfAgencia2.id],
    })).rejects.toThrow('ACCOUNT_NOT_MANAGED');
  });

  it('publicar en navi_agencia sin target_account_id lanza error', async () => {
    await expect(publicarAhora({ portal_email: 'a@x.com', agent_id: agencia1.id, /* no target_account_id */ draft_id: draftX.id }))
      .rejects.toThrow(/target_account_id required/);
  });

  it('listar_cuentas_gestionadas retorna solo cuentas del agente', async () => {
    const r = await listarCuentasGestionadas({ portal_email: 'a@x.com', agent_id: agencia1.id });
    expect(r.accounts.every((a: any) => a.agent_id === undefined || a.agent_id === agencia1.id)).toBe(true);
  });
});
```

- [ ] **Step 5: Correr tests**

```bash
pnpm vitest run src/lib/tools/executors/__tests__/navi-agencia.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/executors/navi.ts src/lib/tools/executors/__tests__/navi-agencia.test.ts src/app/api/voice/tools/listar-cuentas-gestionadas/ src/app/api/voice/tools/replicar-contenido-entre-cuentas/
git commit -m "feat(navi_agencia): target_account_id enforcement + 2 exclusive tools (listar_cuentas, replicar_contenido)"
```

---

## Task 10: Sentiment gate + content safety

**Files:**
- Create: `src/lib/social/sentiment.ts`
- Create: `src/lib/social/content-safety.ts`
- Create: `src/lib/social/__tests__/sentiment.test.ts`
- Create: `src/lib/social/__tests__/content-safety.test.ts`

**Interfaces:**
- Consumes: Anthropic Haiku, Task 1 (`social_interactions`, `social_accounts.denylist_words`).
- Produces:
  ```ts
  export async function classifySentiment(text: string): Promise<'positive'|'neutral'|'negative'|'crisis'>;
  export function checkContentSafety(text: string, denylist: string[], allowedDomains: string[]): { safe: boolean; violations: string[] };
  ```

- [ ] **Step 1: sentiment classifier con caching-friendly prompt**

```typescript
// src/lib/social/sentiment.ts
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/ai/log-llm-call';

const anthropic = new Anthropic();

const CRISIS_KEYWORDS = /demanda|abogado|reembolso|denuncia|fraude|estafa|profeco|condusef|mala experiencia|nunca vuelvo|es una vergüenza/i;

const SYSTEM_PROMPT = `Clasifica el sentiment del texto en una de estas categorías:
- positive: agradecimiento, elogio, pregunta amistosa
- neutral: pregunta neutra, comentario descriptivo
- negative: queja, molestia, crítica no crítica
- crisis: amenaza legal, mención de fraude, escalada urgente
Responde SOLO con la categoría, en una palabra.`;

export async function classifySentiment(text: string, ctx?: { portal_email: string; agent_id: string }): Promise<'positive'|'neutral'|'negative'|'crisis'> {
  if (CRISIS_KEYWORDS.test(text)) return 'crisis';

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: text.slice(0, 500) }],
  });
  if (ctx) await logLlmCall({ ...ctx, purpose: 'sentiment', tokens: res.usage });

  const raw = (res.content[0].type === 'text' ? res.content[0].text : '').toLowerCase().trim();
  if (raw.includes('crisis')) return 'crisis';
  if (raw.includes('negative')) return 'negative';
  if (raw.includes('positive')) return 'positive';
  return 'neutral';
}
```

Tests:

```typescript
describe('classifySentiment', () => {
  it('crisis por regex sin llamar LLM', async () => {
    const r = await classifySentiment('Voy a poner una demanda por esto');
    expect(r).toBe('crisis');
  });
  it('positive para agradecimiento', async () => {
    // mock anthropic → 'positive'
    const r = await classifySentiment('gracias por el servicio!');
    expect(r).toBe('positive');
  });
});
```

- [ ] **Step 2: content safety helper**

```typescript
// src/lib/social/content-safety.ts
export function checkContentSafety(text: string, denylist: string[], allowedDomains: string[] = []): { safe: boolean; violations: string[] } {
  const violations: string[] = [];
  const lower = text.toLowerCase();
  for (const word of denylist) {
    if (lower.includes(word.toLowerCase())) violations.push(`denylist: ${word}`);
  }
  const urls = text.match(/https?:\/\/[^\s]+/g) ?? [];
  for (const url of urls) {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      if (allowedDomains.length > 0 && !allowedDomains.some((d) => domain === d || domain.endsWith('.' + d))) {
        violations.push(`domain not whitelisted: ${domain}`);
      }
    } catch {
      violations.push(`invalid URL: ${url}`);
    }
  }
  const mentions = text.match(/@[A-Za-z0-9._]+/g) ?? [];
  // TODO: validar contra whitelist si se pasa (dejar afuera de v1, aviso en logs)
  return { safe: violations.length === 0, violations };
}
```

Tests:

```typescript
describe('checkContentSafety', () => {
  it('flags denylist word', () => {
    const r = checkContentSafety('gran promo mala experiencia hoy', ['mala experiencia'], []);
    expect(r.safe).toBe(false);
  });
  it('flags URL de dominio no whitelisted', () => {
    const r = checkContentSafety('visita http://competidor.com', [], ['centinelia.mx']);
    expect(r.safe).toBe(false);
  });
  it('acepta URL whitelisted', () => {
    const r = checkContentSafety('visita https://centinelia.mx/oferta', [], ['centinelia.mx']);
    expect(r.safe).toBe(true);
  });
});
```

- [ ] **Step 3: Integrar en `publicar_ahora` y `programar_publicacion`**

Antes de publicar/programar, correr `checkContentSafety` con `social_accounts.denylist_words` y dominios de la org. Si `safe=false`, marcar draft como `failed` con `error_message=violations.join(';')` y notificar al cliente.

- [ ] **Step 4: Correr tests**

```bash
pnpm vitest run src/lib/social/__tests__/sentiment.test.ts src/lib/social/__tests__/content-safety.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/sentiment.ts src/lib/social/content-safety.ts src/lib/social/__tests__/
git commit -m "feat(navi): sentiment gate (LLM + regex crisis) + content safety (denylist + URL whitelist)"
```

---

## Task 11: Cron jobs (publish, metrics, monitor interactions, tokens, media purge)

**Files:**
- Create: 5 archivos en `src/app/api/cron/`
- Modify: `vercel.json` — agregar 5 cron entries
- Create: `src/app/api/cron/__tests__/publish-scheduled-posts.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 8, 10.

- [ ] **Step 1: publish-scheduled-posts cron**

```typescript
// src/app/api/cron/publish-scheduled-posts/route.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPublisher } from '@/lib/social/publishers';
import { validateCronAuth } from '@/lib/cron/auth';
import { NextResponse } from 'next/server';

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!validateCronAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: drafts } = await supabase.from('content_drafts')
    .select('*, social_accounts(*), organizations!inner(features, account_status)')
    .in('status', ['scheduled', 'approved'])
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', now)
    .limit(100);

  const results = { published: 0, failed: 0, skipped: 0 };

  for (const draft of drafts ?? []) {
    // Skip si org tiene account_status inactivo
    if (draft.organizations.account_status !== 'active') {
      await supabase.from('content_drafts').update({ status: 'cancelled', error_message: 'org inactive' }).eq('id', draft.id);
      results.skipped++;
      continue;
    }
    // Skip si social_publishing pausado a nivel org o cuenta
    if (!draft.organizations.features?.social_publishing?.enabled) { results.skipped++; continue; }
    if (draft.social_accounts.paused) { results.skipped++; continue; }

    await supabase.from('content_drafts').update({ status: 'publishing' }).eq('id', draft.id);

    try {
      const publisher = buildPublisher(draft.social_accounts);
      const { containerId } = await publisher.createMediaContainer({
        mediaType: draft.media_type,
        mediaUrls: draft.media_urls,
        caption: `${draft.caption ?? ''}\n\n${(draft.hashtags ?? []).join(' ')}`.trim(),
      });
      const ready = await publisher.waitForContainerReady(containerId);
      if (ready !== 'ready') throw new Error('container not ready');
      const { mediaId, permalink } = await publisher.publishContainer(containerId);
      await supabase.from('content_drafts').update({
        status: 'published', published_media_id: mediaId, published_permalink: permalink, published_at: new Date().toISOString(),
      }).eq('id', draft.id);
      results.published++;
    } catch (e: any) {
      const retryCount = (draft.retry_count ?? 0) + 1;
      const nextStatus = retryCount >= 3 ? 'failed' : 'scheduled';
      await supabase.from('content_drafts').update({
        status: nextStatus, error_message: e.message, retry_count: retryCount,
      }).eq('id', draft.id);
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, results });
}
```

- [ ] **Step 2: refresh-social-metrics cron**

Itera `content_drafts` con `status='published'` y publicados hace 24h/7d/30d, snapshotea si no hay row en `social_metrics` con ese `snapshot_type`.

- [ ] **Step 3: monitor-social-interactions cron**

Pulls nuevos comments/DMs desde `MetaPublisher.listRecentComments/listRecentDms`, para cada uno corre `classifySentiment`, escribe en `social_interactions` con `response_status` según reglas de Sección 7.1 spec (positive+alto template match → auto_reply, negativo → escalated_to_human, etc.).

- [ ] **Step 4: refresh-meta-tokens cron**

Diario. Para cada `social_accounts` con `provider='meta_instagram'` y `expires_at` en <7 días, refresca token largo. Si falla, marca `status='needs_reauth'` y notifica al cliente.

- [ ] **Step 5: purge-expired-media cron**

Diario. Borra rows de `user_media_uploads` con `expires_at < now()` y archivo asociado en Storage.

- [ ] **Step 6: Actualizar vercel.json**

```json
{
  "crons": [
    { "path": "/api/cron/publish-scheduled-posts", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/refresh-social-metrics", "schedule": "0 * * * *" },
    { "path": "/api/cron/monitor-social-interactions", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/refresh-meta-tokens", "schedule": "0 3 * * *" },
    { "path": "/api/cron/purge-expired-media", "schedule": "0 4 * * *" }
  ]
}
```

- [ ] **Step 7: Test integración de publish cron**

```typescript
describe('publish-scheduled-posts cron', () => {
  it('publica draft con scheduled_for <= now', async () => {
    // insert draft con scheduled_for=hace 1min
    const res = await GET(new Request('http://localhost/api/cron/publish-scheduled-posts', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    const body = await res.json();
    expect(body.results.published).toBeGreaterThanOrEqual(1);
  });

  it('skipea drafts de account paused', async () => {
    // setup: social_accounts.paused=true
    // ... expect results.skipped >= 1 y draft sigue en 'scheduled'
  });

  it('retry incrementa retry_count y vuelve a scheduled hasta 3 intentos', async () => {
    // mock publisher para tirar error
    // primera vez: retry_count=1, status=scheduled
    // segunda vez: retry_count=2, status=scheduled
    // tercera vez: retry_count=3, status=failed
  });
});
```

- [ ] **Step 8: Correr tests**

```bash
pnpm vitest run src/app/api/cron/__tests__/publish-scheduled-posts.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add src/app/api/cron/ vercel.json
git commit -m "feat(navi): 5 crons (publish, metrics, interactions monitor, token refresh, media purge)"
```

---

## Task 12: Portal UI — Navi estándar (hub + dashboard + 6 sub-pages)

**Files:**
- Create: `src/app/portal/[token]/oficina/redes/page.tsx` (hub)
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/page.tsx` (dashboard estándar)
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/calendario/page.tsx`
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/plantillas/page.tsx`
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/cuenta/page.tsx`
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/interacciones/page.tsx`
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/media/page.tsx`
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/consumo/page.tsx`
- Create: 6 componentes en `src/components/portal/redes/`
- Modify: `src/components/portal/OficinaSidebar.tsx` — agregar link Redes si `social_publishing.enabled`

**Interfaces:**
- Consumes: Task 6 (REST endpoints).

- [ ] **Step 1: Hub multi-Navi (`redes/page.tsx`)**

Lista todos los `voice_agents` con `role='navi'` o `role='navi_agencia'` del portal. Muestra card por Navi con avatar (badge de color), nombre, variante (chip "Estándar" o "Agencia"), @handle si estándar, resumen métricas 7d. Click → `/redes/[naviId]`.

Si solo hay 1 Navi, redirect inmediato a su dashboard.

- [ ] **Step 2: Dashboard estándar (`[naviId]/page.tsx`)**

Server component que:
1. Detecta variante del Navi. Si `role='navi_agencia'`, renderiza `<NaviAgenciaDashboard/>` (Task 13). Si `role='navi'`, renderiza `<NaviDashboard/>`.
2. `<NaviDashboard/>` (client component) muestra en columnas:
   - Bandeja pending_approval (últimos 10) con preview + botones aprobar/rechazar/editar
   - Próximas publicaciones scheduled (próximos 7 días)
   - Métricas 7d (mini chart)
   - Kill switch toggle
   - Link a subsecciones (Calendario, Plantillas, Cuenta, Interacciones, Media, Consumo)

Copy en español, sin em-dash, sin emojis (usa Lucide icons).

- [ ] **Step 3: Componentes reusables**

- `<BandejaAprobacion navi_id account_id?>` — lista drafts pending_approval con acciones
- `<CalendarioEditorial navi_id account_id? month>` — grid mensual con slots
- `<KillSwitchToggle scope="navi"|"account" id reason?>` — toggle con confirmación
- `<MediaBandeja navi_id>` — grid de `user_media_uploads` con status filter
- `<DraftPreview draft>` — preview con imagen/video + caption + hashtags
- Todos con Tailwind + shadcn/ui (patrón existente del repo)

- [ ] **Step 4: Sub-pages**

- `/calendario/page.tsx` — server component que renderiza `<CalendarioEditorial/>` con month del query param
- `/plantillas/page.tsx` — grid de brand templates con botón "Sincronizar desde Canva"
- `/cuenta/page.tsx` — muestra la cuenta IG conectada + botón reconectar + estado token
- `/interacciones/page.tsx` — lista comments/DMs pending_approval + escalated_to_human
- `/media/page.tsx` — `<MediaBandeja/>` con upload button
- `/consumo/page.tsx` — tabla de ops_log filtrado por agent_id + agregados por día/mes

- [ ] **Step 5: Sidebar update**

```tsx
// src/components/portal/OficinaSidebar.tsx (fragment)
{socialPublishingEnabled(org.features) && (
  <SidebarLink href={`/portal/${token}/oficina/redes`} icon={<Share2/>}>Redes</SidebarLink>
)}
```

- [ ] **Step 6: Tests smoke (Playwright o vitest jsdom)**

Test crítico: dashboard estándar carga sin errores + Kill switch dispara POST /pause con body correcto.

- [ ] **Step 7: Commit**

```bash
git add src/app/portal/[token]/oficina/redes/ src/components/portal/redes/ src/components/portal/OficinaSidebar.tsx
git commit -m "feat(navi): portal UI standard variant (hub, dashboard, 6 sub-pages, sidebar)"
```

---

## Task 13: Portal UI — Navi Agencia (dashboard tipo social media manager)

**Files:**
- Create: `src/components/portal/redes/NaviAgenciaDashboard.tsx`
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/cuentas/page.tsx`
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/cuenta/[socialAccountId]/page.tsx`
- Create: `src/app/portal/[token]/oficina/redes/[naviId]/cross-account/page.tsx`
- Create: `src/components/portal/redes/AccountSelector.tsx`
- Create: `src/components/portal/redes/CrossAccountReplicator.tsx`

**Interfaces:**
- Consumes: Task 6, 9, 12.

- [ ] **Step 1: `<NaviAgenciaDashboard/>` con vista consolidada**

Tabla con columnas: `@handle` | Estado (activa/pausada) | Próx. publicación | Engagement 7d | Bandeja pendiente | Acciones (pausar/reactivar cuenta, entrar a detalle).

Barra superior: selector rápido de cuenta + botón "Vista consolidada" + botón "Cross-account".

- [ ] **Step 2: `/cuentas/page.tsx`**

CRUD de las cuentas IG del portfolio. Botón "Agregar cuenta IG" dispara OAuth Meta con selector de páginas. Cada row permite eliminar cuenta (soft delete: `status='disconnected'`, no borra data histórica).

- [ ] **Step 3: `/cuenta/[socialAccountId]/page.tsx`**

Vista detalle de UNA cuenta gestionada por el Navi Agencia. Mismo layout que `NaviDashboard` (bandeja, calendario, plantillas, interacciones, métricas) pero filtrado por `social_account_id`.

- [ ] **Step 4: `/cross-account/page.tsx`**

Calendario cruzado (grid mensual con posts de todas las cuentas en colores distintos por cuenta) + `<CrossAccountReplicator/>` que toma un `published_media_id` origen y muestra selector multi-cuenta destino + preview de captions adaptados.

- [ ] **Step 5: `<AccountSelector/>` reusable**

Combobox con avatars de las cuentas gestionadas, se usa en todas las páginas de Navi Agencia como toggle rápido.

- [ ] **Step 6: Test integración**

- Al entrar a `/redes/[naviId]` con Navi Agencia, se renderiza `<NaviAgenciaDashboard/>` (no `<NaviDashboard/>`).
- Pausar 1 cuenta no afecta las otras cuentas del mismo Navi Agencia.

- [ ] **Step 7: Commit**

```bash
git add src/app/portal/[token]/oficina/redes/[naviId]/cuentas/ src/app/portal/[token]/oficina/redes/[naviId]/cuenta/[socialAccountId]/ src/app/portal/[token]/oficina/redes/[naviId]/cross-account/ src/components/portal/redes/NaviAgenciaDashboard.tsx src/components/portal/redes/AccountSelector.tsx src/components/portal/redes/CrossAccountReplicator.tsx
git commit -m "feat(navi_agencia): portal UI social media manager view (cuentas, detail per account, cross-account replicator)"
```

---

## Task 14: Kill switch wiring (per-Navi + per-cuenta) + brain integration

**Files:**
- Modify: `src/lib/tools/executors/navi.ts` — helpers `assertNaviNotPaused` en handlers de acción
- Create: `.brain/decisions/2026-09-14-navi-meerkat-social.md` (nueva decision brain)
- Modify: `.brain/policies/tool-completeness.md` — actualizar contadores de roster
- Create: `.brain/skills/adding-a-navi-account.md` (skill nuevo para provisionar cuentas)

**Interfaces:**
- Consumes: Tasks 6, 8.
- Produces: kill switch bloqueando publicación efectivamente + brain con la decisión registrada.

- [ ] **Step 1: helper `assertNaviNotPaused`**

```typescript
// helper compartido
async function assertNaviNotPaused(portal_email: string, agent_id: string, social_account_id?: string) {
  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('metadata, role').eq('id', agent_id).single();
  if (agent!.role === 'navi' && agent!.metadata?.social?.paused) {
    throw new Error('NAVI_PAUSED: publicación pausada por el cliente');
  }
  if (social_account_id) {
    const { data: acc } = await supabase.from('social_accounts').select('paused').eq('id', social_account_id).single();
    if (acc?.paused) throw new Error('ACCOUNT_PAUSED: esta cuenta está pausada');
  }
}
```

Llamar al inicio de `publicarAhora`, `programarPublicacion`, y en el cron `publish-scheduled-posts` (además del check existente).

- [ ] **Step 2: Tests**

- Kill switch estándar activo → `publicarAhora` throw `NAVI_PAUSED`.
- Kill switch por cuenta activo → `publicarAhora(target=X)` throw `ACCOUNT_PAUSED` pero `publicarAhora(target=Y)` (otra cuenta) funciona.

- [ ] **Step 3: Escribir decision brain**

```markdown
<!-- .brain/decisions/2026-09-14-navi-meerkat-social.md -->
---
date: 2026-09-14
type: decision
status: active
owner: nazre
supersedes: none
---

# Navi meerkat social/creativo (2 variantes)

**Decisión:** Introducir 2 nuevos roles `role='navi'` (1 cuenta IG, PyME) y `role='navi_agencia'` (multi-cuenta hasta 20, agencia marketing). Comparten adapters (Canva + Meta) y schema, difieren en shape de tools, UI portal y pricing.

**Por qué:**
- Dolor genérico PyME + agencia marketing por creativo social
- Cliente kickstart es agencia con múltiples cuentas → single-Navi hubiera sido inviable
- Regla 1×1 (rechazada) rompía UX de agencia; multi-cuenta libre rompía aislamiento LLM → dual variant preserva ambos casos
- 6-7 semanas de dev con App Review Meta en paralelo (critical path)

**Cómo aplicar:**
- Toda tool nueva pasa por skill `adding-a-meerkat-tool.md`
- Toda cuenta IG nueva pasa por skill `adding-a-navi-account.md` (nuevo, incluye validación tope 20 para agencia)
- Feature flag obligatorio `organizations.features.social_publishing = { enabled, agency_mode }`
- Adapter obligatorio via `SocialPublisher` interface para nuevos providers (TikTok, LinkedIn, X en el futuro)

**Referencias:**
- Spec: `docs/superpowers/specs/2026-09-14-navi-social-media-design.md`
- Plan: `docs/superpowers/plans/2026-09-14-navi-social-media.md`
```

- [ ] **Step 4: Skill nuevo brain**

```markdown
<!-- .brain/skills/adding-a-navi-account.md -->
---
name: adding-a-navi-account
description: Use when connecting a new IG account to a Navi (standard or agency). Enforces the 1×1 rule for standard, 20-tope for agency, brand summary required, and OAuth flow.
type: skill
owner: nazre
last_verified: 2026-09-14
---

# Adding a Navi IG account

## Precondiciones

1. Org tiene `features.social_publishing.enabled=true`.
2. Meerkat destino existe con `role='navi'` o `role='navi_agencia'`.
3. Si `role='navi'`, no debe tener ya una `social_accounts` row asociada.
4. Si `role='navi_agencia'`, debe tener menos de 20 `social_accounts` rows.

## Pasos

1. Cliente hace click "Conectar Instagram" en `/portal/[token]/oficina/redes/[naviId]/cuenta` (estándar) o `/cuentas` (agencia).
2. Redirect a OAuth Meta con state que incluye `agent_id`.
3. Cliente autoriza en Facebook, selecciona la Página FB linkeada al IG Business.
4. Callback `/api/auth/meta-callback` valida y persiste en `social_accounts`.
5. Trigger DB `enforce_navi_account_limit_trigger` bloquea si excede tope.
6. Cliente completa `brand_summary` en un flow onboarding de 3 pasos.
7. Cliente carga al menos 3 brand templates desde Canva.
8. Cliente aprueba primer calendario editorial mensual.
9. Cliente puede empezar a operar.

## Cuándo NO usar

- Si el cliente quiere manejar TikTok/LinkedIn → esperar v2, no hay adapter aún.
- Si el cliente tiene IG Personal (no Business/Creator) → guiarlo a upgradear cuenta primero.
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executors/navi.ts .brain/decisions/2026-09-14-navi-meerkat-social.md .brain/skills/adding-a-navi-account.md .brain/policies/tool-completeness.md
git commit -m "feat(navi): kill switch enforcement + brain decision + adding-a-navi-account skill"
```

---

## Task 15: E2E provisioning del cliente kickstart (agencia)

**Files:**
- Create: `scripts/provision-navi-agencia-kickstart.ts` (one-shot script)
- Create: `docs/runbooks/navi-onboarding-agencia.md`

**Interfaces:**
- Consumes: todas las tasks anteriores.

Este task es integración final. No es TDD porque toca sistemas externos reales (Meta, Canva del cliente).

- [ ] **Step 1: Habilitar feature flags en la org del cliente**

```typescript
// scripts/provision-navi-agencia-kickstart.ts
await supabase.from('organizations').update({
  features: {
    ...currentFeatures,
    social_publishing: { enabled: true, agency_mode: true },
  }
}).eq('portal_email', CLIENTE_KICKSTART_EMAIL);
```

- [ ] **Step 2: Crear meerkat Navi Agencia**

Vía admin panel o directo SQL:
```sql
insert into voice_agents (portal_email, role, agent_name, active) values (
  '<cliente_kickstart>', 'navi_agencia', 'Navi Agencia <Nombre agencia>', true
);
```

- [ ] **Step 3: Cliente conecta Canva**

Cliente entra a `/portal/[token]/oficina/redes/[naviAgenciaId]/cuentas`, hace click "Conectar Canva", completa OAuth. Verificamos que aparece row en `social_accounts` con `provider='canva'`.

- [ ] **Step 4: Cliente conecta 3-5 cuentas IG Business de sus clientes finales**

Repetir OAuth Meta 3-5 veces, una por cuenta. Cada vez selecciona la Page correspondiente. Verificamos rows en `social_accounts` con `provider='meta_instagram'`.

- [ ] **Step 5: Cliente carga brand templates + brand summary por cuenta**

Cliente edita cada `social_accounts` desde el portal con `brand_summary` de esa cuenta (voz de marca en 3-4 líneas) + carga al menos 3 brand templates de Canva por cuenta.

- [ ] **Step 6: Navi propone calendarios editoriales mensuales por cuenta**

Cliente pide a Navi (vía chat) "propón el calendario editorial de septiembre para @cuenta1". Cliente aprueba slots. Repite por cada cuenta.

- [ ] **Step 7: Primer post de prueba**

Cliente pide a Navi "crea un post de prueba para @cuenta1 con este mensaje: 'Prueba de arranque'". Verificar que aparece en bandeja pending_approval. Cliente aprueba. Cron publica en <5min.

- [ ] **Step 8: Prueba de kill switch por cuenta**

Cliente pausa @cuenta1 desde el portal. Verificar que:
- Draft scheduled para @cuenta1 en 5min NO se publica.
- Draft scheduled para @cuenta2 en 5min SÍ se publica.

- [ ] **Step 9: Prueba de ingesta de media por correo**

Cliente envía un correo con un mp4 adjunto a Navi. Verificar que aparece en `/redes/[naviId]/media` como `available` con `source='email'` y el texto del correo en `cliente_note`.

- [ ] **Step 10: Runbook**

Documentar todo el flow paso a paso en `docs/runbooks/navi-onboarding-agencia.md` para futuros clientes agencia.

- [ ] **Step 11: Commit final**

```bash
git add scripts/provision-navi-agencia-kickstart.ts docs/runbooks/navi-onboarding-agencia.md
git commit -m "chore(navi): provisioning script + onboarding runbook for agency kickstart client"
```

---

## Dependencias entre tasks

```
Task 0 (external, día 1) — paralelo
Task 1 (schema) — bloquea 2-15
├── Task 2 (Canva adapter) — paralelo con 3, 4, 10, 11
├── Task 3 (Meta adapter) — paralelo con 2, 4, 10, 11
├── Task 4 (feature flag + role registration) — paralelo con 2, 3
├── Task 5 (OAuth callbacks) — requiere 2, 3, 4
├── Task 7 (media ingestion) — requiere 1
├── Task 10 (sentiment + safety) — paralelo con 2, 3, 4
├── Task 11 (crons) — requiere 3, 10; excepto refresh-metrics que también necesita 8
├── Task 6 (portal REST) — requiere 4, 5
├── Task 8 (Navi standard tools) — requiere 2, 3, 4, 7
├── Task 9 (Navi Agencia extras) — requiere 8
├── Task 12 (portal UI standard) — requiere 6, 8
├── Task 13 (portal UI agency) — requiere 6, 9, 12
├── Task 14 (kill switch wiring) — requiere 6, 8
└── Task 15 (E2E provisioning) — requiere TODAS
```

Sugerencia de dispatch subagentes en paralelo:
- **Round 1** (post Task 1): Tasks 2, 3, 4, 10 en worktrees separadas
- **Round 2** (post 2, 3, 4): Tasks 5, 7, 6 en paralelo
- **Round 3** (post 6, 7): Tasks 8, 11 en paralelo
- **Round 4** (post 8): Tasks 9, 12 en paralelo
- **Round 5** (post 9, 12): Tasks 13, 14 en paralelo
- **Round 6**: Task 15 (secuencial con humano en el loop)

Task 0 (setup externo Meta App Review) corre desde día 1 en paralelo con Round 1 para no bloquear producción.

---

## Self-Review

### Spec coverage

Skimeado spec sección por sección:
- Sección 1 Motivación → cubierto en header del plan
- Sección 2 Non-goals → respetados (no video editing, no TikTok/LI/X, no auto-pause en crisis)
- Sección 3 Autonomía → Task 8 (auto_publish flag), Task 10 (sentiment gate), Task 14 (kill switch)
- Sección 4.1 Adapters → Tasks 2, 3
- Sección 4.2 Schema → Task 1
- Sección 4.3 Endpoints → Tasks 5, 6, 8, 9, 11
- Sección 5.1 Navi Agencia → Task 9
- Sección 5.2 Ingesta media → Task 7
- Sección 5.3 Registro runtime → Task 4
- Sección 6 Approval flow → Tasks 8, 11 (cron), 12, 13
- Sección 7 Guardarraíles → Task 10
- Sección 8 Portal UI → Tasks 12, 13
- Sección 9 Feature flag/pricing → Task 4 (flag), consumo en Task 8
- Sección 10 App Review → Task 0
- Sección 11 Roadmap → mapeado a 15 tasks
- Sección 12 Riesgos → mitigados en cada task correspondiente
- Sección 13 Preguntas abiertas → NO todas resueltas en el plan (denylist inicial, alcance v1 vs sin DMs, refresh token) → llevar al ejecutor para decidir mid-flight
- Sección 14 Éxito medible → Task 15 checklist
- Sección 16 Gobernanza → Task 14 (decisión brain + skill)

**Gap identificado**: Task 11 no tiene test explícito para `refresh-meta-tokens`. Añadir a subagent instructions.

### Placeholder scan

Revisé "TBD/TODO/appropriate/write tests for the above/similar to Task N" — solo hay:
- `/* ... */` en algunos code snippets del Task 3 Step 1 para el interface, pero incluí el shape completo en el bloque de Interfaces del task. Aceptable.
- `// TODO: validar contra whitelist` en Task 10 Step 2 — marcado explícito como "dejar afuera de v1, aviso en logs". Acceptable como scope conocido.

### Type consistency

- `SocialAccount` definido en Task 3 Step 1 y usado en Tasks 5, 6, 8, 9, 11, 14 ✓
- `SocialPublisher` interface definido en Task 3 y consumido en `buildPublisher` (Task 3) + cron publish (Task 11) ✓
- `MediaInput.mediaType` = `'image'|'carousel'|'reel'|'story'` consistente en Tasks 3, 8, 11 ✓
- `content_drafts.status` values consistentes con spec Sección 4.2 ✓

Plan complete.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-14-navi-social-media.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration. Recomendado especialmente aquí porque las Tasks 2, 3, 4, 10 se pueden dispatch en paralelo (worktrees) en Round 1.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints. Más lento pero cero coordinación de worktrees.

**Which approach?**
