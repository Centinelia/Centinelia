/**
 * Renderiza el checklist Meefi PDF a un archivo local.
 * Uso: node scripts/meefi/generate-checklist-pdf.mjs
 * Output: demos/meefi-gac/Demo_Meefi_15-sept.pdf
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('tsx', pathToFileURL('./'));

const { renderToBuffer } = await import('@react-pdf/renderer');
const { createElement } = await import('react');
const { writeFileSync } = await import('node:fs');
const { ChecklistMeefiPdf } = await import('../../src/lib/pdf/checklist-meefi.tsx');

const buffer = await renderToBuffer(createElement(ChecklistMeefiPdf));
const outPath = 'demos/meefi-gac/Demo_Meefi_15-sept.pdf';
writeFileSync(outPath, buffer);
console.log(`PDF generado: ${outPath} (${buffer.length} bytes)`);
