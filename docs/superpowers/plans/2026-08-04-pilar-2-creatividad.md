# Pilar 2 Creatividad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4 tools nuevas de generación de documentos comerciales — `generar_propuesta_comercial`, `generar_cotizacion`, `generar_one_pager`, `generar_correo_estructurado` — distribuidas intencionalmente entre Noah/Nico/Naia/Nelia. Las 3 primeras generan PDFs; la cuarta genera un draft de correo HTML estructurado. Cada tool es un wrapper role-aware sobre la infra existente de `create_document` (executor.ts:192) que auto-recopila contexto de lead + KB + brand, minimizando lo que el LLM tiene que proveer.

**Architecture:** Reusa `src/lib/documents/` (word/excel/slides/template-fill/quality-enhancer) + `src/lib/brand/kit` + `ops_documents` storage bucket. Agrega capa `src/lib/creativity/` con content-generator (LLM structured content), meerkat-gates (role→tools access map) y document-builder (renders PDF via existing helpers). Skills-lite: nueva tabla `document_templates` para custom .docx per agente + tipo, seleccionada automáticamente cuando el tool corre.

**Tech Stack:** Next.js 16 (App Router, ver AGENTS.md — no es el Next.js de tu training), React 19, Supabase (Postgres + Storage), Anthropic SDK (Sonnet 4.6 para content-generator), @react-pdf/renderer + docxtemplater (ya en package), CloudConvert (ya integrado en template-fill.ts).

## Global Constraints

- Spanish copy, sin em-dashes (`—`). Usar `:` `,` `.`
- Sin emojis en UI. Íconos Lucide únicamente.
- Sin "IA" en copy visible ([[feedback_no_ia_visible]]).
- `./node_modules/.bin/tsc --noEmit` debe pasar limpio al final de cada task.
- Ninguna nueva dependencia. Todo reusa lo que ya está en `package.json`.
- Modelo LLM para content-generator: `claude-sonnet-4-6`. NO Haiku ([[feedback_subagent_sonnet]]).
- **Role gating obligatorio:** cada tool debe rechazar internamente si el meerkat que la invoca no está en su lista de acceso. Nunca dejarlo solo al schema/registration filtering — defense-in-depth como Nox brief hizo en Task 6 del Pilar 1.
- Dropped columns rule: `knowledge_base`, `business_description`, `owner_passphrase`, `brand_website`, `brand_address`, `email_footer_text`, `email_brand_color`, `brand_color_secondary` viven en `organizations`, NO en `voice_agents` ([[feedback_dropped_columns_bugs]]). También `outbound_role` ahora vive en `features` JSONB (fix de 2026-08-04).
- Skill obligatoria a considerar: `centinelia-tool-completeness` (tool registrada en chat + email desde task 1; voz opcional dependiendo del rol — Noah/Nico/Nelia/Naia SÍ tienen voz, así que los 3 canales aplican).
- Feature flag opt-in NO requerido para esta task (a diferencia de Nox brief cron). Estas son tools on-demand invocadas por conversación, no crons automáticos.
- Costo ops obligatorio: cada tool consume ops (definido en cada task). El costo se cobra en el branch del executor, ANTES del LLM call.
- Distribución por rol es una regla de producto ([[feedback_tool_distribution_intentional]]) — no compartir tools "por si acaso".
- Commits incrementales, uno por task, mensaje descriptivo en español.

---

## File Structure

**Created:**
- `migrations/20260804_document_templates.sql` — tabla para custom brand templates por agente + tipo
- `src/lib/creativity/content-generator.ts` — LLM structured content generator + tests
- `src/lib/creativity/meerkat-gates.ts` — const MEERKAT_TOOL_ACCESS: quién puede usar qué + tests
- `src/lib/creativity/document-builder.ts` — orquesta content-generator + PDF render + upload a ops_documents
- `src/lib/creativity/email-drafter.ts` — variante para `generar_correo_estructurado` (HTML email en vez de PDF)
- `src/app/api/portal/[token]/document-templates/route.ts` — GET+POST+DELETE custom templates
- `src/app/portal/[token]/configurar/BrandTemplateSection.tsx` — UI para subir .docx custom
- `docs/superpowers/plans/2026-08-04-pilar-2-e2e-checklist.md` — checklist E2E manual

**Modified:**
- `src/lib/tools/executor.ts` — 4 nuevos branches para los tools (llamando document-builder / email-drafter)
- `src/app/api/portal/[token]/agent-chat/route.ts` — tool declarations condicionales por rol
- `src/lib/ops/inbox-processor.ts` — tool declarations condicionales por rol
- `src/app/api/voice/inbound/route.ts` — buildTools agrega tools nuevos condicionales por rol
- `src/app/portal/[token]/configurar/page.tsx` — mount `<BrandTemplateSection agentId={...} />` para los 4 roles aplicables

---

## Task 1: Migration + meerkat-gates + content-generator + tests

**Files:**
- Create: `migrations/20260804_document_templates.sql`
- Create: `src/lib/creativity/meerkat-gates.ts`
- Create: `src/lib/creativity/content-generator.ts`
- Create: `src/lib/creativity/__tests__/meerkat-gates.test.ts`
- Create: `src/lib/creativity/__tests__/content-generator.test.ts`

**Interfaces:**

Produces:
```ts
// meerkat-gates.ts
export type CreativityTool =
  | 'generar_propuesta_comercial'
  | 'generar_cotizacion'
  | 'generar_one_pager'
  | 'generar_correo_estructurado';

export type MeerkatRoleId = 'noah' | 'nico' | 'naia' | 'nelia' | 'nia' | 'nara' | 'nox' | 'niva' | 'neo' | 'nova';

export const MEERKAT_TOOL_ACCESS: Record<CreativityTool, MeerkatRoleId[]> = {
  generar_propuesta_comercial:  ['noah'],
  generar_cotizacion:           ['noah'],
  generar_one_pager:            ['noah', 'nelia'],
  generar_correo_estructurado:  ['noah', 'nico', 'naia', 'nelia'],
};

export function meerkatCanUse(role: string | null | undefined, tool: CreativityTool): boolean;

// content-generator.ts
export interface ContentContext {
  agentName:      string;
  businessName:   string;
  clientName:     string | null;
  clientNeed:     string | null;
  servicesKb:     string | null;  // slice de KB del org sobre servicios/productos
  extraContext:   string | null;  // opcional (llamada previa, correos anteriores)
}

export interface StructuredContent {
  title:    string;
  sections: Array<{ heading: string; body: string; bullets?: string[] }>;
  closing:  string | null;
}

export async function generateStructuredContent(
  kind: 'propuesta' | 'cotizacion' | 'one_pager' | 'correo',
  ctx:  ContentContext,
): Promise<StructuredContent>;
```

Schema DB:
```
document_templates (
  id           UUID PK,
  agent_id     UUID FK → voice_agents(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK IN ('propuesta','cotizacion','one_pager','correo'),
  storage_path TEXT NOT NULL,  -- path en bucket agent-documents/templates/<agent_id>/<tipo>.docx
  filename     TEXT NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, tipo)
)
```

- [ ] **Step 1: Migration SQL**

Crear `migrations/20260804_document_templates.sql`:

```sql
-- Custom brand templates .docx per agent + tipo.
-- Cuando existe, el tool creativity lo prefiere sobre el React PDF default.

create table if not exists document_templates (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references voice_agents(id) on delete cascade,
  tipo         text not null check (tipo in ('propuesta', 'cotizacion', 'one_pager', 'correo')),
  storage_path text not null,
  filename     text not null,
  uploaded_at  timestamptz not null default now(),
  unique (agent_id, tipo)
);

create index if not exists document_templates_agent_tipo on document_templates (agent_id, tipo);

alter table document_templates enable row level security;

notify pgrst, 'reload schema';
```

Correr en Supabase SQL editor. Verificar:
```sql
\d document_templates
select count(*) from document_templates; -- 0
```

- [ ] **Step 2: Test failing para meerkat-gates**

Crear `src/lib/creativity/__tests__/meerkat-gates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { meerkatCanUse, MEERKAT_TOOL_ACCESS } from '../meerkat-gates';

describe('meerkat-gates', () => {
  it('Noah puede usar los 4 tools', () => {
    expect(meerkatCanUse('noah', 'generar_propuesta_comercial')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_cotizacion')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_one_pager')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_correo_estructurado')).toBe(true);
  });

  it('Nelia puede one_pager y correo pero NO propuesta ni cotizacion', () => {
    expect(meerkatCanUse('nelia', 'generar_one_pager')).toBe(true);
    expect(meerkatCanUse('nelia', 'generar_correo_estructurado')).toBe(true);
    expect(meerkatCanUse('nelia', 'generar_propuesta_comercial')).toBe(false);
    expect(meerkatCanUse('nelia', 'generar_cotizacion')).toBe(false);
  });

  it('Nia (recepcionista) no tiene ninguna tool comercial', () => {
    expect(meerkatCanUse('nia', 'generar_propuesta_comercial')).toBe(false);
    expect(meerkatCanUse('nia', 'generar_cotizacion')).toBe(false);
    expect(meerkatCanUse('nia', 'generar_one_pager')).toBe(false);
    expect(meerkatCanUse('nia', 'generar_correo_estructurado')).toBe(false);
  });

  it('rol null o undefined siempre retorna false', () => {
    expect(meerkatCanUse(null, 'generar_propuesta_comercial')).toBe(false);
    expect(meerkatCanUse(undefined, 'generar_one_pager')).toBe(false);
    expect(meerkatCanUse('', 'generar_cotizacion')).toBe(false);
  });

  it('MEERKAT_TOOL_ACCESS exporta exactamente 4 tools', () => {
    expect(Object.keys(MEERKAT_TOOL_ACCESS)).toEqual([
      'generar_propuesta_comercial',
      'generar_cotizacion',
      'generar_one_pager',
      'generar_correo_estructurado',
    ]);
  });
});
```

Run: `./node_modules/.bin/vitest run src/lib/creativity/__tests__/meerkat-gates.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar meerkat-gates**

Crear `src/lib/creativity/meerkat-gates.ts`:

```ts
export type CreativityTool =
  | 'generar_propuesta_comercial'
  | 'generar_cotizacion'
  | 'generar_one_pager'
  | 'generar_correo_estructurado';

export type MeerkatRoleId = 'noah' | 'nico' | 'naia' | 'nelia' | 'nia' | 'nara' | 'nox' | 'niva' | 'neo' | 'nova';

export const MEERKAT_TOOL_ACCESS: Record<CreativityTool, MeerkatRoleId[]> = {
  generar_propuesta_comercial:  ['noah'],
  generar_cotizacion:           ['noah'],
  generar_one_pager:            ['noah', 'nelia'],
  generar_correo_estructurado:  ['noah', 'nico', 'naia', 'nelia'],
};

export function meerkatCanUse(role: string | null | undefined, tool: CreativityTool): boolean {
  if (!role) return false;
  const allowed = MEERKAT_TOOL_ACCESS[tool];
  if (!allowed) return false;
  return (allowed as string[]).includes(role);
}
```

Run test — expected PASS.

- [ ] **Step 4: Test failing para content-generator**

Crear `src/lib/creativity/__tests__/content-generator.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { generateStructuredContent } from '../content-generator';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

const CTX_BASE = {
  agentName:    'Noah',
  businessName: 'Test Co',
  clientName:   'ACME',
  clientNeed:   'Necesitan CRM',
  servicesKb:   'Ofrecemos CRM + integración por 50k MXN',
  extraContext: null,
};

describe('generateStructuredContent', () => {
  it('devuelve StructuredContent con secciones cuando LLM retorna JSON válido', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          title:    'Propuesta CRM para ACME',
          sections: [
            { heading: 'Objetivo', body: 'Implementar CRM operativo en 30 días.' },
            { heading: 'Alcance',  body: 'Migración de datos y capacitación.', bullets: ['Setup', 'Migración', 'Training'] },
          ],
          closing: 'Quedamos atentos a cualquier duda.',
        }),
      }],
    });

    const result = await generateStructuredContent('propuesta', CTX_BASE);
    expect(result.title).toBe('Propuesta CRM para ACME');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[1].bullets).toEqual(['Setup', 'Migración', 'Training']);
    expect(result.closing).toBe('Quedamos atentos a cualquier duda.');
  });

  it('devuelve estructura mínima cuando LLM retorna JSON inválido', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'no soy JSON' }],
    });
    const result = await generateStructuredContent('cotizacion', CTX_BASE);
    expect(result.title).toBeTruthy();
    expect(result.sections).toEqual([]);
    expect(result.closing).toBeNull();
  });
});
```

Run: FAIL — módulo no existe.

- [ ] **Step 5: Implementar content-generator**

Crear `src/lib/creativity/content-generator.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6' as const;

export interface ContentContext {
  agentName:    string;
  businessName: string;
  clientName:   string | null;
  clientNeed:   string | null;
  servicesKb:   string | null;
  extraContext: string | null;
}

export interface StructuredContent {
  title:    string;
  sections: Array<{ heading: string; body: string; bullets?: string[] }>;
  closing:  string | null;
}

const SYSTEM_PROMPTS: Record<string, string> = {
  propuesta: `Eres el redactor comercial. Genera una propuesta comercial estructurada.
Reglas:
- Título específico (nombre del cliente + servicio).
- 3-5 secciones máximo: Objetivo, Alcance, Tiempos, Inversión, Siguiente paso.
- Body de cada sección en 2-4 oraciones directas.
- Bullets solo cuando aporten claridad (listas de entregables, requisitos, etc.).
- Cierre profesional y cálido, sin em-dashes.
- Sin emojis. Sin "IA" en el copy.
- Devuelve SOLO JSON válido: {title, sections:[{heading, body, bullets?}], closing}.`,

  cotizacion: `Eres el redactor comercial. Genera una cotización estructurada.
Reglas:
- Título tipo "Cotización para [cliente] - [servicio]".
- Secciones: Servicio incluido, Precios (bullets con precios), Condiciones de pago, Vigencia.
- Precios claros en MXN, con IVA cuando aplique.
- Sin em-dashes, sin emojis, sin "IA" en copy.
- Devuelve SOLO JSON: {title, sections:[{heading, body, bullets?}], closing}.`,

  one_pager: `Eres el redactor comercial. Genera un one-pager informativo sobre un servicio.
Reglas:
- Título del servicio.
- 2-4 secciones cortas: Qué es, Cómo funciona, Beneficios, Cómo empezar.
- Body directo, ≤3 oraciones por sección.
- Sin em-dashes, sin emojis, sin "IA".
- Devuelve SOLO JSON: {title, sections:[{heading, body, bullets?}], closing}.`,

  correo: `Eres el redactor comercial. Genera un correo estructurado para el cliente.
Reglas:
- Título = asunto del correo (claro y accionable, <60 caracteres).
- Secciones = párrafos del cuerpo del correo (heading opcional o vacío).
- Cierre = despedida + firma.
- Tono cálido pero profesional, sin em-dashes, sin emojis, sin "IA".
- Devuelve SOLO JSON: {title, sections:[{heading, body, bullets?}], closing}.`,
};

function buildUserPrompt(ctx: ContentContext): string {
  const parts: string[] = [];
  parts.push(`NEGOCIO: ${ctx.businessName}`);
  parts.push(`REDACTA COMO: ${ctx.agentName}`);
  if (ctx.clientName)   parts.push(`CLIENTE: ${ctx.clientName}`);
  if (ctx.clientNeed)   parts.push(`NECESIDAD DEL CLIENTE: ${ctx.clientNeed}`);
  if (ctx.servicesKb)   parts.push(`\nSERVICIOS/PRODUCTOS DEL NEGOCIO:\n${ctx.servicesKb}`);
  if (ctx.extraContext) parts.push(`\nCONTEXTO ADICIONAL:\n${ctx.extraContext}`);
  return parts.join('\n');
}

export async function generateStructuredContent(
  kind: 'propuesta' | 'cotizacion' | 'one_pager' | 'correo',
  ctx: ContentContext,
): Promise<StructuredContent> {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 2000,
    system:     SYSTEM_PROMPTS[kind],
    messages:   [{ role: 'user', content: buildUserPrompt(ctx) }],
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  let parsed: Partial<StructuredContent> = {};
  try {
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch { /* fall through */ }

  const fallbackTitle = ctx.clientName ? `Documento para ${ctx.clientName}` : 'Documento';

  return {
    title:    typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallbackTitle,
    sections: Array.isArray(parsed.sections) ? parsed.sections.filter(s => s && typeof s.heading === 'string' && typeof s.body === 'string') : [],
    closing:  typeof parsed.closing === 'string' ? parsed.closing : null,
  };
}
```

Run test — expected PASS.

- [ ] **Step 6: Type check + commit**

Run: `./node_modules/.bin/tsc --noEmit` — clean.

```bash
git add migrations/20260804_document_templates.sql src/lib/creativity/
git commit -m "feat(creativity): migration document_templates + meerkat-gates + content-generator con tests"
```

---

## Task 2: Document builder (PDF path) + tests

**Files:**
- Create: `src/lib/creativity/document-builder.ts`
- Create: `src/lib/creativity/__tests__/document-builder.test.ts`

**Interfaces:**

Consumes: `StructuredContent` de Task 1, `brandKitFromAgent` (@/lib/brand/kit), PDF renderers existentes.

Produces:
```ts
export interface DocumentBuildResult {
  ok:         true;
  url:        string;      // signed URL 1h
  file_id:    string;      // storage_path
  filename:   string;
  mime_type:  'application/pdf';
  document_id: string;     // ops_documents.id
}

export interface DocumentBuildError { ok: false; error: string }

export async function buildDocument(
  kind: 'propuesta' | 'cotizacion' | 'one_pager',
  content: StructuredContent,
  agent: { id: string; agent_name: string | null; portal_email: string },
  supabase: ReturnType<typeof createAdminClient>,
): Promise<DocumentBuildResult | DocumentBuildError>;
```

**Rules:**
- Si existe `document_templates` con matching (agent_id, tipo) → descarga el .docx, llena via `fillDocxTemplate({title, sections, closing, ...})`, convierte a PDF via `convertDocxToPdf`, sube a bucket.
- Si NO existe → usa `ProposalPDF` (para propuesta/cotizacion) o `GenericDocPDF` (para one_pager) del render existente.
- Storage bucket: `agent-documents` con path `{agent_id}/creativity/{tipo}-{timestamp}.pdf`.
- Insert en `ops_documents` con `template_type` = kind, `title` = content.title, TTL 30d.

- [ ] **Step 1: Test failing con mock**

Crear `src/lib/creativity/__tests__/document-builder.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildDocument } from '../document-builder';

vi.mock('@/lib/brand/kit', () => ({
  brandKitFromAgent: vi.fn(async () => ({ color: '#6C3BFF', logoUrl: null, footer: 'Test Co', website: null, address: null })),
}));

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async () => Buffer.from('fake-pdf-bytes')),
}));

vi.mock('@/lib/pdf/doc', () => ({
  GenericDocPDF: () => null,
  ProposalPDF:   () => null,
  LetterPDF:     () => null,
}));

function mockSupabase() {
  const ops: any[] = [];
  return {
    ops,
    storage: {
      from: () => ({
        upload:            vi.fn(async () => ({ error: null })),
        createSignedUrl:   vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/foo.pdf' }, error: null })),
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),  // no custom template
          }),
        }),
      }),
      insert: (row: any) => {
        ops.push({ table, op: 'insert', row });
        return { select: () => ({ single: async () => ({ data: { id: 'doc-1' }, error: null }) }) };
      },
    }),
  } as any;
}

describe('buildDocument', () => {
  it('renderiza PDF built-in y guarda en ops_documents cuando no hay custom template', async () => {
    const supabase = mockSupabase();
    const res = await buildDocument(
      'propuesta',
      { title: 'Prop ACME', sections: [{ heading: 'Objetivo', body: 'Body' }], closing: 'Saludos.' },
      { id: 'agent-1', agent_name: 'Noah', portal_email: 'test@x.com' },
      supabase,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.filename).toContain('propuesta');
    expect(res.mime_type).toBe('application/pdf');
    expect(supabase.ops.find((o: any) => o.table === 'ops_documents')).toBeTruthy();
  });
});
```

Run: FAIL.

- [ ] **Step 2: Implementar document-builder**

Crear `src/lib/creativity/document-builder.ts`:

```ts
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { createAdminClient } from '@/lib/supabase/admin';
import { brandKitFromAgent } from '@/lib/brand/kit';
import { GenericDocPDF, ProposalPDF } from '@/lib/pdf/doc';
import type { StructuredContent } from './content-generator';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface DocumentBuildResult {
  ok:          true;
  url:         string;
  file_id:     string;
  filename:    string;
  mime_type:   'application/pdf';
  document_id: string;
}

export interface DocumentBuildError { ok: false; error: string }

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

function renderContentText(content: StructuredContent): string {
  const parts: string[] = [];
  for (const s of content.sections) {
    if (s.heading) parts.push(`## ${s.heading}`);
    if (s.body)    parts.push(s.body);
    if (s.bullets?.length) parts.push(s.bullets.map(b => `- ${b}`).join('\n'));
    parts.push('');
  }
  if (content.closing) parts.push(content.closing);
  return parts.join('\n');
}

export async function buildDocument(
  kind: 'propuesta' | 'cotizacion' | 'one_pager',
  content: StructuredContent,
  agent: { id: string; agent_name: string | null; portal_email: string },
  supabase: SupabaseClient,
): Promise<DocumentBuildResult | DocumentBuildError> {
  const brand = await brandKitFromAgent(agent.id, supabase as any);

  const timestamp = Date.now();
  const filename = `${slugify(kind)}-${slugify(content.title || 'documento')}-${timestamp}.pdf`;
  const storagePath = `${agent.id}/creativity/${filename}`;

  // Check for custom .docx template first
  const { data: customTpl } = await supabase
    .from('document_templates')
    .select('storage_path, filename')
    .eq('agent_id', agent.id)
    .eq('tipo', kind === 'one_pager' ? 'one_pager' : kind)
    .maybeSingle();

  let pdfBuffer: Buffer;

  if (customTpl?.storage_path) {
    // Path A: custom .docx template via docxtemplater + CloudConvert
    const { fillDocxTemplate, convertDocxToPdf } = await import('@/lib/documents/template-fill');
    const { data: tplBlob } = await supabase.storage.from('agent-documents').download(customTpl.storage_path);
    if (!tplBlob) return { ok: false, error: 'No se pudo cargar la plantilla personalizada.' };
    const tplBuffer = Buffer.from(await tplBlob.arrayBuffer());
    const docxBuffer = await fillDocxTemplate(tplBuffer, {
      title:    content.title,
      sections: content.sections,
      closing:  content.closing ?? '',
      client_name: '', // template can reference {client_name} if desired; empty when not provided
      business_name: '',
      date: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    pdfBuffer = await convertDocxToPdf(docxBuffer);
  } else {
    // Path B: built-in React PDF
    const contentText = renderContentText(content);
    const props = { title: content.title, content: contentText, brand };
    const Component = kind === 'propuesta' || kind === 'cotizacion' ? ProposalPDF : GenericDocPDF;
    pdfBuffer = await renderToBuffer(createElement(Component as any, props));
  }

  // Upload
  const uploadRes = await supabase.storage.from('agent-documents').upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert:      false,
  });
  if (uploadRes.error) return { ok: false, error: `Upload falló: ${uploadRes.error.message}` };

  // Signed URL 1h
  const { data: signed } = await supabase.storage.from('agent-documents').createSignedUrl(storagePath, 3600);
  const url = signed?.signedUrl ?? '';

  // Insert ops_documents
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: doc, error: insErr } = await supabase.from('ops_documents').insert({
    agent_id:      agent.id,
    title:         content.title,
    filename,
    storage_path:  storagePath,
    template_type: kind,
    expires_at:    expiresAt,
  }).select('id').single();
  if (insErr || !doc) return { ok: false, error: `No se pudo registrar el documento: ${insErr?.message ?? 'unknown'}` };

  return {
    ok:          true,
    url,
    file_id:     storagePath,
    filename,
    mime_type:   'application/pdf',
    document_id: doc.id,
  };
}
```

Run test — expected PASS.

- [ ] **Step 3: Type check + commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/lib/creativity/document-builder.ts src/lib/creativity/__tests__/document-builder.test.ts
git commit -m "feat(creativity): document-builder — PDF built-in o custom template + upload"
```

---

## Task 3: Email drafter (para `generar_correo_estructurado`) + tests

**Files:**
- Create: `src/lib/creativity/email-drafter.ts`
- Create: `src/lib/creativity/__tests__/email-drafter.test.ts`

**Interfaces:**

Produces:
```ts
export interface EmailDraftResult {
  ok:         true;
  subject:    string;
  html_body:  string;   // renderable en Gmail/Outlook, con brand colors
  plain_body: string;   // fallback texto plano
  message:    string;   // human-readable resumen para el agente
}

export interface EmailDraftError { ok: false; error: string }

export async function draftEmail(
  content: StructuredContent,
  agent: { id: string; agent_name: string | null },
  supabase: ReturnType<typeof createAdminClient>,
): Promise<EmailDraftResult | EmailDraftError>;
```

**Rules:**
- Reusa `shell`, `heading`, `infoCard`, `mdToEmailHtml` de `@/lib/email/send`.
- Subject = `content.title`.
- HTML body: primera párrafo saludo (autogenerated si falta), luego secciones con h3 + p, luego closing como firma.
- Plain body: título + secciones en texto + closing.

- [ ] **Step 1: Test failing**

Crear `src/lib/creativity/__tests__/email-drafter.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { draftEmail } from '../email-drafter';

vi.mock('@/lib/email/send', () => ({
  shell:         (html: string) => `<html>${html}</html>`,
  heading:       (t: string) => `<h1>${t}</h1>`,
  infoCard:      (b: string) => `<div>${b}</div>`,
  mdToEmailHtml: (md: string) => `<p>${md}</p>`,
  agentBrandedFrom: (name: string | null) => `${name ?? 'Centinelia'} <no-reply@centinelia.mx>`,
}));

describe('draftEmail', () => {
  it('produce subject + html + plain con secciones', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } as any;
    const result = await draftEmail(
      { title: 'Seguimiento propuesta', sections: [{ heading: 'Contexto', body: 'Después de la llamada...' }], closing: 'Saludos, Noah.' },
      { id: 'a1', agent_name: 'Noah' },
      supabase,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subject).toBe('Seguimiento propuesta');
    expect(result.html_body).toContain('Contexto');
    expect(result.plain_body).toContain('Después de la llamada');
    expect(result.plain_body).toContain('Saludos, Noah.');
  });
});
```

Run: FAIL.

- [ ] **Step 2: Implementar email-drafter**

Crear `src/lib/creativity/email-drafter.ts`:

```ts
import type { createAdminClient } from '@/lib/supabase/admin';
import { shell, heading, mdToEmailHtml } from '@/lib/email/send';
import type { StructuredContent } from './content-generator';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface EmailDraftResult {
  ok:         true;
  subject:    string;
  html_body:  string;
  plain_body: string;
  message:    string;
}

export interface EmailDraftError { ok: false; error: string }

function toMarkdown(content: StructuredContent): string {
  const parts: string[] = [];
  for (const s of content.sections) {
    if (s.heading) parts.push(`### ${s.heading}`);
    if (s.body)    parts.push(s.body);
    if (s.bullets?.length) parts.push(s.bullets.map(b => `- ${b}`).join('\n'));
    parts.push('');
  }
  if (content.closing) parts.push(content.closing);
  return parts.join('\n').trim();
}

function toPlain(content: StructuredContent): string {
  const parts: string[] = [];
  for (const s of content.sections) {
    if (s.heading) parts.push(s.heading.toUpperCase());
    if (s.body)    parts.push(s.body);
    if (s.bullets?.length) parts.push(s.bullets.map(b => `• ${b}`).join('\n'));
    parts.push('');
  }
  if (content.closing) parts.push(content.closing);
  return parts.join('\n').trim();
}

export async function draftEmail(
  content: StructuredContent,
  agent: { id: string; agent_name: string | null },
  _supabase: SupabaseClient,
): Promise<EmailDraftResult | EmailDraftError> {
  const subject = (content.title || 'Mensaje').trim();

  const markdown = toMarkdown(content);
  const htmlBody = shell(heading(subject, `${agent.agent_name ?? 'Centinelia'}`) + mdToEmailHtml(markdown));
  const plainBody = toPlain(content);

  return {
    ok:         true,
    subject,
    html_body:  htmlBody,
    plain_body: plainBody,
    message:    `Borrador de correo listo (${subject}). Revisa antes de enviar.`,
  };
}
```

Run test — expected PASS.

- [ ] **Step 3: Type check + commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/lib/creativity/email-drafter.ts src/lib/creativity/__tests__/email-drafter.test.ts
git commit -m "feat(creativity): email-drafter — HTML + plain body para correo estructurado"
```

---

## Task 4: Executor branches (4 tools) + role guards

**Files:**
- Modify: `src/lib/tools/executor.ts` — 4 nuevos branches insertados al final antes del último return

**Interfaces:**

Consumes: `content-generator`, `document-builder`, `email-drafter`, `meerkatCanUse` de Task 1-3.

Cada tool retorna:
- Para PDF tools (1-3): `{ ok, url, file_id, filename, mime_type, document_id, message }` o `{ ok: false, error }`
- Para email tool (4): `{ ok, subject, html_body, plain_body, message }` o `{ ok: false, error }`

**Role guard (defense in depth):**
```ts
const meerkatId = (agent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;
if (!meerkatCanUse(meerkatId, 'generar_propuesta_comercial')) {
  return { ok: false, error: `${agentName} no puede generar propuestas comerciales. Delega a Noah usando delegar_tarea.` };
}
```

**Ops cost por tool:**
- propuesta: 5 ops (LLM + PDF gen)
- cotizacion: 4 ops
- one_pager: 3 ops
- correo: 2 ops (solo LLM, no PDF)

- [ ] **Step 1: Grep insertion point en executor.ts**

Ubicar el último `if (toolName === '...')` en executor.ts. Los 4 branches nuevos van insertados ANTES del último return del `executeAgentTool`.

- [ ] **Step 2: Insertar los 4 branches**

Insertar en `src/lib/tools/executor.ts` tras el último tool existente (después del branch de `preparar_brief_del_dia` del pilar 1):

```ts
  // ─────────────────────────────────────────────────────────────────────────
  // Pilar 2 Creatividad — 4 tools distribuidos por rol
  // ─────────────────────────────────────────────────────────────────────────

  const CREATIVITY_TOOLS = new Set([
    'generar_propuesta_comercial',
    'generar_cotizacion',
    'generar_one_pager',
    'generar_correo_estructurado',
  ]);

  if (CREATIVITY_TOOLS.has(toolName)) {
    const { meerkatCanUse } = await import('@/lib/creativity/meerkat-gates');
    const meerkatId = (agent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;
    const toolKey = toolName as 'generar_propuesta_comercial' | 'generar_cotizacion' | 'generar_one_pager' | 'generar_correo_estructurado';

    if (!meerkatCanUse(meerkatId, toolKey)) {
      return { ok: false, error: `${agentName} no puede usar ${toolName}. Delega a un compañero autorizado usando delegar_tarea.` };
    }

    // Ops charge
    const opsCost = toolName === 'generar_propuesta_comercial' ? 5
                  : toolName === 'generar_cotizacion' ? 4
                  : toolName === 'generar_one_pager' ? 3
                  : 2;
    const { consumeAiOp } = await import('@/lib/ai/ops-guard');
    const opsResult = await consumeAiOp(agentId, opsCost);
    if (!opsResult.ok) {
      return { ok: false, error: 'Sin operaciones disponibles este mes. Compra más o espera al ciclo siguiente.' };
    }

    // Fetch org KB snippet + owner name for content context
    const { data: org } = await supabase
      .from('organizations')
      .select('knowledge_base, business_description, owner_name')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const servicesKb = ((org?.knowledge_base as string | null) ?? '') + '\n' + ((org?.business_description as string | null) ?? '');

    const { generateStructuredContent } = await import('@/lib/creativity/content-generator');
    const kind = toolName === 'generar_propuesta_comercial' ? 'propuesta'
               : toolName === 'generar_cotizacion' ? 'cotizacion'
               : toolName === 'generar_one_pager' ? 'one_pager'
               : 'correo';

    const content = await generateStructuredContent(kind, {
      agentName,
      businessName,
      clientName:   (toolInput.client_name as string | null) ?? null,
      clientNeed:   (toolInput.client_need as string | null) ?? null,
      servicesKb:   servicesKb.trim() || null,
      extraContext: (toolInput.extra_context as string | null) ?? null,
    });

    if (toolName === 'generar_correo_estructurado') {
      const { draftEmail } = await import('@/lib/creativity/email-drafter');
      return await draftEmail(content, { id: agentId, agent_name: agentName }, supabase);
    } else {
      const { buildDocument } = await import('@/lib/creativity/document-builder');
      const result = await buildDocument(kind as 'propuesta' | 'cotizacion' | 'one_pager', content, { id: agentId, agent_name: agentName, portal_email: portalEmail }, supabase);
      if (!result.ok) return result;
      return { ...result, message: `Documento generado: ${content.title}. Descarga: ${result.url} (válido 1 hora).` };
    }
  }
```

- [ ] **Step 3: Type check + commit**

Run: `./node_modules/.bin/tsc --noEmit` — clean.

```bash
git add src/lib/tools/executor.ts
git commit -m "feat(creativity): executor branches — 4 tools nuevas con role guard + ops charge"
```

---

## Task 5: Tool declarations en chat + email + voice channels

**Files:**
- Modify: `src/app/api/portal/[token]/agent-chat/route.ts` — 4 tool declarations condicionales por rol
- Modify: `src/lib/ops/inbox-processor.ts` — same 4 declarations condicionales
- Modify: `src/app/api/voice/inbound/route.ts` — buildTools agrega 4 tools condicionales

**Interfaces:**

Cada tool tiene esta forma:

```ts
{
  name: 'generar_propuesta_comercial',
  description: 'Genera una propuesta comercial en PDF para un cliente. Usa cuando el cliente pidió una cotización formal o cuando calificaste un lead y necesitas mandar propuesta escrita.',
  input_schema: {
    type: 'object',
    properties: {
      client_name:   { type: 'string', description: 'Nombre del cliente o empresa a quien va dirigida.' },
      client_need:   { type: 'string', description: 'Qué está pidiendo el cliente (servicio, cantidad, contexto).' },
      extra_context: { type: 'string', description: 'Contexto extra opcional (llamada previa, correos, requisitos especiales).' },
    },
    required: ['client_name', 'client_need'],
  },
}
```

Los 4 tools comparten el mismo input_schema shape.

**Role gating en registration:**
```ts
const meerkatId = (typedAgent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;
const { MEERKAT_TOOL_ACCESS } = await import('@/lib/creativity/meerkat-gates');
for (const [toolName, allowed] of Object.entries(MEERKAT_TOOL_ACCESS)) {
  if (meerkatId && (allowed as string[]).includes(meerkatId)) {
    tools.push(TOOL_DECLARATIONS[toolName]);
  }
}
```

- [ ] **Step 1: Agregar declarations en `agent-chat/route.ts`**

Ubicar donde se ensambla `tools` array antes de la llamada `anthropic.messages.create`. Después de las tools existentes (incluyendo `preparar_brief_del_dia` de Pilar 1), agregar:

```ts
// Pilar 2 Creatividad — condicionales por rol
{
  const { MEERKAT_TOOL_ACCESS } = await import('@/lib/creativity/meerkat-gates');
  const meerkatId = (typedAgent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;

  const CREATIVITY_DECLARATIONS: Record<string, any> = {
    generar_propuesta_comercial: {
      name: 'generar_propuesta_comercial',
      description: 'Genera una propuesta comercial en PDF para un cliente. Usa cuando calificaste un lead y necesitas mandar propuesta escrita.',
      input_schema: {
        type: 'object',
        properties: {
          client_name:   { type: 'string', description: 'Nombre del cliente o empresa.' },
          client_need:   { type: 'string', description: 'Qué está pidiendo el cliente.' },
          extra_context: { type: 'string', description: 'Contexto extra opcional.' },
        },
        required: ['client_name', 'client_need'],
      },
    },
    generar_cotizacion: {
      name: 'generar_cotizacion',
      description: 'Genera una cotización PDF con precios y condiciones de pago.',
      input_schema: {
        type: 'object',
        properties: {
          client_name:   { type: 'string', description: 'Nombre del cliente.' },
          client_need:   { type: 'string', description: 'Producto o servicio cotizado.' },
          extra_context: { type: 'string', description: 'Contexto extra (cantidad, condiciones, etc.).' },
        },
        required: ['client_name', 'client_need'],
      },
    },
    generar_one_pager: {
      name: 'generar_one_pager',
      description: 'Genera un one-pager informativo (PDF corto) sobre un servicio para mandar a un cliente que pidió info.',
      input_schema: {
        type: 'object',
        properties: {
          client_name:   { type: 'string', description: 'Nombre del cliente destinatario.' },
          client_need:   { type: 'string', description: 'Servicio sobre el cual informar.' },
          extra_context: { type: 'string', description: 'Contexto extra opcional.' },
        },
        required: ['client_name', 'client_need'],
      },
    },
    generar_correo_estructurado: {
      name: 'generar_correo_estructurado',
      description: 'Genera un borrador de correo largo y estructurado. Devuelve subject + HTML body listo para revisar. NO envía el correo.',
      input_schema: {
        type: 'object',
        properties: {
          client_name:   { type: 'string', description: 'Nombre del destinatario.' },
          client_need:   { type: 'string', description: 'Tema del correo.' },
          extra_context: { type: 'string', description: 'Contexto extra opcional.' },
        },
        required: ['client_name', 'client_need'],
      },
    },
  };

  for (const [toolName, allowed] of Object.entries(MEERKAT_TOOL_ACCESS)) {
    if (meerkatId && (allowed as string[]).includes(meerkatId) && CREATIVITY_DECLARATIONS[toolName]) {
      tools.push(CREATIVITY_DECLARATIONS[toolName]);
    }
  }
}
```

- [ ] **Step 2: Mismo bloque en `inbox-processor.ts`**

Insertar el mismo bloque (con el mismo `CREATIVITY_DECLARATIONS`) donde se arma el `tools` array del inbox processor. Nota: `inbox-processor.ts` usa `agentRow?.features` en vez de `typedAgent.features`.

- [ ] **Step 3: Same en `voice/inbound/route.ts` `buildTools`**

En el final de `buildTools(agent, qbConnected)`, agregar (usando el schema Vapi que ya usa buildTools):

```ts
// Pilar 2 Creatividad — condicionales por rol (voz)
const meerkatId = (agent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;
const { MEERKAT_TOOL_ACCESS } = require('@/lib/creativity/meerkat-gates');

const CREATIVITY_VOICE_DECLS: Record<string, any> = {
  generar_propuesta_comercial: {
    type: 'function',
    function: {
      name: 'generar_propuesta_comercial',
      description: 'Genera propuesta comercial PDF para un cliente calificado.',
      parameters: {
        type: 'object',
        properties: {
          client_name:   { type: 'string', description: 'Nombre del cliente.' },
          client_need:   { type: 'string', description: 'Qué necesita.' },
          extra_context: { type: 'string', description: 'Contexto adicional opcional.' },
        },
        required: ['client_name', 'client_need'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/creativity?agent_id=${agent.id}&tool=generar_propuesta_comercial`,
    },
  },
  generar_cotizacion: {
    type: 'function',
    function: {
      name: 'generar_cotizacion',
      description: 'Genera cotización PDF con precios.',
      parameters: {
        type: 'object',
        properties: {
          client_name:   { type: 'string', description: 'Nombre del cliente.' },
          client_need:   { type: 'string', description: 'Servicio cotizado.' },
          extra_context: { type: 'string', description: 'Contexto adicional opcional.' },
        },
        required: ['client_name', 'client_need'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/creativity?agent_id=${agent.id}&tool=generar_cotizacion`,
    },
  },
  generar_one_pager: {
    type: 'function',
    function: {
      name: 'generar_one_pager',
      description: 'Genera one-pager informativo (PDF corto).',
      parameters: {
        type: 'object',
        properties: {
          client_name:   { type: 'string', description: 'Cliente destinatario.' },
          client_need:   { type: 'string', description: 'Servicio a describir.' },
          extra_context: { type: 'string', description: 'Contexto adicional opcional.' },
        },
        required: ['client_name', 'client_need'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/creativity?agent_id=${agent.id}&tool=generar_one_pager`,
    },
  },
  generar_correo_estructurado: {
    type: 'function',
    function: {
      name: 'generar_correo_estructurado',
      description: 'Genera borrador de correo estructurado (subject + body). No envía.',
      parameters: {
        type: 'object',
        properties: {
          client_name:   { type: 'string', description: 'Nombre del destinatario.' },
          client_need:   { type: 'string', description: 'Tema del correo.' },
          extra_context: { type: 'string', description: 'Contexto adicional opcional.' },
        },
        required: ['client_name', 'client_need'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/creativity?agent_id=${agent.id}&tool=generar_correo_estructurado`,
    },
  },
};

for (const [toolName, allowed] of Object.entries(MEERKAT_TOOL_ACCESS)) {
  if (meerkatId && (allowed as string[]).includes(meerkatId) && CREATIVITY_VOICE_DECLS[toolName]) {
    tools.push(CREATIVITY_VOICE_DECLS[toolName]);
  }
}
```

- [ ] **Step 4: Type check + commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/app/api/portal/\[token\]/agent-chat/route.ts src/lib/ops/inbox-processor.ts src/app/api/voice/inbound/route.ts
git commit -m "feat(creativity): tool declarations en chat + email + voz, gated por meerkat_role_id"
```

---

## Task 6: Voice tool endpoint (dispatch a executor)

**Files:**
- Create: `src/app/api/voice/tools/creativity/route.ts`

**Interfaces:**

Endpoint que Vapi llama con el `serverUrl` que registramos en Task 5 buildTools. Recibe `agent_id` + `tool` como query params, body con los tool params, y despacha a `executeAgentTool`.

- [ ] **Step 1: Crear el endpoint**

```ts
// src/app/api/voice/tools/creativity/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeAgentTool } from '@/lib/tools/executor';

const ALLOWED_TOOLS = new Set(['generar_propuesta_comercial', 'generar_cotizacion', 'generar_one_pager', 'generar_correo_estructurado']);

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const agentId  = url.searchParams.get('agent_id');
  const toolName = url.searchParams.get('tool');

  if (!agentId || !toolName || !ALLOWED_TOOLS.has(toolName)) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid params' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('*').eq('id', agentId).single();
  if (!agent) return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const toolInput = (body?.message?.toolCalls?.[0]?.function?.arguments as Record<string, unknown> | undefined) ?? body ?? {};

  const result = await executeAgentTool(toolName, toolInput, {
    agentId:      agent.id,
    portalEmail:  agent.portal_email,
    agentName:    agent.agent_name ?? 'Empleado',
    businessName: agent.business_name,
    portalToken:  agent.portal_token,
    agent:        agent as Record<string, unknown>,
    supabase,
    channel:      'voice',
  });

  return NextResponse.json({ results: [{ toolCallId: body?.message?.toolCalls?.[0]?.id ?? 'unknown', result }] });
}
```

- [ ] **Step 2: Type check + commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/app/api/voice/tools/creativity/route.ts
git commit -m "feat(voice/tools): creativity endpoint dispatch a executeAgentTool"
```

---

## Task 7: Portal UI para custom brand template upload

**Files:**
- Create: `src/app/api/portal/[token]/document-templates/route.ts` — GET+POST+DELETE
- Create: `src/app/portal/[token]/configurar/BrandTemplateSection.tsx` — client component

**Modified:**
- `src/app/portal/[token]/configurar/page.tsx` — mount `<BrandTemplateSection agentId={currentAgent.id} />` cuando el agente actual es Noah/Nico/Naia/Nelia

**Interfaces:**

`GET /api/portal/[token]/document-templates?agent_id=X` → `{ templates: [{tipo, filename, uploaded_at}] }`
`POST /api/portal/[token]/document-templates?agent_id=X&tipo=Y` → multipart file upload → `{ ok, storage_path }`
`DELETE /api/portal/[token]/document-templates?agent_id=X&tipo=Y` → `{ ok }`

**Guards:**
- IDOR: `agent.portal_email === session.portalEmail`
- Meerkat role: solo permitir para roles que usan al menos un tool de creatividad (Noah, Nico, Naia, Nelia).
- Max file size: 5 MB
- Solo `.docx` (mime `application/vnd.openxmlformats-officedocument.wordprocessingml.document`)

- [ ] **Step 1: Endpoint API**

```ts
// src/app/api/portal/[token]/document-templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { MEERKAT_TOOL_ACCESS } from '@/lib/creativity/meerkat-gates';

const CREATIVITY_ROLES = new Set(Object.values(MEERKAT_TOOL_ACCESS).flat());
const ALLOWED_TIPOS = new Set(['propuesta', 'cotizacion', 'one_pager', 'correo']);
const MAX_SIZE = 5 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function guardAgent(req: NextRequest, agentId: string) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return { error: 'unauthorized', status: 401 as const };
  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('id, portal_email, features').eq('id', agentId).maybeSingle();
  if (!agent || agent.portal_email !== session.portalEmail) return { error: 'forbidden', status: 403 as const };
  const roleId = (agent.features as { meerkat_role_id?: string } | null)?.meerkat_role_id;
  if (!roleId || !CREATIVITY_ROLES.has(roleId as any)) return { error: 'role_not_allowed', status: 400 as const };
  return { agent, supabase };
}

export async function GET(req: NextRequest) {
  const agentId = new URL(req.url).searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'missing_agent_id' }, { status: 400 });
  const g = await guardAgent(req, agentId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { data } = await g.supabase.from('document_templates').select('tipo, filename, uploaded_at').eq('agent_id', agentId);
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get('agent_id');
  const tipo    = url.searchParams.get('tipo');
  if (!agentId || !tipo || !ALLOWED_TIPOS.has(tipo)) return NextResponse.json({ error: 'invalid_params' }, { status: 400 });

  const g = await guardAgent(req, agentId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  if (file.size > MAX_SIZE)     return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
  if (file.type !== DOCX_MIME)  return NextResponse.json({ error: 'invalid_type' }, { status: 400 });

  const storagePath = `${agentId}/templates/${tipo}.docx`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await g.supabase.storage.from('agent-documents').upload(storagePath, buffer, { contentType: DOCX_MIME, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await g.supabase.from('document_templates').upsert({ agent_id: agentId, tipo, storage_path: storagePath, filename: file.name }, { onConflict: 'agent_id,tipo' });

  return NextResponse.json({ ok: true, storage_path: storagePath });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get('agent_id');
  const tipo    = url.searchParams.get('tipo');
  if (!agentId || !tipo || !ALLOWED_TIPOS.has(tipo)) return NextResponse.json({ error: 'invalid_params' }, { status: 400 });

  const g = await guardAgent(req, agentId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const storagePath = `${agentId}/templates/${tipo}.docx`;
  await g.supabase.storage.from('agent-documents').remove([storagePath]);
  await g.supabase.from('document_templates').delete().eq('agent_id', agentId).eq('tipo', tipo);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Client component BrandTemplateSection**

```tsx
// src/app/portal/[token]/configurar/BrandTemplateSection.tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Upload, Trash2, FileText } from 'lucide-react';

interface Props { agentId: string; availableTipos: Array<'propuesta' | 'cotizacion' | 'one_pager' | 'correo'> }

interface TemplateRow { tipo: string; filename: string; uploaded_at: string }

const TIPO_LABEL: Record<string, string> = {
  propuesta:  'Propuesta comercial',
  cotizacion: 'Cotización',
  one_pager:  'One-pager',
  correo:     'Correo estructurado',
};

export function BrandTemplateSection({ agentId, availableTipos }: Props) {
  const { token } = useParams<{ token: string }>();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [busy,      setBusy]      = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  async function fetchAll() {
    const res = await fetch(`/api/portal/${token}/document-templates?agent_id=${agentId}`);
    if (res.ok) {
      const j = await res.json();
      setTemplates(j.templates ?? []);
    }
  }

  useEffect(() => { fetchAll(); }, [token, agentId]);

  async function upload(tipo: string, file: File) {
    setBusy(tipo);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/portal/${token}/document-templates?agent_id=${agentId}&tipo=${tipo}`, { method: 'POST', body: form });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'No se pudo subir el archivo.');
    } else {
      await fetchAll();
    }
    setBusy(null);
  }

  async function remove(tipo: string) {
    setBusy(tipo);
    await fetch(`/api/portal/${token}/document-templates?agent_id=${agentId}&tipo=${tipo}`, { method: 'DELETE' });
    await fetchAll();
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
        Sube una plantilla .docx custom para cada tipo de documento. Si subes una, se usará en vez del formato default. Formato Word estándar, máximo 5 MB. Usa marcadores como {'{title}'}, {'{sections}'}, {'{closing}'} dentro del documento.
      </p>

      {availableTipos.map(tipo => {
        const existing = templates.find(t => t.tipo === tipo);
        return (
          <div key={tipo} className="flex items-center justify-between gap-4 p-3 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--c-text-3)' }} />
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{TIPO_LABEL[tipo]}</p>
                {existing ? (
                  <p className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>{existing.filename}</p>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Usando plantilla por defecto</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {existing && (
                <button
                  disabled={busy === tipo}
                  onClick={() => remove(tipo)}
                  className="p-1.5 rounded hover:opacity-70 disabled:opacity-50"
                  title="Quitar plantilla"
                >
                  <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} />
                </button>
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                style={{ background: '#6C3BFF', color: '#fff', opacity: busy === tipo ? 0.5 : 1 }}>
                <Upload className="w-3.5 h-3.5" />
                {busy === tipo ? 'Subiendo...' : existing ? 'Reemplazar' : 'Subir .docx'}
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  disabled={busy === tipo}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) upload(tipo, f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        );
      })}

      {error && (
        <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount en `configurar/page.tsx`**

Ubicar donde otras secciones se renderizan condicionalmente por rol. Agregar:

```tsx
{['noah', 'nico', 'naia', 'nelia'].includes(meerkatId ?? '') && (
  <Section title="Plantillas de documentos">
    <BrandTemplateSection
      agentId={currentAgent.id}
      availableTipos={
        meerkatId === 'noah'  ? ['propuesta', 'cotizacion', 'one_pager', 'correo'] :
        meerkatId === 'nelia' ? ['one_pager', 'correo'] :
        meerkatId === 'nico'  ? ['correo'] :
        meerkatId === 'naia'  ? ['correo'] :
        []
      }
    />
  </Section>
)}
```

(Ajusta la estructura de `<Section>` al pattern real que use `configurar/page.tsx`; verifica cómo se rendered `BriefDelDiaSection` del Pilar 1 y sigue el mismo pattern).

- [ ] **Step 4: Type check + commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/app/api/portal/\[token\]/document-templates/route.ts src/app/portal/\[token\]/configurar/BrandTemplateSection.tsx src/app/portal/\[token\]/configurar/page.tsx
git commit -m "feat(creativity): upload .docx custom templates per meerkat + mount en Configurar"
```

---

## Task 8: E2E manual checklist + docs

**Files:**
- Create: `docs/superpowers/plans/2026-08-04-pilar-2-e2e-checklist.md`

- [ ] **Step 1: Crear el checklist**

```markdown
# Pilar 2 Creatividad E2E Checklist

Setup: cuenta con Noah + Nelia + Nico + Naia activos, KB del org con descripción de servicios reales, contexto de cliente falso listo para probar.

## Modo chat (portal /oficina)

- [ ] Elegir Noah en el sidebar, mandar: "Genera una propuesta para ACME sobre implementación de CRM"
- [ ] Verificar respuesta con URL del PDF + resumen del contenido
- [ ] Abrir el PDF descargado, verificar branding (color, logo, footer) del org
- [ ] Row en ops_documents con template_type='propuesta'
- [ ] Repetir para cotizacion: "Cotiza CRM para ACME 50k MXN"
- [ ] Repetir con Nelia: "Genera one-pager sobre nuestro servicio de facturación"
- [ ] Repetir con Nico: "Genera correo estructurado para cliente moroso ACME sobre acuerdo de pago"

## Guardarraíles role gating

- [ ] Mandar a Nia (recepcionista) "Genera propuesta para X" → debe rechazar con mensaje "Nia no puede usar generar_propuesta_comercial. Delega a Noah usando delegar_tarea."
- [ ] Mandar a Nelia "Genera cotización" → debe rechazar (Nelia solo tiene one_pager y correo)
- [ ] Mandar a Naia "Genera one_pager" → debe rechazar (Naia solo tiene correo)

## Modo voz

- [ ] Llamar a Noah, decir: "Manda propuesta a ACME por CRM"
- [ ] Verificar por logs Vapi que se llamó /api/voice/tools/creativity con tool=generar_propuesta_comercial
- [ ] Verificar en portal que llegó el PDF a ops_documents

## Modo email

- [ ] Mandar correo al agente Noah pidiendo cotización de servicio X
- [ ] Verificar por logs de inbox-processor que llamó generar_cotizacion
- [ ] Verificar PDF generado en ops_documents

## Ops charge

- [ ] Antes de generar: nota ai_ops_used de Noah
- [ ] Genera 1 propuesta → ai_ops_used debe incrementar +5
- [ ] Genera 1 cotizacion → +4
- [ ] Genera 1 one_pager → +3
- [ ] Genera 1 correo → +2
- [ ] Cuando ai_ops_used > ai_ops_limit → tool responde 429 con mensaje sobre ops agotadas

## Custom template

- [ ] Portal /configurar de Noah → sección "Plantillas de documentos" → subir un .docx con {title} y {sections} marcadores
- [ ] Regenerar propuesta → PDF debe usar el custom template (verificar visualmente)
- [ ] Eliminar template desde UI → siguiente generación usa built-in default de nuevo

## Copy scan

- [ ] Todo el copy visible es español, sin em-dashes, sin emojis, sin "IA"
- [ ] Íconos son Lucide únicamente
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-pilar-2-e2e-checklist.md
git commit -m "docs(creativity): E2E manual checklist para Pilar 2"
```

- [ ] **Step 3: Update handoff memory**

Actualizar `C:\Users\Nazre\.claude\projects\C--Users-Nazre\memory\handoff_pilares_1_2_diseno.md` marcando Pilar 2 como shipped.

---

## Self-Review

**Spec coverage** (contra memoria handoff_pilares_1_2_diseno.md):
- 4 tools distribuidas por rol (Noah, Nico, Naia, Nelia): Task 4 + 5 ✓
- Skills-lite (custom brand template upload): Task 7 ✓
- Reuso de infra existente (create_document / PDFs / ops_documents / brandKit): document-builder Task 2 ✓
- KB Generator sesión 8 concept reuse: content-generator llama Sonnet con KB del org ✓
- 3-canales por tool (voz + chat + email): Task 5 + 6 ✓
- Role guard defense in depth (executor + registration + UI mount): Task 4 (executor) + Task 5 (declarations) + Task 7 (UI) ✓
- Ops charge: Task 4 ✓
- Dropped columns: kb + business_description from `organizations` ✓
- Feature flag opt-in: no aplica (on-demand tools, no crons)
- Regla `feedback_no_unilateral_toggles`: no aplica
- Regla `feedback_no_ia_visible`: verificado en copy scan de Task 8 ✓
- Golden tests: NO cubierto — cada tool nueva idealmente tiene rubric en Golden Tests suite (sesión 48). Follow-up opcional, no bloquea merge inicial.

**Placeholder scan:** revisado. Sin TBD/TODO/"handle edge cases". Todo tiene código concreto.

**Type consistency:** `StructuredContent`, `ContentContext`, `DocumentBuildResult`, `EmailDraftResult`, `MEERKAT_TOOL_ACCESS`, `meerkatCanUse` — usados consistentemente entre tasks.

**Ambigüedad aceptada:**
- Pattern exacto de cómo mount `<BriefDelDiaSection>` en configurar/page.tsx debe verificarse al ejecutar Task 7 Step 3 — el implementador copia el pattern local.
- `inbox-processor.ts` typedAgent vs agentRow: verificar al ejecutar Task 5 Step 2, el pattern real puede diferir ligeramente del Pilar 1.

---

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-08-04-pilar-2-creatividad.md`.

Dos opciones de ejecución:

1. **Subagent-Driven (recomendada)** — fresh subagent por task, review entre tasks. Es lo que funcionó bien en Pilar 1.
2. **Inline Execution** — ejecutar tasks en esta sesión con checkpoints.

¿Cuál eliges?
