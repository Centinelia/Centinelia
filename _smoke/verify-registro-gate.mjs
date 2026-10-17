// Smoke test del gate Operación en /registro.
// Corre: `node _smoke/verify-registro-gate.mjs` con dev server en :3000.

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const results = [];
function pass(name) { results.push({ name, ok: true }); console.log(`  ok  ${name}`); }
function fail(name, why) { results.push({ name, ok: false, why }); console.log(`  FAIL ${name} :: ${why}`); }

const browser = await chromium.launch();
// IMPORTANTE: context fresh por test donde importa, para evitar localStorage leak.
// Default viewport mobile para evitar el breakpoint sm: que oculta/muestra botones distintos.
async function freshPage(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  return { ctx, page };
}

try {
  // ───────────────────────── Test 1: badges "A medida" ────────────────────
  console.log('\nTest 1: /registro muestra badges "A medida" en Operación');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/registro`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const badges = await page.locator('text=A medida').count();
    if (badges >= 10) pass(`${badges} badges "A medida" visibles`);
    else              fail('badges A medida', `solo ${badges} badges, esperaba >=10`);
    await ctx.close();
  }

  // ───────────────────────── Test 2: Nia pre-seleccionada default ─────────
  console.log('\nTest 2: /registro sin params pre-selecciona Nia (no Noah)');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/registro`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    // Nia debería estar seleccionada: su botón tiene borde + checkmark.
    // Verifico por presencia del texto "Continuar con Nia" (que solo aparece si Nia está sel).
    const continuarNia  = await page.locator('text=Continuar con Nia').count();
    const continuarNoah = await page.locator('text=Continuar con Noah').count();
    if (continuarNia > 0)  pass(`"Continuar con Nia" visible (${continuarNia}x)`);
    else                    fail('Nia default', 'no se encontró "Continuar con Nia"');
    if (continuarNoah === 0) pass('Noah no está pre-seleccionado');
    else                     fail('Noah no selected', `"Continuar con Noah" aparece ${continuarNoah}x`);
    await ctx.close();
  }

  // ───────────────────────── Test 3: click en Nala NO abre modal ─────────
  console.log('\nTest 3: click en Nala selecciona pero NO abre modal');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/registro`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const nala = page.locator('button:has-text("Nala")').first();
    await nala.click();
    await page.waitForTimeout(500);

    const modalText = await page.locator('text=Nala se diseña contigo').count();
    const continuar = await page.locator('text=Continuar con Nala').count();

    if (modalText === 0) pass('modal NO abierto en click (correcto)');
    else                 fail('modal premature', 'modal apareció al click');
    if (continuar > 0)   pass('"Continuar con Nala" visible (panel inline con Nala seleccionada)');
    else                 fail('inline panel', 'no se ve Continuar con Nala tras click');
    await ctx.close();
  }

  // ───────────────────────── Test 4: Continuar con Nala abre modal ────────
  console.log('\nTest 4: click en "Continuar con Nala" abre modal');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/registro`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await page.locator('button:has-text("Nala")').first().click();
    await page.waitForTimeout(400);
    // Pueden haber 2 "Continuar con Nala" (mobile + desktop). Click en el primero visible.
    await page.locator('button:has-text("Continuar con Nala")').first().click();
    await page.waitForTimeout(500);

    const modal = await page.locator('text=Nala se diseña contigo').count();
    const ctaDiag  = await page.locator('a:has-text("Agendar diagnóstico")').count();
    const ctaOtro  = await page.locator('button:has-text("Elegir otro empleado")').count();

    if (modal > 0)      pass('modal "Nala se diseña contigo" visible tras Continuar');
    else                 fail('modal post-Continuar', 'no apareció');
    if (ctaDiag > 0)    pass('CTA "Agendar diagnóstico" presente');
    else                 fail('CTA diagnóstico', 'no encontrado');
    if (ctaOtro > 0)    pass('CTA "Elegir otro empleado" presente');
    else                 fail('CTA otro', 'no encontrado');

    const href = await page.locator('a:has-text("Agendar diagnóstico")').first().getAttribute('href');
    if (href === '/cotizar?role=nala') pass(`CTA href correcto: ${href}`);
    else                                fail('CTA href', `esperaba /cotizar?role=nala, got ${href}`);
    await ctx.close();
  }

  // ───────────────────────── Test 5: deep-link ?role=nami → selecciona ────
  console.log('\nTest 5: /registro?role=nami lands con Nami seleccionada (no redirige)');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/registro?role=nami`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const url = page.url();
    const continuarNami = await page.locator('text=Continuar con Nami').count();
    if (url.includes('/registro') && !url.includes('/cotizar')) pass(`se queda en /registro: ${url}`);
    else                                                        fail('deep-link redirect', `URL = ${url}`);
    if (continuarNami > 0) pass('"Continuar con Nami" visible (preselect correcto)');
    else                    fail('deep-link select', 'Nami no pre-seleccionada');
    await ctx.close();
  }

  // ───────────────────────── Test 6: ?role=nia pasa directo a step 2 ─────
  console.log('\nTest 6: /registro?role=nia salta a step 2');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/registro?role=nia`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Step 2 muestra "Jornada" o similar. En el picker (step 1) hay "Tu equipo Centinelia".
    const step1Title = await page.locator('text=Tu equipo Centinelia').count();
    if (step1Title === 0) pass('salió del step 1 (no vemos picker)');
    else                   fail('deep-link nia step', 'sigue en step 1');
    await ctx.close();
  }

  // ───────────────────────── Test 7: Nami y Nalú renderizan ──────────────
  console.log('\nTest 7: Nami y Nalú renderizan; Nox y Niva no');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/registro`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const nami = await page.locator('button:has-text("Nami")').count();
    const nalu = await page.locator('button:has-text("Nalú")').count();
    const nox  = await page.locator('button:has-text("Nox")').count();
    const niva = await page.locator('button:has-text("Niva")').count();

    if (nami > 0) pass('Nami renderizada');     else fail('Nami picker', 'no encontrada');
    if (nalu > 0) pass('Nalú renderizada');     else fail('Nalú picker', 'no encontrada');
    if (nox === 0) pass('Nox NO renderizada');  else fail('Nox oculta', `${nox} botones Nox`);
    if (niva === 0) pass('Niva NO renderizada');else fail('Niva oculta', `${niva} botones Niva`);
    await ctx.close();
  }

  // ───────────────────────── Test 8: V3 Recepción rename ──────────────────
  console.log('\nTest 8: /landing-v3 muestra "Centinelia Recepción", no "Centinelia Voz"');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/landing-v3`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const rec = await page.locator('text=Centinelia Recepción').count();
    const voz = await page.locator('text=Centinelia Voz').count();
    if (rec > 0)   pass(`"Centinelia Recepción" visible ${rec}x`);
    else           fail('rename', 'no encontrado');
    if (voz === 0) pass('"Centinelia Voz" ya no aparece');
    else           fail('rename leftovers', `"Centinelia Voz" aparece ${voz}x`);
    await ctx.close();
  }

} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log('\n' + '='.repeat(60));
console.log(`${results.filter(r => r.ok).length}/${results.length} checks pasaron`);
if (failed.length) {
  console.log('FALLAS:');
  for (const f of failed) console.log(`  - ${f.name}: ${f.why}`);
  process.exit(1);
}
console.log('TODO OK');
