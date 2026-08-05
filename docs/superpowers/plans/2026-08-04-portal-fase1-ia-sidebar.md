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

## Design Tokens — Shopify-style light sidebar + dark header (Opción 1)

Antes de Tasks 4-5, referencia única de tokens visuales. Referencias: **Shopify Admin** (agrupación semántica, active state con acento sutil, iconografía cálida) + **Stripe Dashboard** (spacing generoso, tipografía cuidada, tabular numerals, calma visual) + header dark inspirado en Slack/Linear para preservar el gesto de marca Centinelia.

Se usan como *arbitrary values* de Tailwind (sin extender `tailwind.config` en Fase 1 para mantener la migración chica; se promoverán a tokens semánticos en Fase 2).

**Colores — Header (dark, marca Centinelia)**
| Token           | Valor          | Uso                                        |
|-----------------|----------------|--------------------------------------------|
| Header BG       | `#1A0A3B`      | Bg del header (56px)                       |
| Header text     | `#FAFBFF`      | Business name                              |
| Header eyebrow  | `rgb(255 255 255 / 0.55)` | "Tu oficina digital"            |
| Header divider  | `rgb(255 255 255 / 0.08)` | Border-b del header                    |

**Colores — Sidebar (light, Shopify/Stripe)**
| Token           | Valor          | Uso                                        |
|-----------------|----------------|--------------------------------------------|
| Sidebar BG      | `#FAFAFB`      | Bg del sidebar (casi blanco, warm)         |
| Sidebar divider | `#E8E8ED`      | Border-r del sidebar (`border-neutral-200/80`) |
| Item text idle  | `#3F3D56`      | Nav items idle (`text-neutral-700`)        |
| Item text active| `#6C3BFF`      | Nav item activo (accent Centinelia)        |
| Icon idle       | `#6B7280`      | Íconos Lucide idle (`text-neutral-500`)    |
| Icon active     | `#6C3BFF`      | Ícono en item activo                       |
| Active BG       | `#F3EFFF`      | Bg del ítem activo (accent tint ~10%)      |
| Active indicator| `#6C3BFF`      | Border-l 3px del ítem activo (signature Shopify) |
| Hover BG        | `#F3F3F5`      | Bg del ítem en hover (`hover:bg-neutral-100`) |
| Sub-item text idle | `#525163`   | Sub-item idle (`text-neutral-600`)         |
| Sub-item active BG | `#F3EFFF`   | Sub activo (mismo tint, sin border-l)      |
| Focus ring      | `#6C3BFF` con offset `#FAFAFB` | `focus-visible:ring-2` + `ring-offset-2` |
| Status chip label | `#8B8A9A`    | "Empleado Centinelia" (`text-neutral-500`) |
| Status chip value | `#1A0A3B`    | "300 / 500 min" (brand deep purple)        |

**Contraste verificado:**
- `#3F3D56` sobre `#FAFAFB` ≈ 10.5:1 (AAA)
- `#6C3BFF` sobre `#F3EFFF` ≈ 5.4:1 (AA body)
- `#6C3BFF` sobre `#FAFAFB` ≈ 5.6:1 (AA body)
- `#FAFBFF` sobre `#1A0A3B` ≈ 17:1 (AAA)

**Spacing (más aireado que Slack — Stripe-tier)**
| Elemento         | Clase                          |
|------------------|--------------------------------|
| Header height    | `h-14` (56px)                  |
| Sidebar width    | `w-[260px]`                    |
| Sidebar padding  | `px-3 py-4`                    |
| Item height      | `h-11` (44px) — touch-friendly |
| Item padding-x   | `px-3`                         |
| Item gap ícono/texto | `gap-3` (12px)             |
| Sub-item height  | `h-9` (36px)                   |
| Sub-item indent  | `pl-11 pr-3` (alinea después del ícono) |
| Border radius    | `rounded-md` (6px) en items    |
| Active border-l  | `border-l-[3px] border-[#6C3BFF]` (signature Shopify) |

**Typography (Inter/System — Stripe-quality)**
| Elemento              | Clase                                                       |
|-----------------------|-------------------------------------------------------------|
| Eyebrow (header)      | `text-[10px] font-semibold uppercase tracking-[0.14em]`     |
| Business name (header)| `text-sm font-semibold leading-tight`                       |
| Nav item              | `text-[14px] font-medium leading-none`                      |
| Nav item active       | `text-[14px] font-semibold leading-none`                    |
| Sub-item              | `text-[13px] font-normal leading-none`                      |
| Sub-item active       | `text-[13px] font-medium leading-none`                      |
| Section label (opc.)  | `text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500` |
| Status chip label     | `text-[11px] font-semibold uppercase tracking-wider text-neutral-500` |
| Status chip value     | `text-[13px] font-semibold tabular-nums text-[#1A0A3B]` (tabular-nums evita jitter en números) |

**Íconos:** Lucide, `size={18}` en nav primaria (un pelo más grandes que Slack para respirar), `size={16}` en sub-items, `strokeWidth={1.75}` unificado.

**Motion:** `transition-colors duration-150 ease-out` en cambios de estado; `transition-transform duration-200` para chevrons; siempre acompañar con `motion-reduce:transition-none`. Sin animar layout — solo colors + transform.

**Focus (obligatorio, no removible):**
```
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-[#6C3BFF]
focus-visible:ring-offset-2
focus-visible:ring-offset-[#FAFAFB]
```

**Nota Fase 2:** iconos con tint contextual sutil por área (à la Shopify — cada sección con su acento en el ícono idle) es upgrade opcional. Fase 1 usa monocromo consistente.

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

## Task 5 — Componente `PortalSidebarV2` (Shopify-style light nav)

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

**Referencia visual:** Sidebar Shopify Admin (ítems aireados, active state con tint accent muy suave + border-l indicator signature) con tipografía y calma Stripe Dashboard (tabular-nums, spacing generoso, monocromo hasta el hover). Chip inferior tipo Stripe status con plan + minutos restantes.

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
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFB]';

export default function PortalSidebarV2(props: PortalSidebarV2Props) {
  const { currentPath, status, ...input } = props;
  const areas = buildPortalAreas(input);

  return (
    <nav
      aria-label="Navegación principal"
      className="flex h-full w-[260px] shrink-0 flex-col border-r border-neutral-200/80 bg-[#FAFAFB]"
    >
      {/* Lista de áreas */}
      <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
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
                  'group relative flex h-11 items-center gap-3 rounded-md px-3',
                  'transition-colors duration-150 ease-out motion-reduce:transition-none',
                  active
                    ? 'bg-[#F3EFFF] text-[#6C3BFF] font-semibold'
                    : 'text-neutral-700 font-medium hover:bg-neutral-100 hover:text-neutral-900',
                  FOCUS_RING,
                ].join(' ')}
              >
                {/* Border-l indicator (signature Shopify) — sólo cuando activo */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[#6C3BFF]"
                  />
                )}

                <Icon
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden
                  className={
                    active
                      ? 'text-[#6C3BFF]'
                      : 'text-neutral-500 group-hover:text-neutral-700'
                  }
                />
                <span className="flex-1 truncate text-[14px] leading-none">
                  {area.label}
                </span>
                {area.subItems.length > 0 && (
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    className={[
                      'shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                      active
                        ? 'rotate-90 text-[#6C3BFF]'
                        : 'text-neutral-400 group-hover:text-neutral-600',
                    ].join(' ')}
                  />
                )}
              </Link>

              {showSubs && (
                <ul className="mt-1 space-y-0.5 pb-1">
                  {area.subItems.map(sub => {
                    const subActive = isSubActive(sub.href, currentPath);
                    return (
                      <li key={sub.href}>
                        <Link
                          href={sub.href}
                          aria-current={subActive ? 'page' : undefined}
                          className={[
                            'flex h-9 items-center rounded-md pl-11 pr-3 text-[13px] leading-none',
                            'transition-colors duration-150 ease-out motion-reduce:transition-none',
                            subActive
                              ? 'bg-[#F3EFFF] font-medium text-[#6C3BFF]'
                              : 'font-normal text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
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

      {/* Status chip (Stripe-style status pinned al fondo) */}
      {status && (status.plan || typeof status.minutesRemain === 'number') && (
        <div className="border-t border-neutral-200/80 px-4 py-3">
          <div className="flex flex-col gap-1">
            {status.plan && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                {status.plan}
              </span>
            )}
            {typeof status.minutesRemain === 'number' &&
              typeof status.minutesIncluded === 'number' && (
                <span className="text-[13px] font-semibold tabular-nums text-[#1A0A3B]">
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

Detalles clave (aplicando reglas de `ui-ux-pro-max`):
- **Contraste AAA**: `#3F3D56` (neutral-700 aprox) sobre `#FAFAFB` ≈ 10.5:1; `#6C3BFF` sobre `#F3EFFF` ≈ 5.4:1 AA (regla `color-accessible-pairs`)
- **Signature Shopify**: `border-l` 3px accent absoluto dentro del ítem activo — es el gesto que distingue un buen portal de PYME
- **Focus ring visible** obligatorio (`FOCUS_RING`), offset sobre fondo light `#FAFAFB`
- **Touch target 44px** en primary (`h-11`) — cumple regla `touch-target-size` incluso en mobile (importante: la mayoría del segmento accede desde celular)
- **Motion 150ms** ease-out + `motion-reduce:transition-none` en TODAS las transiciones (regla `reduced-motion`)
- **Solo animo `colors` y `transform`** — nunca layout (regla `transform-performance`)
- **`tabular-nums`** en el chip de minutos: previene jitter cuando el número cambia (regla Stripe-tier `number-tabular`)
- **`aria-current="page"`** en el link activo (área y sub-item)
- **Sub-item active reusa el mismo tint `#F3EFFF`** pero sin border-l — reserva ese gesto para primary areas (jerarquía visual)
- **Ícono a 18px en primary, 16px en sub** — un pelo más grandes que Slack para sentirse Stripe/Notion (aire, no densidad)
- **`gap-3` (12px)** entre ícono y texto — Stripe-tier (Slack usa 10px, más apretado)

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
- [ ] Header 56px de alto, sticky arriba, bg dark `#1A0A3B`, sombra sutil bajo el border-b
- [ ] Header muestra logo (o placeholder con inicial), "Tu oficina digital" en eyebrow uppercase 10px, business name en font-semibold 14px
- [ ] Sidebar 260px de ancho, bg light `#FAFAFB`, border-r sutil `#E8E8ED`, extendido hasta el fondo
- [ ] Sidebar muestra exactamente 5 áreas: Escritorio, Bandeja (si aplica), Historial, Tu equipo, Administración
- [ ] Cada área tiene ícono Lucide de 18px + label 14px, altura de fila 44px (touch-friendly)
- [ ] Contraste visual claro: header dark encima, sidebar light abajo, sin colisiones raras en la esquina superior izquierda

*Estados (sidebar light Shopify-tier):*
- [ ] Área activa: bg tint `#F3EFFF`, texto y ícono en accent `#6C3BFF`, font-semibold, **border-l 3px accent visible** (signature Shopify)
- [ ] Áreas idle: texto `neutral-700`, ícono `neutral-500`, font-medium
- [ ] Hover en área idle: bg `neutral-100`, texto/ícono a `neutral-900`
- [ ] Chevron: `neutral-400` idle → rotado 90° `#6C3BFF` cuando activo
- [ ] Sub-item activo: bg `#F3EFFF`, texto `#6C3BFF` font-medium — **SIN border-l** (reservado a primary)
- [ ] Sub-item idle: texto `neutral-600`, font-normal; hover a `neutral-100`

*Accesibilidad:*
- [ ] Tab desde el header: focus ring morado 2px visible con offset light en cada link
- [ ] Contraste business name (header) vs bg dark >= 4.5:1 — verificar en DevTools Accessibility > Contrast (debería ser ~17:1)
- [ ] Contraste texto idle sidebar (`neutral-700` sobre `#FAFAFB`) >= 4.5:1 — debería ser ~10:1
- [ ] Contraste texto activo (`#6C3BFF` sobre `#F3EFFF`) >= 4.5:1 — debería ser ~5.4:1
- [ ] Enable `prefers-reduced-motion` en DevTools (Rendering panel): transiciones desaparecen, chevron no rota animado
- [ ] Screen reader: `nav` anunciada como "Navegación principal"; link activo anunciado como "current page"
- [ ] `aria-current="page"` presente solo en el link activo (área) y sub activo

*Tipografía y detalles Stripe-tier:*
- [ ] Chip inferior "min restantes / totales" usa `tabular-nums` — al cambiar de "300 / 500" a "299 / 500" no hay jitter horizontal
- [ ] Plan label del chip en uppercase tracking-wider (`Empleado Centinelia`)
- [ ] Sin comas colgadas, sin em-dash (—)

*Copy y branding:*
- [ ] Sin emojis en ningún lado
- [ ] Sin la palabra "IA" visible
- [ ] Uso de "Tu equipo" (no "Empleados IA"), "Recursos de la oficina" (no "Herramientas")
- [ ] Acentos ES correctos: "Administración", "Cómo trabajamos", "Organización", "Investigación", "Navegación"

*Interacción:*
- [ ] Click en área con sub-items: navega al href principal y expande sub-items en el mismo movimiento
- [ ] Click en sub-item: navega y queda marcado como activo
- [ ] URL bar refleja la ruta vieja (ej. `/portal/[t]/oficina/bandeja`) — Fase 1 no cambia rutas
- [ ] Hover con mouse: cursor pointer visible; sin flicker; transición suave 150ms
- [ ] Colapso de sub-items al cambiar a otra área: instantáneo (Fase 2 puede animarlo si vale la pena)

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
