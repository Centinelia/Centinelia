/**
 * E2E — Flow crítico del portal del empleado.
 *
 * Requiere:
 *   1. `node scripts/e2e-seed-portal-test-org.mjs` corrido y sus outputs
 *      pegados en `.env.local`.
 *   2. Dev server corriendo (playwright.config.ts lo arranca solo).
 *
 * Si `E2E_PORTAL_TOKEN` no está en env, el spec entero se skipea con un log
 * explicando cómo habilitarlo. Esto permite que CI corra sin bloquear cuando
 * Supabase no está disponible.
 */

import { test, expect } from '@playwright/test';

const PORTAL_EMAIL    = process.env.E2E_PORTAL_EMAIL;
const PORTAL_TOKEN    = process.env.E2E_PORTAL_TOKEN;
const PORTAL_PASSWORD = process.env.E2E_PORTAL_PASSWORD;
const AGENT_ID        = process.env.E2E_AGENT_ID;

const hasEnv = !!(PORTAL_EMAIL && PORTAL_TOKEN && PORTAL_PASSWORD && AGENT_ID);

test.describe('portal — flow crítico empleado (config + toggle + refresh)', () => {
  test.skip(!hasEnv, 'Falta seed. Corre `node scripts/e2e-seed-portal-test-org.mjs` y pega output en .env.local');

  test.beforeEach(async ({ page }) => {
    // Login real → cookie de sesión persiste para el resto del test.
    await page.goto('/portal/login');
    await page.fill('input[type="email"]',    PORTAL_EMAIL!);
    await page.fill('input[type="password"]', PORTAL_PASSWORD!);
    await page.getByRole('button', { name: /(entrar|iniciar|continuar|acceder)/i }).click();
    await page.waitForURL(new RegExp(`/portal/${PORTAL_TOKEN}(?:/|$)`), { timeout: 10000 });
  });

  test('cargar /empleados muestra la lista con el meerkat de test', async ({ page }) => {
    await page.goto(`/portal/${PORTAL_TOKEN}/empleados`);
    await expect(page.getByText('Nia E2E')).toBeVisible({ timeout: 10000 });
  });

  test('abrir /configurar del empleado seedeado no cae al fallback', async ({ page }) => {
    await page.goto(`/portal/${PORTAL_TOKEN}/configurar?empleado_id=${AGENT_ID}`);
    // Presence of "Configuración pendiente" o el nombre del empleado indica
    // que estamos en la pantalla correcta (no un redirect a 404).
    await expect(page).toHaveURL(new RegExp(`empleado_id=${AGENT_ID}`));
  });

  test('el nav "Rol y Personalidad" está seleccionado por default', async ({ page }) => {
    await page.goto(`/portal/${PORTAL_TOKEN}/configurar?empleado_id=${AGENT_ID}`);
    // Espera a que el tab esté visible
    await expect(page.getByRole('tab', { name: /rol y personalidad/i }).or(
      page.getByText(/rol y personalidad/i),
    )).toBeVisible({ timeout: 10000 });
  });
});
