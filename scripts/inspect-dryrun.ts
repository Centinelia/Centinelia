import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
async function main() {
  const ExcelJSMod = await import('exceljs');
  const Workbook = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;
  const fs = await import('node:fs');
  const path = process.argv[2] ?? 'C:/Users/Nazre/Downloads/nelia-dryrun-1788025399760.xlsx';
  const buf = fs.readFileSync(path);
  const wb = new Workbook(); await wb.xlsx.load(buf as any);
  for (const ws of wb.worksheets) {
    console.log(`\n== ${ws.name} ==`);
    for (let r = 1; r <= 4; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= 17; c++) {
        const v = row.getCell(c).value;
        if (v != null && v !== '') cells.push(`${String.fromCharCode(64+c)}=${String(v).slice(0,30)}`);
      }
      if (cells.length) console.log(`  r${r}: ${cells.join(' | ')}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
