/**
 * Portal — Reglas del negocio (Task 5.1)
 *
 * Happy-path: crear, editar y desactivar una regla desde el portal.
 *
 * Pre-requisito: debe existir un portal activo con token válido en la
 * variable de entorno E2E_PORTAL_TOKEN. Si no está seteada el test se
 * salta automáticamente.
 *
 * Run: npx playwright test tests/playwright/portal-agent-rules.spec.ts
 */

import { test, expect } from '@playwright/test';

const TOKEN = process.env.E2E_PORTAL_TOKEN ?? '';

test.describe('Portal — Reglas del negocio', () => {
  test.skip(!TOKEN, 'E2E_PORTAL_TOKEN no seteado — omitiendo test de reglas');

  test.beforeEach(async ({ page }) => {
    // Navegar al portal e ir a la sección de Organización > Operación > Reglas
    await page.goto(`/portal/${TOKEN}?tab=organizacion#reglas-del-negocio`);
    // Esperar a que la sección esté visible
    await page.waitForSelector('[id="reglas-del-negocio"]', { state: 'visible', timeout: 15_000 });
  });

  test('cliente crea una regla nueva', async ({ page }) => {
    // Hacer clic en "+ Nueva regla"
    await page.getByRole('button', { name: /nueva regla/i }).click();

    // Modal debe aparecer
    await expect(page.getByText('Nueva regla del negocio')).toBeVisible();

    // Rellenar el campo obligatorio
    const textarea = page.locator('textarea').first();
    await textarea.fill('No ofrecemos descuentos sin autorización del dueño');

    // Aceptar "Todos los empleados" (default)
    // Guardar
    await page.getByRole('button', { name: /crear regla/i }).click();

    // Modal debe cerrarse
    await expect(page.getByText('Nueva regla del negocio')).toBeHidden({ timeout: 8_000 });

    // La regla debe aparecer en la lista
    await expect(
      page.getByText('No ofrecemos descuentos sin autorización del dueño'),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('cliente edita una regla existente', async ({ page }) => {
    // Supone que la prueba anterior dejó al menos una regla activa
    const editBtn = page.getByRole('button', { name: /editar/i }).first();
    await editBtn.click();

    // Modal "Editar regla"
    await expect(page.getByText('Editar regla')).toBeVisible();

    // Editar el campo regla
    const textarea = page.locator('textarea').first();
    await textarea.fill('');
    await textarea.fill('No ofrecemos descuentos (actualizado)');

    await page.getByRole('button', { name: /guardar cambios/i }).click();

    // Modal debe cerrarse
    await expect(page.getByText('Editar regla')).toBeHidden({ timeout: 8_000 });

    // El texto actualizado debe aparecer
    await expect(
      page.getByText('No ofrecemos descuentos (actualizado)'),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('cliente desactiva una regla y desaparece de la lista activa', async ({ page }) => {
    // Esperar a que haya al menos una regla activa
    const rulesList = page.locator('[data-testid="rules-list"]');
    await expect(rulesList).toBeVisible({ timeout: 10_000 });

    const initialCount = await rulesList.locator('[data-testid]').count().catch(() => -1);

    const deactivateBtn = page.getByRole('button', { name: /desactivar/i }).first();
    await deactivateBtn.click();

    // La sección debe actualizarse (no aparece el estado de carga eterno)
    await page.waitForTimeout(2_000);

    // Si había al menos 1 regla activa, la lista ahora debería tener una menos
    // (o mostrar el mensaje de vacío si era la única)
    const emptyMsg = page.locator('[data-testid="empty-rules"]');
    const newCount = await rulesList.locator('[data-testid]').count().catch(() => 0);

    // O hay menos reglas activas o aparece el vacío
    const condition = (await emptyMsg.isVisible()) || newCount < initialCount;
    expect(condition).toBe(true);
  });
});
