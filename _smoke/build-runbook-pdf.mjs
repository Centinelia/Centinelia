// Genera el runbook del Meet con Camila en PDF (estilo técnico limpio, SIN brand
// Centinelia — es doc interno para Nazre, no cliente-facing). Lee el markdown
// de la memoria local y lo convierte a PDF via marked + playwright.
//
// Uso: npx tsx _smoke/build-runbook-pdf.mjs

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { marked } from 'marked';

const MD_PATH = 'C:/Users/Nazre/.claude/projects/C--Users-Nazre/memory/handoff_runbook_camila_nami_e2e.md';
const OUT_DIR = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Muestra_para_Camila';
const OUT_PDF = path.join(OUT_DIR, '_INTERNO_Runbook-Nazre-Meet-Camila.pdf');

if (!fs.existsSync(MD_PATH)) { console.error('No encontré el runbook:', MD_PATH); process.exit(1); }
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let md = fs.readFileSync(MD_PATH, 'utf8');

// Remover frontmatter YAML
md = md.replace(/^---[\s\S]*?---\n/, '');

const bodyHtml = marked.parse(md, { gfm: true, breaks: false });
const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

const html = /* html */ `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Runbook Meet Camila (interno Nazre)</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: white; color: #1a1a1a; font-family: 'SF Mono', 'Consolas', 'Menlo', monospace; font-size: 9.5pt; line-height: 1.55; orphans: 3; widows: 3; }

  /* Pagination */
  @page { size: Letter; margin: 18mm 16mm; }
  h1, h2, h3 { page-break-after: avoid; break-after: avoid; page-break-inside: avoid; break-inside: avoid; }
  pre, blockquote, table, ul, ol { page-break-inside: avoid; break-inside: avoid; }

  /* Header de página */
  .meta-head { font-size: 8pt; color: #888; border-bottom: 1px solid #ddd; padding-bottom: 6mm; margin-bottom: 8mm; display: flex; justify-content: space-between; }
  .meta-head .title { font-weight: 600; color: #333; }

  /* Typography — sans para texto, mono para code */
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; }
  code, pre { font-family: 'SF Mono', 'Consolas', 'Menlo', 'Courier New', monospace; font-size: 9pt; }

  h1 { font-size: 20pt; font-weight: 700; color: #0a0a0a; margin: 10mm 0 4mm 0; letter-spacing: -0.4px; border-bottom: 2px solid #333; padding-bottom: 2mm; }
  h1:first-of-type { margin-top: 0; }
  h2 { font-size: 14pt; font-weight: 600; color: #1a1a1a; margin: 8mm 0 3mm 0; letter-spacing: -0.2px; }
  h3 { font-size: 11pt; font-weight: 600; color: #333; margin: 5mm 0 2mm 0; }

  p { margin: 0 0 3mm 0; }
  strong { color: #0a0a0a; font-weight: 600; }

  ul, ol { margin: 0 0 3mm 0; padding-left: 20px; }
  li { margin-bottom: 1.5mm; }
  li > p { margin-bottom: 1mm; }

  /* Code blocks */
  pre { background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px; padding: 3mm 4mm; overflow-x: auto; margin: 2mm 0 4mm 0; font-size: 8.5pt; line-height: 1.45; }
  pre code { background: none; padding: 0; border: none; font-size: inherit; }
  code { background: #f0f0f0; padding: 0 3px; border-radius: 3px; font-size: 9pt; color: #c62828; }

  /* Blockquote (los scripts verbales a Camila) */
  blockquote { background: #f8f9fc; border-left: 3px solid #6C3BFF; padding: 2mm 4mm; margin: 2mm 0 4mm 0; color: #333; }
  blockquote p { margin-bottom: 1.5mm; font-style: italic; }
  blockquote p:last-child { margin-bottom: 0; }

  /* Tables */
  table { border-collapse: collapse; width: 100%; margin: 2mm 0 4mm 0; font-size: 9pt; }
  th, td { border: 1px solid #ddd; padding: 2mm 3mm; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }

  /* Links y wiki-links [[...]] */
  a { color: #0366d6; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Horizontal rule */
  hr { border: none; border-top: 1px solid #ddd; margin: 6mm 0; }

  /* Headers de sección más visibles */
  h2[id^="pre-check"], h2[id^="agenda"], h2[id^="1-apertura"], h2[id^="2-demos"], h2[id^="3-backlog"], h2[id^="4-conversaciones"], h2[id^="5-que-dejas"], h2[id^="6-lo-que-no"], h2[id^="7-post-meet"] { background: #fff8e1; padding: 2mm 3mm; border-left: 4px solid #ffa726; margin-left: -3mm; }

  /* Nota: tacheados ~~texto~~ renderizados por marked */
  del { color: #999; text-decoration: line-through; }
</style>
</head>
<body>
  <div class="meta-head">
    <div class="title">Runbook Meet Camila — uso interno Nazre</div>
    <div>Generado ${today}</div>
  </div>
  ${bodyHtml}
</body>
</html>`;

console.log('Rendering runbook to PDF...');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path: OUT_PDF,
  format: 'Letter',
  printBackground: true,
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
});
await browser.close();
console.log('✓ PDF generado:', OUT_PDF);
const stats = fs.statSync(OUT_PDF);
console.log(`  Tamaño: ${(stats.size / 1024).toFixed(1)} KB`);
