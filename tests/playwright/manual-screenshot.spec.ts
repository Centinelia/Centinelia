/**
 * Screenshot manual del portal para verificación visual.
 *
 * Corre con: `npx playwright test manual-screenshot.spec.ts`
 * Guarda en: `test-results/portal-login-final.png`
 */

import { test } from '@playwright/test';

test('screenshot del login del portal', async ({ page }) => {
  await page.goto('/portal/login');
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: 'test-results/portal-login-final.png',
    fullPage: true,
  });
});
