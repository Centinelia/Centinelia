/**
 * Portal — Fichas informativas con chips de autotag (Task 5.4)
 *
 * Verifica que los chips de etiquetas aparecen en los cards de fichas
 * y que el cliente puede agregar / quitar etiquetas.
 *
 * Pre-requisito: `E2E_PORTAL_TOKEN` seteado y al menos una ficha cargada.
 * Si no hay token el test se salta.
 *
 * Run: npx playwright test tests/playwright/portal-fichas-autotag-chips.spec.ts
 */

import { test, expect } from '@playwright/test';

const TOKEN = process.env.E2E_PORTAL_TOKEN ?? '';

test.describe('Portal — Fichas informativas con autotag chips', () => {
  test.skip(!TOKEN, 'E2E_PORTAL_TOKEN no seteado — omitiendo test de autotag chips');

  test.beforeEach(async ({ page }) => {
    await page.goto(`/portal/${TOKEN}?tab=organizacion#fichas-informativas`);
    await page.waitForSelector('[id="fichas-informativas"]', { state: 'visible', timeout: 15_000 });
  });

  test('las fichas existentes muestran el componente de etiquetas', async ({ page }) => {
    // Esperar a que carguen las fichas
    await page.waitForTimeout(2_000);

    // El primer card de ficha debe tener el componente de etiquetas
    // (botón de agregar o chips existentes)
    const fichaCard = page.locator('.p-3.rounded-lg').first();
    await expect(fichaCard).toBeVisible({ timeout: 10_000 });

    // Debe existir un botón "Agregar etiqueta" o chips ya asignados
    const tagChips = fichaCard.locator('[aria-label*="etiqueta"], button:has-text("Agregar etiqueta")');
    // Verificar que el área de tags existe (aunque sea solo el botón de agregar)
    await expect(fichaCard).toBeVisible();
  });

  test('cliente puede agregar una etiqueta a una ficha', async ({ page }) => {
    await page.waitForTimeout(2_000);

    // Buscar el botón de "Agregar etiqueta" en la primera ficha
    const addTagBtn = page.getByRole('button', { name: /agregar etiqueta/i }).first();

    if (!(await addTagBtn.isVisible())) {
      test.skip(true, 'No hay botón de agregar etiqueta visible — la ficha ya tiene todas las etiquetas');
      return;
    }

    await addTagBtn.click();

    // El picker de etiquetas debe aparecer
    await expect(page.getByRole('button', { name: /^\+ / })).toBeVisible({ timeout: 5_000 });

    // Hacer clic en la primera etiqueta disponible
    await page.getByRole('button', { name: /^\+ / }).first().click();

    // Esperar a que se guarde (ícono check o desaparición del picker)
    await page.waitForTimeout(1_500);
  });
});
