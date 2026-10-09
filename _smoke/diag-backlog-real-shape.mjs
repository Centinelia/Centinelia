// Diagnóstico puro de qué contiene el BACKLOG real HOY.
// Sin suposiciones: lee rango amplio (A1:Z100), cuenta filas y columnas con
// contenido, imprime primeras 3 y últimas 3 filas con datos.

import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctx) { console.error('ctx err:', ctx); process.exit(1); }

console.log('── Config ──');
console.log('  sheets.backlog:', JSON.stringify(ctx.config.sheets.backlog));
console.log('  itemId:', ctx.config.location.itemId);

const sheetName = ctx.config.sheets.backlog.name;
const startRow = ctx.config.sheets.backlog.start_row;
console.log(`\n── Rango amplio A1:Z100 en hoja "${sheetName}" ──`);
const range = await adapter.GraphExcel.readRange(ctx.token, ctx.config.location, sheetName, 'A1:Z100');

// Cuenta filas no-vacías
let nonEmptyRows = 0;
const nonEmptyRowIndexes = [];
for (let i = 0; i < range.values.length; i++) {
  const row = range.values[i];
  if (row.some(v => v !== '' && v !== null && v !== undefined)) {
    nonEmptyRows++;
    nonEmptyRowIndexes.push(i + 1);  // 1-based
  }
}
console.log(`  Filas no-vacías: ${nonEmptyRows}`);
console.log(`  Rows no-vacías (1-based): ${nonEmptyRowIndexes.slice(0, 5).join(',')}${nonEmptyRowIndexes.length > 5 ? '... hasta ' + nonEmptyRowIndexes[nonEmptyRowIndexes.length - 1] : ''}`);

// Cuenta columnas con header no-vacío (primera fila con data)
const firstDataRow = range.values[0] ?? [];
let maxColumns = 0;
for (let col = 0; col < firstDataRow.length; col++) {
  if (firstDataRow[col] !== '' && firstDataRow[col] !== null) maxColumns = col + 1;
}
console.log(`  Columnas con header en row 1: ${maxColumns}`);

// Row headers at startRow - 1 (o row 4 si start_row=5)
console.log(`\n── Headers de datos (row ${startRow - 1}) ──`);
const headerRow = range.values[startRow - 2] ?? [];  // 0-based index
console.log(' ', headerRow.filter(v => v !== '').join(' | '));

console.log(`\n── Primeras 3 filas de datos (desde row ${startRow}) ──`);
for (let i = startRow - 1; i < startRow + 2 && i < range.values.length; i++) {
  const row = range.values[i];
  if (!row || !row.some(v => v !== '' && v !== null)) continue;
  console.log(`  row ${i + 1}:`, row.filter(v => v !== '').slice(0, 12).join(' | '));
}

console.log('\n── Últimas 3 filas con datos (<= row 50) ──');
const dataRowsOnly = nonEmptyRowIndexes.filter(r => r >= startRow && r <= 60);
console.log(`  Total filas de datos en rango start_row..60: ${dataRowsOnly.length}`);
for (const rowNum of dataRowsOnly.slice(-3)) {
  const row = range.values[rowNum - 1];
  console.log(`  row ${rowNum}:`, row.filter(v => v !== '').slice(0, 12).join(' | '));
}

console.log('\n── Resumen ──');
console.log(`  Hoja: ${sheetName}`);
console.log(`  start_row config: ${startRow}`);
console.log(`  Filas totales no-vacías en A1:Z100: ${nonEmptyRows}`);
console.log(`  Filas DE DATOS (>= row ${startRow}): ${dataRowsOnly.length}`);
console.log(`  Columnas: ${maxColumns}`);
