/**
 * Portal — Tareas de meerkat (Task 5.2)
 *
 * Happy-path: crear, editar y desactivar una tarea programada desde el
 * portal de configuración de un empleado.
 *
 * Pre-requisito: debe existir un portal activo con token válido en la
 * variable de entorno E2E_PORTAL_TOKEN. Si no está seteada el test se
 * salta automáticamente.
 *
 * Run: npx playwright test tests/playwright/portal-agent-missions.spec.ts
 */

import { test, expect } from '@playwright/test';

const TOKEN = process.env.E2E_PORTAL_TOKEN ?? '';

test.describe('Portal — Tareas de meerkat', () => {
  test.skip(!TOKEN, 'E2E_PORTAL_TOKEN no seteado — omitiendo test de tareas');

  test.beforeEach(async ({ page }) => {
    // Navegar a la configuración del primer empleado, tab Tareas
    await page.goto(`/portal/${TOKEN}/configurar?tab=tareas`);
    // Esperar a que la sección esté visible
    await page.waitForSelector('[id="tareas-del-empleado"]', { state: 'visible', timeout: 15_000 });
  });

  test('cliente crea una tarea nueva (manual)', async ({ page }) => {
    // Hacer clic en "Nueva tarea"
    await page.getByRole('button', { name: /nueva tarea/i }).click();

    // El wizard debe aparecer
    await expect(page.getByText(/nueva tarea para/i)).toBeVisible();

    // Paso 1: escribir la misión
    const textarea = page.locator('textarea').first();
    await textarea.fill('Enviar resumen de ventas a los clientes pendientes');

    // Avanzar al paso 2
    await page.getByRole('button', { name: /siguiente/i }).click();

    // Paso 2: elegir "Solo manual"
    await page.getByText('Solo manual').click();

    // Avanzar al paso 3
    await page.getByRole('button', { name: /siguiente/i }).click();

    // Paso 3: instrucciones opcionales — dejar vacío, avanzar
    await page.getByRole('button', { name: /siguiente/i }).click();

    // Paso 4: aceptar "Por correo al responsable" (default)
    // Crear
    await page.getByRole('button', { name: /crear tarea/i }).click();

    // El wizard debe cerrarse
    await expect(page.getByText(/nueva tarea para/i)).toBeHidden({ timeout: 8_000 });

    // La tarea debe aparecer en la lista
    await expect(
      page.getByText('Enviar resumen de ventas a los clientes pendientes'),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('cliente edita una tarea existente', async ({ page }) => {
    // Supone que la prueba anterior dejó al menos una tarea activa
    await page.waitForSelector('[data-testid="missions-list"]', { timeout: 10_000 });

    const editBtn = page.getByRole('button', { name: /editar/i }).first();
    await editBtn.click();

    // El wizard debe aparecer en modo edición
    await expect(page.getByText('Editar tarea')).toBeVisible();

    // Editar la misión
    const textarea = page.locator('textarea').first();
    await textarea.fill('');
    await textarea.fill('Enviar resumen de ventas (actualizado)');

    // Navegar hasta el último paso
    await page.getByRole('button', { name: /siguiente/i }).click();
    await page.getByRole('button', { name: /siguiente/i }).click();
    await page.getByRole('button', { name: /siguiente/i }).click();

    await page.getByRole('button', { name: /guardar cambios/i }).click();

    // Modal debe cerrarse
    await expect(page.getByText('Editar tarea')).toBeHidden({ timeout: 8_000 });

    // El texto actualizado debe aparecer
    await expect(
      page.getByText('Enviar resumen de ventas (actualizado)'),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('cliente desactiva una tarea y desaparece de la lista activa', async ({ page }) => {
    const missionsList = page.locator('[data-testid="missions-list"]');
    await expect(missionsList).toBeVisible({ timeout: 10_000 });

    const initialCount = await missionsList.locator('[data-testid^="mission-card-"]').count().catch(() => -1);

    const deactivateBtn = page.getByRole('button', { name: /desactivar/i }).first();
    await deactivateBtn.click();

    // Esperar actualización
    await page.waitForTimeout(2_000);

    // La lista debe tener una tarea menos o mostrar vacío
    const emptyMsg  = page.locator('[data-testid="empty-missions"]');
    const newCount  = await missionsList.locator('[data-testid^="mission-card-"]').count().catch(() => 0);

    const condition = (await emptyMsg.isVisible()) || newCount < initialCount;
    expect(condition).toBe(true);
  });
});
