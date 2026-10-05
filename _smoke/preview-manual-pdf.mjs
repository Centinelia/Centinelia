// Renderiza las páginas del Manual PDF a PNG usando playwright + print media.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = 'C:/Users/Nazre/centinelia/.claude/worktrees/nami-fase1-inventory-writers/_smoke/manual-preview';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Regen HTML temp file first to render it
import('./build-manual-camila-pdf.mjs');  // reusa el HTML? no — tendría que re-ejecutar

// Approach alterno: convertir PDF a imagen via playwright file:// render del PDF directo
const PDF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Muestra_para_Camila/Manual-Nami-para-Camila.pdf';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 1600 } });
const page = await context.newPage();
await page.goto('file:///' + PDF.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// Chrome renderiza PDFs internamente — screenshot captura la primera página
await page.screenshot({ path: `${OUT}/pag-01-preview.png`, fullPage: true });
console.log('✓ Screenshot pag 1 completo:', `${OUT}/pag-01-preview.png`);
await browser.close();
