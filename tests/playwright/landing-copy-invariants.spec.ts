/**
 * Landing copy invariants — E2E test
 *
 * Playwright está instalado (@playwright/test ^1.63.0).
 * Requiere que el servidor esté corriendo en localhost:3000 (npx playwright test --base-url http://localhost:3000).
 *
 * Invariantes que verifica:
 * - Sin em-dash ni en-dash en el texto visible
 * - Sin emojis (rango Unicode básico de emojis)
 * - Sin "IA" ni "AI" como palabras sueltas
 * - Sin "GPT" ni "chatbot"
 * - CTAs principales visibles arriba del fold
 * - Los 3 tiers de pricing están presentes
 * - La franja "empleado a la medida" existe con su precio
 */

import { test, expect } from '@playwright/test';

test.describe('Landing copy invariants', () => {
  test('la landing carga sin em-dash, emojis, ni "IA"', async ({ page }) => {
    await page.goto('/');
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    // "IA" como palabra suelta (no dentro de "Nia", "Naia", "Nalia", etc.)
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
