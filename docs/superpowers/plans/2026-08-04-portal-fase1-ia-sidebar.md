# Portal Fase 1 — Sidebar V2 + Header "Tu oficina digital"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el sidebar del portal por una nueva IA de 5 áreas (Escritorio · Bandeja · Historial · Tu equipo · Administración) con un header persistente "Tu oficina digital · [negocio]", detrás de un feature flag `portal_v2_enabled` por organización. Sin mover ni cambiar páginas todavía — los links del nuevo sidebar apuntan a las rutas existentes.

**Architecture:** Nuevo componente `PortalSidebarV2` que consume una función pura `buildPortalAreas(props)` (unit-testeable). Un helper `isPortalV2Enabled(orgId)` lee una nueva columna `organizations.portal_v2_enabled`. El montaje del sidebar en el layout del portal decide V1 vs V2. Nuevo `PortalHeader` renderiza sobre el sidebar en ambas versiones (queda listo para V1 también, no rompe nada).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind 3, Supabase (postgres), Lucide React icons, Radix UI, Vitest para unit tests, ESLint.

## Global Constraints

- Sin emojis en UI — usar únicamente iconos Lucide React
- Sin em-dash (—) en copy visible; usar dos puntos, coma o punto
- Sin la palabra "IA" en copy visible del portal
- Empleado digital (no "empleado telefónico" ni "agente")
- Preservar dev bypass en `src/proxy.ts` (NODE_ENV=development)
- Preservar patrón IDOR (verificar ownership de org antes de leer por ID)
- Preservar dropped columns de `voice_agents`: no leer knowledge_base, business_description, owner_passphrase, etc. — viven en `organizations`
- **Next.js 16 es breaking**: leer `node_modules/next/dist/docs/` si aparecen APIs desconocidas antes de escribir código
- Preservar `getAgentAccess` / módulos por sub-usuario en el sidebar (no romper filtrado por `modules`)
- Feature flag por organización, default `false`. Rollout opt-in.

---

## File Structure

**Nuevos archivos:**

| Archivo | Responsabilidad |
|---|---|
| `src/lib/portal/portal-v2-flag.ts` | Helper `isPortalV2Enabled(orgId)` — lee columna DB |
| `src/lib/portal/portal-v2-areas.ts` | Tipos `Area`, `SubItem` + función pura `buildPortalAreas(input)` |
| `src/lib/portal/__tests__/portal-v2-areas.test.ts` | Unit tests de `buildPortalAreas` |
| `src/app/portal/[token]/PortalHeader.tsx` | Header persistente "Tu oficina digital · [negocio]" |
| `src/app/portal/[token]/PortalSidebarV2.tsx` | Sidebar V2 (5 áreas), consume `Area[]` |
| `supabase/migrations/YYYYMMDDHHMMSS_portal_v2_flag.sql` | ALTER TABLE organizations ADD COLUMN portal_v2_enabled |

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| Layout/page donde se monta `PortalSidebar` (a descubrir en Task 6) | Condicional V1/V2 + montar `PortalHeader` |

---

## Task 1 — Migración DB + helper de feature flag

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_portal_v2_flag.sql` (reemplazar timestamp con `date +%Y%m%d%H%M%S`)
- Create: `src/lib/portal/portal-v2-flag.ts`

**Interfaces:**
- Consumes: cliente Supabase server-side (patrón existente en el codebase — buscar en `src/lib/supabase/*` cómo se crea el client con service role)
- Produces:
  ```ts
  export async function isPortalV2Enabled(orgId: string): Promise<boolean>
  ```

- [ ] **Step 1: Descubrir cliente Supabase existente**

Buscar cómo se crea el client server-side. Grep por `createClient` bajo `src/lib/`. Anotar el import exacto (probablemente `import { createServiceRoleClient } from '@/lib/supabase/server'` o similar). Usar ese import en el helper.

- [ ] **Step 2: Escribir la migración SQL**

Crear `supabase/migrations/<timestamp>_portal_v2_flag.sql` con:

```sql
-- Feature flag: enable portal V2 IA (Escritorio/Bandeja/Historial/Tu equipo/Administración)
-- Opt-in per organization. Default false.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS portal_v2_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.portal_v2_enabled IS
  'Cuando true, el portal renderiza el sidebar V2 con 5 áreas y header "Tu oficina digital". Fase 1 del rediseño IA.';
```

- [ ] **Step 3: Correr la migración en dev**

```bash
# Sustituir por el comando real que use el proyecto (probablemente supabase db push o similar)
npx supabase migration up --local
# O si el proyecto usa Supabase cloud dev directo:
# psql "$DATABASE_URL" -f supabase/migrations/<timestamp>_portal_v2_flag.sql
```

Verificar que la columna existe:

```bash
psql "$DATABASE_URL" -c "\d organizations" | grep portal_v2_enabled
```

Esperado: aparece una línea con `portal_v2_enabled | boolean | not null | false`.

- [ ] **Step 4: Escribir el helper**

Crear `src/lib/portal/portal-v2-flag.ts`:

```ts
import { createServiceRoleClient } from '@/lib/supabase/server'; // ajustar al import real detectado en Step 1

export async function isPortalV2Enabled(orgId: string): Promise<boolean> {
  if (!orgId) return false;
  const supa = createServiceRoleClient();
  const { data, error } = await supa
    .from('organizations')
    .select('portal_v2_enabled')
    .eq('id', orgId)
    .maybeSingle();
  if (error || !data) return false;
  return data.portal_v2_enabled === true;
}
```

- [ ] **Step 5: Verificar typecheck + lint**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: sin errores en los archivos nuevos.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_portal_v2_flag.sql src/lib/portal/portal-v2-flag.ts
git commit -m "feat(portal): add portal_v2_enabled flag + helper"
```

---

## Task 2 — Función pura `buildPortalAreas` + tipos

**Files:**
- Create: `src/lib/portal/portal-v2-areas.ts`

**Interfaces:**
- Consumes: nada externo (función pura, solo tipos de Lucide para íconos)
- Produces:
  ```ts
  export type AreaId = 'escritorio' | 'bandeja' | 'historial' | 'equipo' | 'administracion';

  export interface SubItem {
    label: string;
    href: string;
    moduleId?: string; // para filtrado por sub-usuario (matches ROUTE_MODULE_MAP)
  }

  export interface Area {
    id: AreaId;
    label: string;
    iconName: string; // nombre del ícono Lucide (ej. "Home", "Inbox", "Clock", "Users", "Settings")
    href: string;    // link principal del área (para click directo si no expande)
    subItems: SubItem[]; // vacío si el área no tiene sub-navegación
  }

  export interface BuildAreasInput {
    token: string;
    hasOpsAgent: boolean;
    showOutbound: boolean;
    isOwner: boolean;
    modules?: string[]; // undefined = owner (acceso total)
    isGovernment?: boolean; // agrega Cabildo si aplica
  }

  export function buildPortalAreas(input: BuildAreasInput): Area[]
  ```

- [ ] **Step 1: Crear el archivo con tipos y esqueleto**

Crear `src/lib/portal/portal-v2-areas.ts`:

```ts
export type AreaId = 'escritorio' | 'bandeja' | 'historial' | 'equipo' | 'administracion';

export interface SubItem {
  label: string;
  href: string;
  moduleId?: string;
}

export interface Area {
  id: AreaId;
  label: string;
  iconName: string;
  href: string;
  subItems: SubItem[];
}

export interface BuildAreasInput {
  token: string;
  hasOpsAgent: boolean;
  showOutbound: boolean;
  isOwner: boolean;
  modules?: string[];
  isGovernment?: boolean;
}

function hasModule(input: BuildAreasInput, moduleId: string): boolean {
  if (!input.modules) return true; // owner: sin filtro
  return input.modules.includes(moduleId);
}

export function buildPortalAreas(input: BuildAreasInput): Area[] {
  const t = input.token;
  const areas: Area[] = [];

  // 1. Escritorio (siempre visible)
  areas.push({
    id: 'escritorio',
    label: 'Escritorio',
    iconName: 'Home',
    href: `/portal/${t}`,
    subItems: [],
  });

  // 2. Bandeja (visible si hay ops agent o helpdesk)
  if (input.hasOpsAgent || hasModule(input, 'bandeja') || hasModule(input, 'helpdesk')) {
    const bandejaSubs: SubItem[] = [];
    if (input.hasOpsAgent || hasModule(input, 'helpdesk')) {
      bandejaSubs.push({
        label: 'Mesa de ayuda',
        href: `/portal/${t}/oficina/helpdesk`,
        moduleId: 'helpdesk',
      });
    }
    areas.push({
      id: 'bandeja',
      label: 'Bandeja',
      iconName: 'Inbox',
      href: `/portal/${t}/oficina/bandeja`,
      subItems: bandejaSubs,
    });
  }

  // 3. Historial
  const historialSubs: SubItem[] = [];
  if (hasModule(input, 'llamadas')) {
    historialSubs.push({
      label: 'Llamadas',
      href: input.hasOpsAgent ? `/portal/${t}/oficina/llamadas` : `/portal/${t}/llamadas/entrantes`,
      moduleId: 'llamadas',
    });
  }
  if (input.showOutbound && hasModule(input, 'salientes')) {
    historialSubs.push({
      label: 'Salientes',
      href: `/portal/${t}/llamadas/salientes`,
      moduleId: 'salientes',
    });
  }
  if (input.hasOpsAgent && hasModule(input, 'reportes')) {
    historialSubs.push({
      label: 'Reportes',
      href: `/portal/${t}/oficina/reportes`,
      moduleId: 'reportes',
    });
  }
  if (input.hasOpsAgent && hasModule(input, 'aprendizajes')) {
    historialSubs.push({
      label: 'Aprendizajes',
      href: `/portal/${t}/oficina/aprendizajes`,
      moduleId: 'aprendizajes',
    });
  }
  if (input.hasOpsAgent && hasModule(input, 'investigacion')) {
    historialSubs.push({
      label: 'Investigación',
      href: `/portal/${t}/oficina/investigacion`,
      moduleId: 'investigacion',
    });
  }
  if (historialSubs.length > 0) {
    areas.push({
      id: 'historial',
      label: 'Historial',
      iconName: 'Clock',
      href: historialSubs[0].href,
      subItems: historialSubs,
    });
  }

  // 4. Tu equipo
  const equipoSubs: SubItem[] = [];
  equipoSubs.push({
    label: 'Empleados',
    href: `/portal/${t}/agentes`,
    moduleId: 'agentes',
  });
  if (input.hasOpsAgent && hasModule(input, 'patrones')) {
    equipoSubs.push({
      label: 'Cómo trabajamos',
      href: `/portal/${t}/oficina/patrones`,
      moduleId: 'patrones',
    });
  }
  areas.push({
    id: 'equipo',
    label: 'Tu equipo',
    iconName: 'Users',
    href: `/portal/${t}/agentes`,
    subItems: equipoSubs,
  });

  // 5. Administración
  const adminSubs: SubItem[] = [
    { label: 'Organización', href: `/portal/${t}?tab=negocio` },
    { label: 'Recursos de la oficina', href: `/portal/${t}/oficina` }, // launcher temp = página oficina actual
    { label: 'Integraciones', href: `/portal/${t}/oficina/integraciones`, moduleId: 'integraciones' },
    { label: 'Uso y compras', href: `/portal/${t}?tab=cuenta` },
  ];
  if (input.isOwner) {
    adminSubs.push({ label: 'Usuarios y permisos', href: `/portal/${t}/usuarios` });
  }
  areas.push({
    id: 'administracion',
    label: 'Administración',
    iconName: 'Settings',
    href: `/portal/${t}?tab=negocio`,
    subItems: adminSubs,
  });

  return areas;
}
```

Notas:
- Acentos ES sí (`Administración`, `Cómo`, `Organización`): el codebase usa UTF-8 y acentos en TS sin fricción.
- Sin em-dash en labels visibles.
- `id` en snake ASCII para evitar problemas de URL/analytics.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/portal/portal-v2-areas.ts
git commit -m "feat(portal): add buildPortalAreas pure function + area types"
```

---

## Task 3 — Unit tests de `buildPortalAreas`

**Files:**
- Create: `src/lib/portal/__tests__/portal-v2-areas.test.ts`

**Interfaces:**
- Consumes: `buildPortalAreas`, `BuildAreasInput` de Task 2
- Produces: nada exportable

- [ ] **Step 1: Escribir los tests failing**

Crear `src/lib/portal/__tests__/portal-v2-areas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPortalAreas, type BuildAreasInput } from '../portal-v2-areas';

const baseInput: BuildAreasInput = {
  token: 'tok123',
  hasOpsAgent: false,
  showOutbound: false,
  isOwner: true,
  modules: undefined, // owner
};

describe('buildPortalAreas', () => {
  it('owner sin ops ni outbound ve Escritorio + Historial(llamadas) + Tu equipo + Administracion (sin Bandeja)', () => {
    const areas = buildPortalAreas(baseInput);
    const ids = areas.map(a => a.id);
    expect(ids).toEqual(['escritorio', 'historial', 'equipo', 'administracion']);
  });

  it('owner con ops agent ve las 5 areas incluyendo Bandeja', () => {
    const areas = buildPortalAreas({ ...baseInput, hasOpsAgent: true });
    const ids = areas.map(a => a.id);
    expect(ids).toEqual(['escritorio', 'bandeja', 'historial', 'equipo', 'administracion']);
  });

  it('Historial incluye Salientes solo si showOutbound=true', () => {
    const sinOutbound = buildPortalAreas(baseInput);
    const conOutbound = buildPortalAreas({ ...baseInput, showOutbound: true });
    const histSin = sinOutbound.find(a => a.id === 'historial')!;
    const histCon = conOutbound.find(a => a.id === 'historial')!;
    expect(histSin.subItems.map(s => s.label)).not.toContain('Salientes');
    expect(histCon.subItems.map(s => s.label)).toContain('Salientes');
  });

  it('Historial incluye Reportes/Aprendizajes/Investigacion solo si hasOpsAgent=true', () => {
    const areas = buildPortalAreas({ ...baseInput, hasOpsAgent: true });
    const hist = areas.find(a => a.id === 'historial')!;
    const labels = hist.subItems.map(s => s.label);
    expect(labels).toContain('Reportes');
    expect(labels).toContain('Aprendizajes');
    expect(labels).toContain('Investigación');
  });

  it('Administracion incluye Usuarios solo si isOwner=true', () => {
    const owner = buildPortalAreas(baseInput);
    const subUser = buildPortalAreas({ ...baseInput, isOwner: false, modules: ['agentes', 'llamadas'] });
    const adminOwner = owner.find(a => a.id === 'administracion')!;
    const adminSub = subUser.find(a => a.id === 'administracion')!;
    expect(adminOwner.subItems.map(s => s.label)).toContain('Usuarios y permisos');
    expect(adminSub.subItems.map(s => s.label)).not.toContain('Usuarios y permisos');
  });

  it('sub-usuario con modules=["agentes"] no ve Historial ni Bandeja', () => {
    const areas = buildPortalAreas({
      ...baseInput,
      isOwner: false,
      hasOpsAgent: false,
      modules: ['agentes'],
    });
    const ids = areas.map(a => a.id);
    expect(ids).toContain('escritorio');
    expect(ids).toContain('equipo');
    expect(ids).toContain('administracion');
    expect(ids).not.toContain('historial'); // sin llamadas ni salientes en modules
    expect(ids).not.toContain('bandeja');
  });

  it('hrefs contienen el token', () => {
    const areas = buildPortalAreas({ ...baseInput, token: 'MYTOK' });
    for (const a of areas) {
      expect(a.href).toContain('MYTOK');
      for (const s of a.subItems) {
        expect(s.href).toContain('MYTOK');
      }
    }
  });

  it('Historial.href apunta a /oficina/llamadas si hasOpsAgent, /llamadas/entrantes si no', () => {
    const conOps = buildPortalAreas({ ...baseInput, hasOpsAgent: true });
    const sinOps = buildPortalAreas({ ...baseInput, hasOpsAgent: false });
    const llamadasConOps = conOps.find(a => a.id === 'historial')!.subItems.find(s => s.label === 'Llamadas')!;
    const llamadasSinOps = sinOps.find(a => a.id === 'historial')!.subItems.find(s => s.label === 'Llamadas')!;
    expect(llamadasConOps.href).toContain('/oficina/llamadas');
    expect(llamadasSinOps.href).toContain('/llamadas/entrantes');
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que pasan**

```bash
npx vitest run src/lib/portal/__tests__/portal-v2-areas.test.ts
```

Esperado: 8 tests pass. Si algún test falla, revisar `buildPortalAreas` en Task 2 y ajustar. Los tests son la especificación operacional.

- [ ] **Step 3: Commit**

```bash
git add src/lib/portal/__tests__/portal-v2-areas.test.ts
git commit -m "test(portal): buildPortalAreas covers ops/owner/subuser combos"
```

---

## Design Tokens — Slack-quality dark shell

Antes de Tasks 4-5, referencia única de tokens visuales. Se usan como *arbitrary values* de Tailwind (sin extender `tailwind.config` en Fase 1 para mantener la migración chica; se promoverán a tokens semánticos en Fase 2).

**Colores (dark shell)**
| Token           | Valor          | Uso                                        |
|-----------------|----------------|--------------------------------------------|
| Shell BG        | `#1A0A3B`      | Header + sidebar (bg)                      |
| Accent          | `#6C3BFF`      | Item activo, focus ring                    |
| Text primary    | `#FAFBFF`      | Business name, item activo                 |
| Text idle       | `rgb(255 255 255 / 0.72)` (`text-white/70`) | Nav items idle                             |
| Text muted      | `rgb(255 255 255 / 0.55)` (`text-white/55`) | Eyebrow "Tu oficina digital", section labels |
| Icon idle       | `rgb(255 255 255 / 0.60)` (`text-white/60`) | Íconos Lucide idle                         |
| Hover BG        | `rgb(255 255 255 / 0.08)` (`hover:bg-white/[0.08]`) | Item hover                        |
| Sub-active BG   | `rgb(255 255 255 / 0.12)` (`bg-white/[0.12]`)       | Sub-item activo (no usar accent aquí) |
| Divider         | `rgb(255 255 255 / 0.08)` (`border-white/[0.08]`)   | Border-b del header                       |
| Focus ring      | `#6C3BFF` con offset `#1A0A3B` | `focus-visible:ring-2` + `ring-offset-2`   |

Contraste verificado: `#FAFBFF` sobre `#1A0A3B` = ~17:1 (AAA); `rgba(255,255,255,0.72)` sobre `#1A0A3B` ≈ 12:1 (AAA); `#FAFBFF` sobre `#6C3BFF` ≈ 5.5:1 (AA para body).

**Spacing**
| Elemento         | Clase                           |
|------------------|--------------------------------|
| Header height    | `h-14` (56px)                  |
| Sidebar width    | `w-[260px]` (`lg:w-[260px]`)   |
| Sidebar padding  | `px-2 py-4`                    |
| Item height      | `h-9` (36px)                   |
| Item padding-x   | `px-3`                         |
| Item gap ícono/texto | `gap-2.5` (10px)           |
| Sub-item height  | `h-7` (28px)                   |
| Sub-item indent  | `ml-3 pl-6` (alinea con label) |
| Border radius    | `rounded-md` (6px) en items    |

**Typography**
| Elemento              | Clase                                                       |
|-----------------------|-------------------------------------------------------------|
| Eyebrow (header)      | `text-[10px] font-semibold uppercase tracking-[0.14em]`     |
| Business name (header)| `text-sm font-semibold leading-tight`                       |
| Nav item              | `text-sm font-medium leading-none`                          |
| Sub-item              | `text-[13px] font-normal leading-none`                      |
| Section label (opc.)  | `text-[11px] font-semibold uppercase tracking-[0.14em]`     |
| Status chip (footer)  | `text-[11px] font-medium`                                   |

**Íconos:** Lucide, `size={16}` en nav primaria, `size={14}` en sub-items, `strokeWidth={1.75}` unificado.

**Motion:** `transition-colors duration-150 ease-out` en cambios de estado; `transition-transform duration-200` para chevrons; siempre acompañar con `motion-reduce:transition-none` (respetar `prefers-reduced-motion`).

**Focus (obligatorio, no removible):**
```
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-[#6C3BFF]
focus-visible:ring-offset-2
focus-visible:ring-offset-[#1A0A3B]
```

---

## Task 4 — Componente `PortalHeader` (Slack-style top bar)

**Files:**
- Create: `src/app/portal/[token]/PortalHeader.tsx`

**Interfaces:**
- Consumes: nada externo (recibe props)
- Produces:
  ```tsx
  export interface PortalHeaderProps {
    businessName: string;
    logoUrl?: string | null;
  }
  export default function PortalHeader(props: PortalHeaderProps): JSX.Element
  ```

**Referencia visual:** Slack workspace switcher (top-left del sidebar, extendido a barra full-width). Densidad: 56px alto, un solo renglón, logo compacto, dos líneas de texto colapsadas (eyebrow + name).

- [ ] **Step 1: Crear el componente**

Crear `src/app/portal/[token]/PortalHeader.tsx`:

```tsx
'use client';

import Image from 'next/image';

export interface PortalHeaderProps {
  businessName: string;
  logoUrl?: string | null;
}

export default function PortalHeader({ businessName, logoUrl }: PortalHeaderProps) {
  return (
    <header
      role="banner"
      className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.08] bg-[#1A0A3B] px-4 text-white shadow-[0_1px_0_0_rgba(0,0,0,0.2)]"
    >
      {/* Logo (o placeholder) */}
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 rounded-md object-cover ring-1 ring-white/10"
          aria-hidden
        />
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.08] ring-1 ring-white/10"
          aria-hidden
        >
          <span className="text-[13px] font-semibold text-white/80">
            {businessName.trim().charAt(0).toUpperCase() || 'C'}
          </span>
        </div>
      )}

      {/* Workspace identity: eyebrow + business name */}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Tu oficina digital
        </span>
        <span
          className="truncate text-sm font-semibold leading-tight text-[#FAFBFF]"
          title={businessName}
        >
          {businessName}
        </span>
      </div>

      {/* Espaciador para acciones futuras (búsqueda, notificaciones, avatar) */}
      <div className="ml-auto" aria-hidden />
    </header>
  );
}
```

Detalles clave:
- **Sticky + z-30** para que el header quede fijo al scrollear.
- **Sombra de 1px** (`shadow-[0_1px_0_0_rgba(0,0,0,0.2)]`) además del border para profundidad tipo Slack.
- **`ring-1 ring-white/10`** en el logo para separarlo del bg oscuro (Slack lo hace).
- **Placeholder inicial**: primera letra del negocio en un cuadro (evita "hueco vacío" si no hay logo — sesión issue_logo_url_por_agente).
- **`ml-auto` divider** deja lista la zona derecha para futuras acciones sin refactorizar el layout.
- **Sin em-dash, sin "IA", sin emojis** (reglas codebase).
- **`title={businessName}`** para el tooltip nativo cuando el nombre trunca.

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: sin errores.

- [ ] **Step 3: Verificación de accesibilidad rápida**

Abrir el componente en Storybook o en dev (`npm run dev`) — cuando el header esté montado en Task 6, verificar en Chrome DevTools:
- Contraste business-name vs bg: >= 4.5:1 (WCAG AA) — debería ser ~17:1
- `<header role="banner">` presente
- Focus visible al llegar por Tab (aunque no hay controles interactivos aún, dejamos preparado el patrón)

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/[token]/PortalHeader.tsx
git commit -m "feat(portal): add PortalHeader (Slack-style workspace bar, 56px, dark shell)"
```

---

## Task 5 — Componente `PortalSidebarV2` (Slack-style dark nav)

**Files:**
- Create: `src/app/portal/[token]/PortalSidebarV2.tsx`

**Interfaces:**
- Consumes: `Area`, `SubItem`, `buildPortalAreas`, `BuildAreasInput` de `@/lib/portal/portal-v2-areas`
- Produces:
  ```tsx
  export interface PortalStatus {
    plan?: string | null;                // ej. "Empleado Centinelia"
    minutesRemain?: number | null;
    minutesIncluded?: number | null;
  }

  export interface PortalSidebarV2Props extends BuildAreasInput {
    currentPath: string;                 // ej. '/portal/tok123/oficina/bandeja'
    status?: PortalStatus;               // chip inferior opcional (Slack-like presence)
  }

  export default function PortalSidebarV2(props: PortalSidebarV2Props): JSX.Element
  ```

**Referencia visual:** Slack sidebar aubergine. Ítems compactos, active state con bg color-relleno, sub-items indentados con opacidad reducida. Chip inferior tipo "You're online" con datos de plan/minutos.

- [ ] **Step 1: Crear el componente**

Crear `src/app/portal/[token]/PortalSidebarV2.tsx`:

```tsx
'use client';

import Link from 'next/link';
import {
  Home,
  Inbox,
  Clock,
  Users,
  Settings,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import {
  buildPortalAreas,
  type Area,
  type BuildAreasInput,
} from '@/lib/portal/portal-v2-areas';

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Inbox,
  Clock,
  Users,
  Settings,
};

export interface PortalStatus {
  plan?: string | null;
  minutesRemain?: number | null;
  minutesIncluded?: number | null;
}

export interface PortalSidebarV2Props extends BuildAreasInput {
  currentPath: string;
  status?: PortalStatus;
}

function isAreaActive(area: Area, currentPath: string): boolean {
  const areaBase = area.href.split('?')[0];
  if (currentPath === areaBase) return true;
  return area.subItems.some(s => currentPath.startsWith(s.href.split('?')[0]));
}

function isSubActive(subHref: string, currentPath: string): boolean {
  return currentPath.startsWith(subHref.split('?')[0]);
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A0A3B]';

export default function PortalSidebarV2(props: PortalSidebarV2Props) {
  const { currentPath, status, ...input } = props;
  const areas = buildPortalAreas(input);

  return (
    <nav
      aria-label="Navegacion principal"
      className="flex h-full w-[260px] shrink-0 flex-col bg-[#1A0A3B] text-white"
    >
      {/* Lista de areas */}
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        {areas.map(area => {
          const Icon = ICON_MAP[area.iconName] ?? Home;
          const active = isAreaActive(area, currentPath);
          const showSubs = active && area.subItems.length > 0;

          return (
            <li key={area.id} className="flex flex-col">
              <Link
                href={area.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'group flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium leading-none',
                  'transition-colors duration-150 ease-out motion-reduce:transition-none',
                  active
                    ? 'bg-[#6C3BFF] text-[#FAFBFF] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                    : 'text-white/72 hover:bg-white/[0.08] hover:text-[#FAFBFF]',
                  FOCUS_RING,
                ].join(' ')}
              >
                <Icon
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden
                  className={
                    active
                      ? 'text-[#FAFBFF]'
                      : 'text-white/60 group-hover:text-[#FAFBFF]'
                  }
                />
                <span className="flex-1 truncate">{area.label}</span>
                {area.subItems.length > 0 && (
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    className={[
                      'shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                      active ? 'rotate-90 text-white/70' : 'text-white/40 group-hover:text-white/70',
                    ].join(' ')}
                  />
                )}
              </Link>

              {showSubs && (
                <ul className="mt-0.5 space-y-px pb-1 pl-3">
                  {area.subItems.map(sub => {
                    const subActive = isSubActive(sub.href, currentPath);
                    return (
                      <li key={sub.href}>
                        <Link
                          href={sub.href}
                          aria-current={subActive ? 'page' : undefined}
                          className={[
                            'flex h-7 items-center rounded-md pl-6 pr-3 text-[13px] font-normal leading-none',
                            'transition-colors duration-150 ease-out motion-reduce:transition-none',
                            subActive
                              ? 'bg-white/[0.12] text-[#FAFBFF]'
                              : 'text-white/70 hover:bg-white/[0.06] hover:text-[#FAFBFF]',
                            FOCUS_RING,
                          ].join(' ')}
                        >
                          {sub.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* Status chip (opcional, tipo Slack presence) */}
      {status && (status.plan || typeof status.minutesRemain === 'number') && (
        <div className="border-t border-white/[0.08] px-4 py-3">
          <div className="flex flex-col gap-0.5">
            {status.plan && (
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
                {status.plan}
              </span>
            )}
            {typeof status.minutesRemain === 'number' &&
              typeof status.minutesIncluded === 'number' && (
                <span className="text-[13px] font-medium text-[#FAFBFF]">
                  {status.minutesRemain} / {status.minutesIncluded} min
                </span>
              )}
          </div>
        </div>
      )}
    </nav>
  );
}
```

Detalles clave (referencia a `--domain ux` del skill ui-ux-pro-max):
- **Contraste AAA**: `text-white/72` sobre `#1A0A3B` ≈ 12:1 (regla `color-accessible-pairs`)
- **Focus ring visible** obligatorio (`FOCUS_RING`), no removible — regla `focus-states`
- **Motion 150ms** ease-out (regla `duration-timing`) + `motion-reduce:transition-none` en TODAS las transiciones (regla `reduced-motion`)
- **Solo animo `colors` y `transform`** (rotate del chevron) — nunca width/height ni layout (regla `transform-performance`)
- **`aria-current="page"`** en el link activo (área y sub-item) — regla `nav-state-active`
- **Touch target 36px alto en primary, 28px en sub** — >= 32 aceptable en desktop; en mobile el drawer futuro debe subir a 44 (regla `touch-target-size` — nota para Fase 2 responsive)
- **Overflow scroll** en `<ul>` de areas (`overflow-y-auto`) — status chip queda pegado abajo
- **`aria-label="Navegacion principal"`** en `<nav>` — regla `keyboard-nav`
- **Sub-item active NO usa accent color** — reservado para primary area para preservar jerarquía visual (regla `visual-hierarchy`)

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/portal/[token]/PortalSidebarV2.tsx
git commit -m "feat(portal): add PortalSidebarV2 (Slack-style dark nav, focus rings, reduced-motion)"
```

---

## Task 6 — Montaje condicional V1/V2 en el layout del portal

**Files:**
- Modify: layout (o page raíz) donde se monta `PortalSidebar` actualmente — descubrir en Step 1

**Interfaces:**
- Consumes: `isPortalV2Enabled` de Task 1, `PortalSidebarV2` de Task 5, `PortalHeader` de Task 4
- Produces: nada nuevo

- [ ] **Step 1: Localizar dónde se monta `PortalSidebar` hoy**

```bash
grep -r "PortalSidebar" src/app/portal --include="*.tsx" -l
```

Esperado: uno o varios `page.tsx` / `layout.tsx` bajo `src/app/portal/[token]/**`. Anotar todos los archivos que importan `PortalSidebar`. El más probable es `src/app/portal/[token]/layout.tsx` (si existe) o directamente `src/app/portal/[token]/page.tsx`.

Si sólo se monta en `page.tsx` de la raíz del portal (no hay layout), en Step 2 se crea un `layout.tsx` compartido para consolidar el montaje.

- [ ] **Step 2: Leer el archivo de montaje y anotar cómo se calculan las props actuales**

Leer el archivo identificado en Step 1. Anotar:
- Cómo se obtiene `orgId` (probablemente `agent.organization_id` o similar)
- Cómo se obtiene `businessName` y `logoUrl` (probablemente `organizations.business_name` y `organizations.logo_url`, ver memoria `issue_logo_url_por_agente`)
- Cómo se obtiene `currentPath` (probablemente vía `usePathname()` en un client wrapper, o `headers().get('x-pathname')` server-side)
- Cómo se obtiene el resto de props (`hasOpsAgent`, `showOutbound`, `isOwner`, `modules`)

- [ ] **Step 3: Agregar el flag lookup + render condicional**

En el archivo (server component o page), agregar:

```tsx
import { isPortalV2Enabled } from '@/lib/portal/portal-v2-flag';
import PortalHeader from './PortalHeader';
import PortalSidebarV2 from './PortalSidebarV2';
// ... imports existentes ...

// Dentro del server component / page async:
const v2 = await isPortalV2Enabled(agent.organization_id);

// En el JSX, reemplazar el bloque que renderiza <PortalSidebar ...> por:
return (
  <div className="flex min-h-screen flex-col">
    {v2 && (
      <PortalHeader
        businessName={organization.business_name ?? 'Tu negocio'}
        logoUrl={organization.logo_url ?? null}
      />
    )}
    <div className="flex flex-1">
      {v2 ? (
        <PortalSidebarV2
          token={token}
          currentPath={/* path actual, ver Step 2 */}
          hasOpsAgent={hasOpsAgent}
          showOutbound={showOutbound}
          isOwner={isOwner}
          modules={modules}
          isGovernment={/* si aplica, ver memoria demo_monterrey */}
          status={{
            plan: agent.plan ?? null, // ej. "Empleado Centinelia"
            minutesRemain: typeof minutesRemain === 'number' ? minutesRemain : null,
            minutesIncluded: typeof minutesIncluded === 'number' ? minutesIncluded : null,
          }}
        />
      ) : (
        <PortalSidebar
          token={token}
          currentTab={currentTab}
          hasOpsAgent={hasOpsAgent}
          showOutbound={showOutbound}
          // ... resto de props existentes idénticas ...
        />
      )}
      <main className="flex-1">{children}</main>
    </div>
  </div>
);
```

*(Ajustar el shape del return al que ya use el archivo — este bloque es orientativo.)*

Si `currentPath` no está disponible fácilmente en server component, opción: pasar `''` y dejar que el `PortalSidebarV2` reciba `currentPath` desde un wrapper client que use `usePathname()`. Se puede crear `PortalSidebarV2Client.tsx` mínimo:

```tsx
'use client';
import { usePathname } from 'next/navigation';
import PortalSidebarV2, { type PortalSidebarV2Props } from './PortalSidebarV2';

export default function PortalSidebarV2Client(props: Omit<PortalSidebarV2Props, 'currentPath'>) {
  const currentPath = usePathname();
  return <PortalSidebarV2 {...props} currentPath={currentPath} />;
}
```

Y desde el server component importar el `*Client` en lugar del componente base.

- [ ] **Step 4: Typecheck + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/[token]/
git commit -m "feat(portal): conditional mount of Sidebar V2 + PortalHeader behind portal_v2 flag"
```

---

## Task 7 — Verificación manual + activar flag en 1 org de prueba

**Files:** ninguno modificado — validación end-to-end.

**Interfaces:** ninguna.

- [ ] **Step 1: Correr dev server**

```bash
npm run dev
```

Esperado: server arranca en localhost:3000 sin errores.

- [ ] **Step 2: Verificar que el portal EXISTENTE sigue funcionando (V1 = default)**

Abrir en navegador: `http://localhost:3000/portal/<token-de-prueba>`

Esperado: el sidebar viejo se renderiza igual que antes. **Sin header nuevo.** No hay regresión visible.

- [ ] **Step 3: Activar el flag en una org de prueba**

Escoger una org de dev (buscar en tabla `organizations` una fila cuyo agente use un `token` accesible):

```sql
UPDATE organizations
SET portal_v2_enabled = true
WHERE id = '<org-id-de-prueba>';
```

- [ ] **Step 4: Verificar sidebar V2 renderizado — QA de calidad Slack-tier**

Refrescar la misma URL de portal. Checklist visual + interacción:

*Estructura:*
- [ ] Header 56px de alto, sticky arriba, bg `#1A0A3B`, sombra sutil bajo el border
- [ ] Header muestra logo (o placeholder con inicial), "Tu oficina digital" en eyebrow uppercase, business name en font-semibold
- [ ] Sidebar 260px de ancho, bg `#1A0A3B`, extendido hasta el fondo de la pantalla
- [ ] Sidebar muestra exactamente 5 áreas: Escritorio, Bandeja (si aplica), Historial, Tu equipo, Administración
- [ ] Cada área tiene ícono Lucide de 16px + label 14px

*Estados:*
- [ ] Área activa: bg accent `#6C3BFF`, chevron rotado 90°, sub-items expandidos debajo
- [ ] Áreas idle: texto blanco 72% opacity, ícono blanco 60% opacity
- [ ] Hover en área idle: bg `white/8`, texto y ícono a 100%
- [ ] Sub-item activo: bg `white/12` (NO accent — jerarquía preservada)
- [ ] Sub-item idle: texto blanco 70%, hover a bg `white/6`

*Accesibilidad:*
- [ ] Tab desde el header: focus ring visible morado con offset oscuro en cada link
- [ ] Contraste business name vs bg >= 4.5:1 (verificar en DevTools Accessibility > Contrast)
- [ ] Enable `prefers-reduced-motion` en DevTools (Rendering panel): las transiciones desaparecen, chevron no rota animado
- [ ] Screen reader (opcional): `nav` anunciada como "Navegacion principal"; link activo anunciado como "current page"
- [ ] Todos los `aria-current="page"` presentes solo en el link activo (área) y sub activo

*Copy y branding:*
- [ ] Sin emojis en ningún lado
- [ ] Sin em-dash (—) en labels ni copy
- [ ] Sin la palabra "IA" visible
- [ ] Uso de "Tu equipo" (no "Empleados IA"), "Recursos de la oficina" (no "Herramientas")
- [ ] Chip inferior muestra plan + `X / Y min` si hay datos

*Interacción:*
- [ ] Click en área con sub-items: navega al href principal y expande sub-items
- [ ] Click en sub-item: navega y queda marcado como activo
- [ ] URL bar refleja la ruta vieja (ej. `/portal/[t]/oficina/bandeja`) — Fase 1 no cambia rutas

- [ ] **Step 5: Verificar sub-usuario (opcional pero recomendado)**

Login con un sub-usuario que tenga `modules = ['agentes']`. Verificar que:
- [ ] Sólo aparecen las áreas permitidas (Escritorio + Tu equipo + Administración)
- [ ] No hay links rotos ni permitidos que no debería

- [ ] **Step 6: Revert del flag para dejar dev limpio**

```sql
UPDATE organizations SET portal_v2_enabled = false WHERE id = '<org-id-de-prueba>';
```

- [ ] **Step 7: Corridas finales**

```bash
npm run lint
npx tsc --noEmit
npx vitest run src/lib/portal/__tests__/portal-v2-areas.test.ts
```

Esperado: los tres verdes.

- [ ] **Step 8: Commit final si hubo ajustes en Steps 4–5**

```bash
git status
# si hay ajustes de estilos/layout:
git add -p
git commit -m "polish(portal): sidebar V2 spacing/active state after QA"
```

---

## Self-review realizado

**Spec coverage:** Fase 1 del spec incluye 3 puntos — (1) Nuevo sidebar con 5 áreas detrás de `portal_v2` → Tasks 2/5/6. (2) Redirects de rutas viejas → nuevas → **NO SE INCLUYE en Fase 1** porque no existen aún rutas nuevas; los redirects se agregan en Fase 2 cuando se muevan las páginas. Documentado explícitamente en la sección Goal. (3) Sin cambios en las páginas mismas → respetado, los `href` apuntan a rutas existentes.

**Ajuste explícito al spec:** Fase 1 tal como estaba en el spec incluía redirects, pero implementarlos sin destino real crearía 404s. La interpretación cuerda es: redirects entran en Fase 2 (cuando existan las nuevas rutas). Confirmar con Nazre en review si desea otra interpretación.

**Placeholder scan:** Sin TBDs. Un `/* si aplica, ver memoria demo_monterrey */` en Task 6 Step 3 — es un puntero a decisión de negocio, no un placeholder de código; queda porque el implementador debe verificar si la org es gobierno (columna existente o lógica actual).

**Type consistency:** `Area`, `SubItem`, `BuildAreasInput`, `PortalSidebarV2Props` definidos en Task 2 y consumidos consistentemente en Tasks 3/5/6. Función `buildPortalAreas` firma consistente en tests (Task 3) y sidebar (Task 5). `isPortalV2Enabled(orgId: string): Promise<boolean>` consistente entre Task 1 y Task 6.
