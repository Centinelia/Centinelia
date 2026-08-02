# Diseño — Makeover premium de correos Centinelia

**Fecha:** 2026-08-02
**Autor:** Nazre + Claude
**Estado:** propuesta, pendiente aprobación
**Trigger:** Nazre compartió 3 screenshots (Gmail) mostrando correos de Sofía que "ninguno tiene diseño estético". Auditoría reveló que 4 templates de alto impacto bypassean el sistema visual existente.

---

## 1. Contexto

Centinelia envía ~29 templates transaccionales distintos vía Resend, todos pasando por `sendEmail()` en `src/lib/email/send.ts`. Existe un `shell()` dark-theme sólido con anti-dark-mode conversion + helpers (`badge`, `heading`, `infoCard`, `btn`, `sectionLabel`, `statPill`, `mdToEmailHtml`) usado por ~90% de los correos, además de un segundo `clientShell()` light-theme brandeado por el negocio final (usado para correos que agentes envían a los callers).

### Diagnóstico de las screenshots

| Template | Archivo | Usa shell? |
|---|---|---|
| "Sofía necesita tu ayuda" | `notify.ts::buildRequestEmailHtml` | ❌ HTML custom |
| "Recordatorio: Sofía sigue esperando" | `notify.ts::buildReminderEmailHtml` | ❌ HTML custom |
| "Revisa 32 correos marcados spam" | `spam-review-digest/route.ts::digestHtml` | ❌ HTML custom |

Los 3 se salen del sistema visual: fondo `#FAFBFF` (light), sin logo de Centinelia, sin footer, sin las triple-wrapped anti-dark-mode guards. Por eso se ven "planos" comparados con el weekly report o el welcome email.

Además, la auditoría exhaustiva encontró **17 templates BÁSICO** de 29 totales. La mayoría usan `shell()` pero carecen de personalidad visual (avatar del meerkat que envía, jerarquía tipográfica editorial, sistema de acento por rol).

---

## 2. Objetivos

1. **Cerrar el gap "orphan"**: los templates que bypassean el shell deben migrarse.
2. **Introducir personalidad meerkat**: cada correo enviado por un meerkat específico (Sofía/Nia/Nox/…) debe llevar su avatar + color en el header.
3. **Polish visual selectivo**: cuando un template BÁSICO usa el shell pero se ve funcional/plano (ej. `minutesAlertHtml`), mejorar jerarquía sin re-arquitectura.
4. **Preview local**: script para renderizar todos los templates con datos mock a HTML files para revisión pre-merge.

### Non-goals

- No tocar `clientShell()` ni los correos que van al caller final (contract, appointment, follow-up). Ya son PREMIUM y con branding del negocio propio.
- No cambiar el sistema de envío (Resend) ni la firma `sendEmail()`.
- No cambiar el dark theme del shell (rationale abajo).
- No agregar A/B testing, tracking pixels, ni nuevas features de contenido.

---

## 3. Decisiones de arquitectura

### 3.1 ¿Dark shell o light? — Mantener dark

El shell actual usa fondo oscuro (`#120726` outer, `#1D1141` card) por decisión explícita:

> "Force white on header even when mobile clients apply dark-mode conversion (Titan Mobile, Gmail iOS, Outlook.com, etc)."
> — comentario en `send.ts:56`

Cambiar a light rompería el fix. Además, dark theme:
- Diferencia Centinelia de la avalancha de correos SaaS light-mode.
- Ya establecido en 26 templates existentes.
- Los brand colors (#6C3BFF acento) contrastan mejor sobre fondo oscuro.

**Los 3 templates orphan del screenshot pasan a dark**. Es un cambio visual notable pero consistente con el resto del sistema.

### 3.2 ¿Color por meerkat o siempre Centinelia purple?

**Color por meerkat** (Nazre confirmó en brainstorm). El shell recibe un color de acento opcional que reemplaza `C.accent` para ese correo. Sofía = `#22c55e` (Noah color, Sofía es una custom que hereda tono verde según prompt), Nia = `#6C3BFF`, Nox = `#0d9488`, etc. desde `MEERKAT_MAP`.

Fallback: si no hay `meerkat_role_id` en `agent.features`, usa `#6C3BFF` (Centinelia).

### 3.3 ¿Avatar meerkat en header?

Sí, cuando el `voice_agent` tiene `meerkat_role_id` en `features`. Se resuelve a `${BASE_URL}/meerkats/${roleId}.png`. Circular, 56×56, fondo tinted con el color del meerkat al 15%.

**Fallback**: monograma (inicial del `agent_name`) en círculo del mismo tinted color.

### 3.4 Ubicación del avatar

Debajo del header blanco con logo Centinelia, dentro de la card oscura, alineado a la izquierda con el nombre del meerkat + rol al lado. No reemplaza el logo Centinelia — coexisten (brand corporativa arriba, brand del empleado individual justo debajo).

---

## 4. Cambios en el sistema visual (send.ts)

### 4.1 Nuevo helper: `meerkatHeader()`

```ts
export interface MeerkatIdentity {
  roleId:  string | null;          // e.g. 'nia', 'nox'; null → fallback
  name:    string;                  // display name — "Sofía"
  role:    string;                  // "Empleada digital · Ventas"
  color:   string;                  // hex accent
  imageUrl: string | null;         // absolute URL to meerkat png
}

export function meerkatHeader(m: MeerkatIdentity): string
```

Renderiza (dentro del body oscuro, arriba del contenido):

```
┌──────────────────────────────────────────────┐
│  ┌────┐                                       │
│  │ 🐾 │  Sofía                                │
│  │    │  Empleada digital · Ventas            │
│  └────┘                                       │
│  ─────────────────────────────────────────    │  ← hairline en color meerkat @ 20%
└──────────────────────────────────────────────┘
```

Fallback sin `imageUrl`: círculo con letra `S`, mismo tinted bg.

### 4.2 Nuevo helper: `resolveMeerkatFromAgent()`

```ts
// src/lib/email/meerkat-identity.ts (nuevo)
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';

export function resolveMeerkatFromAgent(agent: {
  agent_name: string | null;
  features:   Record<string, unknown> | null;
}): MeerkatIdentity {
  const roleId = agent.features?.meerkat_role_id as string | null | undefined;
  const role   = roleId && MEERKAT_MAP[roleId as keyof typeof MEERKAT_MAP];

  if (role) {
    return {
      roleId:   role.id,
      name:     agent.agent_name || role.nombre,
      role:     `Empleado digital · ${role.rol}`,
      color:    role.color,
      imageUrl: `${BASE_URL}/meerkats/${role.id}.png`,
    };
  }
  return {
    roleId:   null,
    name:     agent.agent_name || 'Centinelia',
    role:     'Empleado digital',
    color:    '#6C3BFF',
    imageUrl: null,
  };
}
```

### 4.3 Extensión de `shell()`

Nueva firma retro-compatible:

```ts
export function shell(body: string, opts?: {
  meerkat?:  MeerkatIdentity;
  accent?:   string;   // override manual del color de acento (para escalation red, etc.)
  preheader?: string;  // texto oculto de preview en la bandeja
}): string
```

- Si `opts.meerkat` presente → inserta `meerkatHeader()` al inicio del body.
- Si `opts.accent` presente → el CTA principal (`btn(primary)`) usa ese color como base del gradient.
- Si `opts.preheader` presente → inserta `<div style="display:none;max-height:0;overflow:hidden;color:transparent">` con el texto al arranque del body.

Todos los llamados actuales de `shell(body)` siguen funcionando sin cambios.

### 4.4 Ajuste a `btn()`

Recibir color opcional:

```ts
export function btn(label: string, href: string, opts?: {
  primary?: boolean;
  color?:   string;   // hex; primary usa gradient de color→lighten(color)
}): string
```

Backward compat: `btn('Texto', href)` y `btn('Texto', href, false)` funcionan igual (booleano se detecta y trata como `{ primary: bool }`).

---

## 5. Migración de templates orphan

### 5.1 `notify.ts::buildRequestEmailHtml` (Sofía necesita tu ayuda)

**Antes:** HTML custom light-theme, ~18 líneas de string template.
**Después:**

```ts
async function buildRequestEmailHtml(req, agent) {
  const meerkat = resolveMeerkatFromAgent(agent);
  const url = requestUrl(agent.portal_token, req.id);
  const urgencyColor = { baja: '#8C7FB8', media: '#FBBF24', alta: '#EF4444' }[req.urgency];
  const urgencyLabel = `Urgencia ${req.urgency}`;

  return shell(`
    ${meerkatHeader(meerkat)}
    ${badge(urgencyLabel, urgencyColor)}
    ${heading('Necesito tu ayuda', agent.business_name)}
    ${infoCard(`
      ${sectionLabel('Solicitud')}
      <p style="color:${C.text};font-size:15px;font-weight:600;margin:0 0 12px;line-height:1.4">${escapeHtml(req.title)}</p>
      <div style="color:${C.sub};font-size:13px;line-height:1.7;white-space:pre-wrap">${escapeHtml(req.description)}</div>
    `, true)}
    ${req.source_context ? contextCollapsible(req.source_context) : ''}
    ${btn('Responder ahora →', url, { color: meerkat.color })}
    ${replyHelperText(replyTo)}
  `, {
    meerkat,
    accent:    meerkat.color,
    preheader: `${meerkat.name}: ${req.title}`,
  });
}
```

Nuevo mini-helper interno `contextCollapsible()` que renderiza el contexto de correo original en un `<details>` con estilo dark-theme (o simplemente un infoCard secundario si `<details>` no funciona bien en Gmail — investigar).

Nuevo helper `replyHelperText()`:

```ts
function replyHelperText(replyTo?: string): string {
  if (!replyTo) return '';
  return `<p style="color:${C.mute};font-size:12px;text-align:center;margin:16px 0 0;line-height:1.6">
    Puedes responder este correo directamente y tu respuesta se registrará automáticamente.
  </p>`;
}
```

### 5.2 `notify.ts::buildReminderEmailHtml`

```ts
async function buildReminderEmailHtml(req, agent) {
  const meerkat = resolveMeerkatFromAgent(agent);
  const url = requestUrl(agent.portal_token, req.id);

  return shell(`
    ${meerkatHeader(meerkat)}
    ${badge('Recordatorio · 24 horas', '#FBBF24')}
    ${heading('Sigo esperando', agent.business_name)}
    ${infoCard(`
      ${sectionLabel('Solicitud pendiente')}
      <p style="color:${C.text};font-size:15px;font-weight:600;margin:0;line-height:1.4">${escapeHtml(req.title)}</p>
    `, true)}
    ${btn('Responder ahora →', url, { color: '#FBBF24' })}
  `, { meerkat, accent: '#FBBF24', preheader: `Recordatorio: ${req.title}` });
}
```

### 5.3 `notify.ts::buildEscalationEmailHtml`

```ts
async function buildEscalationEmailHtml(req, agent, escalatedTo) {
  const meerkat = resolveMeerkatFromAgent(agent);
  const url = requestUrl(agent.portal_token, req.id);

  return shell(`
    ${meerkatHeader(meerkat)}
    ${badge('Escalado a ti · 48h sin respuesta', '#EF4444')}
    ${heading('Necesito respuesta', agent.business_name)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">
      Solicitud original enviada a <strong style="color:${C.text}">${escapeHtml(req.target_email)}</strong> hace 48 horas sin respuesta.
    </p>
    ${infoCard(`
      ${sectionLabel('Solicitud')}
      <p style="color:${C.text};font-size:15px;font-weight:600;margin:0 0 12px;line-height:1.4">${escapeHtml(req.title)}</p>
      <div style="color:${C.sub};font-size:13px;line-height:1.7;white-space:pre-wrap">${escapeHtml(req.description)}</div>
    `, true)}
    ${btn('Responder ahora →', url, { color: '#EF4444' })}
  `, { meerkat, accent: '#EF4444', preheader: `Escalado: ${req.title}` });
}
```

### 5.4 `spam-review-digest/route.ts::digestHtml`

Reescribir para usar `shell()` con items dark-themed:

```ts
function digestHtml(args) {
  const meerkat = resolveMeerkatFromAgent({
    agent_name: args.agentName,
    features:   { meerkat_role_id: args.roleId }  // pasar desde el caller
  });
  const portalUrl = `${BASE_URL}/portal/${args.portalToken}/oficina/bandeja?tab=spam`;
  const count = args.items.length;

  const itemsHtml = args.items.map(it => `
    ${infoCard(`
      <p style="color:${C.text};font-size:14px;font-weight:600;margin:0 0 4px;line-height:1.35">${escapeHtml(it.email_subject || '(sin asunto)')}</p>
      <p style="color:${C.mute};font-size:12px;margin:0 0 8px">De: ${escapeHtml(it.email_from)}</p>
      ${it.ai_summary ? `<p style="color:${C.sub};font-size:13px;line-height:1.6;margin:0">${escapeHtml(it.ai_summary)}</p>` : ''}
    `)}
  `).join('');

  return shell(`
    ${meerkatHeader(meerkat)}
    ${badge('Revisar por si acaso', meerkat.color)}
    ${heading(`${count} correo${count === 1 ? '' : 's'} sospechoso${count === 1 ? '' : 's'}`, args.businessName)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 20px;text-align:center">
      Marqué estos como spam pero podrían ser leads reales. Rescátalos desde la bandeja si me equivoqué.
    </p>
    ${itemsHtml}
    ${btn('Ver bandeja de spam →', portalUrl, { color: meerkat.color })}
    <p style="color:${C.mute};font-size:11px;line-height:1.5;margin:20px 0 0;text-align:center">
      Filtro: solo correos con más de 500 caracteres. Los promocionales cortos ya se descartaron.
    </p>
  `, { meerkat, preheader: `${count} correos marcados spam para revisión` });
}
```

Requiere agregar `roleId` al fetch del agent en el route (línea ~97) — trivialmente selecciona `features` adicionalmente.

### 5.5 `auto-mode-digest/route.ts` — verificar y migrar si es orphan

Pendiente confirmar en implementación. Si tiene template custom, aplicar el mismo patrón: `shell() + meerkatHeader() + items en infoCard()`.

---

## 6. Polish selectivo de templates BÁSICO existentes

Estos ya usan `shell()` pero se benefician de mejoras menores. Todas retro-compatibles.

### 6.1 `minutesAlertHtml` — barra de progreso

Actualmente es texto plano. Agregar la misma barra usada en `weeklyReportHtml`:

```ts
export function minutesAlertHtml(opts) {
  const pct = Math.min(opts.pct, 100);
  const barColor = pct >= 100 ? '#F87171' : pct >= 80 ? '#FBBF24' : C.accent;
  return shell(`
    ${badge(...)}
    ${heading(opts.businessName)}
    ${infoCard(`
      ${sectionLabel('Consumo del plan')}
      <div style="background:rgba(255,255,255,0.10);border-radius:6px;height:10px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:6px"></div>
      </div>
      <p style="color:${C.sub};font-size:13px;margin:0"><strong style="color:${C.text}">${opts.used}</strong> de ${opts.included} min · <span style="color:${barColor};font-weight:700">${Math.round(opts.pct)}%</span></p>
      <p style="color:${C.mute};font-size:12px;margin:6px 0 0">Se renueva el ${opts.resetDate}</p>
    `, true)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:20px 0 24px">${bodyText}</p>
    ${btn(...)}
  `);
}
```

### 6.2 `agentPausedHtml`, `paymentFailedHtml`, `reauthRequiredHtml`

Ya funcionan bien con shell — el gap es solo el badge del estado. Considerar añadir un `infoCard` con "¿Qué significa esto?" para tono más informativo/empático. **Deferrable** — no bloquea el makeover principal.

### 6.3 `accountWarningHtml`, `accountSuspendedHtml`, `accountTerminatedHtml`

Templates legales, tono conservador intencional. **No tocar visualmente** en este makeover — solo verificar que el bug de `color:#ef4444}"` (línea 748, comilla mal cerrada) esté arreglado. → Ya está roto en el código actual, arreglarlo de paso.

### 6.4 `bugReportHtml`, `infraAlertHtml`

Templates internos a `hola@centinelia.mx`. Priorizar cero — no los toca este makeover.

---

## 7. Preview local pre-merge

Nuevo script `scripts/preview-emails.ts`:

- Renderiza cada template con datos mock representativos.
- Escribe los HTML a `.email-previews/` (gitignored).
- Abre `.email-previews/index.html` (grid con iframes de todos los templates) en el navegador default vía `open`/`start`.

Ejecución:
```bash
pnpm tsx scripts/preview-emails.ts
```

Cubre: request, reminder, escalation, spam digest, weekly report, welcome, new lead, minutes alert (60%/80%/100%), paused, payment failed, empresarial, reauth, infra alert.

Este script es la "prueba" del makeover — pre-merge, Nazre valida visualmente.

---

## 8. Archivos afectados

| Archivo | Tipo de cambio | Estimado |
|---|---|---|
| `src/lib/email/send.ts` | extender `shell()`, agregar `meerkatHeader()`, ajustar `btn()`, mejorar `minutesAlertHtml`, arreglar bug legal | +80 líneas |
| `src/lib/email/meerkat-identity.ts` | **nuevo** | +40 líneas |
| `src/lib/human-handoff/notify.ts` | reescribir 3 builders + agregar select `features` en queries | -60 / +80 |
| `src/app/api/cron/spam-review-digest/route.ts` | reescribir digestHtml + agregar `features` al select | -40 / +50 |
| `src/app/api/cron/auto-mode-digest/route.ts` | verificar; migrar si orphan | condicional |
| `src/lib/ops/onboarding-mailer.ts` | verificar; ajustar si divergente | condicional |
| `scripts/preview-emails.ts` | **nuevo** | +120 líneas |
| `.gitignore` | agregar `.email-previews/` | 1 línea |

Total estimado: ~2 archivos nuevos, ~5 archivos modificados, ~-100/+380 líneas netas.

---

## 9. Compatibilidad y riesgos

- **Zero downtime**: cambios solo tocan generación HTML, no afectan envío ni triggers.
- **Backwards-compat de `shell()` y `btn()`**: firmas antiguas siguen funcionando (opts es opcional; booleano en btn se detecta).
- **Riesgo Gmail/Outlook rendering**: el shell ya está battle-tested. Los helpers nuevos (`meerkatHeader`) usan las mismas convenciones (tablas + inline styles + solid hex).
- **Riesgo imágenes**: los `meerkats/*.png` viven en `public/`. Deben ser accesibles vía HTTPS absoluto. Verificar en preview local que las URLs cargan.
- **Cero cambio de subject lines**: los correos siguen llegando con los mismos asuntos, filtros de Gmail del cliente no se rompen.
- **Cero cambio de reply-to**: replyToken/reply-to-email siguen funcionando.

---

## 10. Testing

1. **Preview local**: script `preview-emails.ts` renderiza todos los templates con datos mock. Nazre valida visualmente en Chrome.
2. **Send-to-self manual**: post-merge, disparar cada template contra `nazre20@gmail.com` con datos reales de dev DB.
3. **Cliente real**: enviar cada template a Gmail web, Gmail iOS, Outlook web, Outlook desktop (screenshot check).
4. **No unit tests**: los templates son HTML strings, testing por snapshot añade fricción sin valor real. El preview visual + prueba manual es la validación correcta.

---

## 11. Plan de ejecución (post-aprobación)

Orden recomendado:

1. Extender `send.ts` (shell opts, meerkatHeader, btn) — **no rompe nada existente**.
2. Crear `meerkat-identity.ts`.
3. Escribir `scripts/preview-emails.ts` con los templates actuales (sin cambios) para tener baseline visual.
4. Migrar los 4 orphan templates (notify.ts × 3, spam-digest × 1).
5. Regenerar previews, comparar side-by-side.
6. Aplicar polish de `minutesAlertHtml` + fix del bug legal.
7. Verificar auto-mode-digest y onboarding-mailer, aplicar mismos patrones si son orphan.
8. Commit por template (revisable) → PR único con screenshots de preview.

---

## 12. Preguntas abiertas

Ninguna — Nazre ya confirmó:
- Header con avatar meerkat + banner (dark shell mantenido).
- Color de acento por meerkat (con fallback a `#6C3BFF`).
- Alcance: auditar todos los correos y arreglar los que lo necesiten (definido en secciones 5-6).
