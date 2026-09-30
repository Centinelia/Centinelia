import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { statSync } from 'node:fs';

const HTML_PATH = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Guia-Archivo-Excel-Nami.html';
const PDF_PATH = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Guia-Archivo-Excel-Nami.pdf';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(pathToFileURL(HTML_PATH).href, { waitUntil: 'networkidle' });

await page.pdf({
  path: PDF_PATH,
  format: 'Letter',
  printBackground: true,
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
});

await browser.close();

const { size } = statSync(PDF_PATH);
console.log(`PDF generado: ${PDF_PATH} (${size} bytes)`);
