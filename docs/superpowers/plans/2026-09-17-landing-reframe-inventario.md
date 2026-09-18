# Inventario Landing Pre-Reframe — 2026-09-17

> Generado por Task 1 del SDD `2026-09-17-landing-reframe-empleados-digitales`.
> Fuente: lectura directa de `src/app/page.tsx` (1022 líneas), `src/app/PricingSection.tsx` (377), `src/app/LandingWidgets.tsx` (488) y `src/app/layout.tsx`.

---

## 1. Secciones actuales de `page.tsx`

Orden de renderizado, de arriba a abajo:

| # | Nombre de bloque (comentario JSX) | Componente / código | Notas |
|---|---|---|---|
| 1 | `<LandingNav />` | `./LandingNav` | importado, no inlinado |
| 2 | HERO, full-screen cinematic image | inline JSX | usa `hero-bg.png` (desktop) + `hero-bg-mobile.png` (mobile); orbs animados; overlay oscuro; fade a `#0D0520` en el bottom |
| 3 | Trust chips | inline, dentro del hero | `['Sin contrato mínimo', 'Activo en menos de 24 h', 'Número local incluido', 'Soporte en español']` — posición absolute al fondo del hero |
| 4 | PROBLEMA | inline JSX + `OverloadIllustration` + `AnimatedSection` | `id="problema"`, fondo `#0D0520`; 3 tarjetas con const `LIMITS`; cita-blockquote al fondo |
| 5 | EMPLEADO DIGITAL | inline JSX + `AnimatedSection` | fondo `C.bgAlt (#F4F0FF)`; 4 tarjetas `DIFFERENTIATORS`; tagline cierre |
| 6 | FEATURES — Construye tu oficina digital | inline JSX + `AnimatedSection` | org-chart Nox&Niva + 4+6 empleados; CTA `→ /empleados`; usa const `TEAM` (10 empleados) + const `DIRECTORS` |
| 7 | CÓMO TRABAJAN | `<TeamFlowSection />` | importado |
| 8 | LO QUE CAMBIA EL LUNES | `<BeforeAfterSection />` | importado |
| 9 | ASÍ TRABAJA EN TU NEGOCIO | `<IndustriesSection />` | importado |
| 10 | PRIMERA ENTREVISTA | `<NiaInterview />` | importado; `id="demo"` (anchor del hero CTA) |
| 11 | PLANES (Pricing) | inline wrapper `#0D0520` + `<PricingSection />` + Empresarial card | header copy "Hoy pagas la incorporación..." |
| 12 | LAS REGLAS DE TU OFICINA DIGITAL | `<ReglasManifesto />` | importado |
| 13 | FAQ | `<FaqLanding />` | importado (distinto de `FaqSection`) |
| 14 | BOTTOM CTA | inline JSX | fondo `#0D0520`; loss-lines copy; 2 botones: `/registro` + `tel:+528116333559` |
| 15 | FOOTER | inline JSX | logo + Pneuma Studio crédito; links: `/industrias`, `/faq`, `/portal/login`, `/registro`, `/legal`; RRSS: Instagram, LinkedIn, Facebook; email `hola@centinelia.mx` |
| 16 | `<LandingWidgets />` | `./LandingWidgets` | renderizado fuera del footer; chat Noah (bottom-left) + WhatsApp (bottom-right) |

### Componentes importados (no inlinados)

```
LandingNav, LandingWidgets, PricingSection, RotatingNiche, FaqSection (importado pero no usado en JSX visible),
FaqLanding, NiaInterview, AnimatedSection, MeerkatReveal (importado, sin uso visible en JSX),
OverloadIllustration, AudioWaveform, Marquee (importado, sin uso visible en JSX),
TeamFlowSection, ReglasManifesto, BeforeAfterSection, IndustriesSection
```

> **Nota:** `FaqSection`, `MeerkatReveal`, `Marquee` aparecen en las importaciones pero no tienen instancia JSX en el body. Son imports muertos o reservados.

---

## 2. Componentes reutilizables clave

### 2.1 `PricingSection.tsx` (377 líneas)

- Componente `'use client'` con estado local (`selectedId`, `jornadaId`).
- **HARDCODEA sus propios datos de pricing** en `JORNADA_TIERS` y `AGENT_TYPES` en lugar de leer de `src/lib/billing/plans.ts`.
- Cifras hardcoded en `PricingSection.tsx`:
  - `setupFee: 14990`
  - Tier prices: `2997 / 5994 / 11988`
  - Tier allocations: combinada `(250/300), (500/600), (1000/1200)` — minutos: `(500/20), (900/20), (1800/20)` — tareas: `(0/500), (0/1200), (0/3000)`
- Dichas cifras **coinciden** con `JORNADA_CONFIG` en `plans.ts` a la fecha de este inventario, pero son una copia independiente — toda actualización futura de precios requiere editar dos lugares.
- Incluye componente `AnimatedNumber` para interpolación animada de precio total.
- Paso 3: CTA → `/registro`.

### 2.2 `LandingWidgets.tsx` (488 líneas)

- Componente `'use client'` con chat Noah (bottom-left) y botón WhatsApp (bottom-right).
- El chat Noah llama a `/api/chat/sales` con streaming SSE.
- El botón WhatsApp usa `NEXT_PUBLIC_SUPPORT_WHATSAPP` env var; si no está definida, el link es `https://wa.me` desnudo. **El botón WhatsApp se muestra en producción como un canal de contacto hacia Centinelia** (no como canal del meerkat).
- Contiene un `WhatsAppIcon` custom SVG (lucide no lo incluye).
- Mensaje de bienvenida de Noah usa el término "empleados digitales" — alineado.
- WA link hardcodea en el texto del mensaje: `"...contratar un agente 24/7..."` — **violación de vocabulario**: usa "agente" en un string que el usuario podría ver.

### 2.3 Hero backgrounds

- Desktop: `/hero-bg.png` (Next.js `<Image>`, `fill`, `priority`, `quality={100}`)
- Mobile: `/hero-bg-mobile.png` (idem, `block sm:hidden`)
- Ambas imágenes usan `objectFit: 'cover'`; desktop tiene `objectPosition: 'center'`, mobile `center 30%`.

### 2.4 Imágenes de meerkats

- Org-chart DIRECTORS: `/meerkats/nox-niva.png`
- Org-chart TEAM (10 empleados): `/meerkats/{nia,noah,nara,neo,naia,nico,nelia,nova,nala,nami}.png`
- PricingSection paso 1: `/meerkats/avatar/nox.png`
- Bottom CTA: `/meerkats-happy-team.png?v=4` (desktop opacity 0.05) + `/meerkats-mobile-bg.png` (mobile)
- Logo: `/logo-icon.png`

---

## 3. Meta tags, JSON-LD y analytics (`layout.tsx`)

### 3.1 Meta tags (`export const metadata`)

| Campo | Valor |
|---|---|
| `title.default` | `'Centinelia | Construye tu oficina digital'` |
| `title.template` | `'%s | Centinelia'` |
| `description` | `'La forma más sencilla de ampliar la capacidad...'` |
| `keywords` | incluye `'empleados digitales IA'`, `'agentes de voz inteligencia artificial'`, `'asistente IA para negocios'` — contiene "IA" y "agentes" en keywords (SEO-only, no copy visible) |
| `openGraph.locale` | `'es_MX'` |
| `openGraph.images` | `/og-centinelia.jpg` (1950×1024) |
| `twitter.card` | `'summary_large_image'` |
| `robots` | `index: true, follow: true` |
| `alternates.canonical` | `'https://www.centinelia.mx'` |
| `manifest` | `/site.webmanifest` |
| `icons.icon` | `/favicon-96x96.png` + `/favicon.ico` |

### 3.2 JSON-LD schemas

Tres schemas en `<head>` vía `dangerouslySetInnerHTML`:

1. **Organization** — nombre, url, logo, contactPoint (tel `+52-81-1633-3559`), sameAs RRSS
2. **SoftwareApplication** — incluye `offers` con los 3 tiers de `combinada` hardcodeados (precios `2997/5994/11988`, minutos `250/500/1000`, tareas `300/600/1200`). **Tiene nota interna** advirtiendo que deben mantenerse sincronizados con `plans.ts`.
3. **FAQPage** — 7 preguntas/respuestas. Una respuesta menciona "agente" y "asistente automatizado" (contexto de FAQ, valor SEO; no afecta copy visible de landing).

### 3.3 Analytics

- GA4 via `NEXT_PUBLIC_GA_ID` env var — cargado condicionalmente con `<Script strategy="afterInteractive">`.
- `WebVitalsReporter` — reporta CLS, LCP, INP, FCP, TTFB, FID como custom events a GA4.
- **Analytics IDs no están hardcodeados** en el código; vienen de env var.

### 3.4 Fonts

- Sora (`--font-sora`): 400/500/600/700/800
- DM Sans (`--font-dm-sans`): 400/500/600

---

## 4. Trust chips

Hardcodeados en `page.tsx` línea 300, dentro del bloque HERO:

```
['Sin contrato mínimo', 'Activo en menos de 24 h', 'Número local incluido', 'Soporte en español']
```

Renderizados con `<Check size={11} color="#9B6DFF" />` (icono Lucide, correcto).

---

## 5. Lista: PRESERVAR

Todo lo siguiente debe **sobrevivir intacto** al reframe:

### SEO / analytics
- `export const metadata` completo en `layout.tsx` — title, description, OG, Twitter, robots, canonical, favicon, manifest
- Los 3 JSON-LD schemas (`organizationSchema`, `softwareSchema`, `faqSchema`) — incluyendo precios de `softwareSchema.offers` (actualizarlos solo si cambian en `plans.ts`)
- `NEXT_PUBLIC_GA_ID` binding + `WebVitalsReporter`
- Fonts: Sora + DM Sans
- `lang="es"` en `<html>`

### Rutas y navegación
- Links a `/registro`, `/cotizar`, `/privacidad` (si existe en footer, verificar), `/legal`, `/portal/login`, `/industrias`, `/faq`, `/empleados`
- Anchor `id="demo"` (apuntado por CTA "Conoce a tu próximo empleado")
- Anchor `id="problema"` (link potencial desde nav)
- Tel link `tel:+528116333559`
- Email `hola@centinelia.mx`
- RRSS: Instagram, LinkedIn, Facebook (con SVGs inline)

### Imágenes / assets
- `/hero-bg.png` y `/hero-bg-mobile.png` (hero backgrounds — serán reutilizados en el nuevo hero o reemplazados por nuevas versiones; conservar el patrón `<Image fill priority quality={100}>`)
- `/logo-icon.png`
- `/og-centinelia.jpg` (OG image — no tocar)
- `/meerkats/*.png` — todas las fotos de los 10 empleados + `/meerkats/avatar/nox.png`
- `/meerkats-happy-team.png` y `/meerkats-mobile-bg.png` (bottom CTA BG)

### Componentes reutilizables
- `<AnimatedSection>` — wrapper de scroll-reveal; se reutiliza en todo el reframe
- `<PricingSection />` — se conserva con modificación mínima (ver Rehacer)
- `<LandingNav />` — fuera del scope del reframe
- `<RotatingNiche />` — si el nuevo hero mantiene el ángulo de nicho
- `<AudioWaveform />` — indicador "EN LÍNEA" en hero; conservar si el nuevo hero lo incluye
- Trust chips copy — el texto está bien, conservar los 4 chips exactos
- `<FaqLanding />` — conservar; ya es el componente correcto (distinto de `FaqSection`)

### Tokens de diseño
- Objeto `C` (colores brand): `bg: '#FAFBFF'`, `accent: '#6C3BFF'`, `text: '#1A0A3B'`, etc. — estos son los tokens canónicos del brand
- Fondo oscuro `#0D0520` para secciones de contraste
- Degradado `linear-gradient(135deg, #6C3BFF, #9B6DFF)` para CTAs primarios

---

## 6. Lista: REHACER

Secciones que se tocan o reescriben en el reframe:

| Elemento | Qué cambia | Observaciones |
|---|---|---|
| **Hero — headline** | Nueva h1 centrada en "empleados digitales" como concepto | Actual: "Tu primer empleado / digital." — ya está cerca pero el reframe la amplifica |
| **Hero — sub** | Nueva bajada orientada a beneficios de negocio, no features | Actual dice "Primera oficina digital con empleados especializados..." |
| **PROBLEMA section** | Posiblemente reencuadrado como "problema de capacidad → solución = empleados digitales" | El bloque actual ya tiene buena dirección, pero puede acortarse |
| **EMPLEADO DIGITAL section** | Texto de h2 y bullets enfocados más en el concepto de "empleado" vs "software/bot" | Actual h2: "No es software. No es recepcionista. Es capacidad operativa que trabaja sola" |
| **FEATURES — Org-chart** | Posible actualización de copy del tagline de sección | Títulos de sección: "Arma tu equipo." / "Construye tu oficina digital" — revisar con brief Task 2 |
| **PricingSection — tier labels** | `TIER_LABELS` en `plans.ts` dice "Esencial/Profesional/Alta Demanda"; `PricingSection.tsx` dice "Media Jornada/Jornada Completa/Alta Demanda" — discrepancia | La landing usa "Media Jornada"/"Jornada Completa"/"Alta Demanda"; `plans.ts` tiene "Esencial"/"Profesional"/"Alta Demanda". Son dos nomenclaturas distintas. El reframe debe decidir una sola. |
| **Pricing — copy header** | "Empieza a construir tu oficina digital" — puede refinarse | El copy del pricing wrapper está en `page.tsx` líneas 687-706 |
| **FAQ** | `<FaqLanding />` — revisar preguntas contra el nuevo frame | Sin cambios de componente pero el contenido puede necesitar ajuste |
| **Bottom CTA** | Copy de las "loss lines" y headline del CTA | Actual ya tiene buen tono; reframe puede ajustar énfasis |

---

## 7. Lista: ELIMINAR

Elementos que **no deben existir** en la versión reframe:

### Violaciones a global constraints encontradas en el código actual

| Ubicación | Violación | Tipo | Línea aprox. |
|---|---|---|---|
| `LandingWidgets.tsx` línea 77 | WA link message hardcodea `"...contratar un agente 24/7..."` — usa "agente" en string visible al usuario | Vocabulario: "agente" en vez de "empleado digital" | L77 |
| `layout.tsx` JSON-LD `faqSchema` | Pregunta 7: `"¿Mis clientes van a saber que están hablando con una IA?"` y respuesta menciona "asistente automatizado", "IA" — estas strings son visibles para Google y rich snippets | "IA" en copy SEO (FAQ schema). Riesgo bajo para usuario final, pero Rich Snippets lo mostraría. | L161 |
| `layout.tsx` `metadata.keywords` | Incluye `'empleados digitales IA'`, `'agentes de voz inteligencia artificial'`, `'asistente IA para negocios'` — keywords con "IA", "agentes" | Keywords HTML (no visible al usuario, pero documenta la deuda) | L32-36 |
| `layout.tsx` JSON-LD `softwareSchema.description` | `"Plataforma de empleados digitales de IA para organizaciones mexicanas..."` — "IA" en description del schema | "IA" en meta SEO | L108 |
| `layout.tsx` `organizationSchema.description` | `"empleados digitales de IA"` | "IA" en JSON-LD | L87 |
| `layout.tsx` `softwareSchema.featureList` | Varios items usan "IA" o expresiones de bot: `"Empleados de IA especializados..."`, `"Administración de correos electrónicos con respuestas automáticas"` | Deuda SEO vs copy policy | L129 |
| `PricingSection.tsx` | Datos de pricing hardcodeados sin leer de `plans.ts` | Deuda técnica (fuente de verdad duplicada) | L42-80 |
| `page.tsx` imports | `FaqSection`, `MeerkatReveal`, `Marquee` importados pero sin uso en JSX | Dead imports | L11-23 |

### WhatsApp como canal del meerkat
- El botón WhatsApp flotante en `LandingWidgets.tsx` **no representa WhatsApp como canal del meerkat** — es un botón de contacto hacia Centinelia (number `NEXT_PUBLIC_SUPPORT_WHATSAPP`). Este uso **es correcto** según constraints ("WhatsApp NO aparece como canal del meerkat [pero] puede aparecer como CTA hacia Centinelia").
- **No se elimina**. Se documenta para evitar confusión en tasks futuros.

### Em-dashes
- No se encontraron em-dashes (— –) en copy visible de `page.tsx`, `PricingSection.tsx` ni `LandingWidgets.tsx`. Las reglas de copy están siendo respetadas en estos archivos.

### Precios hardcodeados en copy visible
- `page.tsx` tiene un comentario de código en líneas 95-100 que documenta que las cifras antiguas `$320/$420/$520` fueron eliminadas. No aparecen en el JSX visible.
- `PricingSection.tsx` sí tiene precios hardcoded (`2997`, `5994`, `11988`, `14990`) en las constantes del componente — coinciden con `plans.ts` hoy, pero representan una deuda que se debe migrar a importar de `plans.ts`.

### Emojis en copy visible
- No se encontraron emojis en copy visible de `page.tsx` ni `PricingSection.tsx`.
- `LandingWidgets.tsx` no tiene emojis en UI.

---

## 8. Tabla resumen rápido

| Categoría | Elementos | Acción |
|---|---|---|
| SEO tags | metadata, 3 JSON-LD, GA4 binding | Preservar (ajuste mínimo de "IA" en keywords/schemas en tarea posterior si se decide) |
| Hero backgrounds | `/hero-bg.png`, `/hero-bg-mobile.png` | Preservar o reemplazar en Task 2 |
| Trust chips | 4 strings actuales | Preservar |
| Rutas clave | `/registro`, `/cotizar`, `/legal`, `/portal/login`, `/empleados`, `tel:`, `mailto:` | Preservar todos |
| Anchor `#demo` | `id="demo"` en `NiaInterview` | Preservar |
| Analytics id | `NEXT_PUBLIC_GA_ID` (env var) | Preservar |
| `PricingSection.tsx` | Todo el componente | Rehacer parcial: migrar datos a `plans.ts` + ajustar tier labels |
| Org-chart empleados | 10+2 meerkats con imágenes | Preservar imágenes y estructura |
| WhatsApp widget | Botón de contacto hacia Centinelia | Preservar (es CTA hacia Centinelia, no canal de meerkat) |
| "agente" en WA link text | `LandingWidgets.tsx` L77 | Eliminar en Task 3 (cambiar a "empleado digital") |
| Dead imports | `FaqSection`, `MeerkatReveal`, `Marquee` | Eliminar en limpieza |
| `PricingSection` hardcode | Datos sin leer de `plans.ts` | Refactorizar en Task 4/5 |

---

## 9. Hallazgos adicionales (no anticipados en el brief)

1. **Discrepancia de tier labels**: `plans.ts` define `TIER_LABELS` como `{ starter: 'Esencial', growth: 'Profesional', scale: 'Alta Demanda' }` pero `PricingSection.tsx` muestra `'Media Jornada' / 'Jornada Completa' / 'Alta Demanda'`. El reframe debe alinear una sola nomenclatura. El riesgo es que los tier labels del JSON-LD en `layout.tsx` también usan "Media Jornada / Jornada Completa / Alta Demanda" — son coherentes entre sí pero divergen de `plans.ts`.

2. **`PricingSection.tsx` es una isla de datos**: todo el componente tiene sus propias constantes. Si el equipo bumps precios solo en `plans.ts`, la landing silenciosamente muestra cifras stale. Recomienda migrar a importar `JORNADA_CONFIG` y `FEATURE_PLAN_CONFIG` de `plans.ts` como parte del reframe de pricing.

3. **`RotatingNiche` y `NiaInterview`** son componentes importados cuyo contenido no fue auditado en este task (no estaban en el scope). Si el reframe toca el hero o la sección "Primera Entrevista", Task 2 debe auditarlos.

4. **`TeamFlowSection`, `BeforeAfterSection`, `IndustriesSection`, `ReglasManifesto`**: no fueron auditados (fuera del scope de Task 1). Aparecen entre FEATURES y PLANES. Su contenido y copy deben revisarse en tasks correspondientes.

5. **Footer no tiene link a `/privacidad`**: tiene `/legal` pero no `/privacidad` explícito. Si existe la ruta `/privacidad`, el footer debería linkearla; si no, este es un gap en la navegación legal.
