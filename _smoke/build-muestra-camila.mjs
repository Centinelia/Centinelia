// Genera 3 archivos de muestra para enviar a Camila y que compare formatos:
//
//   1. 01_Tu_BACKLOG_actual.xlsx         — su hoja BACKLOG manual (47 filas, formato suyo)
//   2. 02_BACKLOG_Nami_propuesta.xlsx    — hoja BACKLOG_NAMI con el PDF TRANE parseado (45 filas, formato Nami)
//   3. 03_PDF_original_TRANE.pdf         — copia del PDF que Nami lee cada L/Mi/V
//
// Carpeta destino: C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Muestra_para_Camila/
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/build-muestra-camila.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const OUT_DIR    = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Muestra_para_Camila';
const SAMPLE_PDF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/AIRE ACONDICIONADO PROYECTOS SA DE CV.pdf';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
console.log('Carpeta destino:', OUT_DIR);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adapter = await import('../src/lib/inventory/adapter.ts');
const GraphExcel = adapter.GraphExcel;
const ctx = await adapter.resolveInventoryContext('camila@acproyectos.com', sb, '3245bc1f-89e1-4949-bbed-71a18b05e344');
if ('error' in ctx) { console.error(ctx); process.exit(1); }

// ─── 1. BACKLOG actual de Camila (hoja humana) ───────────────────────────────
console.log('\n── 1. Exportando BACKLOG actual (tu formato) ──');
const humana = await GraphExcel.readRange(ctx.token, ctx.config.location, 'BACKLOG', 'A1:H60');
const wb1 = new ExcelJS.Workbook();
const ws1 = wb1.addWorksheet('BACKLOG');
let last1 = 0;
humana.values.forEach((row, i) => {
  const hasContent = row.some(v => v !== '' && v !== null && v !== undefined);
  if (hasContent) {
    ws1.getRow(i + 1).values = ['', ...row]; // ExcelJS 1-indexed, shift
    last1 = i + 1;
  }
});
// Negrita en la fila de headers si la detectamos
ws1.getRow(4).font = { bold: true };
ws1.columns.forEach(c => { c.width = 18; });
const out1 = path.join(OUT_DIR, '01_Tu_BACKLOG_actual.xlsx');
await wb1.xlsx.writeFile(out1);
console.log('  ✓', out1, `(${last1} filas con contenido)`);

// ─── 2. BACKLOG_NAMI propuesta (lo que Nami generaría) ───────────────────────
console.log('\n── 2. Generando BACKLOG_NAMI propuesta (formato Nami) ──');
const parser = await import('../src/lib/inventory/backlog-parser.ts');
const syncer = await import('../src/lib/inventory/backlog-syncer.ts');
const pdfBytes = new Uint8Array(fs.readFileSync(SAMPLE_PDF));
const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', 'camila@acproyectos.com').maybeSingle();
const pwd = org.inventory_excel_config.backlog_trane.pdf_password;
const parsed = await parser.parseBacklogPdf(pdfBytes, pwd);
console.log('  PDF parseado:', parsed.rows.length, 'filas');

const wb2 = new ExcelJS.Workbook();
const ws2 = wb2.addWorksheet('BACKLOG_NAMI');
// Headers Nami (A..H)
ws2.getRow(4).values = ['', 'OC AC', 'OC TRANE', 'FECHA REGISTRO', 'MODELO', 'CANTIDAD', 'ESTATUS TRANE', 'FECHA ENTREGA ESTIMADA', 'NOTAS'];
ws2.getRow(4).font = { bold: true };
parsed.rows.forEach((r, i) => {
  const vals = syncer.rowToExcelValues(r);
  ws2.getRow(5 + i).values = ['', ...vals];
});
ws2.columns.forEach(c => { c.width = 20; });
ws2.getColumn(2).width = 12;  // OC AC
ws2.getColumn(3).width = 14;  // OC TRANE
ws2.getColumn(9).width = 42;  // NOTAS
const out2 = path.join(OUT_DIR, '02_BACKLOG_Nami_propuesta.xlsx');
await wb2.xlsx.writeFile(out2);
console.log('  ✓', out2, `(${parsed.rows.length} filas de datos, headers en R4)`);

// ─── 3. PDF original de TRANE (copia) ────────────────────────────────────────
console.log('\n── 3. Copiando PDF TRANE original ──');
const out3 = path.join(OUT_DIR, '03_PDF_original_TRANE.pdf');
fs.copyFileSync(SAMPLE_PDF, out3);
console.log('  ✓', out3);

// ─── 4. LÉEME.md con contexto corto para Camila ──────────────────────────────
console.log('\n── 4. Agregando LÉEME.md ──');
const readme = `# Comparativo BACKLOG — para que lo veas antes de la cita

Camila, tres archivos para que compares los formatos:

## 1. "Tu BACKLOG actual"
Es exactamente la hoja BACKLOG como la mantienes a mano hoy. Columnas:
- CUSTOMER PO NUMBER
- ITEM
- LINES STATUS
- QUANTITY
- BACKLOG USD
- RESERVED

## 2. "BACKLOG Nami propuesta"
Es la hoja que Nami llenaría automático cada lunes, miércoles y viernes, usando el PDF que TRANE te manda. Trae columnas distintas:
- OC AC
- OC TRANE
- FECHA REGISTRO
- MODELO
- CANTIDAD
- ESTATUS TRANE
- FECHA ENTREGA ESTIMADA
- NOTAS (donde embebo número de línea, warehouse, USD y RESERVED en una sola celda)

## 3. "PDF original de TRANE"
El documento tal como te lo mandan. Nami lo lee, lo descifra con la contraseña, extrae las ${parsed.rows.length} líneas y las vuelca al Excel.

## Qué queremos preguntarte
No queremos tocar tu BACKLOG a mano. Entonces Nami va a escribir en una hoja aparte dentro del mismo Excel. Si te acomoda tener las dos hojas lado a lado (la tuya + la de Nami actualizada 3 veces por semana), listo. Si prefieres mezclar formatos o migrar a solo una, lo platicamos.
`;
const outReadme = path.join(OUT_DIR, 'LÉEME.md');
fs.writeFileSync(outReadme, readme, 'utf8');
console.log('  ✓', outReadme);

console.log('\n✓ DONE. Archivos listos para enviar a Camila:');
console.log('   ', OUT_DIR);
