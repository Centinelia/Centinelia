/**
 * E2E — Flow completo del callback de landing (form -> OTP -> dialing/fallback).
 *
 * Requiere:
 *   1. Dev server corriendo en localhost:3000 (playwright.config.ts lo arranca con `npm run dev`).
 *   2. Las siguientes variables en .env.local:
 *        LANDING_OTP_MOCK_CODE=123456
 *        TWILIO_ACCOUNT_SID=mock
 *        TWILIO_AUTH_TOKEN=mock
 *        TWILIO_FROM_NUMBER=+521234567890
 *        VAPI_API_KEY=mock
 *        LANDING_DEMO_PORTAL_EMAIL=<email de la org de demo>
 *   3. Una base de datos Supabase accesible (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 *
 * Cuando LANDING_OTP_MOCK_CODE no esta seteado, los specs se skipean con un
 * mensaje explicativo para no bloquear CI.
 *
 * Para correr manualmente:
 *   npx playwright test tests/playwright/landing-callback-flow.spec.ts
 *
 * El test acepta AMBOS outcomes de /api/landing/callback-verify:
 *   - callStatus: 'dialing'        -> Vapi marco, Nia esta llamando
 *   - callStatus: 'fallback_manual' -> fuera de horario o Vapi fallo; callback manual
 */

import { test, expect } from '@playwright/test';

const MOCK_CODE = process.env.LANDING_OTP_MOCK_CODE;
const hasEnv    = !!MOCK_CODE;

// Numero de prueba que pasa la regex MX_PHONE_RE (10 digitos, sin cero inicial)
const TEST_PHONE = '8112345678';

test.describe('landing — flow completo callback (form -> OTP -> resultado)', () => {
  test.skip(!hasEnv, [
    'LANDING_OTP_MOCK_CODE no esta seteado.',
    'Agrega estas variables a .env.local y reinicia el servidor:',
    '  LANDING_OTP_MOCK_CODE=123456',
    '  TWILIO_ACCOUNT_SID=mock',
    '  TWILIO_AUTH_TOKEN=mock',
    '  TWILIO_FROM_NUMBER=+521234567890',
    '  VAPI_API_KEY=mock',
    '  LANDING_DEMO_PORTAL_EMAIL=<email de la org demo>',
  ].join('\n'));

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Flujo feliz completo — form lleno -> stage OTP visible
  // ─────────────────────────────────────────────────────────────────────────
  test('form relleno con datos validos muestra la etapa de OTP', async ({ page }) => {
    await page.goto('/');

    // Navegar al bloque de callback
    const callbackSection = page.locator('#callback');
    await callbackSection.scrollIntoViewIfNeeded();

    // Rellenar numero de telefono
    const phoneInput = page.getByLabel(/tu tel[eé]fono/i);
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.fill(TEST_PHONE);

    // Seleccionar tipo de negocio
    const industrySelect = page.getByLabel(/tu tipo de negocio/i);
    await expect(industrySelect).toBeVisible();
    await industrySelect.selectOption('tortilleria_abarrotes');

    // Marcar consentimiento — el checkbox esta dentro de un label
    const consentCheckbox = page.locator('#callback input[type="checkbox"]');
    await expect(consentCheckbox).toBeVisible();
    await consentCheckbox.check();

    // El boton de submit aparece solo cuando consent = true
    const submitButton = page.getByRole('button', { name: /quiero que me llame nia/i });
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // La etapa OTP debe aparecer — la API graba el request y simula que envia SMS
    // (Twilio mock no lo manda realmente)
    await expect(page.getByText(/te mandamos un c[oó]digo/i)).toBeVisible({ timeout: 15_000 });

    // El campo del codigo debe estar visible
    const otpInput = page.getByLabel(/c[oó]digo de verificaci[oó]n/i);
    await expect(otpInput).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: OTP correcto -> estado final (dialing O fallback)
  // ─────────────────────────────────────────────────────────────────────────
  test('OTP correcto lleva al estado final (dialing o fallback_manual)', async ({ page }) => {
    await page.goto('/');

    const callbackSection = page.locator('#callback');
    await callbackSection.scrollIntoViewIfNeeded();

    // Llenar form
    await page.getByLabel(/tu tel[eé]fono/i).fill(TEST_PHONE);
    await page.getByLabel(/tu tipo de negocio/i).selectOption('tortilleria_abarrotes');
    await page.locator('#callback input[type="checkbox"]').check();
    await page.getByRole('button', { name: /quiero que me llame nia/i }).click();

    // Esperar stage OTP
    const otpInput = page.getByLabel(/c[oó]digo de verificaci[oó]n/i);
    await expect(otpInput).toBeVisible({ timeout: 15_000 });

    // Ingresar el codigo mock
    await otpInput.fill(MOCK_CODE!);

    const verifyButton = page.getByRole('button', { name: /verificar c[oó]digo/i });
    await expect(verifyButton).toBeEnabled();
    await verifyButton.click();

    // Resultado: dialing = "Nia te esta llamando"
    //            fallback = "te llamamos en menos de 30 minutos"
    // Ambos son outcomes validos — aceptar cualquiera de los dos
    const dialingText  = page.getByText(/nia te est[aá] llamando/i);
    const fallbackText = page.getByText(/te llamamos en menos de 30 minutos/i);

    await expect(dialingText.or(fallbackText)).toBeVisible({ timeout: 15_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: OTP incorrecto muestra error sin avanzar de etapa
  // ─────────────────────────────────────────────────────────────────────────
  test('OTP incorrecto muestra error y no avanza al estado final', async ({ page }) => {
    await page.goto('/');

    const callbackSection = page.locator('#callback');
    await callbackSection.scrollIntoViewIfNeeded();

    // Llenar form
    await page.getByLabel(/tu tel[eé]fono/i).fill(TEST_PHONE);
    await page.getByLabel(/tu tipo de negocio/i).selectOption('otro');
    await page.locator('#callback input[type="checkbox"]').check();
    await page.getByRole('button', { name: /quiero que me llame nia/i }).click();

    // Esperar stage OTP
    const otpInput = page.getByLabel(/c[oó]digo de verificaci[oó]n/i);
    await expect(otpInput).toBeVisible({ timeout: 15_000 });

    // Ingresar codigo INCORRECTO (distinto al mock)
    const wrongCode = MOCK_CODE === '999999' ? '111111' : '999999';
    await otpInput.fill(wrongCode);
    await page.getByRole('button', { name: /verificar c[oó]digo/i }).click();

    // Debe mostrar un mensaje de error
    const errorMsg = page.getByText(/c[oó]digo incorrecto|intentalo de nuevo/i);
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });

    // NO debe haber avanzado: ni "Nia te esta llamando" ni "te llamamos"
    await expect(page.getByText(/nia te est[aá] llamando/i)).not.toBeVisible();
    await expect(page.getByText(/te llamamos en menos de 30 minutos/i)).not.toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Telefono invalido bloquea el submit del form
  // ─────────────────────────────────────────────────────────────────────────
  test('telefono invalido bloquea el submit y muestra error de validacion', async ({ page }) => {
    await page.goto('/');

    const callbackSection = page.locator('#callback');
    await callbackSection.scrollIntoViewIfNeeded();

    // Numero con menos de 10 digitos
    await page.getByLabel(/tu tel[eé]fono/i).fill('81123');
    await page.getByLabel(/tu tipo de negocio/i).selectOption('construccion');
    await page.locator('#callback input[type="checkbox"]').check();
    await page.getByRole('button', { name: /quiero que me llame nia/i }).click();

    // Mensaje de error del form (validacion client-side en CallbackForm)
    const validationError = page.getByText(/tel[eé]fono no v[aá]lido|10 d[ií]gitos/i);
    await expect(validationError).toBeVisible({ timeout: 5_000 });

    // NO debe haber avanzado a OTP
    await expect(page.getByText(/te mandamos un c[oó]digo/i)).not.toBeVisible();
  });
});
