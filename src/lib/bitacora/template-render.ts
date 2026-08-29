import { Workbook } from 'exceljs';
import type { IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import type { TemplateMapping, CanonicalField } from './template-analyzer';

/**
 * Extrae el valor de un incident correspondiente a un campo canónico.
 * Format: fecha ES-MX corto (28/8/2026), phone raw, resto string.
 */
function fieldValue(inc: IncidentRow, field: CanonicalField): string {
  switch (field) {
    case 'fecha':
      return new Date(inc.created_at).toLocaleDateString('es-MX');
    case 'business_name':
      return inc.business_name;
    case 'sucursal':
      return inc.sucursal ?? '';
    case 'contact_name':
      return inc.contact_name ?? '';
    case 'contact_phone':
      return inc.contact_phone;
    case 'address':
      return inc.address;
    case 'motivo':
      return inc.motivo ?? '';
    case 'tipo':
      return inc.type === 'alta' ? 'Alta' : 'Queja';
    case 'verification_date':
      return inc.verification_scheduled_at
        ? new Date(inc.verification_scheduled_at).toLocaleDateString('es-MX')
        : '';
    case 'verification_result':
      if (inc.type === 'alta') return '';
      if (!inc.verification_result) return 'pendiente';
      return inc.verification_result;
    case 'vendedor':
      return inc.vendedor ?? '';
  }
}

function colLetterToNumber(letter: string): number {
  const upper = letter.toUpperCase();
  let n = 0;
  for (let i = 0; i < upper.length; i++) {
    n = n * 26 + (upper.charCodeAt(i) - 64);
  }
  return n;
}

/**
 * Renderiza la bitácora usando el template del cliente + su mapping.
 * Preserva estilos (colores, fuentes, bordes, logo/imagen si están en otra row).
 *
 * Estrategia:
 * 1. Cargar el template del buffer
 * 2. En el sheet target, snapshot los estilos de la fila insertion_row (esta
 *    fila es tratada como "template row" — puede estar vacía o con datos
 *    muestra del cliente que se descartan)
 * 3. Borrar la fila template (splice)
 * 4. Insertar N filas nuevas en insertion_row, aplicando estilos cacheados y
 *    valores per mapping. Filas después de la última se desplazan sin tocar.
 */
export async function renderWithCustomTemplate(
  templateBuffer: Buffer,
  mapping:        TemplateMapping,
  incidents:      IncidentRow[],
): Promise<Buffer> {
  const wb = new Workbook();
  await wb.xlsx.load(templateBuffer as unknown as ArrayBuffer);

  const ws = wb.getWorksheet(mapping.sheet_name) ?? wb.worksheets[0];
  if (!ws) throw new Error(`Sheet '${mapping.sheet_name}' no encontrado en el template`);

  // Cachear estilos de la fila template
  const sampleRow = ws.getRow(mapping.insertion_row);
  const sampleStyles: (unknown | undefined)[] = [];
  let maxCol = 1;
  sampleRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    sampleStyles[colNum] = cell.style;
    if (colNum > maxCol) maxCol = colNum;
  });
  // Fallback: si la fila template está vacía, usamos como min el rango de cols mapeadas
  for (const colLetter of Object.keys(mapping.columns)) {
    const n = colLetterToNumber(colLetter);
    if (n > maxCol) maxCol = n;
  }

  // Borrar la fila template
  ws.spliceRows(mapping.insertion_row, 1);

  // Insertar filas de datos
  incidents.forEach((inc, i) => {
    const rowIdx = mapping.insertion_row + i;
    const emptyRow = new Array(maxCol + 1).fill(null);
    const newRow = ws.insertRow(rowIdx, emptyRow);

    for (const [colLetter, field] of Object.entries(mapping.columns)) {
      if (!field) continue;
      const colNum = colLetterToNumber(colLetter);
      newRow.getCell(colNum).value = fieldValue(inc, field);
    }

    // Aplicar estilos cacheados a cada col (aunque no esté mapeada — respeta
    // el zebrado o formato base del cliente).
    sampleStyles.forEach((style, colNum) => {
      if (style) newRow.getCell(colNum).style = JSON.parse(JSON.stringify(style));
    });
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
