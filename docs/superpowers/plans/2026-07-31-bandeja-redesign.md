# Bandeja Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la bandeja del portal (`Oficina · Bandeja`) para que Nazre identifique en <2s qué requiere su acción, distinga la categoría de cada correo sin expandir y separe visualmente lo escalado de lo ya al día. Sin cambios de API ni de DB.

**Architecture:** El componente `OpsInboxSection.tsx` (819 líneas) se refactoriza en 3 subcomponentes locales (`CategoryChips`, `InboxZone`, `InboxRow`) que consumen la misma shape de datos que ya devuelve `GET /api/portal/[token]/ops-inbox`. La lista plana actual se parte en dos zonas verticales dentro de cada tab (`Requieren tu acción` con status `escalated|info_requested`, `Al día` con el resto), y arriba se agrega una fila de chips single-select que filtra por `category` con URL sync (`?cat=<slug>`). El chip de agente solo aparece si el portal tiene >1 agente activo; para saberlo, `page.tsx` de la bandeja pasa la lista de agentes como prop.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind 3, Lucide React (íconos), `next/navigation` (`useSearchParams` + `useRouter`), Sonner (toasts, ya presente).

## Global Constraints

- Spanish, sin em-dashes (—). Usar `:` `,` `.`
- Sin emojis en UI. Íconos Lucide únicamente.
- Sin "IA" en copy visible.
- Sin cambios en `src/app/api/portal/[token]/ops-inbox/route.ts` ni en DB.
- `./node_modules/.bin/tsc --noEmit` debe pasar limpio al terminar cada task.
- Commits incrementales, uno por task.
- Preservar 100%:
  - Deep-link support (`?tab=auto`, `?tab=spam`).
  - Sección "PENDIENTES TUYOS" (`human_requests`) sobre la partición zonas.
  - Card expandida con summary, draft editable, adjuntos, acciones (approve/reject/edit).
  - Botón Rescatar en Spam.
  - Tab Reportados con detalles del reporte.
  - Banner "Cliente ya respondió" cuando `client_replied_at` está set.
  - Correo de corrección al cliente.
- Colores fuentes (variables del sistema): `--c-surface`, `--c-surface-2`, `--c-border`, `--c-border-2`, `--c-text`, `--c-text-2`, `--c-text-3`, `--c-text-4`. Color de marca `#6C3BFF`. Ver `OpsInboxSection.tsx:73-102` para paleta de categorías/urgencias existente.

---

## File Structure

**Modified:**
- `src/app/portal/[token]/OpsInboxSection.tsx` — de ~819 líneas a ~600. Delega row rendering a `<InboxRow />`, agrupación visual a `<InboxZone />`, filtro categoría a `<CategoryChips />`. Acepta nueva prop `agents`.
- `src/app/portal/[token]/oficina/bandeja/page.tsx` — fetch agents del `portal_email` y pásalos como prop.

**Created:**
- `src/app/portal/[token]/inbox/CategoryChips.tsx` — chips single-select con URL sync a `?cat=<slug>`. Deriva categorías del set de items visible y calcula conteos.
- `src/app/portal/[token]/inbox/InboxZone.tsx` — wrapper con header + conteo + colapsable si `items.length > 10`.
- `src/app/portal/[token]/inbox/InboxRow.tsx` — fila colapsada nueva (dot, chip categoría, chip agente condicional, subject bold/light, from + tiempo, badge estado en Zona 1). Recibe callback `onToggle`; body expandido sigue en el parent.
- `src/app/portal/[token]/inbox/categories.ts` — helpers puros: `normalizeCategory(raw)`, `categorySlugs`, `CATEGORY_LABELS`, `CATEGORY_COLORS`, orden fijo.

---

## Task 1: Extraer helpers de categoría y agregar prop `agents` sin cambio visual

**Files:**
- Create: `src/app/portal/[token]/inbox/categories.ts`
- Modify: `src/app/portal/[token]/OpsInboxSection.tsx` (extraer constantes 64-80, aceptar prop `agents`)
- Modify: `src/app/portal/[token]/oficina/bandeja/page.tsx` (fetch agents, pasarlos)

**Interfaces:**
- Produces:
  - `type CategorySlug = 'cliente' | 'proveedor' | 'factura' | 'urgente' | 'otros'`
  - `const CATEGORY_ORDER: CategorySlug[] = ['cliente', 'proveedor', 'factura', 'urgente', 'otros']`
  - `const CATEGORY_LABELS: Record<CategorySlug, string>`
  - `const CATEGORY_COLORS: Record<CategorySlug, string>` (hex)
  - `function normalizeCategory(raw: string | null | undefined): CategorySlug`
  - `interface InboxAgent { id: string; agent_name: string | null; business_name: string | null }`
  - `OpsInboxSection` acepta `{ token: string; agents: InboxAgent[] }`

- [ ] **Step 1: Crear `src/app/portal/[token]/inbox/categories.ts`**

```ts
export type CategorySlug = 'cliente' | 'proveedor' | 'factura' | 'urgente' | 'otros';

export const CATEGORY_ORDER: CategorySlug[] = ['cliente', 'proveedor', 'factura', 'urgente', 'otros'];

export const CATEGORY_LABELS: Record<CategorySlug, string> = {
  cliente:   'Cliente',
  proveedor: 'Proveedor',
  factura:   'Factura',
  urgente:   'Urgente',
  otros:     'Otros',
};

// hex + hex de fondo (10% alpha) + hex de texto (700)
export const CATEGORY_COLORS: Record<CategorySlug, { fg: string; bg: string; border: string }> = {
  cliente:   { fg: '#1D4ED8', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.30)'  }, // blue
  proveedor: { fg: '#047857', bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)'  }, // emerald
  factura:   { fg: '#B45309', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)'  }, // amber
  urgente:   { fg: '#B91C1C', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)'   }, // red
  otros:     { fg: '#374151', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.30)' }, // gray
};

const SYNONYMS: Record<string, CategorySlug> = {
  cliente:      'cliente',
  clientes:     'cliente',
  client:       'cliente',
  proveedor:    'proveedor',
  proveedores:  'proveedor',
  supplier:     'proveedor',
  vendor:       'proveedor',
  factura:      'factura',
  facturas:     'factura',
  invoice:      'factura',
  recibo:       'factura',
  urgente:      'urgente',
  urgent:       'urgente',
  urgencia:     'urgente',
  prioritario:  'urgente',
};

export function normalizeCategory(raw: string | null | undefined): CategorySlug {
  if (!raw) return 'otros';
  const key = raw.trim().toLowerCase();
  return SYNONYMS[key] ?? 'otros';
}

export interface InboxAgent {
  id:            string;
  agent_name:    string | null;
  business_name: string | null;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 3: Modificar `src/app/portal/[token]/oficina/bandeja/page.tsx`**

Actualmente la página es corta y llama a `<OpsInboxSection token={token} />`. Amplíala para que fetch agents del portal_email y los pase como prop:

```tsx
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import OpsInboxSection from '../../OpsInboxSection';
import type { InboxAgent } from '../../inbox/categories';

interface Props { params: Promise<{ token: string }> }

export default async function BandejaPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const { data: acct } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();

  let agents: InboxAgent[] = [];
  if (acct?.portal_email) {
    const { data } = await supabase
      .from('voice_agents')
      .select('id, agent_name, business_name')
      .eq('portal_email', acct.portal_email);
    agents = (data ?? []) as InboxAgent[];
  }

  return (
    <div id="of-bandeja">
      <OpsInboxSection token={token} agents={agents} />
    </div>
  );
}

export const dynamic = 'force-dynamic';
```

**Nota:** Preserva `export const dynamic = 'force-dynamic'` que ya está en la página; no cambies otros comportamientos que pudiera tener (revisa el archivo actual antes con `Read`).

- [ ] **Step 4: Modificar `OpsInboxSection.tsx` signature y quitar constantes duplicadas**

- Reemplaza `export default function OpsInboxSection({ token }: { token: string })` (línea ~115) por:

```tsx
import type { InboxAgent } from './inbox/categories';

interface OpsInboxSectionProps {
  token:  string;
  agents: InboxAgent[];
}

export default function OpsInboxSection({ token, agents }: OpsInboxSectionProps) {
```

- Elimina las constantes `CATEGORY_LABELS` (líneas 64-71) y `CATEGORY_COLORS` (líneas 73-80) del archivo. Serán reemplazadas por las de `./inbox/categories.ts` en Task 3. Mientras tanto, para no romper la UI existente que las usa (líneas 487-488), reemplázalas por adapters inline temporales que consulten el helper:

```tsx
// Temporal: mientras InboxRow no exista, adaptamos las viejas keys al helper nuevo.
// Se elimina en Task 3.
import { normalizeCategory, CATEGORY_LABELS as CAT_LABELS, CATEGORY_COLORS as CAT_COLORS } from './inbox/categories';

function catColorLegacy(raw: string | null | undefined): string {
  return CAT_COLORS[normalizeCategory(raw)].fg;
}
function catLabelLegacy(raw: string | null | undefined): string {
  return CAT_LABELS[normalizeCategory(raw)];
}
```

- Actualiza las 2 líneas dentro del map (~487-488):

```tsx
const catColor   = catColorLegacy(item.category);
const catLabel   = catLabelLegacy(item.category);
```

Y las referencias donde se usa `${catColor}18`, `${catColor}30`, `${catColor}08`, `${catColor}20`, `${catColor}44` (color hex + alpha). El `catColor` sigue siendo hex, sigue funcionando.

- [ ] **Step 5: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 6: Smoke manual**

Abre `http://localhost:3000/portal/<token>/oficina/bandeja` en dev (`npm run dev`).
Verifica: la bandeja se ve idéntica a antes del cambio. Las categorías (colores, labels) siguen igual. Los tabs, search, human_requests, expand/collapse, aprobar/rechazar, Rescatar, Reportar, Corrección — todo funciona igual que antes del refactor.

- [ ] **Step 7: Commit**

```bash
git add src/app/portal/[token]/inbox/categories.ts src/app/portal/[token]/OpsInboxSection.tsx src/app/portal/[token]/oficina/bandeja/page.tsx
git commit -m "refactor(bandeja): extraer helpers de categoría y agregar prop agents

Prepara el terreno para el rediseño. Sin cambios visibles: bandeja
se ve idéntica.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Extraer `<InboxRow />` preservando comportamiento actual

**Files:**
- Create: `src/app/portal/[token]/inbox/InboxRow.tsx`
- Modify: `src/app/portal/[token]/OpsInboxSection.tsx`

**Interfaces:**
- Consumes: `InboxAgent[]` de la prop `agents` del parent.
- Produces:

```ts
interface InboxRowProps {
  item:            InboxItem;
  agents:          InboxAgent[];     // para agent chip (Task 3)
  isExpanded:      boolean;
  onToggle:        () => void;
  showStateBadge?: boolean;          // true en Zona 1 (Task 5), false en Zona 2
}
```

En este task `showStateBadge` se ignora — el badge nuevo se agrega en Task 3 junto con los otros cambios visuales. El objetivo aquí es solo mover el JSX de la row colapsada a un componente sin cambiar nada visible.

- [ ] **Step 1: Crear `src/app/portal/[token]/inbox/InboxRow.tsx`**

Copia verbatim el JSX del botón "Collapsed row" (líneas ~496-563 del `OpsInboxSection` actual) a un nuevo componente. Sin cambios visuales. Los datos derivados (`catColor`, `catLabel`, `isPending`) se calculan dentro del componente. El `markRead` viene como callback del parent.

```tsx
'use client';

import { ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import type { InboxAgent } from './categories';
import { normalizeCategory, CATEGORY_LABELS, CATEGORY_COLORS } from './categories';

// Shape mínima del item que consume la row. Debe matchear InboxItem del parent.
interface InboxRowItem {
  id:                      string;
  agent_id:                string;
  email_from:              string;
  email_subject:           string;
  category:                string | null;
  ai_summary:              string | null;
  item_type:               'email' | 'invoice';
  status:                  string;
  attachments:             Array<{ name: string; url: string; type: string }>;
  created_at:              string;
  auto_mode_decision:      string | null;
  auto_mode_reason:        string | null;
  auto_mode_flagged_at:    string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending:        'Pendiente',
  approved:       'Aprobado',
  rejected:       'Rechazado',
  sent:           'Enviado',
  skipped:        'Ignorado',
  auto_replied:   'Enviado automáticamente',
  escalated:      'Escalado a ti',
  info_requested: 'Info solicitada al remitente',
};

interface InboxRowProps {
  item:            InboxRowItem;
  agents:          InboxAgent[];
  isExpanded:      boolean;
  onToggle:        () => void;
  showStateBadge?: boolean;
}

export default function InboxRow({ item, isExpanded, onToggle }: InboxRowProps) {
  const cat       = normalizeCategory(item.category);
  const catColor  = CATEGORY_COLORS[cat];
  const catLabel  = CATEGORY_LABELS[cat];
  const isPending = item.status === 'pending';

  return (
    <button
      className="w-full flex items-start gap-3 px-4 py-3 text-left"
      onClick={onToggle}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
        <div className="w-2 h-2 rounded-full" style={{ background: isPending ? catColor.fg : 'var(--c-border-2)' }} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span
            className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: catColor.bg, color: catColor.fg, border: `1px solid ${catColor.border}` }}
          >
            {catLabel}
          </span>
          {item.item_type === 'invoice' && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
            >
              Factura
            </span>
          )}
          {item.auto_mode_decision === 'send' && item.status === 'auto_replied' && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#0F5132] bg-[#D1E7DD] border border-[#0F5132]/20 rounded-full px-2 py-0.5"
              title={item.auto_mode_reason ?? 'Enviado sin humano por el modo Auto'}
            >
              Enviado automático
            </span>
          )}
          {item.auto_mode_decision === 'block' && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#842029] bg-[#F8D7DA] border border-[#842029]/20 rounded-full px-2 py-0.5"
              title={item.auto_mode_reason ?? 'Bloqueado por red de seguridad'}
            >
              Bloqueado
            </span>
          )}
          {item.auto_mode_flagged_at && (
            <span
              className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-[#664D03] bg-[#FFF3CD] border border-[#664D03]/20 rounded-full px-2 py-0.5"
              title="Marcado como envío incorrecto"
            >
              Reportado
            </span>
          )}
          {!isPending && !item.auto_mode_flagged_at && (
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{STATUS_LABELS[item.status]}</span>
          )}
        </div>
        <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
          {item.email_subject || '(sin asunto)'}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--c-text-3)' }}>{item.email_from}</p>
        {item.ai_summary && !isExpanded && (
          <p className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--c-text-4)' }}>{item.ai_summary}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {item.attachments?.length > 0 && (
          <Paperclip size={11} style={{ color: 'var(--c-text-4)' }} />
        )}
        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
          {new Date(item.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
        </span>
        {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} /> : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Reemplazar el JSX de la row en `OpsInboxSection.tsx`**

Localiza el bloque de la row colapsada (aproximadamente líneas 496-563 del original). Reemplázalo por:

```tsx
<InboxRow
  item={item}
  agents={agents}
  isExpanded={isExpanded}
  onToggle={() => {
    const opening = expandedId !== item.id;
    setExpanded(opening ? item.id : null);
    if (opening) markRead(item.id);
  }}
/>
```

Añade el import al top:

```tsx
import InboxRow from './inbox/InboxRow';
```

Ya puedes remover los adapters `catColorLegacy` / `catLabelLegacy` de Task 1: el body expandido sigue usando `catColor` como hex (`${catColor}08`, etc.), así que reemplaza esas referencias por el hex directo desde el helper:

```tsx
const catColorObj = CATEGORY_COLORS[normalizeCategory(item.category)];
const catColorHex = catColorObj.fg;
// Usa catColorHex en lugar de catColor en las referencias `${catColor}08` etc.
```

Import `CATEGORY_COLORS` y `normalizeCategory` desde `./inbox/categories`.

Elimina `Paperclip`, `ChevronDown`, `ChevronUp` del import de lucide-react del `OpsInboxSection.tsx` **solo si ya no se usan** en el archivo (verifica que no queden otros usos en el body expandido antes de removerlos; si `ChevronUp/Down` ya no se usan afuera de la row, quitar).

- [ ] **Step 3: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 4: Smoke manual**

Recarga la bandeja. Debe verse idéntica a Task 1 (idéntica al pre-refactor). Expand/collapse, badges de estado, dot de color, chips de Factura/Auto/Bloqueado/Reportado deben aparecer igual.

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/[token]/inbox/InboxRow.tsx src/app/portal/[token]/OpsInboxSection.tsx
git commit -m "refactor(bandeja): extraer InboxRow preservando comportamiento

Row colapsada movida a componente propio. Sin cambios visuales.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Rediseño visual de `<InboxRow />` (agent chip, read/unread contrast, state badge)

**Files:**
- Modify: `src/app/portal/[token]/inbox/InboxRow.tsx`

**Interfaces:**
- `InboxRowProps.showStateBadge` ahora sí se consume (default `false`).
- Sigue mismos tipos que Task 2.

Cambios visuales:
1. **Chip de agente condicional:** si `agents.length > 1`, mostrar el nombre del agente (agent_name o business_name como fallback).
2. **Subject contrast pending vs non-pending:** `font-semibold` + `text-black` si `pending|escalated|info_requested`, `font-normal` + `text-gray-500` si otro.
3. **Badge de estado (esquina derecha) solo si `showStateBadge`:** para status `escalated` y `info_requested`, pill con color rojo/naranja tenue. Reemplaza al viejo `STATUS_LABELS[item.status]` chip cuando aplique.
4. **Hover más marcado:** aplicar `hover:bg-gray-50` al `<button>`.

- [ ] **Step 1: Editar `InboxRow.tsx` para chip de agente**

Dentro del componente, arriba del `return`:

```tsx
const agent      = agents.find(a => a.id === item.agent_id) ?? null;
const agentLabel = agent?.agent_name ?? agent?.business_name ?? null;
const showAgent  = agents.length > 1 && !!agentLabel;
```

En el bloque de chips (después del `Factura`, antes de `auto_replied`), agrega:

```tsx
{showAgent && (
  <span
    className="text-[11px] px-1.5 py-0.5 rounded-full"
    style={{
      background: 'var(--c-surface)',
      color:      'var(--c-text-3)',
      border:     '1px solid var(--c-border)',
    }}
  >
    {agentLabel}
  </span>
)}
```

- [ ] **Step 2: Reforzar read/unread contrast en subject**

Localiza:

```tsx
<p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
```

Reemplaza por:

```tsx
<p
  className={`text-sm truncate ${isPending ? 'font-semibold' : 'font-normal'}`}
  style={{ color: isPending ? 'var(--c-text)' : 'var(--c-text-3)' }}
>
```

Donde `isPending` incluye ahora los estados que "requieren atención":

```tsx
const isPending = ['pending', 'escalated', 'info_requested'].includes(item.status);
```

Reemplaza el `const isPending = item.status === 'pending'` del Task 2 por lo anterior. El color del dot ya se apoya en `isPending` así que se refuerza automáticamente.

- [ ] **Step 3: Agregar badge de estado condicional en la esquina derecha**

Nueva sección en el bloque `<div className="flex items-center gap-2 flex-shrink-0 ml-2">` (antes del `attachments` icon), condicional:

```tsx
{showStateBadge && item.status === 'escalated' && (
  <span
    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
    style={{ background: 'rgba(239,68,68,0.12)', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.30)' }}
  >
    Escalado
  </span>
)}
{showStateBadge && item.status === 'info_requested' && (
  <span
    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
    style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309', border: '1px solid rgba(245,158,11,0.30)' }}
  >
    Info solicitada
  </span>
)}
```

Cuando `showStateBadge` es true y el status es escalated/info_requested, **oculta** el viejo `STATUS_LABELS[item.status]` inline en el bloque de chips (líneas del `{!isPending && !item.auto_mode_flagged_at && ...}`). Reemplaza esa condición por:

```tsx
{!isPending && !item.auto_mode_flagged_at && !showStateBadge && (
  <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{STATUS_LABELS[item.status]}</span>
)}
```

- [ ] **Step 4: Agregar hover**

Agrega `hover:bg-gray-50` a la className del `<button>` raíz:

```tsx
<button
  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50/50"
  ...
```

- [ ] **Step 5: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 6: Smoke manual**

Recarga la bandeja. Verifica:
- Con >1 agente en tu portal: aparece el chip de agente en cada row.
- Con 1 solo agente: NO aparece.
- Los correos ya atendidos (approved/sent/rejected/auto_replied) se ven en gris con peso normal; los pendientes/escalated/info_requested se ven en negro bold.
- El `showStateBadge` está aún en `false` por default, así que ningún badge nuevo aparece en esta task (llega en Task 5).
- Hover en la row cambia sutilmente el fondo.

- [ ] **Step 7: Commit**

```bash
git add src/app/portal/[token]/inbox/InboxRow.tsx
git commit -m "feat(bandeja): chip de agente + contrast read/unread + hover

- Chip de agente aparece cuando el portal tiene >1 agente activo.
- Subject pending: bold + texto principal. Subject atendido: normal +
  texto gris. Refuerza el dot que ya diferenciaba estado.
- Hover sutil en la row.
- Badge de estado (Escalado / Info solicitada) preparado tras
  showStateBadge; se activa en la partición de zonas de Task 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `<CategoryChips />` + filtro categoría con URL sync (`?cat=<slug>`)

**Files:**
- Create: `src/app/portal/[token]/inbox/CategoryChips.tsx`
- Modify: `src/app/portal/[token]/OpsInboxSection.tsx`

**Interfaces:**
- Consumes: `filteredItems: InboxItem[]` (los del tab + post-search), `activeCategory: CategorySlug | null` (null = "Todas"), `onSelect(cat: CategorySlug | null): void`.
- Produces: `<CategoryChips items={...} activeCategory={...} onSelect={...} />`.

Comportamiento:
- Auto-oculto si `items.length <= 3` (fricción innecesaria).
- Chip `Todas` siempre visible aunque haya cero items.
- Otros chips solo si al menos 1 item post-search tiene esa categoría normalizada.
- Orden fijo: `Todas → Cliente → Proveedor → Factura → Urgente → Otros`.
- Conteo dinámico dentro del chip: `Cliente 8`.
- Activo: fondo `#6C3BFF` + texto blanco. Inactivo: borde suave + texto neutro.
- La partición de zonas (Task 5) se aplica DESPUÉS del filtro de categoría: si el usuario filtra "Factura", ambas zonas solo muestran facturas.

- [ ] **Step 1: Crear `src/app/portal/[token]/inbox/CategoryChips.tsx`**

```tsx
'use client';

import { CATEGORY_ORDER, CATEGORY_LABELS, normalizeCategory } from './categories';
import type { CategorySlug } from './categories';

interface CategoryChipsItem {
  category: string | null;
}

interface CategoryChipsProps {
  items:           CategoryChipsItem[];
  activeCategory:  CategorySlug | null;
  onSelect:        (cat: CategorySlug | null) => void;
}

export default function CategoryChips({ items, activeCategory, onSelect }: CategoryChipsProps) {
  if (items.length <= 3) return null;

  const counts = new Map<CategorySlug, number>();
  for (const it of items) {
    const c = normalizeCategory(it.category);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  const availableSlugs = CATEGORY_ORDER.filter(slug => (counts.get(slug) ?? 0) > 0);
  if (availableSlugs.length === 0) return null;

  const chipBase =
    'text-xs px-3 py-1 rounded-full font-medium transition-colors flex items-center gap-1.5';

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        className={chipBase}
        onClick={() => onSelect(null)}
        style={{
          background: activeCategory === null ? '#6C3BFF' : 'var(--c-surface)',
          color:      activeCategory === null ? '#fff'    : 'var(--c-text-3)',
          border:     `1px solid ${activeCategory === null ? '#6C3BFF' : 'var(--c-border)'}`,
        }}
      >
        Todas
        <span
          className="text-[10px] font-semibold px-1.5 py-0 rounded-full"
          style={{
            background: activeCategory === null ? 'rgba(255,255,255,0.20)' : 'var(--c-surface-2)',
            color:      activeCategory === null ? '#fff'                    : 'var(--c-text-3)',
          }}
        >
          {items.length}
        </span>
      </button>
      {availableSlugs.map(slug => {
        const isActive = activeCategory === slug;
        return (
          <button
            key={slug}
            type="button"
            className={chipBase}
            onClick={() => onSelect(isActive ? null : slug)}
            style={{
              background: isActive ? '#6C3BFF' : 'var(--c-surface)',
              color:      isActive ? '#fff'    : 'var(--c-text-3)',
              border:     `1px solid ${isActive ? '#6C3BFF' : 'var(--c-border)'}`,
            }}
          >
            {CATEGORY_LABELS[slug]}
            <span
              className="text-[10px] font-semibold px-1.5 py-0 rounded-full"
              style={{
                background: isActive ? 'rgba(255,255,255,0.20)' : 'var(--c-surface-2)',
                color:      isActive ? '#fff'                    : 'var(--c-text-3)',
              }}
            >
              {counts.get(slug) ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Conectar en `OpsInboxSection.tsx` con estado + URL sync**

En los imports, agrega:

```tsx
import { useRouter } from 'next/navigation';
import CategoryChips from './inbox/CategoryChips';
import type { CategorySlug } from './inbox/categories';
import { CATEGORY_ORDER, normalizeCategory } from './inbox/categories';
```

Debajo del estado `search`, agrega:

```tsx
const router = useRouter();

const initialCategory: CategorySlug | null = (() => {
  const c = searchParams.get('cat');
  if (c && (CATEGORY_ORDER as string[]).includes(c)) return c as CategorySlug;
  return null;
})();
const [activeCategory, setActiveCategory] = useState<CategorySlug | null>(initialCategory);

const changeCategory = useCallback((next: CategorySlug | null) => {
  setActiveCategory(next);
  const params = new URLSearchParams(searchParams.toString());
  if (next) params.set('cat', next); else params.delete('cat');
  const qs = params.toString();
  router.replace(qs ? `?${qs}` : '?', { scroll: false });
}, [router, searchParams]);
```

Modifica `filteredItems` para aplicar el filtro de categoría DESPUÉS del search:

```tsx
const filteredItems = (() => {
  let base: InboxItem[];
  // ... mismo switch por activeTab que hoy ...

  const bySearch = !search.trim()
    ? base
    : base.filter(i =>
        (i.email_subject ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (i.email_from    ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (i.ai_summary    ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (i.category      ?? '').toLowerCase().includes(search.toLowerCase())
      );

  if (!activeCategory) return bySearch;
  return bySearch.filter(i => normalizeCategory(i.category) === activeCategory);
})();
```

Los conteos de tabs (`pendingOpsCount`, etc.) deben seguir sin considerar `activeCategory` — se mantienen igual (los tabs no se filtran por categoría).

Renderiza `<CategoryChips />` justo debajo del search bar y antes de la sección "PENDIENTES TUYOS":

```tsx
<CategoryChips
  items={/* mismo base que filteredItems pero SIN aplicar filtro de categoría */ (() => {
    let base: InboxItem[];
    if (activeTab === 'pendientes') base = items.filter(i => ['pending', 'escalated', 'info_requested'].includes(i.status));
    else if (activeTab === 'auto')       base = items.filter(i => i.status === 'auto_replied' && i.auto_mode_decision === 'send');
    else if (activeTab === 'spam')       base = items.filter(i => i.status === 'skipped' && i.category === 'spam');
    else if (activeTab === 'rechazados') base = items.filter(i => i.status === 'rejected');
    else if (activeTab === 'reportados') base = items.filter(i => !!i.auto_mode_flagged_at);
    else                                  base = items;
    return base;
  })()}
  activeCategory={activeCategory}
  onSelect={changeCategory}
/>
```

**Refactor recomendado para evitar duplicación:** extrae el switch por tab a un `useMemo`:

```tsx
const tabItems = useMemo<InboxItem[]>(() => {
  if (activeTab === 'pendientes')  return items.filter(i => ['pending', 'escalated', 'info_requested'].includes(i.status));
  if (activeTab === 'auto')        return items.filter(i => i.status === 'auto_replied' && i.auto_mode_decision === 'send');
  if (activeTab === 'spam')        return items.filter(i => i.status === 'skipped' && i.category === 'spam');
  if (activeTab === 'rechazados')  return items.filter(i => i.status === 'rejected');
  if (activeTab === 'reportados')  return items.filter(i => !!i.auto_mode_flagged_at);
  return items;
}, [items, activeTab]);
```

Y `filteredItems` se convierte en:

```tsx
const filteredItems = useMemo(() => {
  const bySearch = !search.trim() ? tabItems : tabItems.filter(i =>
    (i.email_subject ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.email_from    ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.ai_summary    ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.category      ?? '').toLowerCase().includes(search.toLowerCase())
  );
  if (!activeCategory) return bySearch;
  return bySearch.filter(i => normalizeCategory(i.category) === activeCategory);
}, [tabItems, search, activeCategory]);
```

Añade `useMemo` al import de React.

Y `<CategoryChips items={tabItems} .../>`

- [ ] **Step 3: Cuando el tab cambia, resetear categoría si no aplica**

Cuando el usuario cambia de tab, el filtro `activeCategory` puede quedar apuntando a una categoría que no existe en el nuevo tab. Reset:

En el `onClick` del tab (~línea 382), añade `changeCategory(null)`:

```tsx
onClick={() => {
  setActiveTab(tab.key);
  changeCategory(null);
}}
```

- [ ] **Step 4: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 5: Smoke manual**

Recarga bandeja. Verifica:
- Aparece la fila de chips debajo del search si el tab tiene >3 items.
- Click en un chip filtra la lista. URL cambia a `?tab=<tab>&cat=<slug>`.
- Click de nuevo en el mismo chip lo deselecciona (regresa a "Todas").
- Refresh preserva el chip activo.
- Cambio de tab resetea a "Todas".
- Deep-link `/portal/<t>/oficina/bandeja?tab=auto&cat=cliente` abre en el tab y filtro correctos.

- [ ] **Step 6: Commit**

```bash
git add src/app/portal/[token]/inbox/CategoryChips.tsx src/app/portal/[token]/OpsInboxSection.tsx
git commit -m "feat(bandeja): chips de categoría con URL sync

Filtro secundario dentro de cada tab. Chips auto-derivados con conteo
dinámico. Estado en ?cat=<slug>. Reset al cambiar de tab.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `<InboxZone />` + partición "Requieren tu acción" / "Al día"

**Files:**
- Create: `src/app/portal/[token]/inbox/InboxZone.tsx`
- Modify: `src/app/portal/[token]/OpsInboxSection.tsx`

**Interfaces:**
- Produces:

```ts
interface InboxZoneProps {
  title:           string;
  count:           number;
  tone?:           'attention' | 'neutral';   // controla el fondo/borde del header
  defaultOpen?:    boolean;                    // default true; si count > 10 y neutral, ofrecer colapsar
  children:        React.ReactNode;
}
```

- [ ] **Step 1: Crear `src/app/portal/[token]/inbox/InboxZone.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface InboxZoneProps {
  title:        string;
  count:        number;
  tone?:        'attention' | 'neutral';
  defaultOpen?: boolean;
  children:     React.ReactNode;
}

export default function InboxZone({
  title,
  count,
  tone       = 'neutral',
  defaultOpen = true,
  children,
}: InboxZoneProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isAttention     = tone === 'attention';
  const collapsible     = count > 10 && !isAttention;

  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-2"
      style={{
        background: isAttention ? 'rgba(239,68,68,0.04)' : 'transparent',
        border:     isAttention ? '1px solid rgba(239,68,68,0.15)' : 'none',
      }}
    >
      <button
        type="button"
        onClick={() => collapsible && setOpen(v => !v)}
        className="flex items-center gap-2 px-2 py-1 text-left"
        style={{
          background: 'transparent',
          border:     'none',
          cursor:     collapsible ? 'pointer' : 'default',
        }}
      >
        {collapsible && (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: isAttention ? '#B91C1C' : 'var(--c-text-4)' }}
        >
          {title}
        </span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{
            background: isAttention ? 'rgba(239,68,68,0.12)' : 'var(--c-surface-2)',
            color:      isAttention ? '#B91C1C'              : 'var(--c-text-3)',
          }}
        >
          {count}
        </span>
      </button>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Aplicar partición en `OpsInboxSection.tsx`**

En imports:

```tsx
import InboxZone from './inbox/InboxZone';
```

Después de `filteredItems`, agrega:

```tsx
const attentionItems = useMemo(
  () => filteredItems.filter(i => i.status === 'escalated' || i.status === 'info_requested'),
  [filteredItems]
);
const restItems = useMemo(
  () => filteredItems.filter(i => i.status !== 'escalated' && i.status !== 'info_requested'),
  [filteredItems]
);
```

Define un flag para saber cuándo aplicar la partición (todos los tabs excepto `reportados`, y solo cuando `attentionItems.length > 0`):

```tsx
const applyPartition = activeTab !== 'reportados' && attentionItems.length > 0;
```

Reemplaza el bloque `filteredItems.map(item => { ... })` por:

```tsx
{applyPartition ? (
  <>
    <InboxZone title="Requieren tu acción" count={attentionItems.length} tone="attention">
      {attentionItems.map(item => renderItem(item, /* showStateBadge */ true))}
    </InboxZone>
    {restItems.length > 0 && (
      <InboxZone title="Al día" count={restItems.length} tone="neutral">
        {restItems.map(item => renderItem(item, false))}
      </InboxZone>
    )}
  </>
) : (
  filteredItems.map(item => renderItem(item, false))
)}
```

Extrae la lógica del map a `renderItem(item, showStateBadge)`. Esta función devuelve el `<div key={item.id} className="rounded-xl overflow-hidden" ...>` con `<InboxRow ... showStateBadge={showStateBadge} />` y el body expandido. Pásale `agents` a `<InboxRow />`.

Ejemplo skeleton (mantén el body expandido completo, igual que hoy):

```tsx
const renderItem = (item: InboxItem, showStateBadge: boolean) => {
  const isExpanded  = expandedId === item.id;
  const catColorObj = CATEGORY_COLORS[normalizeCategory(item.category)];
  const catColorHex = catColorObj.fg;
  const isPending   = item.status === 'pending';

  return (
    <div
      key={item.id}
      className="rounded-xl overflow-hidden"
      style={{
        border:     `1px solid ${isExpanded ? catColorHex + '44' : 'var(--c-border)'}`,
        background: isExpanded ? `${catColorHex}08` : 'var(--c-surface-2)',
      }}
    >
      <InboxRow
        item={item}
        agents={agents}
        isExpanded={isExpanded}
        onToggle={() => {
          const opening = expandedId !== item.id;
          setExpanded(opening ? item.id : null);
          if (opening) markRead(item.id);
        }}
        showStateBadge={showStateBadge}
      />

      {isExpanded && (
        <div className="px-4 pb-4" style={{ borderTop: `1px solid ${catColorHex}20` }}>
          {/* MISMO body expandido que hoy: banner client_replied_at, summary, invoice_data,
              discrepancy, draft editable, attachments, actions, unspam, flag form, correction... */}
          {/* Copia verbatim de las líneas ~569-810 del original. */}
        </div>
      )}
    </div>
  );
};
```

**No cambies el body expandido**: aprobar/rechazar, editable draft, Rescatar, Reportar mal envío, Corrección al cliente, banner client_replied_at, etc. — todo eso se preserva idéntico.

- [ ] **Step 3: Actualizar empty states para considerar zonas**

Los empty states actuales (`filteredItems.length === 0 && humanRequests.length === 0 && activeTab === 'pendientes'`) siguen funcionando: si no hay items en el tab, ni chips ni zonas aparecen. Verifica manualmente en un tab vacío.

- [ ] **Step 4: Eliminar el header "CORREOS PENDIENTES" viejo**

El bloque:

```tsx
{activeTab === 'pendientes' && filteredItems.length > 0 && (
  <p className="text-xs font-semibold uppercase tracking-widest" ...>
    Correos pendientes
  </p>
)}
```

...se vuelve redundante con los headers de las zonas. Elimínalo.

- [ ] **Step 5: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 6: Smoke manual completo**

Recarga bandeja. Verifica:

- **Tab Pendientes** con al menos un escalated o info_requested: aparecen 2 zonas ("Requieren tu acción" con fondo rojo tenue arriba, "Al día" abajo).
- **Tab Pendientes sin escalados:** solo un stream plano, sin headers de zonas (`applyPartition` es false).
- **Tab Auto-enviados:** todo va a "Al día" o stream plano (según `applyPartition`). Debería ser plano en la práctica porque no hay escalated en auto.
- **Tab Spam:** stream plano.
- **Tab Reportados:** stream plano (no partición).
- **Tab Todo:** puede tener partición si hay items escalated.
- **Badge de estado** (Escalado / Info solicitada) aparece a la derecha en items de la Zona 1.
- **Chip de agente** con >1 agente en el portal.
- **Chips de categoría** filtran ambas zonas cuando aplicas.
- Todas las acciones (approve, reject, edit draft, rescatar, reportar, corrección) funcionan igual.
- Deep-links `?tab=auto`, `?tab=spam`, `?tab=auto&cat=cliente` funcionan.

- [ ] **Step 7: Commit**

```bash
git add src/app/portal/[token]/inbox/InboxZone.tsx src/app/portal/[token]/OpsInboxSection.tsx
git commit -m "feat(bandeja): partición Requieren tu acción / Al día

Zone 1 (escalated + info_requested) con fondo tenue rojo y badge de
estado por item. Zone 2 con el resto. Si no hay attention items, la
partición se oculta y todo se ve como stream plano.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verificación final + limpieza

**Files:**
- Modify: `src/app/portal/[token]/OpsInboxSection.tsx` (limpieza de imports muertos, mediciones finales)

- [ ] **Step 1: Ejecutar tsc estricto**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa sin errores.

- [ ] **Step 2: Verificar líneas del componente principal**

Run: `wc -l src/app/portal/\[token\]/OpsInboxSection.tsx`
Expected: ~600 líneas o menos.

- [ ] **Step 3: Verificar imports no usados**

En `OpsInboxSection.tsx`, revisar el import de lucide-react del top y remover íconos que ya no se referencian (probablemente `ChevronDown`, `ChevronUp`, `Paperclip` migraron a InboxRow). Deja los que sí se usan en el body expandido: `AlertTriangle`, `FileText`, `Check`, `X`, `MessageSquare`, `RotateCcw`, `PlugZap`, `Search`, `Inbox`, `RefreshCw`.

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 4: Smoke E2E final con Nazre**

Nazre entra al portal y valida:

1. Con menos de 5 items en Pendientes: no aparecen chips (según regla `>3`).
2. Con un item escalated: aparece la Zona 1 con fondo tenue arriba.
3. Chip de agente aparece si hay Sofía + Nia + Nox + otros en el mismo portal.
4. Read/unread: los items ya atendidos se ven visiblemente más apagados que los pendientes.
5. Nada de lo shipped en sesión 50 (deep-links, editable draft, Rescatar, Reportar mal envío, Correo de corrección, banner client_replied_at) se rompió.
6. La bandeja se siente ordenada según sus criterios.

Si Nazre pide ajustes finos (color X, spacing Y), aplicarlos como commits adicionales de polish.

- [ ] **Step 5: Commit final si hubo limpieza**

```bash
git add src/app/portal/[token]/OpsInboxSection.tsx
git commit -m "chore(bandeja): limpieza de imports y verificación final

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (post-write)

**Spec coverage:**
- Estructura del layout (2 zonas + tabs + search + chips + PENDIENTES TUYOS) → Task 5.
- Chips de categoría con URL sync → Task 4.
- Chip de agente condicional → Task 3.
- Read/unread contrast (peso + color) → Task 3.
- Badge de estado en Zona 1 → Task 3 (preparado) + Task 5 (activado).
- Extract subcomponentes (CategoryChips, InboxZone, InboxRow, categories.ts) → Tasks 1, 2, 4, 5.
- Sin cambios API/DB → constraint global + verificado.
- Preserva deep-links, editable draft, Rescatar, Reportar mal envío, Corrección → smoke tests en Tasks 2, 5, 6.
- Sinónimos de categoría normalizados → `normalizeCategory` en Task 1.
- URL slugs para `?cat=` → Task 4.

**Placeholder scan:** sin TBD, sin "similar a Task N", cada task tiene código concreto y comandos exactos.

**Type consistency:**
- `InboxAgent`, `CategorySlug`, `CATEGORY_ORDER`, `CATEGORY_LABELS`, `CATEGORY_COLORS`, `normalizeCategory` — definidos en Task 1, consumidos en Tasks 2/3/4/5 con nombres exactos.
- `InboxRowProps` — definido en Task 2, extendido en Task 3 (`showStateBadge` consumido).
- `InboxZoneProps` — definido en Task 5.
- `CategoryChipsProps` — definido en Task 4.

**Riesgo residual conocido:** en Task 2, el body expandido usa `catColor` como hex directo en concatenación (`${catColor}08`). Cambié la migración a `catColorHex` para claridad. Confirmar en implementación que no quede el nombre viejo en algún lugar.
