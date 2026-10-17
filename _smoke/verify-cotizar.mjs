// Smoke test de /cotizar personalizada por role.
// Corre: `node _smoke/verify-cotizar.mjs` con dev server en :3000.

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const results = [];
function pass(name) { results.push({ name, ok: true }); console.log(`  ok  ${name}`); }
function fail(name, why) { results.push({ name, ok: false, why }); console.log(`  FAIL ${name} :: ${why}`); }

const browser = await chromium.launch();

async function freshPage(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  return { ctx, page };
}

try {
  // ───────────────────────── Test 1: hero genérico sin role ──────────────
  console.log('\nTest 1: /cotizar sin role muestra hero genérico');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/cotizar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const generic = await page.locator('text=Diseña tu oficina').count();
    const personalized = await page.locator('text=Diseñando a').count();
    if (generic > 0)       pass('título genérico visible');
    else                   fail('título genérico', 'no encontrado');
    if (personalized === 0) pass('sin chip "Diseñando a" (correcto para no-role)');
    else                    fail('chip', `aparece ${personalized}x sin role`);
    await ctx.close();
  }

  // ───────────────────────── Test 2: ?role=noah personaliza ──────────────
  console.log('\nTest 2: /cotizar?role=noah personaliza hero + sidebar');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/cotizar?role=noah`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const chip      = await page.locator('text=Diseñando a Noah').count();
    const title     = await page.locator('text=Diseñemos a').count();
    const sidebar   = await page.locator('text=Lo que trabaja Noah').count();
    const timeline  = await page.locator('text=Así trabajamos').count();

    if (chip > 0)     pass('chip "Diseñando a Noah" visible');
    else              fail('chip Noah', 'no visible');
    if (title > 0)    pass('título "Diseñemos a" personalizado');
    else              fail('título Noah', 'no personalizado');
    if (sidebar > 0)  pass('sidebar "Lo que trabaja Noah" visible');
    else              fail('sidebar Noah', 'no visible');
    if (timeline > 0) pass('timeline "Así trabajamos" visible');
    else              fail('timeline', 'no visible');
    await ctx.close();
  }

  // ───────────────────────── Test 3: ?role=nami renderiza su imagen ──────
  console.log('\nTest 3: /cotizar?role=nami renderiza imagen de Nami');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/cotizar?role=nami`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const chip = await page.locator('text=Diseñando a Nami').count();
    const img  = await page.locator('img[alt="Nami"], img[src*="nami"]').count();
    if (chip > 0) pass('chip Nami visible');
    else          fail('chip Nami', 'no visible');
    if (img > 0)  pass(`imagen de Nami renderizada (${img} tags)`);
    else           fail('img Nami', 'no encontrada');
    await ctx.close();
  }

  // ───────────────────────── Test 4: timeline 3 pasos ────────────────────
  console.log('\nTest 4: timeline muestra Paso 1, 2, 3');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/cotizar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const paso1 = await page.locator('text=Paso 1').count();
    const paso2 = await page.locator('text=Paso 2').count();
    const paso3 = await page.locator('text=Paso 3').count();
    if (paso1 && paso2 && paso3) pass('3 pasos del timeline presentes');
    else                         fail('timeline pasos', `paso1=${paso1} paso2=${paso2} paso3=${paso3}`);
    await ctx.close();
  }

  // ───────────────────────── Test 5: form submit button existe ───────────
  console.log('\nTest 5: form sigue funcional (botón Enviar + campos requeridos)');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/cotizar?role=noah`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const btnEnviar  = await page.locator('button:has-text("Enviar solicitud")').count();
    const campoCorreo = await page.locator('input[type="email"]').count();
    if (btnEnviar > 0)   pass('botón "Enviar solicitud" visible');
    else                 fail('submit', 'no visible');
    if (campoCorreo > 0) pass('campo correo email visible');
    else                 fail('campo email', 'no visible');
    await ctx.close();
  }

  // ───────────────────────── Test 6: role inválido = genérico ────────────
  console.log('\nTest 6: /cotizar?role=xxx (inválido) usa hero genérico');
  {
    const { ctx, page } = await freshPage();
    await page.goto(`${BASE}/cotizar?role=xxx`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const generic = await page.locator('text=Diseña tu oficina').count();
    const chip    = await page.locator('text=Diseñando a').count();
    if (generic > 0) pass('fallback a hero genérico');
    else             fail('fallback', 'no renderiza hero genérico');
    if (chip === 0)  pass('sin chip personalizado');
    else             fail('chip spurio', `aparece ${chip}x con role inválido`);
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
