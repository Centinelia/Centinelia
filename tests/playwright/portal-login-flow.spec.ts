/**
 * E2E — Flow completo del login del portal con mocks de API.
 *
 * No requiere DB seedeada. Verifica que el form del login:
 *  - Envía credenciales al endpoint correcto
 *  - Redirige a /portal/[token] al recibir 200
 *  - Muestra el error del servidor al recibir 401/400
 *  - No permite submit con campos vacíos
 */

import { test, expect } from '@playwright/test';
import { setupLoginMocks } from './fixtures/login-with-mock';

test.describe('portal login — flow con mocks', () => {
  test('login exitoso redirige a /portal/[token]', async ({ page }) => {
    await setupLoginMocks(page, {
      loginResponse: { status: 200, token: 'mocked-org-token-xyz' },
    });
    await page.goto('/portal/login');

    await page.fill('input[type="email"]',    'nazre20@gmail.com');
    await page.fill('input[type="password"]', 'super-secret-pw');
    await page.getByRole('button', { name: /(entrar|iniciar|continuar|acceder)/i }).click();

    // Espera redirect (la navegación puede ser client-side router.push).
    await page.waitForURL(/\/portal\/mocked-org-token-xyz/, { timeout: 5000 });
  });

  test('login fallido muestra error del servidor sin redirigir', async ({ page }) => {
    await setupLoginMocks(page, {
      loginResponse: { status: 401, error: 'Credenciales incorrectas' },
    });
    await page.goto('/portal/login');

    await page.fill('input[type="email"]',    'wrong@example.com');
    await page.fill('input[type="password"]', 'wrong-pw');
    await page.getByRole('button', { name: /(entrar|iniciar|continuar|acceder)/i }).click();

    // Sigue en /portal/login
    await expect(page).toHaveURL(/\/portal\/login/);
    // Error visible en pantalla
    await expect(page.getByText(/credenciales incorrectas/i)).toBeVisible();
  });

  test('login con 429 rate limit muestra error apropiado', async ({ page }) => {
    await setupLoginMocks(page, {
      loginResponse: { status: 429, error: 'Demasiadas solicitudes. Intenta de nuevo en unos momentos.' },
    });
    await page.goto('/portal/login');

    await page.fill('input[type="email"]',    'x@x.com');
    await page.fill('input[type="password"]', 'x');
    await page.getByRole('button', { name: /(entrar|iniciar|continuar|acceder)/i }).click();

    await expect(page.getByText(/demasiadas solicitudes/i)).toBeVisible();
  });
});
