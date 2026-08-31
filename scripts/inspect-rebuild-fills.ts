import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import fs from 'node:fs';

async function main() {
  const ExcelJSMod = await import('exceljs');
  const Workbook = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;
  const path = process.argv[2];
  const buf = fs.readFileSync(path);
  const wb = new Workbook(); await wb.xlsx.load(buf as any);

  for (const ws of wb.worksheets) {
    console.log(`\n=== SHEET: "${ws.name}" ===`);
    const model = (ws as any).model;
    console.log(`Merges: ${JSON.stringify(model?.merges ?? [])}`);
    for (let r = 1; r <= 4; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= 17; c++) {
        const cell = row.getCell(c);
        const v = cell.value;
        const fill = (cell.fill as any)?.fgColor?.argb ?? 'none';
        const letter = String.fromCharCode(64 + c);
        cells.push(`${letter}=${v == null ? '·' : String(v).slice(0, 15)}(${fill.slice(0, 8)})`);
      }
      console.log(`r${r}: ${cells.join(' | ')}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
