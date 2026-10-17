// Verifica que cada meerkat renderiza su subtítulo específico en /cotizar.
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';

const EXPECT = {
  noah:  'Trabaja tu lista',
  nami:  'control del inventario',
  nalu:  'Concilia tu banca',
  nala:  'Timbra tus CFDIs',
  nico:  'Busca a tus clientes',
  nelia: 'Resuelve dudas',
  naia:  'Organiza vacaciones',
  neo:   'Resuelve tickets',
  nara:  'Coordina procesos',
  nova:  'Despacha equipos',
  nia:   'Contesta llamadas 24/7',
};

const browser = await chromium.launch();
let pass = 0, fail = 0;
for (const [role, expected] of Object.entries(EXPECT)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/cotizar?role=${role}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const subtitles = await page.locator('section >> p').allInnerTexts();
  const found = subtitles.find(t => t.includes(expected));
  if (found) { console.log(`  ok  ${role.padEnd(6)} → "${expected}" visible`); pass++; }
  else       { console.log(`  FAIL ${role.padEnd(6)} → esperaba "${expected}"`); fail++; }
  await ctx.close();
}
await browser.close();
console.log(`\n${pass}/${pass + fail} subtítulos correctos`);
if (fail) process.exit(1);
