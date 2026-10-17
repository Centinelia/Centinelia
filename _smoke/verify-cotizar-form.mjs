// Smoke test del form de /cotizar: campo nuevo "dudas", esconder empleados
// cuando hay role, "Y más" en sidebar.
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const ok   = m => { console.log(`  ok  ${m}`); pass++; };
const bad  = m => { console.log(`  FAIL ${m}`); fail++; };

const browser = await chromium.launch();

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  return { ctx, page };
}

try {
  // Test 1: con role=noah, pregunta de empleados OCULTA
  console.log('\nTest 1: /cotizar?role=noah oculta campo "¿Cuántos empleados?"');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/cotizar?role=noah`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const empleadosLabel = await page.locator('text=¿Cuántos empleados digitales necesitas?').count();
    if (empleadosLabel === 0) ok('campo empleados oculto con role');
    else                       bad(`campo empleados aparece ${empleadosLabel}x con role=noah`);
    await ctx.close();
  }

  // Test 2: sin role, pregunta de empleados VISIBLE
  console.log('\nTest 2: /cotizar sin role muestra campo "¿Cuántos empleados?"');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/cotizar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const empleadosLabel = await page.locator('text=¿Cuántos empleados digitales necesitas?').count();
    if (empleadosLabel > 0) ok('campo empleados visible sin role');
    else                     bad('campo empleados no aparece sin role');
    await ctx.close();
  }

  // Test 3: nuevo campo "¿Tienes dudas..."
  console.log('\nTest 3: campo "¿Tienes dudas que quieras resolver antes?" existe');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/cotizar?role=noah`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const label = await page.locator('text=¿Tienes dudas que quieras resolver antes?').count();
    const textareas = await page.locator('textarea').count();
    if (label > 0) ok('label "¿Tienes dudas...?" presente');
    else           bad('no se encontró label');
    if (textareas >= 2) ok(`${textareas} textareas (mensaje + dudas)`);
    else                 bad(`solo ${textareas} textarea(s)`);
    await ctx.close();
  }

  // Test 4: "Y más" en sidebar
  console.log('\nTest 4: sidebar muestra "Y más, que diseñamos a la medida"');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/cotizar?role=nami`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const yMas = await page.locator('text=Y más, que diseñamos a la medida').count();
    if (yMas > 0) ok(`"Y más..." visible (${yMas}x)`);
    else           bad('no aparece "Y más..."');
    await ctx.close();
  }

  // Test 5: submit enabled con role (sin empleados)
  console.log('\nTest 5: submit button enabled con role, sin tocar empleados');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/cotizar?role=noah`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const btn = page.locator('button:has-text("Enviar solicitud")');
    const disabled = await btn.getAttribute('disabled');
    if (disabled === null) ok('submit habilitado con role');
    else                    bad(`submit deshabilitado: disabled=${disabled}`);
    await ctx.close();
  }

  // Test 6: submit disabled sin role sin empleados
  console.log('\nTest 6: submit disabled sin role y sin empleados elegidos');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/cotizar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const btn = page.locator('button:has-text("Enviar solicitud")');
    const disabled = await btn.getAttribute('disabled');
    if (disabled !== null) ok('submit correctamente deshabilitado sin role+empleados');
    else                    bad('submit habilitado sin role ni empleados elegidos');
    await ctx.close();
  }

} finally {
  await browser.close();
}

console.log(`\n${pass}/${pass + fail} checks pasaron`);
if (fail) process.exit(1);
