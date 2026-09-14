/**
 * Helper: monta el login del portal con respuestas mockeadas via page.route().
 *
 * No requiere DB seedeada. Sirve para validar el flow del formulario de
 * login end-to-end (client-side validation, fetch, error handling, redirect).
 */

import { type Page } from '@playwright/test';

export interface MockLoginConfig {
  /** Respuesta que dará /api/portal/auth/login al submit. */
  loginResponse:
    | { status: 200; token: string }
    | { status: number; error: string };
}

export async function setupLoginMocks(page: Page, cfg: MockLoginConfig) {
  await page.route('**/api/portal/auth/login', async (route) => {
    const r = cfg.loginResponse;
    const body = 'token' in r
      ? JSON.stringify({ token: r.token })
      : JSON.stringify({ error: r.error });

    await route.fulfill({
      status:      r.status,
      contentType: 'application/json',
      body,
    });
  });
}
