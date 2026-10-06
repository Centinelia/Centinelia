// Renderiza el HTML del manual con print emulation y hace fullPage screenshot.
// Después crop a Letter-size chunks para review visual por página.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// Re-genera el HTML usando el mismo pattern que build-manual-camila-pdf.mjs
const LOGO_PATH = 'public/logo.png';
const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
const logoDataUrl = `data:image/png;base64,${logoBase64}`;
const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

// Importar el HTML del script build
const buildScript = fs.readFileSync('_smoke/build-manual-camila-pdf.mjs', 'utf8');
const htmlMatch = buildScript.match(/const html = \/\* html \*\/ `([\s\S]*?)`;/);
if (!htmlMatch) { console.error('No pude extraer el HTML del script'); process.exit(1); }
const html = htmlMatch[1]
  .replace(/\$\{logoDataUrl\}/g, logoDataUrl)
  .replace(/\$\{today\}/g, today);

const OUT = 'C:/Users/Nazre/centinelia/.claude/worktrees/nami-fase1-inventory-writers/_smoke/manual-preview';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
// Letter at 150 DPI = 1275 x 1650 px
const context = await browser.newContext({ viewport: { width: 1275, height: 1650 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.emulateMedia({ media: 'print' });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// Mide altura real
const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
console.log('Total HTML height:', totalHeight, 'px');

// Encuentra límites de página: cada <div class="page"> y .cover
const pageBreaks = await page.evaluate(() => {
  const pages = Array.from(document.querySelectorAll('.page, .cover'));
  return pages.map((p, i) => {
    const r = p.getBoundingClientRect();
    return { idx: i + 1, top: Math.round(r.top + window.scrollY), height: Math.round(r.height), tag: p.className };
  });
});
console.log('Pages found:', pageBreaks.length);
pageBreaks.forEach(p => console.log(`  pag ${p.idx} [${p.tag}] top=${p.top}px height=${p.height}px`));

// Screenshot de cada página aislada
for (const p of pageBreaks) {
  await page.setViewportSize({ width: 1275, height: Math.max(p.height + 50, 400) });
  await page.evaluate((top) => window.scrollTo(0, top), p.top);
  await page.waitForTimeout(300);
  const outPath = `${OUT}/pag-${String(p.idx).padStart(2, '0')}.png`;
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1275, height: Math.min(p.height, 1650) } });
  console.log(`  ✓ ${outPath}`);
}

await browser.close();
console.log('\nDone. Preview images en:', OUT);
