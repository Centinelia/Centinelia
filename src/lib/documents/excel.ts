import * as XLSX from 'xlsx';

export interface ExcelSheet {
  name:    string;
  headers: string[];
  rows:    (string | number | null)[][];
}

export function generateExcel(sheets: ExcelSheet[]): Buffer {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const data: (string | number | null)[][] = [sheet.headers, ...sheet.rows];
    const ws   = XLSX.utils.aoa_to_sheet(data);

    // Bold header row
    const headerRange = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
      const cell = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[cell]) ws[cell].s = { font: { bold: true } };
    }

    // Auto-width columns (estimate from content)
    const colWidths = sheet.headers.map((h, ci) => {
      const maxLen = Math.max(
        h.length,
        ...sheet.rows.map(r => String(r[ci] ?? '').length),
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
