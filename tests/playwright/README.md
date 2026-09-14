# Playwright E2E — portal Centinelia

## Correr los tests

```bash
npx playwright test              # todos los specs
npx playwright test --headed     # con navegador visible
npx playwright test --debug      # step-by-step
```

El `playwright.config.ts` arranca `next dev` automáticamente si el puerto 3000 está libre. Si ya tienes el dev server corriendo, se reusa.

## Qué cubren estos specs hoy

- **`portal-login.spec.ts`** — Smoke test de la landing del portal. Verifica que la página carga sin 500, renderiza el form de login, y no leakea strings basura (`Invalid Date`, emojis, em-dashes). Es el canary de "portal roto en la puerta de entrada".

## Correr flow crítico completo

Los specs `portal-login-flow.spec.ts` y `portal-critical-flow.spec.ts` cubren el flow real.

- `portal-login-flow.spec.ts` **no requiere DB**: usa `page.route()` para interceptar `/api/portal/auth/login`. Corre siempre.
- `portal-critical-flow.spec.ts` **requiere DB seedeada**:

```bash
# 1. Seedear la org de test (idempotente)
node scripts/e2e-seed-portal-test-org.mjs
# → imprime 4 líneas E2E_*=... para pegar en .env.local

# 2. Correr
npx playwright test
```

Sin las env vars, `portal-critical-flow.spec.ts` se skipea automáticamente con un `test.skip()` — no bloquea el suite.

## Regla dura

Ningún E2E toca clientes reales — solo la org sintética de test. Ver `[[feedback-no-test-a-clientes]]` en `.brain/`.
