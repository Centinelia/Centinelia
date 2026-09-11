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

const OUT = process.env.PLANTILLA_OUT || 'scripts/output/PLANTILLA_Ramon_Leang.xlsx';

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
  // Ciclo martes-a-martes según regla de Beatriz PV ("SE HACE CORTE DE MARTES
  // A MARTES NO SAB NI DOM, NI FERIADOS"). Solo 6 columnas de depósito, una
  // por día que sí genera factura: 5 laborables + 1 martes siguiente (ajuste
  // centavos). Ella deja vacío si es feriado o no hubo venta.
  ws.columns = [
    { key: 'semana',       width: 20 },
    { key: 'dep_mar',      width: 14 },
    { key: 'dep_mie',      width: 14 },
    { key: 'dep_jue',      width: 14 },
    { key: 'dep_vie',      width: 14 },
    { key: 'dep_lun',      width: 14 },
    { key: 'dep_ajuste',   width: 16 },
    { key: 'total',        width: 16 },
    { key: 'por_factura',  width: 16 },
    { key: 'ajuste_calc',  width: 16 },
    { key: 'observaciones', width: 30 },
  ];

  // -- Row 1: título brand --
  ws.mergeCells('A1:K1');
  const titulo = ws.getCell('A1');
  titulo.value = 'Plantilla de ventas semanales — Ramón Leang';
  titulo.font  = { name: 'Calibri', size: 18, bold: true, color: { argb: BLANCO } };
  titulo.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO } };
  titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 44;

  // -- Row 2: subtítulo --
  ws.mergeCells('A2:K2');
  const subt = ws.getCell('A2');
  subt.value = 'Cada martes llena una fila nueva con los depósitos de la semana pasada (martes a lunes). Nala hace el resto.';
  subt.font  = { name: 'Calibri', size: 11, italic: true, color: { argb: GRIS_TX } };
  subt.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 24;

  // -- Row 3: aire --
  ws.getRow(3).height = 8;

  // -- Row 4: headers --
  const headers = [
    'Semana (martes)',
    'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Lunes',
    'Ajuste (mar sig)',
    'Total depositado',
    'Por factura (× 5)',
    'Ajuste calculado',
    'Observaciones',
  ];
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
  // Fechas dinámicas: siguientes 3 martes desde HOY (así la plantilla no rota
  // aunque se regenere meses después). Datos monetarios calcados del Excel
  // actual de Beatriz PV para que ella los reconozca.
  const primerMartes = nextTuesday(new Date());
  const ejemplos: Array<{ semana: Date; deps: (number | null)[]; nota: string }> = [
    {
      semana: primerMartes,
      deps:   [18553.50, 6844.00, 13849.00, 18212.50, 11961.50, 17626.00],
      nota:   'Ejemplo (borrar cuando empieces)',
    },
    {
      semana: addDays(primerMartes, 7),
      deps:   [15200.00, 14100.50, 16800.00, 13500.00, 17800.00, 15300.50],
      nota:   'Ejemplo (borrar cuando empieces)',
    },
    {
      semana: addDays(primerMartes, 14),
      deps:   [12500.00, null, 15300.00, 17200.00, 14100.00, 12900.50],
      nota:   'Si un día es feriado déjalo vacío (ejemplo del miércoles).',
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
    // Cols 2-7: depósitos (MAR, MIE, JUE, VIE, LUN, AJUSTE mar sig)
    ej.deps.forEach((dep, i) => {
      const cell = row.getCell(i + 2);
      if (dep != null) cell.value = dep;
      cell.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.font = { name: 'Calibri', size: 11, color: { argb: NEGRO_TX } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } };
      cell.border = borderThin();
    });
    // Col 8: Total (fórmula SUM depósitos)
    const cTotal = row.getCell(8);
    cTotal.value = { formula: `SUM(B${rowNum}:G${rowNum})` };
    cTotal.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    cTotal.alignment = { vertical: 'middle', horizontal: 'right' };
    cTotal.font = { name: 'Calibri', size: 11, bold: true, color: { argb: MORADO_OSC } };
    cTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO_CLARO } };
    cTotal.border = borderThin();
    // Col 9: Por factura (INT(total/N) — trunca a peso entero como Beatriz).
    // Usa COUNT dinámico (no hardcodea nDias) para que si Beatriz edita las
    // celdas de ejemplo la fórmula siga funcionando.
    const cPorFac = row.getCell(9);
    cPorFac.value = { formula: `IF(COUNT(B${rowNum}:G${rowNum})=0,0,INT(H${rowNum}/COUNT(B${rowNum}:G${rowNum})))` };
    cPorFac.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    cPorFac.alignment = { vertical: 'middle', horizontal: 'right' };
    cPorFac.font = { name: 'Calibri', size: 11, bold: true, color: { argb: MORADO_OSC } };
    cPorFac.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO_CLARO } };
    cPorFac.border = borderThin();
    // Col 10: Ajuste calculado (total - por_factura × (N-1))
    const cAjuste = row.getCell(10);
    cAjuste.value = { formula: `IF(COUNT(B${rowNum}:G${rowNum})=0,0,ROUND(H${rowNum}-I${rowNum}*(COUNT(B${rowNum}:G${rowNum})-1),2))` };
    cAjuste.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    cAjuste.alignment = { vertical: 'middle', horizontal: 'right' };
    cAjuste.font = { name: 'Calibri', size: 11, bold: true, color: { argb: MORADO_OSC } };
    cAjuste.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO_CLARO } };
    cAjuste.border = borderThin();
    // Col 11: Observaciones
    const cObs = row.getCell(11);
    cObs.value = ej.nota;
    cObs.font = { name: 'Calibri', size: 10, italic: true, color: { argb: GRIS_TX } };
    cObs.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cObs.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } };
    cObs.border = borderThin();
  });

  // Ahora 11 columnas totales (1 semana + 6 depósitos + 3 preview + 1 obs).
  const NCOL = 11;
  const COL_OBS = 11;

  // -- Row 8: fila vacía destacada como "AQUÍ ESCRIBES" --
  const rowGuia = ws.getRow(8);
  rowGuia.height = 30;
  for (let c = 1; c <= NCOL; c++) {
    const cell = rowGuia.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSA_SUAVE } };
    cell.border = {
      top:    { style: 'medium', color: { argb: 'FFDB2777' } },
      bottom: { style: 'medium', color: { argb: 'FFDB2777' } },
      left:   { style: c === 1 ? 'medium' : 'thin', color: { argb: 'FFDB2777' } },
      right:  { style: c === NCOL ? 'medium' : 'thin', color: { argb: 'FFDB2777' } },
    };
    if (c === 1) {
      cell.value = '⬅ Aquí escribes';
      cell.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFDB2777' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else {
      cell.font = { name: 'Calibri', size: 11, color: { argb: NEGRO_TX } };
      cell.alignment = { vertical: 'middle', horizontal: c === COL_OBS ? 'left' : 'right' };
      if (c >= 2 && c <= COL_OBS - 1) cell.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    }
  }

  // -- Rows 9-30: filas vacías con formato listo para llenar --
  for (let r = 9; r <= 30; r++) {
    const row = ws.getRow(r);
    row.height = 22;
    for (let c = 1; c <= NCOL; c++) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : c === COL_OBS ? 'left' : 'right' };
      cell.font = { name: 'Calibri', size: 11, color: { argb: NEGRO_TX } };
      cell.border = borderVerySoft();
      if (r % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFF' } };
      if (c === 1) cell.numFmt = 'dd/mm/yyyy';
      if (c >= 2 && c <= COL_OBS - 1) cell.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    }
    // Preview con fórmulas — se activan cuando Beatriz llena depósitos.
    // Cuenta cuántos depósitos hay (COUNT ignora vacías), divide y ajusta.
    const cTotal = row.getCell(8);
    cTotal.value = { formula: `IF(COUNT(B${r}:G${r})=0,"",SUM(B${r}:G${r}))` };
    cTotal.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: MORADO_OSC } };
    cTotal.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO_CLARO } };
    const cPor = row.getCell(9);
    cPor.value = { formula: `IF(COUNT(B${r}:G${r})=0,"",INT(SUM(B${r}:G${r})/COUNT(B${r}:G${r})))` };
    cPor.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: MORADO_OSC } };
    cPor.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO_CLARO } };
    const cAj = row.getCell(10);
    cAj.value = { formula: `IF(COUNT(B${r}:G${r})=0,"",ROUND(SUM(B${r}:G${r})-I${r}*(COUNT(B${r}:G${r})-1),2))` };
    cAj.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: MORADO_OSC } };
    cAj.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO_CLARO } };
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
  addStep('2', `Escribe la fecha del martes que abre la semana en la columna "Semana (martes)". Ejemplo: ${formatShort(ejemplos[0].semana)}.`);
  addStep('3', 'Pon los depósitos bancarios: uno por cada día laborable (mar, mie, jue, vie, lun) más el ajuste en el martes siguiente. Si algún día fue feriado, déjalo vacío.');
  addSpace(4);
  addPlain('En cuanto escribas los depósitos, las columnas moradas se llenan solas:', { italic: true, color: GRIS_TX });
  addPlain('  Total depositado, Por factura (× 5) y Ajuste calculado. Así ves el detalle antes de mandarlo.');
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

  // Sección: ejemplo (fechas dinámicas alineadas a la fila 1 de la hoja Semanas)
  const ej1 = ejemplos[0].semana;
  const ejAjuste = addDays(ej1, 7);
  addTitle('Ejemplo con datos reales');
  addPlain(`Semana del martes ${formatShort(ej1)} (fila 1 de la hoja "Semanas"):`, { italic: true, color: GRIS_TX });
  addPlain('  Martes $18,553.50 · Miércoles $6,844.00 · Jueves $13,849.00');
  addPlain(`  Viernes $18,212.50 · Lunes $11,961.50 · Ajuste (martes ${formatShort(ejAjuste)}) $17,626.00`);
  addPlain('  Total depositado: $87,046.50', { color: MORADO_OSC });
  addSpace(4);
  addPlain('Nala calcula automáticamente:', { italic: true, color: GRIS_TX });
  addPlain('  5 facturas de $14,507.00 c/u (una por cada día laborable)');
  addPlain(`  1 factura de $14,511.50 el martes ${formatShort(ejAjuste)} (ajuste de centavos)`);
  addPlain('  Total facturado: $87,046.50  ✓ cuadra con tus depósitos', { color: VERDE });
  addSpace(16);

  // Sección: ¿y si...?
  addTitle('¿Y si…?');
  addPlain('… hay un feriado en día laborable (ej. miércoles 16 de septiembre):', { italic: true, color: GRIS_TX });
  addPlain('  Deja vacía la celda de ese día. Nala emite una factura menos y ajusta el reparto.');
  addSpace(4);
  addPlain('… la suma da exacto sin centavos:', { italic: true, color: GRIS_TX });
  addPlain('  Deja vacía la celda "Ajuste (mar sig)". Solo se emiten las facturas base.');
  addSpace(4);
  addPlain('… te equivocaste al capturar un depósito:', { italic: true, color: GRIS_TX });
  addPlain('  Corrige la celda antes de mandar el archivo. Si ya lo mandaste, escríbenos.');
  addSpace(4);
  addPlain('… hubo depósito el sábado o domingo:', { italic: true, color: GRIS_TX });
  addPlain('  Súmalo a los depósitos de los días laborables (SAT no permite facturar ese día).');
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

/** Retorna el próximo martes >= la fecha dada (si hoy es martes, retorna hoy). */
function nextTuesday(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const daysUntilTue = (2 - d.getDay() + 7) % 7; // 2 = Tuesday
  d.setDate(d.getDate() + daysUntilTue);
  return d;
}

/** Suma `n` días a la fecha (nueva instancia). */
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Formato corto español: 01/09/2026. */
function formatShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
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
