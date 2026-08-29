import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import fs from 'node:fs';

const SOURCE_PATH = 'C:/Users/Nazre/Dropbox/PC/Downloads/Tortillería Estrella X Centinelia/BITACORA DE CLIENTES OCTUBRE 2023.xlsx';

async function main() {
  const ExcelJSMod = await import('exceljs');
  const Workbook = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;
  const wb = new Workbook();
  await wb.xlsx.load(fs.readFileSync(SOURCE_PATH) as any);

  const ws = wb.getWorksheet('09 - 14 OCTUBRE ') ?? wb.worksheets[0];
  console.log(`Sheet: ${ws.name}\n`);

  const model = (ws as any).model;
  console.log(`Merges (${model?.merges?.length ?? 0}):`);
  (model?.merges ?? []).forEach((m: any) => console.log(`  ${m}`));
  console.log();

  // Row 1 y 2 cell-by-cell con fills
  for (const r of [1, 2, 3]) {
    console.log(`--- Row ${r} ---`);
    const row = ws.getRow(r);
    for (let c = 1; c <= 20; c++) {
      const cell = row.getCell(c);
      const letter = String.fromCharCode(64 + c);
      const v = cell.value;
      const fill = (cell.fill as any)?.fgColor?.argb ?? null;
      const font = (cell.font as any) ?? {};
      if (v == null && !fill) continue;
      const val = v == null ? '(empty)' : typeof v === 'string' ? v.slice(0, 50) : String(v);
      console.log(`  ${letter}${r}: value="${val}" | fill=${fill} | bold=${!!font.bold} | color=${font.color?.argb ?? '-'}`);
    }
    console.log();
  }

  console.log('Col widths:');
  for (let c = 1; c <= 20; c++) {
    const col = ws.getColumn(c);
    if (col.width) console.log(`  ${String.fromCharCode(64+c)}: ${col.width}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
