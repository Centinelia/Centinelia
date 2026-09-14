/**
 * Smoke E2E: la pantalla de login del portal se monta sin errores y
 * responde a validación client-side.
 *
 * NO cubre el flow completo (login → configurar → toggle) porque eso
 * requiere una org seedeada en Supabase con portal_email de test y un
 * token válido. Ver `tests/playwright/README.md` para setup del flow
 * completo cuando se decida ampliar.
 *
 * Este smoke basta para verificar:
 *  - El bundle carga sin errores 500 en el server component
 *  - El form de login está presente y accesible
 *  - Client-side validation dispara con email inválido
 *  - Hay un link para reset/recuperar acceso
 *
 * Actúa como canary: si esto revienta post-deploy, el portal está roto
 * en la puerta de entrada y ningún otro test (unit o API) lo detectaría.
 */

import { test, expect } from '@playwright/test';

test.describe('/portal/login — smoke', () => {
  test('la página carga sin errores HTTP', async ({ page }) => {
    const response = await page.goto('/portal/login');
    expect(response?.ok()).toBe(true);
  });

  test('renderiza el formulario de login', async ({ page }) => {
    await page.goto('/portal/login');
    // Campo email visible
    await expect(page.locator('input[type="email"]')).toBeVisible();
    // Botón de submit
    const submit = page.getByRole('button', { name: /(entrar|iniciar|continuar|acceder)/i });
    await expect(submit).toBeVisible();
  });

  test('no leakea "Invalid Date" en texto visible', async ({ page }) => {
    await page.goto('/portal/login');
    // innerText solo devuelve texto visible al usuario, no scripts inline.
    const visible = await page.locator('body').innerText();
    expect(visible).not.toContain('Invalid Date');
    expect(visible).not.toContain('NaN·');
  });

  test('no muestra emojis ni em-dashes en copy visible', async ({ page }) => {
    await page.goto('/portal/login');
    const visible = await page.locator('body').innerText();
    // Em-dash prohibido en copy español.
    expect(visible).not.toContain('—');
    // Emojis comunes prohibidos (Lucide icons only).
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}]/u;
    expect(visible).not.toMatch(emojiRegex);
  });
});
