// Inspección detallada del template original de tortillería para entender
// qué son las cols B/C (FECHA SEGUIMIENTO doble) y col I.
//
// Uso: npx tsx scripts/inspect-tortilleria-template.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import fs from 'node:fs';

const SOURCE_PATH = 'C:/Users/Nazre/Dropbox/PC/Downloads/Tortillería Estrella X Centinelia/BITACORA DE CLIENTES OCTUBRE 2023.xlsx';

async function main() {
  const ExcelJSMod = await import('exceljs');
  const Workbook = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;

  const buffer = fs.readFileSync(SOURCE_PATH);
  const wb = new Workbook();
  await wb.xlsx.load(buffer as any);

  console.log(`Sheets: ${wb.worksheets.map((w: any) => w.name).join(', ')}\n`);

  const ws = wb.getWorksheet('09 - 14 OCTUBRE ') ?? wb.worksheets[0];
  console.log(`Analizando sheet: "${ws.name}"\n`);

  // Merges
  const model = ws.model;
  const merges = model?.merges ?? [];
  console.log(`Merges (${merges.length}):`);
  merges.slice(0, 20).forEach((m: any) => console.log(`  ${JSON.stringify(m)}`));
  console.log();

  // Rows 1-3 con detalle por col A-Q
  for (let r = 1; r <= 3; r++) {
    console.log(`--- Row ${r} ---`);
    const row = ws.getRow(r);
    for (let c = 1; c <= 17; c++) {
      const cell = row.getCell(c);
      const letter = String.fromCharCode(64 + c);
      const v = cell.value;
      const displayVal = v == null ? '(empty)' : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v);
      console.log(`  ${letter} (${cell.address}): value="${displayVal}" | type=${cell.type}`);
    }
    console.log();
  }

  // Muestra 3 rows de data (row 3-5) para ver qué había realmente en col C e I
  console.log('--- Muestra de rows 3-5 con TODAS las cols (data histórica 2023) ---');
  for (let r = 3; r <= 5; r++) {
    console.log(`Row ${r}:`);
    const row = ws.getRow(r);
    for (let c = 1; c <= 17; c++) {
      const cell = row.getCell(c);
      const letter = String.fromCharCode(64 + c);
      const v = cell.value;
      if (v == null || v === '') continue;
      const display = typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80);
      console.log(`  ${letter}: "${display}"`);
    }
    console.log();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
