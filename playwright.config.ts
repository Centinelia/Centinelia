import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config para smoke tests + flows críticos del portal.
 *
 * Corre con: `npx playwright test`
 *
 * webServer: arranca `next dev` automáticamente y espera al puerto 3000
 * antes de correr los specs. Si ya tienes el dev server corriendo local,
 * comenta el bloque webServer o mata el proceso primero.
 *
 * Los specs que requieren sesión autenticada dependen de un org seedeado.
 * Ver `tests/playwright/README.md` para el runbook de seed.
 */
export default defineConfig({
  testDir: './tests/playwright',
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/portal/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
