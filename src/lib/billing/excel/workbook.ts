import ExcelJS from 'exceljs';
import type { ExcelSchema } from './schemas';

type Row = Record<string, unknown>;

export class ExcelWorkbook {
  private constructor(
    private wb: ExcelJS.Workbook,
    private schema: ExcelSchema
  ) {}

  static empty(schema: ExcelSchema): ExcelWorkbook {
    const wb = new ExcelJS.Workbook();
    for (const sheet of schema.sheets) {
      const ws = wb.addWorksheet(sheet.name);
      ws.columns = sheet.columns.map(c => ({
        header: c.header,
        key: c.key,
        width: c.width ?? 15,
      }));
    }
    return new ExcelWorkbook(wb, schema);
  }

  static async fromBuffer(buf: Buffer, schema: ExcelSchema): Promise<ExcelWorkbook> {
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    // Ensure column key mappings exist for loaded sheets
    for (const sheet of schema.sheets) {
      const ws = wb.getWorksheet(sheet.name);
      if (ws) {
        // Re-assign columns so key-based row reads work correctly
        ws.columns = sheet.columns.map(c => ({
          header: c.header,
          key: c.key,
          width: c.width ?? 15,
        }));
      }
    }
    return new ExcelWorkbook(wb, schema);
  }

  getRows(sheetName: string): Row[] {
    const ws = this.wb.getWorksheet(sheetName);
    if (!ws) return [];
    const schemaDef = this.schema.sheets.find(s => s.name === sheetName);
    if (!schemaDef) return [];
    const cols = schemaDef.columns;
    const rows: Row[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const obj: Row = {};
      cols.forEach((c, idx) => {
        const cell = row.getCell(idx + 1);
        obj[c.key] = cell.value;
      });
      rows.push(obj);
    });
    return rows;
  }

  appendRow(sheetName: string, row: Row): void {
    const ws = this.wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Sheet "${sheetName}" does not exist`);
    const schemaDef = this.schema.sheets.find(s => s.name === sheetName);
    if (!schemaDef) throw new Error(`Schema for sheet "${sheetName}" not found`);
    // Build ordered values array matching column order
    const values = schemaDef.columns.map(c => row[c.key] ?? null);
    ws.addRow(values);
  }

  updateRow(
    sheetName: string,
    matcher: (r: Row) => boolean,
    updates: Row
  ): number {
    const ws = this.wb.getWorksheet(sheetName);
    if (!ws) return 0;
    const schemaDef = this.schema.sheets.find(s => s.name === sheetName);
    if (!schemaDef) return 0;
    const cols = schemaDef.columns;
    let count = 0;
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const obj: Row = {};
      cols.forEach((c, idx) => {
        obj[c.key] = row.getCell(idx + 1).value;
      });
      if (matcher(obj)) {
        for (const [key, value] of Object.entries(updates)) {
          const colIdx = cols.findIndex(c => c.key === key);
          if (colIdx >= 0) {
            row.getCell(colIdx + 1).value = value as ExcelJS.CellValue;
          }
        }
        count++;
      }
    });
    return count;
  }

  deleteRow(
    sheetName: string,
    matcher: (r: Row) => boolean
  ): number {
    const ws = this.wb.getWorksheet(sheetName);
    if (!ws) return 0;
    const schemaDef = this.schema.sheets.find(s => s.name === sheetName);
    if (!schemaDef) return 0;
    const cols = schemaDef.columns;
    const toDelete: number[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const obj: Row = {};
      cols.forEach((c, idx) => {
        obj[c.key] = row.getCell(idx + 1).value;
      });
      if (matcher(obj)) toDelete.push(rowNum);
    });
    // Delete in reverse order to preserve row numbers
    for (const rn of toDelete.reverse()) {
      ws.spliceRows(rn, 1);
    }
    return toDelete.length;
  }

  async toBuffer(): Promise<Buffer> {
    const arr = await this.wb.xlsx.writeBuffer();
    return Buffer.from(arr);
  }
}
