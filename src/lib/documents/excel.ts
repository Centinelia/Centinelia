import ExcelJS from 'exceljs';

export interface ExcelSheet {
  name:    string;
  headers: string[];
  rows:    (string | number | null)[][];
  /** Notas al inicio de la hoja (bajo el título, arriba de los headers). Opcional. */
  subtitle?: string;
}

export interface ExcelBrand {
  businessName?: string;
  accentColor?:  string;                // hex con o sin #, e.g. "#6C3BFF"
  logoData?:     string | null;         // data URL "data:image/png;base64,..."
  title?:        string;                // título grande del reporte, e.g. "Reporte comercial · Últimos 30 días"
  subtitle?:     string;                // subtítulo opcional bajo el título
}

// Convierte "#6C3BFF" o "6C3BFF" a "FF6C3BFF" (ARGB para ExcelJS).
function argb(hex: string): string {
  const clean = (hex || '').replace(/^#/, '').toUpperCase();
  return `FF${clean.padEnd(6, '0').slice(0, 6)}`;
}

// Aclara un color hex (blend con blanco) — para bandas alternadas.
function lighten(hex: string, amount: number): string {
  const clean = hex.replace(/^#/, '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0');
  return `FF${mix(r)}${mix(g)}${mix(b)}`.toUpperCase();
}

function extractBase64(dataUrl: string): { mime: 'png' | 'jpeg'; buffer: Buffer } | null {
  const m = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
  return { mime, buffer: Buffer.from(m[2], 'base64') };
}

export async function generateExcel(sheets: ExcelSheet[], brand?: ExcelBrand): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator     = brand?.businessName ?? 'Centinelia';
  wb.created     = new Date();
  wb.modified    = new Date();

  const accentHex = (brand?.accentColor ?? '#6C3BFF').replace(/^#/, '');
  const accentArgb = argb(accentHex);
  const stripeArgb = lighten(accentHex, 0.94);       // banda alternada muy tenue
  const headerText = 'FFFFFFFF';                     // blanco sobre fondo accent
  const bodyText   = 'FF2A2A3F';                     // gris oscuro Centinelia

  // Registra el logo UNA vez a nivel workbook, se reusa en todas las hojas.
  let logoId: number | null = null;
  if (brand?.logoData) {
    const decoded = extractBase64(brand.logoData);
    if (decoded) {
      logoId = wb.addImage({ buffer: decoded.buffer as unknown as ArrayBuffer, extension: decoded.mime });
    }
  }

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
      properties: { defaultRowHeight: 18 },
      views:      [{ state: 'frozen', ySplit: brand ? 4 : 1 }],
    });

    // ── Encabezado con branding ─────────────────────────────────────────────
    let dataStartRow = 1;
    if (brand) {
      // Fila 1: banda accent (título + fecha).
      ws.mergeCells(1, 1, 1, Math.max(sheet.headers.length, 4));
      const titleCell = ws.getCell(1, 1);
      titleCell.value = brand.title ?? `Reporte · ${sheet.name}`;
      titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: headerText } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
      ws.getRow(1).height = 32;

      // Fila 2: subtítulo (business name + hoja + fecha).
      ws.mergeCells(2, 1, 2, Math.max(sheet.headers.length, 4));
      const subCell = ws.getCell(2, 1);
      const dateStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
      const parts = [brand.businessName, sheet.name, dateStr].filter(Boolean);
      subCell.value = brand.subtitle ?? parts.join(' · ');
      subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF8A8A8A' } };
      subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(2).height = 22;

      // Fila 3: separador vacío.
      ws.getRow(3).height = 8;
      dataStartRow = 4;

      // Logo esquina superior derecha (si existe).
      if (logoId !== null) {
        const lastCol = Math.max(sheet.headers.length, 4);
        ws.addImage(logoId, {
          tl: { col: lastCol - 1.2, row: 0.1 },
          ext: { width: 110, height: 44 },
          editAs: 'oneCell',
        });
      }
    }

    // ── Headers ─────────────────────────────────────────────────────────────
    const headerRow = ws.getRow(dataStartRow);
    sheet.headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: headerText } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.border = { bottom: { style: 'thin', color: { argb: accentArgb } } };
    });
    headerRow.height = 24;

    // ── Data rows ───────────────────────────────────────────────────────────
    if (sheet.rows.length === 0) {
      const emptyRow = ws.getRow(dataStartRow + 1);
      emptyRow.getCell(1).value = 'Sin datos para el período consultado.';
      emptyRow.getCell(1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF9A9A9A' } };
      emptyRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.mergeCells(dataStartRow + 1, 1, dataStartRow + 1, Math.max(sheet.headers.length, 4));
    } else {
      sheet.rows.forEach((row, ri) => {
        const excelRow = ws.getRow(dataStartRow + 1 + ri);
        row.forEach((val, ci) => {
          const cell = excelRow.getCell(ci + 1);
          cell.value = val ?? '';
          cell.font = { name: 'Calibri', size: 11, color: { argb: bodyText } };
          cell.alignment = { vertical: 'middle', horizontal: typeof val === 'number' ? 'right' : 'left', indent: 1, wrapText: true };
          // Bandas alternadas.
          if (ri % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stripeArgb } };
          }
        });
      });
    }

    // ── Column widths (auto por contenido, con min/max) ────────────────────
    sheet.headers.forEach((h, ci) => {
      const contentLens = sheet.rows.map(r => String(r[ci] ?? '').length);
      const maxLen = Math.max(h.length, ...contentLens, 10);
      ws.getColumn(ci + 1).width = Math.min(Math.max(maxLen + 4, 12), 55);
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
