/**
 * Genera el Excel plantilla para Beatriz PV con formato profesional
 * (Centinelia brand: morado #6C3BFF). Usa ExcelJS para soporte completo
 * de estilos (colores, bordes, negritas, formato moneda, freeze panes).
 *
 * Incluye 3 semanas de ejemplo con datos reales del Excel actual de Ramón
 * Leang, mapeados al layout ideal (1 fila por semana, columnas por día).
 *
 * Output: scripts/output/PLANTILLA_Ramon_Leang.xlsx
 */
import { mkdirSync } from 'node:fs';
import ExcelJS from 'exceljs';

const OUT = 'scripts/output/PLANTILLA_Ramon_Leang.xlsx';

// -- Paleta Centinelia -------------------------------------------------------
const MORADO       = 'FF6C3BFF';
const MORADO_OSC   = 'FF3A2570';
const MORADO_CLARO = 'FFEDE7FF';
const AMARILLO     = 'FFFFF3B0';
const GRIS_LINEA   = 'FFE5E7EB';
const GRIS_TX      = 'FF6B6480';
const BLANCO       = 'FFFFFFFF';
const NEGRO_TX     = 'FF1A0A3B';
const VERDE        = 'FF15803D';
const ROSA_SUAVE   = 'FFFCE7F3';

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Centinelia';
  wb.company = 'Centinelia';
  wb.created = new Date();

  // ==========================================================================
  // HOJA 1: SEMANAS
  // ==========================================================================
  const ws = wb.addWorksheet('Semanas', {
    views:      [{ state: 'frozen', ySplit: 4, xSplit: 1, activeCell: 'A9' }],
    properties: { defaultRowHeight: 22 },
  });

  // Orden: MARTES a LUNES (la semana operativa de Ramón Leang empieza martes
  // y termina el lunes siguiente. Cada martes Beatriz PV cierra la semana
  // pasada y llena una fila nueva).
  ws.columns = [
    { key: 'semana',  width: 20 },
    { key: 'dep_mar', width: 14 },
    { key: 'dep_mie', width: 14 },
    { key: 'dep_jue', width: 14 },
    { key: 'dep_vie', width: 14 },
    { key: 'dep_sab', width: 14 },
    { key: 'dep_dom', width: 14 },
    { key: 'dep_lun', width: 14 },
    { key: 'nota',    width: 36 },
  ];

  // -- Row 1: título brand --
  ws.mergeCells('A1:I1');
  const titulo = ws.getCell('A1');
  titulo.value = 'Plantilla de ventas semanales — Ramón Leang';
  titulo.font  = { name: 'Calibri', size: 18, bold: true, color: { argb: BLANCO } };
  titulo.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO } };
  titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 44;

  // -- Row 2: subtítulo --
  ws.mergeCells('A2:I2');
  const subt = ws.getCell('A2');
  subt.value = 'Cada martes llena una fila nueva con los depósitos de la semana pasada (martes a lunes). Nala hace el resto.';
  subt.font  = { name: 'Calibri', size: 11, italic: true, color: { argb: GRIS_TX } };
  subt.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 24;

  // -- Row 3: aire --
  ws.getRow(3).height = 8;

  // -- Row 4: headers --
  const headers = ['Semana (martes)', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Lunes', 'Nota (opcional)'];
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font  = { name: 'Calibri', size: 12, bold: true, color: { argb: BLANCO } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top:    { style: 'thin', color: { argb: MORADO_OSC } },
      bottom: { style: 'medium', color: { argb: MORADO_OSC } },
      left:   { style: 'thin', color: { argb: MORADO_OSC } },
      right:  { style: 'thin', color: { argb: MORADO_OSC } },
    };
  });
  headerRow.height = 34;

  // -- Rows 5-7: 3 semanas de ejemplo (datos reales del fixture Ramón Leang) --
  // Mapeados desde el Excel actual de Beatriz PV para que ella los reconozca.
  // Cada ejemplo: semana MARTES-LUNES (7 días). Orden columnas: MAR, MIE, JUE, VIE, SAB, DOM, LUN.
  // Datos reales del Excel actual de Beatriz PV (fixture Ramón Leang parseado).
  const ejemplos: Array<{ semana: Date; deps: (number | null)[]; nota: string }> = [
    {
      // Semana martes 05/08 al lunes 11/08 — 6 días con ventas (mar-dom), lunes cerrado
      semana: new Date('2026-08-05'),
      deps:   [14914.00, 15673.50, 5676.00, 13338.50, 14288.00, 17606.00, null],
      nota:   'Semana de ejemplo 1 (borrar cuando empieces)',
    },
    {
      // Semana martes 12/08 al lunes 18/08 — 6 días con ventas mar-dom
      semana: new Date('2026-08-12'),
      deps:   [16123.00, 11810.50, 8601.00, 11120.00, 21290.50, 12661.00, null],
      nota:   'Semana de ejemplo 2 (borrar cuando empieces)',
    },
    {
      // Semana martes 26/08 al lunes 01/09 — semana corta: solo mar/mie/jue
      semana: new Date('2026-08-26'),
      deps:   [8573.50, 13486.50, 14007.50, null, null, null, null],
      nota:   'Semana corta: 3 días con ventas, resto sin depósito',
    },
  ];

  ejemplos.forEach((ej, idx) => {
    const rowNum = 5 + idx;
    const row = ws.getRow(rowNum);
    row.height = 26;
    // Col 1: fecha
    const c1 = row.getCell(1);
    c1.value = ej.semana;
    c1.numFmt = 'dd/mm/yyyy';
    c1.alignment = { vertical: 'middle', horizontal: 'center' };
    c1.font = { name: 'Calibri', size: 11, color: { argb: NEGRO_TX } };
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } };
    c1.border = borderThin();
    // Cols 2-8: depósitos por día
    ej.deps.forEach((dep, i) => {
      const cell = row.getCell(i + 2);
      if (dep != null) cell.value = dep;
      cell.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.font = { name: 'Calibri', size: 11, color: { argb: NEGRO_TX } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } };
      cell.border = borderThin();
    });
    // Col 9: nota
    const c9 = row.getCell(9);
    c9.value = ej.nota;
    c9.font = { name: 'Calibri', size: 10, italic: true, color: { argb: GRIS_TX } };
    c9.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    c9.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } };
    c9.border = borderThin();
  });

  // -- Row 8: fila vacía destacada como "AQUÍ ESCRIBES" --
  const rowGuia = ws.getRow(8);
  rowGuia.height = 30;
  for (let c = 1; c <= 9; c++) {
    const cell = rowGuia.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSA_SUAVE } };
    cell.border = {
      top:    { style: 'medium', color: { argb: 'FFDB2777' } },
      bottom: { style: 'medium', color: { argb: 'FFDB2777' } },
      left:   { style: c === 1 ? 'medium' : 'thin', color: { argb: c === 1 ? 'FFDB2777' : 'FFDB2777' } },
      right:  { style: c === 9 ? 'medium' : 'thin', color: { argb: c === 9 ? 'FFDB2777' : 'FFDB2777' } },
    };
    if (c === 1) {
      cell.value = '⬅ Aquí escribes';
      cell.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFDB2777' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else {
      cell.font = { name: 'Calibri', size: 11, color: { argb: NEGRO_TX } };
      cell.alignment = { vertical: 'middle', horizontal: c === 9 ? 'left' : 'right' };
      if (c >= 2 && c <= 8) cell.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    }
  }

  // -- Rows 9-30: filas vacías con formato listo para llenar --
  for (let r = 9; r <= 30; r++) {
    const row = ws.getRow(r);
    row.height = 22;
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : c === 9 ? 'left' : 'right' };
      cell.font = { name: 'Calibri', size: 11, color: { argb: NEGRO_TX } };
      cell.border = borderVerySoft();
      if (r % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFF' } };
      if (c === 1) cell.numFmt = 'dd/mm/yyyy';
      if (c >= 2 && c <= 8) cell.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    }
  }

  // ==========================================================================
  // HOJA 2: CÓMO USAR
  // ==========================================================================
  const wi = wb.addWorksheet('Cómo usar', {
    views:      [{ state: 'frozen', ySplit: 2 }],
    properties: { defaultRowHeight: 22 },
  });
  wi.columns = [
    { key: 'label', width: 5 },
    { key: 'text',  width: 96 },
  ];

  // Título
  wi.mergeCells('A1:B1');
  const titIns = wi.getCell('A1');
  titIns.value = '¿Cómo llenar este Excel?';
  titIns.font  = { name: 'Calibri', size: 18, bold: true, color: { argb: BLANCO } };
  titIns.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO } };
  titIns.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wi.getRow(1).height = 44;

  wi.mergeCells('A2:B2');
  const subIns = wi.getCell('A2');
  subIns.value = 'Guía rápida — 3 pasos por semana (cada martes). Nala se encarga del resto.';
  subIns.font  = { name: 'Calibri', size: 11, italic: true, color: { argb: GRIS_TX } };
  subIns.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wi.getRow(2).height = 24;

  let cur = 4;
  function addTitle(text: string) {
    wi.mergeCells(`A${cur}:B${cur}`);
    const c = wi.getCell(`A${cur}`);
    c.value = text;
    c.font  = { name: 'Calibri', size: 14, bold: true, color: { argb: MORADO_OSC } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 0 };
    c.border = { bottom: { style: 'medium', color: { argb: MORADO } } };
    wi.getRow(cur).height = 32;
    cur++;
    wi.getRow(cur).height = 8;
    cur++;
  }
  function addStep(num: string, text: string, colorNum = MORADO) {
    const row = wi.getRow(cur);
    const numCell = row.getCell(1);
    numCell.value = num;
    numCell.font  = { name: 'Calibri', size: 12, bold: true, color: { argb: colorNum } };
    numCell.alignment = { vertical: 'top', horizontal: 'center' };
    const txCell = row.getCell(2);
    txCell.value = text;
    txCell.font  = { name: 'Calibri', size: 11, color: { argb: NEGRO_TX } };
    txCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    row.height = 42;
    cur++;
  }
  function addPlain(text: string, opts: { italic?: boolean; color?: string } = {}) {
    const row = wi.getRow(cur);
    row.getCell(2).value = text;
    row.getCell(2).font  = { name: 'Calibri', size: 11, italic: !!opts.italic, color: { argb: opts.color ?? NEGRO_TX } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    row.height = 22;
    cur++;
  }
  function addSpace(h = 12) {
    wi.getRow(cur).height = h;
    cur++;
  }

  // Sección: cada semana
  addTitle('Cada martes, en 3 pasos');
  addStep('1', 'Ve al final de la hoja "Semanas" y agrega una fila nueva (puedes copiar la última llenada para conservar el formato).');
  addStep('2', 'Escribe la fecha del martes que abre la semana en la columna "Semana (martes)". Ejemplo: 05/08/2026.');
  addStep('3', 'Pon los depósitos bancarios en las columnas del día que corresponda (martes a lunes). Los días sin ventas los dejas vacíos.');
  addSpace();
  addStep('✓', 'Guarda el archivo y mándalo el mismo martes a info@grupoestrella.mx. Nala hace el resto.', VERDE);
  addSpace(16);

  // Sección: qué hace Nala
  addTitle('Lo que Nala hace por ti');
  const items = [
    'Suma tus depósitos → total de ventas de la semana.',
    'Cuenta los días con depósito → cuántas facturas emitir.',
    'Divide el total entre los días → monto de cada factura.',
    'Ajusta los centavos en la última factura para que la suma cuadre exacta.',
    'Emite todas las facturas a Público en General y las envía a CONTPAQi para timbrarlas.',
    'Si algo se ve raro, te avisa a Beatriz-PV@hotmail.com con un link al portal para corregir.',
  ];
  for (const it of items) {
    const row = wi.getRow(cur);
    row.getCell(1).value = '✓';
    row.getCell(1).font  = { name: 'Calibri', size: 13, bold: true, color: { argb: VERDE } };
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
    row.getCell(2).value = it;
    row.getCell(2).font  = { name: 'Calibri', size: 11, color: { argb: NEGRO_TX } };
    row.getCell(2).alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    row.height = 28;
    cur++;
  }
  addSpace(16);

  // Sección: ejemplo
  addTitle('Ejemplo con datos reales');
  addPlain('Semana del martes 05/08/2026 al lunes 11/08/2026 (fila 1 de la hoja "Semanas"):', { italic: true, color: GRIS_TX });
  addPlain('  Martes $14,914.00 · Miércoles $15,673.50 · Jueves $5,676.00');
  addPlain('  Viernes $13,338.50 · Sábado $14,288.00 · Domingo $17,606.00 · Lunes (cerrado)');
  addPlain('  Total depositado: $81,496.00', { color: MORADO_OSC });
  addSpace(4);
  addPlain('Nala calcula automáticamente:', { italic: true, color: GRIS_TX });
  addPlain('  6 facturas de $13,582.00 c/u (una por día con venta)');
  addPlain('  1 factura de $13,586.00 (última con ajuste de centavos)');
  addPlain('  Total facturado: $81,496.00  ✓ cuadra con tus depósitos', { color: VERDE });
  addSpace(16);

  // Sección: ¿y si...?
  addTitle('¿Y si…?');
  addPlain('… un día no hubo ventas (feriado, cerrado, sin ventas):', { italic: true, color: GRIS_TX });
  addPlain('  Deja la celda de ese día vacía. Nala lo omite.');
  addSpace(4);
  addPlain('… todos los montos deberían dar exacto sin centavos:', { italic: true, color: GRIS_TX });
  addPlain('  Nala no genera factura de ajuste. Solo las facturas base.');
  addSpace(4);
  addPlain('… te equivocaste al capturar un depósito:', { italic: true, color: GRIS_TX });
  addPlain('  Corrige la celda antes de mandar el archivo. Si ya lo mandaste, escríbenos.');
  addSpace(16);

  // Contacto
  addTitle('¿Necesitas ayuda?');
  addPlain('Correo: hola@centinelia.mx');
  addPlain('WhatsApp: +52 811 633 3559');

  // ==========================================================================
  // Escribir archivo
  // ==========================================================================
  mkdirSync('scripts/output', { recursive: true });
  await wb.xlsx.writeFile(OUT);
  console.log(`✓ Plantilla generada: ${OUT}`);
}

function borderThin() {
  return {
    top:    { style: 'thin' as const, color: { argb: 'FFCCCCCC' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCCCCCC' } },
    left:   { style: 'thin' as const, color: { argb: 'FFCCCCCC' } },
    right:  { style: 'thin' as const, color: { argb: 'FFCCCCCC' } },
  };
}
function borderVerySoft() {
  return {
    top:    { style: 'thin' as const, color: { argb: GRIS_LINEA } },
    bottom: { style: 'thin' as const, color: { argb: GRIS_LINEA } },
    left:   { style: 'thin' as const, color: { argb: GRIS_LINEA } },
    right:  { style: 'thin' as const, color: { argb: GRIS_LINEA } },
  };
}

main().catch(e => { console.error(e); process.exit(1); });
