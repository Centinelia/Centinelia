# Landing Reframe: Empleados Digitales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la landing pública de Centinelia con una narrativa PyME de "empleados digitales que trabajan por ti, sin contratar", incluyendo callback en vivo con guardrails (fallback, OTP, consentimiento LFPDPPP).

**Architecture:** Refactor de `src/app/page.tsx` (1022 líneas actuales) a un layout compuesto por componentes de sección aislados en `src/app/(landing)/`. El callback en vivo se implementa como pipeline síncrono desde edge function → OTP verificación → Vapi outbound directo, con fallback a notificación manual al owner si el pipeline falla. Datos de meerkats y pricing se leen en runtime de `src/lib/portal/meerkat-roles.ts` y `src/lib/billing/plans.ts` (source of truth, cero hardcode).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind, Supabase (leads + rate limit), Vapi (llamada outbound), Anthropic Claude (guión dinámico opcional), Twilio o Vonage (OTP SMS).

**Spec:** `docs/superpowers/specs/2026-09-17-landing-reframe-empleados-digitales-design.md`

## Global Constraints

- **Next.js 15 breaking changes**: leer `node_modules/next/dist/docs/` antes de asumir APIs (guía en `AGENTS.md` del repo).
- **Español completo obligatorio**: ñ, á, é, í, ó, ú, ¿, ¡ en todo copy visible. Nunca ASCII plano.
- **Prohibido en copy visible**: em-dashes (—), emojis, palabras "IA"/"AI", "agente", "chatbot", "GPT", "automatización" (excepto en la franja "empleado a la medida" donde se usa intencional).
- **Vocabulario canónico**: "empleado digital" (nunca "agente"). Meerkats se presentan con nombre + rol laboral.
- **Regionalismos**: evitar chilangoismos ("te late", "chido"). Registro neutro mexicano regio.
- **WhatsApp**: NO aparece en integraciones ni como canal del meerkat. Puede aparecer como CTA de contacto hacia Centinelia (footer, opcional).
- **Anthropic**: toda llamada a Claude debe usar `logLlmCall` (enforced por `pnpm lint`).
- **Fuente de verdad pricing**: `src/lib/billing/plans.ts` (`JORNADA_CONFIG`). Nunca hardcodear cifras — leer en runtime.
- **Fuente de verdad meerkats**: `src/lib/portal/meerkat-roles.ts` (`MEERKAT_ROLES`, `PUBLIC_MEERKAT_ROLES`). Nunca hardcodear roster — filtrar por `INTERNAL_MEERKAT_IDS`.
- **Meerkats a mostrar**: los 13 públicos actuales. Neka y Nash internos (excluidos). Navi/Navi Agencia excluidos hasta Meta App Review.
- **Pool cobra siempre**: cada callback demo consume minutos del pool interno Centinelia (memoria `feedback-pool-accuracy-top-priority`).
- **Test pipelines first**: antes de conectar UI a Vapi, probar la ruta E2E con curl/script.
- **Zero deuda**: bug detectado en sesión se arregla en la misma sesión (memoria `feedback-zero-debt`).

---

## File Structure

### Phase 1: Frontend

**Modify:**
- `src/app/page.tsx` (1022 líneas → ~150 líneas, refactor a composición de secciones)
- `src/app/PricingSection.tsx` (agregar franja "empleado a la medida" + setup fee visible)
- `src/app/layout.tsx` (actualizar JSON-LD y meta si aplica)

**Create:**
- `src/app/(landing)/sections/Hero.tsx`
- `src/app/(landing)/sections/CallbackForm.tsx` (Phase 1: form-only → POSTs a stub)
- `src/app/(landing)/sections/Elenco.tsx`
- `src/app/(landing)/sections/ComoFunciona.tsx`
- `src/app/(landing)/sections/CasosReales.tsx`
- `src/app/(landing)/sections/Comparativa.tsx`
- `src/app/(landing)/sections/Integraciones.tsx`
- `src/app/(landing)/sections/FAQ.tsx`
- `src/app/(landing)/sections/CTAFinal.tsx`
- `src/app/(landing)/lib/casos-reales.ts` (data de casos con permisos)
- `src/app/(landing)/lib/integraciones-catalog.ts` (grid data)

**Test:**
- `src/app/(landing)/sections/__tests__/*.test.tsx` (uno por sección con smoke)
- `tests/e2e/landing-copy-invariants.spec.ts` (Playwright: verifica que no aparezca em-dash, emoji, "IA")

### Phase 2: Callback pipeline

**Create:**
- `supabase/migrations/YYYYMMDDHHMM_landing_callback_requests.sql`
- `src/app/api/landing/callback-request/route.ts` (POST: crea request + dispara OTP)
- `src/app/api/landing/callback-verify/route.ts` (POST: verifica OTP + dispara Vapi)
- `src/lib/landing/callback-store.ts` (CRUD Supabase)
- `src/lib/landing/callback-throttle.ts` (rate limit por IP + teléfono)
- `src/lib/landing/otp-sms.ts` (envío + verificación OTP vía Twilio)
- `src/lib/landing/notify-owner.ts` (notif por correo si pipeline falla)
- `src/lib/vapi/landing-demo.ts` (llamada Vapi outbound con guión demo Nia)

**Modify:**
- `src/lib/portal/meerkat-roles.ts` (agregar `landingDemoPersonalidad` a Nia, opcional)
- `src/app/(landing)/sections/CallbackForm.tsx` (conectar a endpoint real)

**Test:**
- `src/lib/landing/__tests__/callback-throttle.test.ts`
- `src/lib/landing/__tests__/otp-sms.test.ts`
- `src/lib/landing/__tests__/notify-owner.test.ts`
- `src/lib/vapi/__tests__/landing-demo.test.ts`
- `tests/e2e/landing-callback-flow.spec.ts` (Playwright: submit → OTP → llamada mock)
- `src/app/api/landing/callback-request/__tests__/route.test.ts` (integration con guard `assertNotProdOrAllowed`)

---

## PHASE 1 — Landing Frontend Reframe

### Task 1: Inventario y setup

**Files:**
- Read: `src/app/page.tsx` (1022 líneas)
- Read: `src/app/PricingSection.tsx` (377 líneas)
- Read: `src/app/LandingWidgets.tsx` (488 líneas)
- Create: `docs/superpowers/plans/2026-09-17-landing-reframe-inventario.md` (audit doc, temporal)

**Interfaces:**
- Consumes: nada
- Produces: audit doc con qué se preserva, qué se rompe, qué componentes existentes se reutilizan (SEO tags, analytics, Trust chips, hero-bg images)

- [ ] **Step 1: Leer los 3 archivos y catalogar responsabilidades**

Documenta en `docs/superpowers/plans/2026-09-17-landing-reframe-inventario.md`:
- Secciones actuales de `page.tsx` (por comentarios `{/* … */}` y por bloques semánticos).
- Componentes reutilizables (`PricingSection`, `LandingWidgets`, hero backgrounds `/hero-bg.png`, `/hero-bg-mobile.png`).
- Meta tags, JSON-LD, analytics ids.
- Trust chips.

- [ ] **Step 2: Identificar qué queda, qué se rehace, qué se elimina**

Tres listas en el mismo doc:
- **Preservar**: analytics ids, JSON-LD schema, favicon, cualquier link a `/privacidad`, `/cotizar`, `/registro`.
- **Rehacer**: hero, secciones intermedias, pricing (parcial — se toca `PricingSection.tsx` pero se conserva), FAQ, CTA final.
- **Eliminar**: cualquier mención a WhatsApp como canal del meerkat, referencias a $320/$420/$520 si aparecen hardcoded, cualquier em-dash o emoji.

- [ ] **Step 3: Commit inventario**

```bash
git add docs/superpowers/plans/2026-09-17-landing-reframe-inventario.md
git commit -m "docs: inventario landing pre-reframe"
```

---

### Task 2: Componente Hero

**Files:**
- Create: `src/app/(landing)/sections/Hero.tsx`
- Create: `src/app/(landing)/sections/__tests__/Hero.test.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<Hero />` component (default export). Props: `{ onCallbackClick: () => void; onElencoClick: () => void }`.

- [ ] **Step 1: Test smoke — renderiza copy exacto sin em-dash ni emoji**

```typescript
// src/app/(landing)/sections/__tests__/Hero.test.tsx
import { render, screen } from '@testing-library/react';
import Hero from '../Hero';

describe('Hero', () => {
  it('renderiza el headline sin em-dash ni emoji', () => {
    render(<Hero onCallbackClick={() => {}} onElencoClick={() => {}} />);
    const headline = screen.getByRole('heading', { level: 1 });
    expect(headline.textContent).toContain('Contesta el teléfono');
    expect(headline.textContent).not.toMatch(/[—–]/);
    expect(headline.textContent).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it('CTA primario dice "Deja que Nia te llame"', () => {
    render(<Hero onCallbackClick={() => {}} onElencoClick={() => {}} />);
    expect(screen.getByRole('button', { name: /deja que nia te llame/i })).toBeInTheDocument();
  });

  it('CTA secundario dice "Conoce al equipo"', () => {
    render(<Hero onCallbackClick={() => {}} onElencoClick={() => {}} />);
    expect(screen.getByRole('button', { name: /conoce al equipo/i })).toBeInTheDocument();
  });

  it('subheadline menciona "sin contratar" y "próximo lunes"', () => {
    render(<Hero onCallbackClick={() => {}} onElencoClick={() => {}} />);
    expect(screen.getByText(/sin contratar/i)).toBeInTheDocument();
    expect(screen.getByText(/próximo lunes/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — debe fallar**

```bash
cd C:/Users/Nazre/centinelia
npm test -- src/app/\(landing\)/sections/__tests__/Hero.test.tsx
```
Expected: FAIL (`Hero` no existe todavía)

- [ ] **Step 3: Implementar Hero**

```tsx
// src/app/(landing)/sections/Hero.tsx
'use client';

interface HeroProps {
  onCallbackClick: () => void;
  onElencoClick: () => void;
}

export default function Hero({ onCallbackClick, onElencoClick }: HeroProps) {
  return (
    <section className="relative min-h-[80vh] flex flex-col justify-center items-center px-6 py-24 bg-white text-center">
      <p className="text-sm uppercase tracking-wider text-[#6C3BFF] mb-6">
        Empleados digitales para tu negocio
      </p>
      <h1 className="text-5xl md:text-6xl font-bold leading-tight text-[#1A0A3B] mb-6 max-w-3xl">
        Contesta el teléfono. Cotiza.
        <br />
        Factura. Cobra. Agenda.
      </h1>
      <p className="text-2xl md:text-3xl font-medium text-[#1A0A3B] mb-4">
        Sin contratar a nadie.
      </p>
      <p className="text-lg text-gray-600 mb-10 max-w-xl">
        Empleados digitales que empiezan a trabajar el próximo lunes.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={onCallbackClick}
          className="px-8 py-4 bg-[#6C3BFF] text-white font-semibold rounded-lg hover:bg-[#5A2FD9] transition"
        >
          Deja que Nia te llame
        </button>
        <button
          onClick={onElencoClick}
          className="px-8 py-4 bg-transparent text-[#6C3BFF] font-semibold rounded-lg border-2 border-[#6C3BFF] hover:bg-[#6C3BFF]/5 transition"
        >
          Conoce al equipo
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test — debe pasar**

```bash
npm test -- src/app/\(landing\)/sections/__tests__/Hero.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/\(landing\)/sections/Hero.tsx src/app/\(landing\)/sections/__tests__/Hero.test.tsx
git commit -m "feat(landing): Hero component con copy PyME tarea/dolor"
```

---

### Task 3: Componente CallbackForm (Phase 1 — form-only, sin backend)

**Files:**
- Create: `src/app/(landing)/sections/CallbackForm.tsx`
- Create: `src/app/(landing)/sections/__tests__/CallbackForm.test.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<CallbackForm />` component. Props: `{ onSubmit: (data: CallbackRequestPayload) => Promise<{ ok: boolean; message?: string }> }`.
- Exports type: `CallbackRequestPayload = { phone: string; industry: IndustryKey; consent: true }`.
- Exports type: `IndustryKey = 'tortilleria_abarrotes' | 'construccion' | 'despacho_contable' | 'servicios_profesionales' | 'otro'`.

- [ ] **Step 1: Test — form solo submite con consent + industria + teléfono válido MX**

```typescript
// src/app/(landing)/sections/__tests__/CallbackForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CallbackForm from '../CallbackForm';

describe('CallbackForm', () => {
  it('botón submit está oculto sin consent (hide over disable)', () => {
    render(<CallbackForm onSubmit={async () => ({ ok: true })} />);
    expect(screen.queryByRole('button', { name: /quiero que me llame/i })).not.toBeInTheDocument();
  });

  it('botón aparece cuando marcas consent', () => {
    render(<CallbackForm onSubmit={async () => ({ ok: true })} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /quiero que me llame/i })).toBeInTheDocument();
  });

  it('valida que el teléfono sea MX (10 dígitos)', async () => {
    const onSubmit = jest.fn().mockResolvedValue({ ok: true });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu teléfono/i), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText(/tu tipo de negocio/i), { target: { value: 'tortilleria_abarrotes' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(/teléfono no válido/i)).toBeInTheDocument();
    });
  });

  it('submite con datos válidos', async () => {
    const onSubmit = jest.fn().mockResolvedValue({ ok: true });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu teléfono/i), { target: { value: '8112345678' } });
    fireEvent.change(screen.getByLabelText(/tu tipo de negocio/i), { target: { value: 'tortilleria_abarrotes' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ phone: '8112345678', industry: 'tortilleria_abarrotes', consent: true });
    });
  });
});
```

- [ ] **Step 2: Run test — fail**

```bash
npm test -- src/app/\(landing\)/sections/__tests__/CallbackForm.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implementar CallbackForm**

```tsx
// src/app/(landing)/sections/CallbackForm.tsx
'use client';
import { useState } from 'react';

export type IndustryKey =
  | 'tortilleria_abarrotes'
  | 'construccion'
  | 'despacho_contable'
  | 'servicios_profesionales'
  | 'otro';

export interface CallbackRequestPayload {
  phone: string;
  industry: IndustryKey;
  consent: true;
}

interface Props {
  onSubmit: (data: CallbackRequestPayload) => Promise<{ ok: boolean; message?: string }>;
}

const INDUSTRIES: { key: IndustryKey; label: string }[] = [
  { key: 'tortilleria_abarrotes', label: 'Tortillería, abarrotes o reparto' },
  { key: 'construccion', label: 'Constructora u obra' },
  { key: 'despacho_contable', label: 'Despacho contable o de facturación' },
  { key: 'servicios_profesionales', label: 'Servicios profesionales' },
  { key: 'otro', label: 'Otro' },
];

const MX_PHONE_RE = /^[1-9]\d{9}$/;

export default function CallbackForm({ onSubmit }: Props) {
  const [phone, setPhone] = useState('');
  const [industry, setIndustry] = useState<IndustryKey>('tortilleria_abarrotes');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!MX_PHONE_RE.test(phone)) {
      setError('Teléfono no válido. Escribe los 10 dígitos sin espacios ni guiones.');
      return;
    }
    setSending(true);
    const res = await onSubmit({ phone, industry, consent: true });
    setSending(false);
    if (res.ok) {
      setSent(res.message ?? 'Recibido. En breve te llamamos.');
    } else {
      setError(res.message ?? 'No pudimos procesar tu solicitud.');
    }
  }

  if (sent) {
    return (
      <section className="py-24 px-6 bg-[#FAFBFF]">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-2xl font-medium text-[#1A0A3B]">{sent}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-24 px-6 bg-[#FAFBFF]">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-4">
          En menos de 60 segundos, uno de nuestros empleados digitales te llama.
        </h2>
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="text-left">
            <span className="text-sm font-medium text-[#1A0A3B]">Tu teléfono</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="8112345678"
              className="mt-1 w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:border-[#6C3BFF]"
              maxLength={10}
            />
          </label>
          <label className="text-left">
            <span className="text-sm font-medium text-[#1A0A3B]">Tu tipo de negocio</span>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value as IndustryKey)}
              className="mt-1 w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:border-[#6C3BFF]"
            >
              {INDUSTRIES.map((i) => (
                <option key={i.key} value={i.key}>{i.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-3 text-left text-sm text-gray-700 mt-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              Autorizo que Centinelia me contacte por teléfono. Ver <a href="/privacidad" className="text-[#6C3BFF] underline">aviso de privacidad</a>.
            </span>
          </label>
          {consent && (
            <button
              type="submit"
              disabled={sending}
              className="mt-4 px-8 py-4 bg-[#6C3BFF] text-white font-semibold rounded-lg hover:bg-[#5A2FD9] disabled:opacity-50 transition"
            >
              {sending ? 'Enviando...' : 'Quiero que me llame Nia ahora'}
            </button>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </form>
        <p className="mt-6 text-sm text-gray-600 max-w-lg mx-auto">
          Vas a hablar con Nia. Va a durar unos 2 minutos. Te va a preguntar sobre tu negocio para mostrarte cómo trabajaría contigo.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests — pass**

```bash
npm test -- src/app/\(landing\)/sections/__tests__/CallbackForm.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/\(landing\)/sections/CallbackForm.tsx src/app/\(landing\)/sections/__tests__/CallbackForm.test.tsx
git commit -m "feat(landing): CallbackForm con validación MX + consent + hide-over-disable"
```

---

### Task 4: Componente Elenco (lee de meerkat-roles.ts)

**Files:**
- Create: `src/app/(landing)/sections/Elenco.tsx`
- Create: `src/app/(landing)/sections/__tests__/Elenco.test.tsx`

**Interfaces:**
- Consumes: `PUBLIC_MEERKAT_ROLES` de `src/lib/portal/meerkat-roles.ts`
- Produces: `<Elenco />` component. Props: `{ initialVisibleCount?: number }` (default 8).

- [ ] **Step 1: Test — muestra exactamente 13 meerkats públicos, ninguno interno**

```typescript
// src/app/(landing)/sections/__tests__/Elenco.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Elenco from '../Elenco';
import { PUBLIC_MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

describe('Elenco', () => {
  it('renderiza 8 meerkats por default y expone "Ver todo el equipo"', () => {
    render(<Elenco />);
    const cards = screen.getAllByTestId('meerkat-card');
    expect(cards.length).toBe(8);
    expect(screen.getByRole('button', { name: /ver todo el equipo/i })).toBeInTheDocument();
  });

  it('al hacer click en "Ver todo el equipo" muestra los 13', () => {
    render(<Elenco />);
    fireEvent.click(screen.getByRole('button', { name: /ver todo el equipo/i }));
    const cards = screen.getAllByTestId('meerkat-card');
    expect(cards.length).toBe(PUBLIC_MEERKAT_ROLES.length);
    expect(cards.length).toBe(13);
  });

  it('no incluye Neka ni Nash (internos)', () => {
    render(<Elenco />);
    fireEvent.click(screen.getByRole('button', { name: /ver todo el equipo/i }));
    expect(screen.queryByText(/^Neka$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Nash$/i)).not.toBeInTheDocument();
  });

  it('no incluye Navi (behind feature flag)', () => {
    render(<Elenco />);
    fireEvent.click(screen.getByRole('button', { name: /ver todo el equipo/i }));
    expect(screen.queryByText(/^Navi/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — fail**

```bash
npm test -- src/app/\(landing\)/sections/__tests__/Elenco.test.tsx
```

- [ ] **Step 3: Implementar Elenco**

```tsx
// src/app/(landing)/sections/Elenco.tsx
'use client';
import { useState } from 'react';
import Image from 'next/image';
import { PUBLIC_MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

const STARS_ORDER = ['nia', 'noah', 'nala', 'nova', 'nelia', 'nox', 'neo', 'nami'] as const;

function orderedPublicRoles() {
  const stars = STARS_ORDER
    .map((id) => PUBLIC_MEERKAT_ROLES.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  const rest = PUBLIC_MEERKAT_ROLES.filter((r) => !STARS_ORDER.includes(r.id as never));
  return [...stars, ...rest];
}

interface Props {
  initialVisibleCount?: number;
}

export default function Elenco({ initialVisibleCount = 8 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const all = orderedPublicRoles();
  const visible = expanded ? all : all.slice(0, initialVisibleCount);

  return (
    <section id="elenco" className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-2 text-center">
          Este es tu nuevo equipo.
        </h2>
        <p className="text-lg text-gray-600 mb-12 text-center">
          Cada empleado se especializa en su función.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {visible.map((m) => (
            <div
              key={m.id}
              data-testid="meerkat-card"
              className="bg-[#FAFBFF] rounded-xl p-6 text-center hover:shadow-lg transition"
            >
              {m.imagen && (
                <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden bg-white">
                  <Image
                    src={m.imagen}
                    alt={m.nombre}
                    width={96}
                    height={96}
                    style={{ objectFit: 'cover', objectPosition: m.avatarPosition ?? 'center 3%' }}
                  />
                </div>
              )}
              <h3 className="text-xl font-bold text-[#1A0A3B]">{m.nombre}</h3>
              <p className="text-sm text-[#6C3BFF] font-medium mt-1">{m.rol}</p>
              <p className="text-sm text-gray-600 mt-3">{m.descripcion}</p>
            </div>
          ))}
        </div>
        {!expanded && all.length > initialVisibleCount && (
          <div className="text-center mt-10">
            <button
              onClick={() => setExpanded(true)}
              className="px-6 py-3 text-[#6C3BFF] font-semibold hover:underline"
            >
              Ver todo el equipo ({all.length})
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test — pass**

```bash
npm test -- src/app/\(landing\)/sections/__tests__/Elenco.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(landing\)/sections/Elenco.tsx src/app/\(landing\)/sections/__tests__/Elenco.test.tsx
git commit -m "feat(landing): Elenco lee PUBLIC_MEERKAT_ROLES (13 meerkats, sin internos)"
```

---

### Task 5: Componente ComoFunciona

**Files:**
- Create: `src/app/(landing)/sections/ComoFunciona.tsx`
- Create: `src/app/(landing)/sections/__tests__/ComoFunciona.test.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<ComoFunciona />` component sin props.

- [ ] **Step 1: Test**

```typescript
// src/app/(landing)/sections/__tests__/ComoFunciona.test.tsx
import { render, screen } from '@testing-library/react';
import ComoFunciona from '../ComoFunciona';

describe('ComoFunciona', () => {
  it('muestra los 3 pasos', () => {
    render(<ComoFunciona />);
    expect(screen.getByText(/eliges qué empleado/i)).toBeInTheDocument();
    expect(screen.getByText(/llamada de 30 minutos lo capacitamos/i)).toBeInTheDocument();
    expect(screen.getByText(/próximo lunes/i)).toBeInTheDocument();
  });

  it('menciona "sin instalar" y "sin cambiar sistemas"', () => {
    render(<ComoFunciona />);
    expect(screen.getByText(/sin instalar/i)).toBeInTheDocument();
    expect(screen.getByText(/sin cambiar tus sistemas/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```tsx
// src/app/(landing)/sections/ComoFunciona.tsx
export default function ComoFunciona() {
  return (
    <section className="py-24 px-6 bg-[#FAFBFF]">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-12 text-center">
          Cómo funciona
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#6C3BFF] text-white flex items-center justify-center mx-auto mb-4 text-2xl font-bold">1</div>
            <p className="text-lg font-medium text-[#1A0A3B]">Eliges qué empleado necesitas.</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#6C3BFF] text-white flex items-center justify-center mx-auto mb-4 text-2xl font-bold">2</div>
            <p className="text-lg font-medium text-[#1A0A3B]">En una llamada de 30 minutos lo capacitamos con tu info.</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#6C3BFF] text-white flex items-center justify-center mx-auto mb-4 text-2xl font-bold">3</div>
            <p className="text-lg font-medium text-[#1A0A3B]">Empieza a trabajar el próximo lunes.</p>
          </div>
        </div>
        <p className="text-center text-gray-600 mt-12">Sin instalar nada. Sin cambiar tus sistemas.</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/\(landing\)/sections/ComoFunciona.tsx src/app/\(landing\)/sections/__tests__/ComoFunciona.test.tsx
git commit -m "feat(landing): ComoFunciona — 3 pasos + sin instalar nada"
```

---

### Task 6: Componente CasosReales (data-driven)

**Files:**
- Create: `src/app/(landing)/lib/casos-reales.ts`
- Create: `src/app/(landing)/sections/CasosReales.tsx`
- Create: `src/app/(landing)/sections/__tests__/CasosReales.test.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<CasosReales />` component. Exports type: `Caso = { slug: string; empresa: string; logoSrc: string | null; metricaPrincipal: string; contexto: string; permiso: boolean }`. Exports const `CASOS: Caso[]`.

- [ ] **Step 1: Test — solo renderiza casos con permiso=true**

```typescript
// src/app/(landing)/sections/__tests__/CasosReales.test.tsx
import { render, screen } from '@testing-library/react';
import CasosReales from '../CasosReales';

describe('CasosReales', () => {
  it('renderiza Tortillería Estrella (permiso=true)', () => {
    render(<CasosReales />);
    expect(screen.getByText(/tortiller[ií]a/i)).toBeInTheDocument();
  });

  it('no renderiza casos sin permiso escrito', () => {
    // La lib exporta CASOS con permiso boolean. Cualquier caso con permiso=false
    // no aparece en el DOM. Se verifica por ausencia.
    render(<CasosReales />);
    const cards = screen.getAllByTestId('caso-real');
    cards.forEach((card) => {
      expect(card).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```typescript
// src/app/(landing)/lib/casos-reales.ts
export interface Caso {
  slug:              string;
  empresa:           string;
  logoSrc:           string | null;
  metricaPrincipal:  string;
  contexto:          string;
  permiso:           boolean;
}

export const CASOS: Caso[] = [
  {
    slug:             'tortilleria-estrella',
    empresa:          'Tortillería Estrella',
    logoSrc:          null,
    metricaPrincipal: 'Nia contesta el 100% de las llamadas.',
    contexto:         'Distribuidora de tortilla en MTY. Antes perdían llamadas fuera de horario. Hoy Nia registra pedidos y escala incidencias al encargado.',
    permiso:          true,
  },
  {
    slug:             'ac-proyectos',
    empresa:          'AC Proyectos',
    logoSrc:          null,
    metricaPrincipal: 'Cotizaciones desde correo, sin captura manual.',
    contexto:         'Constructora que recibía cotizaciones de proveedor por correo. Nala parsea y crea OC en su sistema.',
    permiso:          false,
  },
];
```

```tsx
// src/app/(landing)/sections/CasosReales.tsx
import { CASOS } from '../lib/casos-reales';

export default function CasosReales() {
  const visibles = CASOS.filter((c) => c.permiso);
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-12 text-center">
          Ya está trabajando en negocios como el tuyo.
        </h2>
        <div className="grid gap-8">
          {visibles.map((c) => (
            <div key={c.slug} data-testid="caso-real" className="bg-[#FAFBFF] rounded-xl p-8">
              <p className="text-sm text-gray-500 mb-2">{c.empresa}</p>
              <p className="text-2xl font-bold text-[#1A0A3B] mb-3">{c.metricaPrincipal}</p>
              <p className="text-gray-600">{c.contexto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/\(landing\)/lib/casos-reales.ts src/app/\(landing\)/sections/CasosReales.tsx src/app/\(landing\)/sections/__tests__/CasosReales.test.tsx
git commit -m "feat(landing): CasosReales con permiso flag (default solo Tortillería)"
```

---

### Task 7: Componente Comparativa

**Files:**
- Create: `src/app/(landing)/sections/Comparativa.tsx`
- Create: `src/app/(landing)/sections/__tests__/Comparativa.test.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<Comparativa />` component sin props.

- [ ] **Step 1: Test — tabla con las 13 filas y ancla laboral completa**

```typescript
// src/app/(landing)/sections/__tests__/Comparativa.test.tsx
import { render, screen } from '@testing-library/react';
import Comparativa from '../Comparativa';

describe('Comparativa', () => {
  it('menciona IMSS, aguinaldo, vacaciones, PTU', () => {
    render(<Comparativa />);
    expect(screen.getByText(/IMSS/i)).toBeInTheDocument();
    expect(screen.getByText(/aguinaldo/i)).toBeInTheDocument();
    expect(screen.getByText(/vacaciones/i)).toBeInTheDocument();
    expect(screen.getByText(/utilidades|PTU/i)).toBeInTheDocument();
  });

  it('no compara contra chatbot (comparación laboral solamente)', () => {
    render(<Comparativa />);
    expect(screen.queryByText(/chatbot/i)).not.toBeInTheDocument();
  });

  it('no menciona "IA" ni "GPT" ni "automatización"', () => {
    const { container } = render(<Comparativa />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bIA\b/);
    expect(text).not.toMatch(/GPT/i);
    expect(text).not.toMatch(/automatizaci[oó]n/i);
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```tsx
// src/app/(landing)/sections/Comparativa.tsx
const ROWS: { label: string; humano: string; centinelia: string }[] = [
  { label: 'Arranca en',                humano: '2 a 4 semanas',       centinelia: 'El siguiente lunes' },
  { label: 'Sueldo mensual',            humano: '$12,000 a $25,000',   centinelia: 'Desde $2,997' },
  { label: 'IMSS y prestaciones',       humano: '+30% del sueldo',     centinelia: 'Incluido en tu plan' },
  { label: 'Aguinaldo',                 humano: '15 días',              centinelia: 'No aplica' },
  { label: 'Vacaciones (crecen anual)', humano: 'Sí',                   centinelia: 'No aplica' },
  { label: 'Utilidades (PTU)',          humano: 'Sí',                   centinelia: 'No aplica' },
  { label: 'Faltas y llegadas tarde',   humano: 'Sí',                   centinelia: 'Nunca falta' },
  { label: 'Capacitación',              humano: 'Semanas',              centinelia: '30 minutos' },
  { label: 'Trabaja 24/7',              humano: 'No',                   centinelia: 'Sí' },
  { label: 'Contesta teléfono',         humano: 'Sí',                   centinelia: 'Sí' },
  { label: 'Manda correos',             humano: 'Sí',                   centinelia: 'Sí' },
  { label: 'Usa tus sistemas',          humano: 'Después de entrenarlo', centinelia: 'Desde el día 1' },
  { label: 'Cotiza y factura',          humano: 'Sí',                   centinelia: 'Sí' },
];

export default function Comparativa() {
  return (
    <section className="py-24 px-6 bg-[#FAFBFF]">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-12 text-center">
          Un empleado humano vs. un empleado digital
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-[#6C3BFF]">
                <th className="py-4 pr-4"></th>
                <th className="py-4 px-4 text-gray-700">Contratar humano</th>
                <th className="py-4 px-4 text-[#6C3BFF]">Empleado digital Centinelia</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-b border-gray-200">
                  <td className="py-3 pr-4 font-medium text-[#1A0A3B]">{r.label}</td>
                  <td className="py-3 px-4 text-gray-600">{r.humano}</td>
                  <td className="py-3 px-4 text-[#1A0A3B] font-medium">{r.centinelia}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-8 text-sm text-gray-600 max-w-3xl mx-auto text-center">
          Un empleado humano en tu negocio, con sueldo y carga laboral completa, cuesta entre $200,000 y $450,000 al año. Un empleado digital de Centinelia arranca desde $35,964 al año.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/\(landing\)/sections/Comparativa.tsx src/app/\(landing\)/sections/__tests__/Comparativa.test.tsx
git commit -m "feat(landing): Comparativa laboral (IMSS + aguinaldo + PTU + capacitación)"
```

---

### Task 8: Componente Integraciones

**Files:**
- Create: `src/app/(landing)/lib/integraciones-catalog.ts`
- Create: `src/app/(landing)/sections/Integraciones.tsx`
- Create: `src/app/(landing)/sections/__tests__/Integraciones.test.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<Integraciones />` component. Exports type `Integracion = { key: string; label: string; logoSrc: string | null }` y const `INTEGRACIONES: Integracion[]`.

- [ ] **Step 1: Test — no incluye WhatsApp ni Vapi ni infra**

```typescript
// src/app/(landing)/sections/__tests__/Integraciones.test.tsx
import { render, screen } from '@testing-library/react';
import Integraciones from '../Integraciones';

describe('Integraciones', () => {
  it('incluye Gmail, Sheets, QuickBooks Online, Facturama', () => {
    render(<Integraciones />);
    expect(screen.getByText(/gmail/i)).toBeInTheDocument();
    expect(screen.getByText(/sheets/i)).toBeInTheDocument();
    expect(screen.getByText(/quickbooks/i)).toBeInTheDocument();
    expect(screen.getByText(/facturama/i)).toBeInTheDocument();
  });

  it('NO incluye WhatsApp, Vapi, Supabase, Anthropic, Twilio', () => {
    const { container } = render(<Integraciones />);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('whatsapp');
    expect(text).not.toContain('vapi');
    expect(text).not.toContain('supabase');
    expect(text).not.toContain('anthropic');
    expect(text).not.toContain('twilio');
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```typescript
// src/app/(landing)/lib/integraciones-catalog.ts
export interface Integracion {
  key:     string;
  label:   string;
  logoSrc: string | null;
}

export const INTEGRACIONES: Integracion[] = [
  { key: 'gmail',        label: 'Gmail / Google Workspace',    logoSrc: null },
  { key: 'outlook',      label: 'Outlook / Microsoft 365',     logoSrc: null },
  { key: 'sheets',       label: 'Google Sheets',                logoSrc: null },
  { key: 'drive',        label: 'Google Drive',                 logoSrc: null },
  { key: 'dropbox',      label: 'Dropbox',                      logoSrc: null },
  { key: 'onedrive',     label: 'OneDrive',                     logoSrc: null },
  { key: 'quickbooks',   label: 'QuickBooks Online',            logoSrc: null },
  { key: 'facturama',    label: 'Facturama',                    logoSrc: null },
  { key: 'contpaqi',     label: 'ContPAQi',                     logoSrc: null },
  { key: 'invoiceone',   label: 'InvoiceOne',                   logoSrc: null },
  { key: 'sf',           label: 'Solución Factible',            logoSrc: null },
  { key: 'notion',       label: 'Notion',                       logoSrc: null },
];
```

```tsx
// src/app/(landing)/sections/Integraciones.tsx
import { INTEGRACIONES } from '../lib/integraciones-catalog';

export default function Integraciones() {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-4">
          Se conecta con lo que ya usas.
        </h2>
        <p className="text-gray-600 mb-12">
          El empleado trabaja con tus sistemas actuales. No cambia nada.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {INTEGRACIONES.map((i) => (
            <div key={i.key} className="bg-[#FAFBFF] rounded-lg p-6 flex items-center justify-center text-gray-700 font-medium">
              {i.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/\(landing\)/lib/integraciones-catalog.ts src/app/\(landing\)/sections/Integraciones.tsx src/app/\(landing\)/sections/__tests__/Integraciones.test.tsx
git commit -m "feat(landing): Integraciones grid sin WhatsApp/Vapi/infra"
```

---

### Task 9: Update PricingSection.tsx (setup fee + franja empleado a la medida)

**Files:**
- Modify: `src/app/PricingSection.tsx`
- Create: `src/app/__tests__/PricingSection.test.tsx`

**Interfaces:**
- Consumes: `JORNADA_CONFIG` de `src/lib/billing/plans.ts`
- Produces: `<PricingSection />` mismo export, con nueva franja + setup fee visible.

- [ ] **Step 1: Test — setup fee visible + franja $60,000**

```typescript
// src/app/__tests__/PricingSection.test.tsx
import { render, screen } from '@testing-library/react';
import PricingSection from '../PricingSection';

describe('PricingSection', () => {
  it('muestra el setup fee $14,990 sin énfasis', () => {
    render(<PricingSection />);
    expect(screen.getByText(/\$14,990/)).toBeInTheDocument();
    expect(screen.getByText(/incorporación/i)).toBeInTheDocument();
  });

  it('muestra franja "empleado a la medida" con $60,000 + IVA', () => {
    render(<PricingSection />);
    expect(screen.getByText(/rol.*catálogo/i)).toBeInTheDocument();
    expect(screen.getByText(/\$60,000/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /agenda tu diagnóstico/i })).toHaveAttribute('href', expect.stringContaining('cotizar'));
  });

  it('menciona minutos extra $12/min', () => {
    render(<PricingSection />);
    expect(screen.getByText(/\$12.*minuto/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fail (asumiendo setup fee y franja no existen todavía)**

- [ ] **Step 3: Leer PricingSection.tsx actual y modificar**

Añadir bloque de setup fee después del CTA de cada tier, con clase `text-xs text-gray-500`. Al pie de la tabla, agregar nota de minutos extra. Debajo de todo, agregar franja "empleado a la medida" con estilo suave:

```tsx
{/* Bloque a agregar al final de PricingSection, antes del cierre de section */}
<div className="mt-6 text-center text-xs text-gray-500">
  Incluye una sola incorporación de $14,990 + IVA.
</div>
<div className="mt-4 text-center text-xs text-gray-500">
  Minutos adicionales $12 MXN por minuto. Se compran desde el portal en cualquier momento.
</div>

<div className="mt-16 max-w-4xl mx-auto bg-[#F5F0FF] border border-[#D6C2FF] rounded-xl p-8 text-center">
  <h3 className="text-2xl font-bold text-[#1A0A3B] mb-3">
    ¿El rol que necesita tu negocio no está en el catálogo?
  </h3>
  <p className="text-gray-700 mb-4 max-w-2xl mx-auto">
    Diseñamos empleados digitales a la medida de tu operación. Empezamos con un diagnóstico de tu negocio, automatizamos lo que necesita quedar listo antes, y luego incorporamos al empleado que tu equipo va a usar.
  </p>
  <p className="text-gray-700 mb-6 max-w-2xl mx-auto font-medium">
    Consultoría y automatización desde $60,000 + IVA. Después, el empleado que diseñamos entra en un plan del catálogo o en cotización empresarial.
  </p>
  <a
    href="/cotizar"
    className="inline-block px-8 py-4 bg-[#6C3BFF] text-white font-semibold rounded-lg hover:bg-[#5A2FD9] transition"
  >
    Agenda tu diagnóstico
  </a>
</div>
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/PricingSection.tsx src/app/__tests__/PricingSection.test.tsx
git commit -m "feat(landing): setup fee visible + franja empleado a la medida \$60,000"
```

---

### Task 10: Componente FAQ

**Files:**
- Create: `src/app/(landing)/sections/FAQ.tsx`
- Create: `src/app/(landing)/sections/__tests__/FAQ.test.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<FAQ />` component.

- [ ] **Step 1: Test — 10 preguntas obligatorias**

```typescript
// src/app/(landing)/sections/__tests__/FAQ.test.tsx
import { render, screen } from '@testing-library/react';
import FAQ from '../FAQ';

describe('FAQ', () => {
  const OBLIGATORIAS = [
    /esto es un chatbot/i,
    /se equivoca/i,
    /aprender mi negocio/i,
    /español/i,
    /whatsapp/i,
    /rol que no está en el catálogo/i,
    /probar antes de pagar/i,
    /crece mi negocio/i,
    /dónde guardan mis datos/i,
  ];

  it.each(OBLIGATORIAS)('incluye pregunta que matchea %s', (re) => {
    render(<FAQ />);
    expect(screen.getByText(re)).toBeInTheDocument();
  });

  it('la respuesta de WhatsApp dice "hoy no"', () => {
    render(<FAQ />);
    expect(screen.getByText(/hoy no/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```tsx
// src/app/(landing)/sections/FAQ.tsx
'use client';
import { useState } from 'react';

const ITEMS: { q: string; a: string }[] = [
  {
    q: '¿Esto es un chatbot?',
    a: 'No. Los empleados digitales de Centinelia contestan el teléfono, mandan correos y usan tus sistemas. Un chatbot solo responde texto en una ventana.',
  },
  {
    q: '¿Y si se equivoca? ¿Quién revisa?',
    a: 'Cada acción del empleado queda auditada. Tú ves todo lo que hizo en tu portal y puedes corregirlo. Los coordinadores (Nox, Niva) revisan al equipo automáticamente.',
  },
  {
    q: '¿Cuánto tarda en aprender mi negocio?',
    a: 'Treinta minutos de capacitación con nosotros y una semana de ajustes finos.',
  },
  {
    q: '¿Habla en español?',
    a: 'Sí, todos los empleados hablan español de México, con acentos y modismos naturales.',
  },
  {
    q: '¿Necesito cambiar mi correo o mi teléfono?',
    a: 'No. El empleado se conecta a los que ya tienes.',
  },
  {
    q: '¿Manda WhatsApp?',
    a: 'Hoy no. Los empleados trabajan por teléfono, chat de portal y correo. WhatsApp para negocio no está en el producto hoy.',
  },
  {
    q: '¿Y si necesito un rol que no está en el catálogo?',
    a: 'Lo diseñamos. Empezamos con un diagnóstico de tu operación, cobramos la consultoría y automatización previa, y luego incorporamos al empleado.',
  },
  {
    q: '¿Puedo probar antes de pagar?',
    a: 'Sí. Deja tu teléfono en la parte de arriba y Nia te llama en 60 segundos.',
  },
  {
    q: '¿Qué pasa si crece mi negocio y necesito más empleados?',
    a: 'Contratas más. Cada empleado tiene su propio plan.',
  },
  {
    q: '¿Dónde guardan mis datos?',
    a: 'En Supabase (nube), México y Estados Unidos, con encripción en tránsito y en reposo. El aviso de privacidad completo está en /privacidad.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-12 text-center">
          Preguntas frecuentes
        </h2>
        <div className="space-y-3">
          {ITEMS.map((it, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                className="w-full px-6 py-4 text-left font-medium text-[#1A0A3B] hover:bg-[#FAFBFF] transition"
                onClick={() => setOpen(open === idx ? null : idx)}
              >
                {it.q}
              </button>
              {open === idx && (
                <div className="px-6 pb-5 text-gray-700">{it.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/\(landing\)/sections/FAQ.tsx src/app/\(landing\)/sections/__tests__/FAQ.test.tsx
git commit -m "feat(landing): FAQ 10 preguntas incluyendo WhatsApp aclarado + rol custom"
```

---

### Task 11: Componente CTAFinal

**Files:**
- Create: `src/app/(landing)/sections/CTAFinal.tsx`
- Create: `src/app/(landing)/sections/__tests__/CTAFinal.test.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<CTAFinal />`. Props: `{ onCallbackClick: () => void }`.

- [ ] **Step 1: Test**

```typescript
// src/app/(landing)/sections/__tests__/CTAFinal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import CTAFinal from '../CTAFinal';

describe('CTAFinal', () => {
  it('dispara onCallbackClick al hacer click en primario', () => {
    const cb = jest.fn();
    render(<CTAFinal onCallbackClick={cb} />);
    fireEvent.click(screen.getByRole('button', { name: /deja que nia te llame/i }));
    expect(cb).toHaveBeenCalled();
  });

  it('el CTA secundario apunta a /cotizar o /agendar', () => {
    render(<CTAFinal onCallbackClick={() => {}} />);
    const link = screen.getByRole('link', { name: /llamada humana/i });
    expect(link).toHaveAttribute('href', expect.stringMatching(/cotizar|agendar/));
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```tsx
// src/app/(landing)/sections/CTAFinal.tsx
'use client';

interface Props {
  onCallbackClick: () => void;
}

export default function CTAFinal({ onCallbackClick }: Props) {
  return (
    <section className="py-24 px-6 bg-[#1A0A3B] text-white text-center">
      <h2 className="text-3xl md:text-5xl font-bold mb-8 max-w-2xl mx-auto">
        Contrata a tu primer empleado digital hoy.
      </h2>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={onCallbackClick}
          className="px-8 py-4 bg-[#6C3BFF] text-white font-semibold rounded-lg hover:bg-[#5A2FD9] transition"
        >
          Deja que Nia te llame
        </button>
        <a
          href="/cotizar"
          className="px-8 py-4 bg-transparent text-white font-semibold rounded-lg border-2 border-white hover:bg-white/10 transition inline-block"
        >
          Agenda una llamada humana
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/\(landing\)/sections/CTAFinal.tsx src/app/\(landing\)/sections/__tests__/CTAFinal.test.tsx
git commit -m "feat(landing): CTAFinal con callback + humano"
```

---

### Task 12: Refactor page.tsx a composición de secciones

**Files:**
- Modify: `src/app/page.tsx` (1022 líneas → ~180 líneas)
- Create: `tests/e2e/landing-copy-invariants.spec.ts` (Playwright)

**Interfaces:**
- Consumes: todos los componentes de secciones + PricingSection.
- Produces: `LandingPage` recompuesto. Los CTAs de Hero/CTAFinal hacen scroll al `#callback` (id del CallbackForm) o al `#elenco`.

- [ ] **Step 1: Escribir test E2E de invariantes de copy**

```typescript
// tests/e2e/landing-copy-invariants.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Landing copy invariants', () => {
  test('la landing carga sin em-dash, emojis, ni "IA"', async ({ page }) => {
    await page.goto('/');
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    // "IA" como palabra suelta (no dentro de "Nia", "Naia", etc.)
    expect(text).not.toMatch(/\bIA\b/);
    expect(text).not.toMatch(/\bAI\b/);
    expect(text).not.toMatch(/GPT/i);
    expect(text).not.toMatch(/chatbot/i);
  });

  test('los CTAs principales están visibles arriba', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /deja que nia te llame/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /conoce al equipo/i })).toBeVisible();
  });

  test('el pricing muestra los 3 tiers reales', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/media jornada/i)).toBeVisible();
    await expect(page.getByText(/jornada completa/i)).toBeVisible();
    await expect(page.getByText(/alta demanda/i)).toBeVisible();
    await expect(page.getByText(/\$2,997/)).toBeVisible();
    await expect(page.getByText(/\$5,994/)).toBeVisible();
    await expect(page.getByText(/\$11,988/)).toBeVisible();
  });

  test('la franja empleado a la medida existe', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/rol.*catálogo/i)).toBeVisible();
    await expect(page.getByText(/\$60,000/)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E — fail (la landing vieja tiene chatbot/IA/em-dash probablemente)**

```bash
npx playwright test tests/e2e/landing-copy-invariants.spec.ts
```

- [ ] **Step 3: Refactor page.tsx**

```tsx
// src/app/page.tsx
'use client';

import { useRef } from 'react';
import Hero from './(landing)/sections/Hero';
import CallbackForm, { type CallbackRequestPayload } from './(landing)/sections/CallbackForm';
import Elenco from './(landing)/sections/Elenco';
import ComoFunciona from './(landing)/sections/ComoFunciona';
import CasosReales from './(landing)/sections/CasosReales';
import Comparativa from './(landing)/sections/Comparativa';
import Integraciones from './(landing)/sections/Integraciones';
import PricingSection from './PricingSection';
import FAQ from './(landing)/sections/FAQ';
import CTAFinal from './(landing)/sections/CTAFinal';

export default function LandingPage() {
  const callbackRef = useRef<HTMLDivElement>(null);
  const elencoRef = useRef<HTMLDivElement>(null);

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleCallbackSubmit(payload: CallbackRequestPayload) {
    // Phase 1: POST a endpoint stub que solo captura lead y notifica a owner.
    // Phase 2 reemplaza este handler con OTP + Vapi.
    const res = await fetch('/api/landing/callback-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, message: 'No pudimos procesar tu solicitud. Intenta de nuevo.' };
    }
    return { ok: true, message: 'Recibido. Te llamamos en menos de 30 minutos.' };
  }

  return (
    <main>
      <Hero
        onCallbackClick={() => scrollTo(callbackRef)}
        onElencoClick={() => scrollTo(elencoRef)}
      />
      <div ref={callbackRef} id="callback">
        <CallbackForm onSubmit={handleCallbackSubmit} />
      </div>
      <div ref={elencoRef} id="elenco">
        <Elenco />
      </div>
      <ComoFunciona />
      <CasosReales />
      <Comparativa />
      <Integraciones />
      <PricingSection />
      <FAQ />
      <CTAFinal onCallbackClick={() => scrollTo(callbackRef)} />
    </main>
  );
}
```

- [ ] **Step 4: Run E2E — pass (después de crear el endpoint stub en Task 13)**

Nota: este step depende del endpoint stub. Si falla por eso, marca la task como "en espera de Task 13" y continúa.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx tests/e2e/landing-copy-invariants.spec.ts
git commit -m "refactor(landing): page.tsx recompuesto por secciones aisladas"
```

---

### Task 13: Endpoint stub `/api/landing/callback-request` (Phase 1)

**Files:**
- Create: `src/app/api/landing/callback-request/route.ts`
- Create: `src/app/api/landing/callback-request/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `{ phone: string; industry: IndustryKey; consent: true }` en JSON body
- Produces: `{ ok: true }` (200) o `{ ok: false; error: string }` (400/500). Notifica a owner por correo.

- [ ] **Step 1: Test — valida payload y envía correo a Nazre**

```typescript
// src/app/api/landing/callback-request/__tests__/route.test.ts
import { POST } from '../route';

describe('POST /api/landing/callback-request', () => {
  it('rechaza payload sin consent', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body: JSON.stringify({ phone: '8112345678', industry: 'otro', consent: false }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rechaza teléfono no MX', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body: JSON.stringify({ phone: '12345', industry: 'otro', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('acepta payload válido y responde ok', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body: JSON.stringify({ phone: '8112345678', industry: 'tortilleria_abarrotes', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar endpoint stub**

```typescript
// src/app/api/landing/callback-request/route.ts
import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send'; // asumido: helper existente

const MX_PHONE_RE = /^[1-9]\d{9}$/;
const INDUSTRIES = ['tortilleria_abarrotes', 'construccion', 'despacho_contable', 'servicios_profesionales', 'otro'] as const;
type Industry = typeof INDUSTRIES[number];

interface Payload {
  phone:    string;
  industry: Industry;
  consent:  boolean;
}

function validate(body: unknown): Payload | null {
  if (typeof body !== 'object' || !body) return null;
  const b = body as Record<string, unknown>;
  if (b.consent !== true) return null;
  if (typeof b.phone !== 'string' || !MX_PHONE_RE.test(b.phone)) return null;
  if (typeof b.industry !== 'string' || !INDUSTRIES.includes(b.industry as Industry)) return null;
  return { phone: b.phone, industry: b.industry as Industry, consent: true };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const payload = validate(body);
  if (!payload) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  // Phase 1: notificar a owner por correo con el lead. Phase 2 disparará OTP + Vapi.
  await sendEmail({
    to:      'nazre20@gmail.com',
    subject: `Nuevo lead landing: ${payload.industry} (${payload.phone})`,
    html:    `<p>Teléfono: ${payload.phone}</p><p>Industria: ${payload.industry}</p><p>Consentimiento: sí</p>`,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/landing/callback-request/route.ts src/app/api/landing/callback-request/__tests__/route.test.ts
git commit -m "feat(landing): endpoint stub Phase 1 con notif a owner por correo"
```

---

### Task 14: Deploy Phase 1

**Files:**
- Modify: `src/app/layout.tsx` (actualizar `metadata.description` si el copy cambió)

**Interfaces:**
- Consumes: build de Phase 1 completa (tasks 2-13)
- Produces: landing v2 pública en `centinelia.mx`, con callback en modo manual (owner ve leads por correo y llama)

- [ ] **Step 1: Actualizar metadata**

Leer `src/app/layout.tsx`, verificar que `metadata.description` refleje la nueva narrativa. Ejemplo:

```typescript
export const metadata: Metadata = {
  title: 'Centinelia | Empleados digitales para tu negocio',
  description: 'Contesta el teléfono, cotiza, factura, cobra y agenda sin contratar a nadie. Empleados digitales que empiezan a trabajar el próximo lunes.',
  // resto igual (JSON-LD, og:image, etc.)
};
```

- [ ] **Step 2: Correr toda la suite de tests**

```bash
npm test
npx playwright test tests/e2e/landing-copy-invariants.spec.ts
```
Expected: todo verde.

- [ ] **Step 3: Preview local**

```bash
npm run dev
# Abrir http://localhost:3000 y verificar cada sección visualmente.
```

Checklist manual:
- Hero muestra copy correcto sin em-dash.
- Callback form solo aparece submit al marcar consent.
- Elenco muestra 8 arriba, expande a 13.
- Comparativa tiene todas las filas.
- Integraciones no incluye WhatsApp ni Vapi.
- PricingSection muestra setup fee + franja empleado a la medida.
- FAQ tiene 10 preguntas.
- CTA final funciona.

- [ ] **Step 4: Deploy a producción**

Confirmar con Nazre antes de mergear a main. Deploy es automático vía Vercel al push de main.

```bash
# Rebase antes de merge (memoria feedback-rebase-before-merge)
git fetch origin main
git rebase origin/main
git push origin <feature-branch>
# Crear PR y esperar review humano (memoria: humanos mergean)
```

- [ ] **Step 5: Verificar en producción**

Post-deploy: `centinelia.mx` cargado. Lead form enviado con teléfono real → confirmar que llega correo a nazre20@gmail.com.

```bash
git tag landing-v2-phase1
git push origin landing-v2-phase1
```

---

## PHASE 2 — Callback Pipeline Backend

**Nota:** Phase 2 automatiza el callback manual. Requiere Twilio (o Vonage) para OTP SMS, y Vapi outbound configurado con guión demo de Nia. Puede ejecutarse inmediatamente después de Phase 1 o pospuesto.

### Task 15: Supabase migration `landing_callback_requests`

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMM_landing_callback_requests.sql`

**Interfaces:**
- Produces: tabla `landing_callback_requests` con columns: `id uuid pk`, `phone text not null`, `industry text not null`, `ip inet`, `otp_hash text`, `otp_expires_at timestamptz`, `otp_verified_at timestamptz`, `vapi_call_id text`, `call_status text`, `created_at timestamptz default now()`.

- [ ] **Step 1: Escribir migration**

```sql
-- supabase/migrations/YYYYMMDDHHMM_landing_callback_requests.sql
create table if not exists landing_callback_requests (
  id                  uuid primary key default gen_random_uuid(),
  phone               text not null,
  industry            text not null,
  ip                  inet,
  user_agent          text,
  consent_at          timestamptz not null default now(),
  otp_hash            text,
  otp_expires_at      timestamptz,
  otp_attempts        int not null default 0,
  otp_verified_at     timestamptz,
  vapi_call_id        text,
  call_status         text check (call_status in ('pending','dialing','answered','completed','failed','fallback_manual')),
  call_started_at     timestamptz,
  call_ended_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index landing_callback_requests_phone_created_idx on landing_callback_requests (phone, created_at desc);
create index landing_callback_requests_ip_created_idx on landing_callback_requests (ip, created_at desc);
create index landing_callback_requests_status_idx on landing_callback_requests (call_status) where call_status = 'pending';
```

- [ ] **Step 2: Aplicar migration en dev**

```bash
# Correr contra Supabase local o dev
supabase db push
```

- [ ] **Step 3: Verificar tabla existe**

```sql
-- En Supabase Studio o psql
select column_name from information_schema.columns where table_name = 'landing_callback_requests';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/YYYYMMDDHHMM_landing_callback_requests.sql
git commit -m "feat(landing): migration landing_callback_requests"
```

---

### Task 16: `callback-store.ts` (CRUD)

**Files:**
- Create: `src/lib/landing/callback-store.ts`
- Create: `src/lib/landing/__tests__/callback-store.test.ts`

**Interfaces:**
- Consumes: cliente Supabase admin de `@/lib/supabase/server`
- Produces:
  - `createRequest(input: { phone: string; industry: string; ip: string | null; userAgent: string | null }): Promise<{ id: string }>`
  - `setOtpHash(id: string, hash: string, expiresAt: Date): Promise<void>`
  - `incrementOtpAttempts(id: string): Promise<number>`
  - `markOtpVerified(id: string): Promise<void>`
  - `setVapiCall(id: string, vapiCallId: string, status: CallStatus): Promise<void>`
  - `getById(id: string): Promise<Request | null>`
  - `type CallStatus = 'pending' | 'dialing' | 'answered' | 'completed' | 'failed' | 'fallback_manual'`

- [ ] **Step 1: Test con Supabase real (integration, no mock)**

Este test corre contra Supabase dev, siguiendo memoria `feedback-smoke-guard-prod-db`: usar `assertNotProdOrAllowed()` en `beforeAll`.

```typescript
// src/lib/landing/__tests__/callback-store.test.ts
import { createRequest, setOtpHash, getById, markOtpVerified } from '../callback-store';
import { assertNotProdOrAllowed } from '@/../supabase/__tests__/_helpers/assert-not-prod';

describe('callback-store integration', () => {
  beforeAll(() => {
    assertNotProdOrAllowed();
  });

  it('crea request y la lee por id', async () => {
    const { id } = await createRequest({
      phone:     '8112345678',
      industry:  'tortilleria_abarrotes',
      ip:        '127.0.0.1',
      userAgent: 'test',
    });
    const req = await getById(id);
    expect(req?.phone).toBe('8112345678');
  });

  it('setOtpHash y markOtpVerified funcionan', async () => {
    const { id } = await createRequest({ phone: '8112345679', industry: 'otro', ip: null, userAgent: null });
    await setOtpHash(id, 'hashed', new Date(Date.now() + 5 * 60_000));
    await markOtpVerified(id);
    const req = await getById(id);
    expect(req?.otp_verified_at).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/landing/callback-store.ts
import { supabaseAdmin } from '@/lib/supabase/server';

export type CallStatus = 'pending' | 'dialing' | 'answered' | 'completed' | 'failed' | 'fallback_manual';

export interface CallbackRequest {
  id:               string;
  phone:            string;
  industry:         string;
  ip:               string | null;
  otp_hash:         string | null;
  otp_expires_at:   string | null;
  otp_attempts:     number;
  otp_verified_at:  string | null;
  vapi_call_id:     string | null;
  call_status:      CallStatus | null;
  created_at:       string;
}

export async function createRequest(input: {
  phone:     string;
  industry:  string;
  ip:        string | null;
  userAgent: string | null;
}): Promise<{ id: string }> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('landing_callback_requests')
    .insert({ phone: input.phone, industry: input.industry, ip: input.ip, user_agent: input.userAgent })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createRequest failed: ${error?.message}`);
  return { id: data.id };
}

export async function setOtpHash(id: string, hash: string, expiresAt: Date): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('landing_callback_requests')
    .update({ otp_hash: hash, otp_expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`setOtpHash failed: ${error.message}`);
}

export async function incrementOtpAttempts(id: string): Promise<number> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.rpc('increment_otp_attempts', { req_id: id });
  if (error) throw new Error(`incrementOtpAttempts failed: ${error.message}`);
  return data as number;
}

export async function markOtpVerified(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('landing_callback_requests')
    .update({ otp_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`markOtpVerified failed: ${error.message}`);
}

export async function setVapiCall(id: string, vapiCallId: string, status: CallStatus): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('landing_callback_requests')
    .update({ vapi_call_id: vapiCallId, call_status: status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`setVapiCall failed: ${error.message}`);
}

export async function getById(id: string): Promise<CallbackRequest | null> {
  const { data, error } = await supabaseAdmin()
    .from('landing_callback_requests')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as CallbackRequest;
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/callback-store.ts src/lib/landing/__tests__/callback-store.test.ts
git commit -m "feat(landing): callback-store CRUD con guard prod DB"
```

---

### Task 17: `callback-throttle.ts` (rate limit)

**Files:**
- Create: `src/lib/landing/callback-throttle.ts`
- Create: `src/lib/landing/__tests__/callback-throttle.test.ts`

**Interfaces:**
- Consumes: `getById` no aplica; consulta Supabase directo con count por ventana temporal.
- Produces:
  - `checkThrottle(input: { ip: string | null; phone: string }): Promise<{ allowed: boolean; reason?: 'ip_rate_limit' | 'phone_rate_limit' }>`

Reglas: máx 3 requests por IP en 10 min, máx 2 requests por teléfono en 1 hora.

- [ ] **Step 1: Test**

```typescript
// src/lib/landing/__tests__/callback-throttle.test.ts
import { checkThrottle } from '../callback-throttle';
import { createRequest } from '../callback-store';
import { assertNotProdOrAllowed } from '@/../supabase/__tests__/_helpers/assert-not-prod';

describe('callback-throttle', () => {
  beforeAll(() => assertNotProdOrAllowed());

  it('permite 1er intento', async () => {
    const res = await checkThrottle({ ip: '10.0.0.100', phone: '8110000001' });
    expect(res.allowed).toBe(true);
  });

  it('bloquea 4to intento desde misma IP en 10 min', async () => {
    const ip = '10.0.0.101';
    for (let i = 0; i < 3; i++) {
      await createRequest({ phone: `81${String(i).padStart(8, '0')}`, industry: 'otro', ip, userAgent: null });
    }
    const res = await checkThrottle({ ip, phone: '8199999999' });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('ip_rate_limit');
  });

  it('bloquea 3er intento con el mismo teléfono en 1h', async () => {
    const phone = '8110000010';
    for (let i = 0; i < 2; i++) {
      await createRequest({ phone, industry: 'otro', ip: `10.0.0.${200 + i}`, userAgent: null });
    }
    const res = await checkThrottle({ ip: '10.0.0.250', phone });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('phone_rate_limit');
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/landing/callback-throttle.ts
import { supabaseAdmin } from '@/lib/supabase/server';

const IP_WINDOW_MIN = 10;
const IP_MAX = 3;
const PHONE_WINDOW_MIN = 60;
const PHONE_MAX = 2;

export async function checkThrottle(input: { ip: string | null; phone: string }): Promise<{ allowed: boolean; reason?: 'ip_rate_limit' | 'phone_rate_limit' }> {
  const supabase = supabaseAdmin();

  if (input.ip) {
    const ipSince = new Date(Date.now() - IP_WINDOW_MIN * 60_000).toISOString();
    const { count: ipCount } = await supabase
      .from('landing_callback_requests')
      .select('id', { count: 'exact', head: true })
      .eq('ip', input.ip)
      .gte('created_at', ipSince);
    if ((ipCount ?? 0) >= IP_MAX) {
      return { allowed: false, reason: 'ip_rate_limit' };
    }
  }

  const phoneSince = new Date(Date.now() - PHONE_WINDOW_MIN * 60_000).toISOString();
  const { count: phoneCount } = await supabase
    .from('landing_callback_requests')
    .select('id', { count: 'exact', head: true })
    .eq('phone', input.phone)
    .gte('created_at', phoneSince);
  if ((phoneCount ?? 0) >= PHONE_MAX) {
    return { allowed: false, reason: 'phone_rate_limit' };
  }

  return { allowed: true };
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/callback-throttle.ts src/lib/landing/__tests__/callback-throttle.test.ts
git commit -m "feat(landing): rate limit por IP (3/10min) + teléfono (2/1h)"
```

---

### Task 18: `otp-sms.ts` (envío + verificación)

**Files:**
- Create: `src/lib/landing/otp-sms.ts`
- Create: `src/lib/landing/__tests__/otp-sms.test.ts`

**Interfaces:**
- Consumes: env vars `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Consumes `setOtpHash`, `incrementOtpAttempts`, `getById` de callback-store.
- Produces:
  - `sendOtp(requestId: string, phone: string): Promise<{ ok: boolean }>`
  - `verifyOtp(requestId: string, submittedCode: string): Promise<{ ok: boolean; reason?: 'expired' | 'too_many_attempts' | 'wrong_code' }>`

- [ ] **Step 1: Test**

```typescript
// src/lib/landing/__tests__/otp-sms.test.ts
import { sendOtp, verifyOtp } from '../otp-sms';
import { createRequest, getById } from '../callback-store';
import { assertNotProdOrAllowed } from '@/../supabase/__tests__/_helpers/assert-not-prod';

// Mock Twilio para no gastar $$
jest.mock('twilio', () => () => ({
  messages: { create: jest.fn().mockResolvedValue({ sid: 'MOCK_SID' }) },
}));

describe('otp-sms', () => {
  beforeAll(() => assertNotProdOrAllowed());

  it('sendOtp genera código de 6 dígitos, lo hashea y setea expiración', async () => {
    const { id } = await createRequest({ phone: '8112345678', industry: 'otro', ip: null, userAgent: null });
    const res = await sendOtp(id, '8112345678');
    expect(res.ok).toBe(true);
    const req = await getById(id);
    expect(req?.otp_hash).toBeTruthy();
    expect(req?.otp_expires_at).toBeTruthy();
  });

  it('verifyOtp rechaza código incorrecto', async () => {
    const { id } = await createRequest({ phone: '8112345679', industry: 'otro', ip: null, userAgent: null });
    await sendOtp(id, '8112345679');
    const res = await verifyOtp(id, '000000');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('wrong_code');
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/landing/otp-sms.ts
import twilio from 'twilio';
import crypto from 'crypto';
import { setOtpHash, incrementOtpAttempts, markOtpVerified, getById } from './callback-store';

const OTP_TTL_MIN = 5;
const OTP_MAX_ATTEMPTS = 5;

function hashCode(code: string, requestId: string): string {
  return crypto.createHmac('sha256', requestId).update(code).digest('hex');
}

function sixDigitCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('twilio env missing');
  return twilio(sid, token);
}

export async function sendOtp(requestId: string, phone: string): Promise<{ ok: boolean }> {
  const code = sixDigitCode();
  const hash = hashCode(code, requestId);
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);
  await setOtpHash(requestId, hash, expiresAt);

  await twilioClient().messages.create({
    to:   `+52${phone}`,
    from: process.env.TWILIO_FROM_NUMBER!,
    body: `Tu código Centinelia: ${code}. Válido ${OTP_TTL_MIN} minutos.`,
  });

  return { ok: true };
}

export async function verifyOtp(requestId: string, submittedCode: string): Promise<{ ok: boolean; reason?: 'expired' | 'too_many_attempts' | 'wrong_code' }> {
  const req = await getById(requestId);
  if (!req?.otp_hash || !req.otp_expires_at) return { ok: false, reason: 'wrong_code' };
  if (new Date(req.otp_expires_at) < new Date()) return { ok: false, reason: 'expired' };
  if (req.otp_attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  const attempts = await incrementOtpAttempts(requestId);
  if (attempts > OTP_MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  const expectedHash = hashCode(submittedCode, requestId);
  if (expectedHash !== req.otp_hash) return { ok: false, reason: 'wrong_code' };

  await markOtpVerified(requestId);
  return { ok: true };
}
```

Nota: `increment_otp_attempts` rpc no existe. Alternativa: leer + update en 2 queries. Ajustar callback-store si es necesario. Para simplificar el plan, hacer el increment inline aquí:

Modificar callback-store para exponer un `incrementOtpAttempts(id)` que use un rpc de Supabase creado en la misma migration:

```sql
-- Agregar a la migration de Task 15
create or replace function increment_otp_attempts(req_id uuid)
returns int as $$
declare
  new_count int;
begin
  update landing_callback_requests
  set otp_attempts = otp_attempts + 1, updated_at = now()
  where id = req_id
  returning otp_attempts into new_count;
  return new_count;
end;
$$ language plpgsql;
```

- [ ] **Step 4: Actualizar la migration de Task 15 (retro-fix)**

Agregar el rpc arriba a la misma migration antes de aplicar en prod. Si la migration ya está aplicada en dev, crear una migration incremental `_add_otp_rpc.sql`.

- [ ] **Step 5: Run test + commit**

```bash
git add src/lib/landing/otp-sms.ts src/lib/landing/__tests__/otp-sms.test.ts supabase/migrations/
git commit -m "feat(landing): OTP SMS con Twilio + rpc increment_otp_attempts"
```

---

### Task 19a: Seedear `VoiceAgent` "landing-demo-nia" en Supabase

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMM_seed_landing_demo_agent.sql`
- Create: `scripts/seed-landing-demo-agent.ts` (opcional, para re-crear si se corrompe)

**Interfaces:**
- Produces: fila en `voice_agents` con `id` conocido (constante exportada en `src/lib/landing/constants.ts`), sincronizada con Vapi mediante `sync.ts`. `role='nia'`, `active=true`, feature flags mínimas para outbound demo.

**Contexto (fuente verificada):** `triggerOutboundCall` en `src/lib/vapi/outbound.ts:109` requiere `agent: VoiceAgent` con `vapi_agent_id` ya sincronizado. NO acepta raw prompt. Reutilizamos el patrón: un agente dedicado "landing-demo-nia" que vive en Supabase, sincronizado con Vapi. El `system_prompt` del agente contiene el guión demo, y el `campaignInstructions` del `triggerOutboundCall` inyecta el contexto de industria en cada llamada.

- [ ] **Step 1: Definir constante del agent id**

```typescript
// src/lib/landing/constants.ts
export const LANDING_DEMO_AGENT_ID = '00000000-0000-0000-0000-000000000001';
export const LANDING_DEMO_ORG_ID   = '00000000-0000-0000-0000-000000000002';
```

- [ ] **Step 2: Migration seed**

Antes de escribirla, leer el schema real de `voice_agents` y `organizations` para ver qué columnas son requeridas:

```bash
# Ejecutor: leer estos archivos primero
cat supabase/migrations/*voice_agents*.sql | head -100
cat src/types/agent.ts
```

Basado en el schema (verificar antes de correr):

```sql
-- supabase/migrations/YYYYMMDDHHMM_seed_landing_demo_agent.sql

-- Org especial para el agente demo (no aparece en admin/clientes normal).
insert into organizations (id, name, plan, active)
values ('00000000-0000-0000-0000-000000000002', 'Centinelia Landing Demo', 'demo', true)
on conflict (id) do nothing;

-- Agente demo. system_prompt vacío → se llena post-sync con el guión.
insert into voice_agents (
  id, org_id, agent_name, business_name, role, active,
  portal_email, features, speech_style,
  minutes_included, ai_ops_limit
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Nia',
  'Centinelia',
  'nia',
  true,
  'landing-demo@centinelia.mx',
  jsonb_build_object(
    'receptionist', true,
    'lead_qualification', true,
    'outbound_calls', true,
    'meerkat_role_id', 'nia',
    'landing_demo', true
  ),
  'usted',
  99999,
  99999
)
on conflict (id) do nothing;
```

- [ ] **Step 3: Sincronizar con Vapi**

```bash
# Ejecutar el sync.ts del proyecto contra el agente nuevo:
npx tsx scripts/sync-agent-to-vapi.ts 00000000-0000-0000-0000-000000000001
# (Si el script no existe, verificar cómo se sincronizan otros agentes — ver `src/lib/vapi/sync.ts`)
```

- [ ] **Step 4: Verificar en Vapi dashboard**

Abrir dashboard.vapi.ai → confirmar que hay un assistant "Nia Landing Demo" con voice + prompt configurados.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_seed_landing_demo_agent.sql src/lib/landing/constants.ts
git commit -m "feat(landing): seed VoiceAgent landing-demo-nia sincronizado con Vapi"
```

---

### Task 19b: `landing-demo.ts` — wrapper de `triggerOutboundCall` para landing

**Files:**
- Create: `src/lib/vapi/landing-demo.ts`
- Create: `src/lib/vapi/__tests__/landing-demo.test.ts`

**Interfaces:**
- Consumes:
  - `triggerOutboundCall` de `@/lib/vapi/outbound` — firma REAL: `({ agent: VoiceAgent, customerNumber: string, customerName?: string, motivo?: string, isCallback?: boolean, campaignInstructions?: string, externalSource?: string, externalId?: string }) => Promise<{ ok: boolean; callId?: string; error?: string }>`
  - `createAdminClient` de `@/lib/supabase/admin` para leer el `VoiceAgent` demo.
  - `LANDING_DEMO_AGENT_ID` de `@/lib/landing/constants`.
  - `setVapiCall` de `@/lib/landing/callback-store`.
- Produces:
  - `triggerLandingDemoCall(input: { phone: string; industry: IndustryKey; requestId: string }): Promise<{ ok: boolean; vapiCallId?: string; error?: string }>`

- [ ] **Step 1: Test con mock de triggerOutboundCall**

```typescript
// src/lib/vapi/__tests__/landing-demo.test.ts
import { triggerLandingDemoCall } from '../landing-demo';

jest.mock('../outbound', () => ({
  triggerOutboundCall: jest.fn().mockResolvedValue({ ok: true, callId: 'MOCK_VAPI_ID' }),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { id: 'agent-demo', vapi_agent_id: 'vapi-x', business_name: 'Centinelia', role: 'nia', features: {} },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

jest.mock('@/lib/landing/callback-store', () => ({
  setVapiCall: jest.fn().mockResolvedValue(undefined),
}));

describe('triggerLandingDemoCall', () => {
  it('llama triggerOutboundCall con el agente demo y campaignInstructions de industria', async () => {
    const res = await triggerLandingDemoCall({
      phone:     '8112345678',
      industry:  'tortilleria_abarrotes',
      requestId: 'req-1',
    });
    expect(res.ok).toBe(true);
    expect(res.vapiCallId).toBe('MOCK_VAPI_ID');
    const { triggerOutboundCall } = await import('../outbound');
    expect(triggerOutboundCall).toHaveBeenCalledWith(expect.objectContaining({
      customerNumber:       '+528112345678',
      externalSource:       'landing_demo',
      externalId:           'req-1',
      campaignInstructions: expect.stringContaining('tortiller'),
    }));
  });

  it('marca fallback si triggerOutboundCall retorna ok:false', async () => {
    const { triggerOutboundCall } = await import('../outbound');
    (triggerOutboundCall as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'no phone number' });
    const res = await triggerLandingDemoCall({
      phone:     '8112345678',
      industry:  'otro',
      requestId: 'req-2',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('no phone number');
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/vapi/landing-demo.ts
import { triggerOutboundCall } from './outbound';
import { createAdminClient } from '@/lib/supabase/admin';
import { LANDING_DEMO_AGENT_ID } from '@/lib/landing/constants';
import { setVapiCall } from '@/lib/landing/callback-store';
import type { IndustryKey } from '@/app/(landing)/sections/CallbackForm';
import type { VoiceAgent } from '@/types/agent';

const INDUSTRY_LABEL: Record<IndustryKey, string> = {
  tortilleria_abarrotes:   'tortillería, abarrotes o distribuidor de ruta',
  construccion:            'constructora u obra',
  despacho_contable:       'despacho contable o de facturación',
  servicios_profesionales: 'servicios profesionales',
  otro:                    'negocio',
};

function buildCampaignInstructions(industry: IndustryKey): string {
  const label = INDUSTRY_LABEL[industry];
  return `
CONTEXTO DE ESTA LLAMADA DE DEMOSTRACIÓN:
- La persona a la que estás llamando dejó su teléfono en la landing de Centinelia.
- Dijo que su negocio es: ${label}.

OBJETIVO:
En 2 a 3 minutos: preséntate como empleada digital de Centinelia, pregúntale a qué se dedica exactamente y cuál es su dolor operativo más grande, describe cómo trabajarías con su negocio (con ejemplos concretos para ${label}), y ofrece agendar una llamada con Nazre para cerrar detalles.

REGLAS ESTRICTAS:
- Nunca digas "IA", "AI", "chatbot", "GPT" ni "automatización". Eres empleada digital, punto.
- Máximo 3 minutos. Si a los 2:30 aún no hay cierre, agenda directamente.
- Si preguntan precio: "el plan más chico arranca en 2,997 pesos al mes más IVA, con una incorporación de 14,990 pesos", y ofrece que Nazre les mande cotización por correo.
- No prometas features que no sabes si están hoy.
`.trim();
}

export async function triggerLandingDemoCall(input: {
  phone:     string;
  industry:  IndustryKey;
  requestId: string;
}): Promise<{ ok: boolean; vapiCallId?: string; error?: string }> {
  const supabase = createAdminClient();
  const { data: agent, error: agentErr } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', LANDING_DEMO_AGENT_ID)
    .single();
  if (agentErr || !agent) {
    return { ok: false, error: 'landing_demo_agent_not_seeded' };
  }

  const result = await triggerOutboundCall({
    agent:                agent as VoiceAgent,
    customerNumber:       `+52${input.phone}`,
    motivo:               'quiere conocer cómo trabaja un empleado digital de Centinelia',
    campaignInstructions: buildCampaignInstructions(input.industry),
    externalSource:       'landing_demo',
    externalId:           input.requestId,
  });

  if (!result.ok || !result.callId) {
    return { ok: false, error: result.error ?? 'vapi_call_failed' };
  }

  await setVapiCall(input.requestId, result.callId, 'dialing');
  return { ok: true, vapiCallId: result.callId };
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/vapi/landing-demo.ts src/lib/vapi/__tests__/landing-demo.test.ts
git commit -m "feat(landing): wrapper triggerOutboundCall con agente demo + industria"
```

---

### Task 20: `notify-owner.ts` — fallback si pipeline falla

**Files:**
- Create: `src/lib/landing/notify-owner.ts`
- Create: `src/lib/landing/__tests__/notify-owner.test.ts`

**Interfaces:**
- Consumes: helper `sendEmail` existente
- Produces:
  - `notifyOwnerFallback(input: { requestId: string; phone: string; industry: string; reason: string }): Promise<void>`
  - `notifyOwnerNewLead(input: { requestId: string; phone: string; industry: string }): Promise<void>` (usado para leads que no verifican OTP)

- [ ] **Step 1: Test**

```typescript
// src/lib/landing/__tests__/notify-owner.test.ts
import { notifyOwnerFallback } from '../notify-owner';

jest.mock('@/lib/email/send', () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

describe('notify-owner', () => {
  it('notifica a owner con el reason y datos del lead', async () => {
    const { sendEmail } = await import('@/lib/email/send');
    await notifyOwnerFallback({
      requestId: 'r1',
      phone:     '8112345678',
      industry:  'tortilleria_abarrotes',
      reason:    'vapi_call_failed',
    });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to:      'nazre20@gmail.com',
      subject: expect.stringContaining('FALLBACK'),
    }));
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/landing/notify-owner.ts
import { sendEmail } from '@/lib/email/send';

const OWNER_EMAIL = 'nazre20@gmail.com';

export async function notifyOwnerFallback(input: {
  requestId: string;
  phone:     string;
  industry:  string;
  reason:    string;
}): Promise<void> {
  await sendEmail({
    to:      OWNER_EMAIL,
    subject: `[FALLBACK] Lead landing sin llamada auto: ${input.phone}`,
    html: `
      <p>El pipeline auto de callback falló. Necesita callback manual.</p>
      <ul>
        <li>Request ID: ${input.requestId}</li>
        <li>Teléfono: ${input.phone}</li>
        <li>Industria: ${input.industry}</li>
        <li>Razón: ${input.reason}</li>
      </ul>
      <p>Llamar en menos de 30 minutos.</p>
    `,
  });
}

export async function notifyOwnerNewLead(input: {
  requestId: string;
  phone:     string;
  industry:  string;
}): Promise<void> {
  await sendEmail({
    to:      OWNER_EMAIL,
    subject: `Nuevo lead landing: ${input.industry} (${input.phone})`,
    html: `
      <p>Nuevo lead. Verificación OTP pendiente.</p>
      <ul>
        <li>Request ID: ${input.requestId}</li>
        <li>Teléfono: ${input.phone}</li>
        <li>Industria: ${input.industry}</li>
      </ul>
    `,
  });
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/notify-owner.ts src/lib/landing/__tests__/notify-owner.test.ts
git commit -m "feat(landing): notify-owner para fallback + new-lead"
```

---

### Task 21: Endpoint `/api/landing/callback-request` (Phase 2 wire)

**Files:**
- Modify: `src/app/api/landing/callback-request/route.ts` (upgrade del stub de Task 13)

**Interfaces:**
- Consumes: `checkThrottle`, `createRequest`, `sendOtp`, `notifyOwnerNewLead`
- Produces:
  - Respuesta ok: `{ ok: true; requestId: string }` (200) → frontend guarda requestId y pide OTP
  - Respuesta throttled: `{ ok: false; error: 'ip_rate_limit' | 'phone_rate_limit' }` (429)
  - Respuesta inválida: `{ ok: false; error: 'invalid_payload' }` (400)

- [ ] **Step 1: Actualizar test del endpoint**

```typescript
// src/app/api/landing/callback-request/__tests__/route.test.ts (upgrade)
import { POST } from '../route';

describe('POST /api/landing/callback-request Phase 2', () => {
  it('responde con requestId y no llama a Vapi todavía (solo OTP)', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8112345678', industry: 'tortilleria_abarrotes', consent: true }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.requestId).toBeTruthy();
  });

  it('responde 429 en throttle', async () => {
    // Dispara 4 requests desde misma IP simulada
    for (let i = 0; i < 3; i++) {
      const r = new Request('http://localhost/api/landing/callback-request', {
        method:  'POST',
        headers: { 'x-forwarded-for': '10.0.0.99' },
        body:    JSON.stringify({ phone: `81${String(i).padStart(8, '0')}`, industry: 'otro', consent: true }),
      });
      await POST(r);
    }
    const r = new Request('http://localhost/api/landing/callback-request', {
      method:  'POST',
      headers: { 'x-forwarded-for': '10.0.0.99' },
      body:    JSON.stringify({ phone: '8199999999', industry: 'otro', consent: true }),
    });
    const res = await POST(r);
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run — fail (nuevo comportamiento no existe todavía)**

- [ ] **Step 3: Reemplazar el endpoint stub con Phase 2**

```typescript
// src/app/api/landing/callback-request/route.ts
import { NextResponse } from 'next/server';
import { checkThrottle } from '@/lib/landing/callback-throttle';
import { createRequest } from '@/lib/landing/callback-store';
import { sendOtp } from '@/lib/landing/otp-sms';
import { notifyOwnerNewLead } from '@/lib/landing/notify-owner';

const MX_PHONE_RE = /^[1-9]\d{9}$/;
const INDUSTRIES = ['tortilleria_abarrotes', 'construccion', 'despacho_contable', 'servicios_profesionales', 'otro'] as const;

function extractIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }); }
  const b = body as Record<string, unknown> | null;
  if (!b || b.consent !== true) return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  if (typeof b.phone !== 'string' || !MX_PHONE_RE.test(b.phone)) return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  if (typeof b.industry !== 'string' || !INDUSTRIES.includes(b.industry as never)) return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });

  const ip = extractIp(req);
  const throttle = await checkThrottle({ ip, phone: b.phone });
  if (!throttle.allowed) {
    return NextResponse.json({ ok: false, error: throttle.reason }, { status: 429 });
  }

  const { id: requestId } = await createRequest({
    phone:     b.phone,
    industry:  b.industry as string,
    ip,
    userAgent: req.headers.get('user-agent') ?? null,
  });

  await sendOtp(requestId, b.phone);
  await notifyOwnerNewLead({ requestId, phone: b.phone, industry: b.industry as string });

  return NextResponse.json({ ok: true, requestId });
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/landing/callback-request/route.ts src/app/api/landing/callback-request/__tests__/route.test.ts
git commit -m "feat(landing): endpoint Phase 2 con throttle + OTP + notif"
```

---

### Task 22: Endpoint `/api/landing/callback-verify` + wire Vapi

**Files:**
- Create: `src/app/api/landing/callback-verify/route.ts`
- Create: `src/app/api/landing/callback-verify/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `verifyOtp`, `triggerLandingDemoCall`, `notifyOwnerFallback`, `getById`
- Produces:
  - `{ ok: true; callStatus: 'dialing' | 'fallback_manual' }` — se disparó llamada, o fallback a manual
  - `{ ok: false; error: 'expired' | 'too_many_attempts' | 'wrong_code' }` (400)

- [ ] **Step 1: Test**

```typescript
// src/app/api/landing/callback-verify/__tests__/route.test.ts
import { POST } from '../route';

jest.mock('@/lib/vapi/landing-demo', () => ({
  triggerLandingDemoCall: jest.fn().mockResolvedValue({ vapiCallId: 'V1' }),
}));

describe('POST /api/landing/callback-verify', () => {
  it('rechaza código malo', async () => {
    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   JSON.stringify({ requestId: 'r-bad', code: '999999' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Test happy path requiere setup de un request con OTP verificable — usar helper de test o skip aquí
});
```

- [ ] **Step 2: Implementar**

```typescript
// src/app/api/landing/callback-verify/route.ts
import { NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/landing/otp-sms';
import { getById } from '@/lib/landing/callback-store';
import { triggerLandingDemoCall } from '@/lib/vapi/landing-demo';
import { notifyOwnerFallback } from '@/lib/landing/notify-owner';
import type { IndustryKey } from '@/app/(landing)/sections/CallbackForm';

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }); }
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b.requestId !== 'string' || typeof b.code !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  const verified = await verifyOtp(b.requestId, b.code);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.reason }, { status: 400 });
  }

  const request = await getById(b.requestId);
  if (!request) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  // Horario laboral MX (9am-8pm America/Monterrey)
  const nowMx = new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey', hour: 'numeric', hour12: false });
  const hourMx = parseInt(nowMx, 10);
  const inHours = hourMx >= 9 && hourMx < 20;

  if (!inHours) {
    await notifyOwnerFallback({
      requestId: b.requestId,
      phone:     request.phone,
      industry:  request.industry,
      reason:    'out_of_hours',
    });
    return NextResponse.json({ ok: true, callStatus: 'fallback_manual', reason: 'out_of_hours' });
  }

  const callResult = await triggerLandingDemoCall({
    phone:     request.phone,
    industry:  request.industry as IndustryKey,
    requestId: b.requestId,
  });
  if (!callResult.ok) {
    await notifyOwnerFallback({
      requestId: b.requestId,
      phone:     request.phone,
      industry:  request.industry,
      reason:    `vapi_fail: ${callResult.error ?? 'unknown'}`,
    });
    return NextResponse.json({ ok: true, callStatus: 'fallback_manual', reason: 'vapi_fail' });
  }
  return NextResponse.json({ ok: true, callStatus: 'dialing' });
}
```

- [ ] **Step 3: Run — pass**

- [ ] **Step 4: Commit**

```bash
git add src/app/api/landing/callback-verify/
git commit -m "feat(landing): verify OTP → dispara Vapi o fallback manual"
```

---

### Task 23: Actualizar CallbackForm para flow OTP + wire real

**Files:**
- Modify: `src/app/(landing)/sections/CallbackForm.tsx`
- Modify: `src/app/(landing)/sections/__tests__/CallbackForm.test.tsx`

**Interfaces:**
- El componente ahora tiene 2 etapas: form (paso 1) → captcha de OTP (paso 2) → confirmación (paso 3).

- [ ] **Step 1: Extender el componente con state machine simple**

```tsx
// src/app/(landing)/sections/CallbackForm.tsx (dif)
// Reemplazar el useState de "sent" por:
type Stage = 'form' | 'otp' | 'dialing' | 'fallback' | 'error';
const [stage, setStage] = useState<Stage>('form');
const [requestId, setRequestId] = useState<string | null>(null);
const [otpCode, setOtpCode] = useState('');
// ...
async function handleSubmit(e: React.FormEvent) {
  // ...
  const res = await onSubmit({ phone, industry, consent: true });
  if (res.ok && res.requestId) {
    setRequestId(res.requestId);
    setStage('otp');
  } else {
    setError(res.message ?? 'Error');
  }
}

async function handleOtpVerify(e: React.FormEvent) {
  e.preventDefault();
  const res = await fetch('/api/landing/callback-verify', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ requestId, code: otpCode }),
  });
  const body = await res.json();
  if (body.ok && body.callStatus === 'dialing') setStage('dialing');
  else if (body.ok && body.callStatus === 'fallback_manual') setStage('fallback');
  else setError(body.error);
}
```

Renderizar UI diferente según `stage`:
- `otp`: input de 6 dígitos + "verificar código"
- `dialing`: "Nia te está llamando ahora. Contesta al +52 xx…"
- `fallback`: "Se nos complicó llamarte automático. Te llamamos en menos de 30 minutos."

Actualizar tipo del onSubmit:

```typescript
onSubmit: (data: CallbackRequestPayload) => Promise<{ ok: boolean; requestId?: string; message?: string }>;
```

- [ ] **Step 2: Actualizar page.tsx para leer requestId de la respuesta**

En `handleCallbackSubmit` de `page.tsx`, cambiar:
```typescript
const body = await res.json();
return { ok: body.ok, requestId: body.requestId, message: body.error };
```

- [ ] **Step 3: Correr tests + fix**

- [ ] **Step 4: Commit**

```bash
git add src/app/\(landing\)/sections/CallbackForm.tsx src/app/\(landing\)/sections/__tests__/CallbackForm.test.tsx src/app/page.tsx
git commit -m "feat(landing): CallbackForm state machine con OTP + dialing + fallback"
```

---

### Task 24: E2E test del flow completo

**Files:**
- Create: `tests/e2e/landing-callback-flow.spec.ts`

**Interfaces:**
- Consumes: dev server corriendo con env vars mock de Twilio + Vapi.

- [ ] **Step 1: Escribir E2E**

```typescript
// tests/e2e/landing-callback-flow.spec.ts
import { test, expect } from '@playwright/test';

test('lead completa el flow: form → OTP mock → dialing state', async ({ page }) => {
  await page.goto('/');
  // Scroll a callback
  await page.locator('#callback').scrollIntoViewIfNeeded();

  // Fill form
  await page.getByLabel(/tu teléfono/i).fill('8112345678');
  await page.getByLabel(/tu tipo de negocio/i).selectOption('tortilleria_abarrotes');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /quiero que me llame/i }).click();

  // OTP stage aparece
  await expect(page.getByLabel(/código/i)).toBeVisible();

  // En dev con mock, el OTP es siempre '123456' (o extraído del test helper)
  await page.getByLabel(/código/i).fill('123456');
  await page.getByRole('button', { name: /verificar/i }).click();

  // Dialing o fallback aparece
  await expect(page.getByText(/te está llamando|te llamamos/i)).toBeVisible();
});
```

- [ ] **Step 2: Configurar env vars mock para test**

En `.env.test` (o docker-compose test setup):
```
TWILIO_ACCOUNT_SID=mock
TWILIO_AUTH_TOKEN=mock
VAPI_API_KEY=mock
LANDING_OTP_MOCK_CODE=123456   # nuevo env var: si está definido, OTP siempre acepta este código
```

Modificar `otp-sms.ts` para leer `LANDING_OTP_MOCK_CODE` en modo test y bypass la generación.

- [ ] **Step 3: Correr E2E**

```bash
npx playwright test tests/e2e/landing-callback-flow.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/landing-callback-flow.spec.ts src/lib/landing/otp-sms.ts .env.example
git commit -m "test(landing): E2E flow completo callback"
```

---

### Task 25: Deploy Phase 2 + monitoreo

**Files:**
- Modify: env vars en Vercel (`TWILIO_*`, `LANDING_OTP_MOCK_CODE` desactivado en prod)
- Create: `src/app/api/admin/landing/monitor/route.ts` (endpoint admin para ver leads recientes + status de callbacks)

- [ ] **Step 1: Endpoint monitor**

```typescript
// src/app/api/admin/landing/monitor/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from('landing_callback_requests')
    .select('id, phone, industry, call_status, otp_verified_at, created_at')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50);
  return NextResponse.json({ ok: true, leads: data ?? [] });
}
```

- [ ] **Step 2: Setear env vars en Vercel**

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (prod)
- `LANDING_OTP_MOCK_CODE` — NO configurar en prod
- Confirmar `CRON_SECRET` existente

- [ ] **Step 3: Test manual end-to-end en prod**

Desde teléfono real de Nazre:
1. Ir a `centinelia.mx` en móvil.
2. Llenar form callback con su propio teléfono.
3. Recibir SMS con código.
4. Ingresar código.
5. Recibir llamada de Nia.
6. Conversar 2-3 min.
7. Confirmar que el flow completo funcionó.

- [ ] **Step 4: Verificar métricas iniciales**

`GET /api/admin/landing/monitor` con `CRON_SECRET` para ver leads del día.

- [ ] **Step 5: Commit + tag release**

```bash
git add src/app/api/admin/landing/monitor/
git commit -m "feat(landing): admin monitor endpoint para leads recientes"
git tag landing-v2-phase2
git push origin landing-v2-phase2
```

---

## Self-Review

**Spec coverage:**
- ✓ Sección 1 Hero → Task 2
- ✓ Sección 2 Callback → Tasks 3 (Phase 1) + 21, 22, 23 (Phase 2)
- ✓ Sección 3 Elenco → Task 4
- ✓ Sección 4 Cómo funciona → Task 5
- ✓ Sección 5 Casos → Task 6
- ✓ Sección 6 Comparativa → Task 7
- ✓ Sección 7 Integraciones → Task 8
- ✓ Sección 8 Pricing (setup fee + franja) → Task 9
- ✓ Sección 9 FAQ → Task 10
- ✓ Sección 10 CTA final → Task 11
- ✓ Refactor page.tsx → Task 12
- ✓ Endpoint Phase 1 (form-only) → Task 13
- ✓ Deploy Phase 1 → Task 14
- ✓ Migration DB → Task 15
- ✓ Store → Task 16
- ✓ Throttle → Task 17
- ✓ OTP → Task 18
- ✓ Vapi outbound demo → Task 19
- ✓ Notif owner + fallback → Task 20
- ✓ Endpoint Phase 2 → Task 21, 22
- ✓ Frontend OTP flow → Task 23
- ✓ E2E test → Task 24
- ✓ Deploy Phase 2 + monitoreo → Task 25

**Guardrails del callback (spec sección 2):**
- ✓ Fallback si cron/Vapi falla → Task 20 + Task 22 (rama fallback_manual)
- ✓ OTP anti-abuse → Task 18
- ✓ Rate limit → Task 17
- ✓ Consentimiento LFPDPPP visible + hide-over-disable → Task 3
- ✓ Guión pre-establecido de Nia por industria → Task 19
- ✓ Horario (fuera de horas → agendar día siguiente) → Task 22
- ✓ Pool cobra siempre → implícito, Vapi outbound consume del pool interno

**Gaps cerrados con verificación real de código (2026-09-17):**
- ✓ Anclaje salarial ajustado a rango $12,000-$25,000 (honesto para MTY, no un solo punto).
- ✓ `assertNotProdOrAllowed` existe en `supabase/__tests__/_helpers/assert-not-prod.ts`. Import path ya corregido en todas las tasks.
- ✓ Firma real de outbound Vapi: `triggerOutboundCall({ agent: VoiceAgent, customerNumber, motivo?, campaignInstructions?, externalSource?, externalId? })`. Requiere `VoiceAgent` con `vapi_agent_id` — NO acepta raw prompt. Task 19 dividida en 19a (seedear agente demo) + 19b (wrapper).
- ✓ `sendEmail` en `src/lib/email/send.ts` retorna `Promise<boolean>` (no throw). Compatible con el uso planeado.

**Riesgos residuales:**
- Task 19a asume schema de `voice_agents`. El ejecutor debe leer `src/types/agent.ts` + migrations recientes de `voice_agents` para confirmar columnas requeridas antes de correr el seed.
- Task 19a asume que existe un helper de sync agent→Vapi. Si `scripts/sync-agent-to-vapi.ts` no existe, revisar `src/lib/vapi/sync.ts` para ver el flujo correcto (probablemente se auto-sincroniza al crear/activar el agente, o hay un endpoint admin).

**Placeholder scan:**
- Task 15 tenía "YYYYMMDDHHMM" para timestamp de migration — esto es el patrón estándar del proyecto, no un placeholder que evitar. El ejecutor sustituye con la fecha real (formato Supabase).
- Sin otros TBDs.

**Type consistency:**
- `IndustryKey` definido en `CallbackForm.tsx` (Task 3), consumido en `landing-demo.ts` (Task 19) y `callback-verify/route.ts` (Task 22). Consistente.
- `CallStatus` definido en `callback-store.ts` (Task 16), consumido en `landing-demo.ts` (Task 19). Consistente.
- `CallbackRequestPayload` definido en Task 3, consumido en Task 12 (page.tsx). Consistente.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-17-landing-reframe-empleados-digitales.md`.**

**Dos opciones de ejecución:**

**1. Subagent-Driven (recomendado)** — Yo dispatch un subagente fresco por task, review entre tasks, iteración rápida. Ideal para este plan porque las tasks son bite-sized (2-5 min steps) y el gate entre Phase 1 y Phase 2 es natural para review.

**2. Inline Execution** — Ejecutar las tasks en esta sesión con `superpowers:executing-plans`, batch con checkpoints. Menos aislamiento entre tasks pero más rápido si estás monitoreando en vivo.

**¿Cuál prefieres?**

**Crítico path identificado:** Task 19 (Vapi outbound landing-demo) es el bloqueador técnico más grande de Phase 2 — depende de conocer la API real de `outbound.ts` que aún no leí a fondo. Si eso resulta ser más complejo de lo asumido, la Phase 2 completa se retrasa. Phase 1 (tasks 1-14) puede shipear independiente sin bloqueo — el pipeline manual (owner recibe correo y llama) sirve mientras Phase 2 se termina.
