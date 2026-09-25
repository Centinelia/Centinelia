/**
 * Portal — Onboarding wizard (Task 5.3)
 *
 * Happy-path: flujo completo del wizard de 4 pantallas (bienvenida, reglas
 * base, tareas base, resumen + guardar).
 *
 * Pre-requisito: `E2E_PORTAL_TOKEN` apuntando a un org cuyo
 * `organizations.features.wizard_completed_at` sea null.
 * Si la variable no está seteada el test se salta.
 *
 * Run: npx playwright test tests/playwright/portal-onboarding-wizard.spec.ts
 */

import { test, expect } from '@playwright/test';

const TOKEN = process.env.E2E_PORTAL_TOKEN ?? '';

test.describe('Portal — Onboarding wizard', () => {
  test.skip(!TOKEN, 'E2E_PORTAL_TOKEN no seteado — omitiendo test del wizard');

  test('flujo completo del wizard (4 pantallas)', async ({ page }) => {
    await page.goto(`/portal/${TOKEN}/onboarding-wizard`);

    // Pantalla 1: Bienvenida
    await expect(page.getByText(/vamos a enseñarle/i)).toBeVisible({ timeout: 10_000 });

    // Avanzar a pantalla 2
    await page.getByRole('button', { name: /siguiente/i }).click();

    // Pantalla 2: Reglas base
    await expect(page.getByText(/reglas del negocio/i)).toBeVisible();

    // Escribir una regla
    const ruleTextarea = page.locator('textarea').first();
    await ruleTextarea.fill('Nunca ofrecer descuentos sin aprobación del responsable.');

    await page.getByRole('button', { name: /siguiente/i }).click();

    // Pantalla 3: Tareas base
    await expect(page.getByText(/tareas programadas/i)).toBeVisible();

    // Expandir la primera tarea y escribir misión
    await page.locator('button').filter({ hasText: /tarea 1/i }).click();
    const missionArea = page.locator('textarea').first();
    await missionArea.fill('Enviar resumen semanal de ventas.');

    // Seleccionar "Solo manual"
    await page.getByRole('button', { name: /solo manual/i }).click();

    await page.getByRole('button', { name: /siguiente/i }).click();

    // Pantalla 4: Resumen
    await expect(page.getByText(/resumen de configuración/i)).toBeVisible();
    await expect(page.getByText('Nunca ofrecer descuentos sin aprobación del responsable.')).toBeVisible();
    await expect(page.getByText('Enviar resumen semanal de ventas.')).toBeVisible();

    // Guardar
    await page.getByRole('button', { name: /guardar y continuar/i }).click();

    // Debe redirigir al portal (URL sin /onboarding-wizard)
    await expect(page).toHaveURL(/\/portal\//, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/onboarding-wizard/, { timeout: 5_000 });
  });

  test('botón saltar cierra el wizard sin guardar', async ({ page }) => {
    await page.goto(`/portal/${TOKEN}/onboarding-wizard`);

    // Pantalla 1 tiene el botón "Saltar por ahora"
    await expect(page.getByText(/vamos a enseñarle/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /saltar/i }).first().click();

    // Redirige al portal
    await expect(page).toHaveURL(/\/portal\//, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/onboarding-wizard/);
  });
});
