// Reconstruye el template de Tortillería desde el original con las ediciones
// que Nazre pidió, atómico y preservando colores. NO sube a bucket — genera
// el archivo local para review antes de commit.
//
// Uso: npx tsx scripts/rebuild-tortilleria-template.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import fs from 'node:fs';

const SOURCE_PATH = 'C:/Users/Nazre/Dropbox/PC/Downloads/Tortillería Estrella X Centinelia/BITACORA DE CLIENTES OCTUBRE 2023.xlsx';
const OUT_PATH    = `C:/Users/Nazre/Downloads/tortilleria-rebuilt-${Date.now()}.xlsx`;

// Colores originales
const FILL_DATOS_CLIENTE       = 'FF71FF2B';  // verde brillante
const FILL_SEGUIMIENTO         = 'FFD3FF43';  // verde limón

const WEEK_RANGE_PLACEHOLDER = '{{RANGO_SEMANA}}';

async function main() {
  const ExcelJSMod = await import('exceljs');
  const Workbook = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;

  const wb = new Workbook();
  await wb.xlsx.load(fs.readFileSync(SOURCE_PATH) as any);

  // Solo mantenemos la primera hoja como template. El runtime clonará esta
  // sheet para cada semana del mes. Elimina el bug de fills inconsistentes
  // entre múltiples sheets del template original.
  const firstSheet = wb.worksheets[0];
  for (const ws of [...wb.worksheets]) {
    if (ws.id !== firstSheet.id) wb.removeWorksheet(ws.id);
  }
  firstSheet.name = 'Bitacora';
  editSheet(firstSheet);

  const outBuf = Buffer.from(await wb.xlsx.writeBuffer());
  fs.writeFileSync(OUT_PATH, outBuf);
  console.log(`\nGuardado: ${OUT_PATH}`);
  console.log(`Tamaño: ${outBuf.length} bytes`);
  console.log(`Sheets editados: ${wb.worksheets.map((w: any) => w.name).join(', ')}`);
}

function editSheet(ws: any) {
  // 1. UNMERGE todos los merges que existen (K1:AH1, A1:G1, etc). Los volvemos
  //    a crear controladamente.
  const model = ws.model;
  const originalMerges: string[] = [];
  if (Array.isArray(model?.merges)) {
    for (const m of model.merges) {
      if (typeof m === 'string') originalMerges.push(m);
    }
  }
  for (const m of originalMerges) {
    try { ws.unMergeCells(m); } catch { /* ignore */ }
  }

  // 2. BORRAR COL C entera. Splice shifts col D→C, E→D, ..., grid K-P → J-O
  ws.spliceColumns(3, 1);

  // Nuevo layout después del splice:
  //  A  FECHA DE LLAMADA
  //  B  FECHA SEGUIMIENTO (era B)
  //  C  NOM DEL NEGOCIO (era D)
  //  D  NOM DEL CLIENTE (era E)
  //  E  DIRECCION (era F)
  //  F  TELEFONO (era G)
  //  G  COMENTARIO (era H) → renombrar a MOTIVO
  //  H  (vacío, era I) → renombrar a COMENTARIO
  //  I  VENDEDOR (era J)
  //  J-O grid (era K-P)

  // 3. Ajustar row 2 headers
  const row2 = ws.getRow(2);
  row2.getCell(7).value = 'MOTIVO';       // G (era H)
  row2.getCell(8).value = 'COMENTARIO';   // H (era I, vacía)

  // 4. Limpiar row 1, row 2 completo (vamos a re-armar 3 filas de header).
  const row1 = ws.getRow(1);
  for (let c = 1; c <= 40; c++) row1.getCell(c).value = null;
  for (let c = 1; c <= 40; c++) row2.getCell(c).value = null;

  // 5. Row 1 A:I merged = "DATOS DEL CLIENTE" verde (una sola fila)
  const datosCell = row1.getCell(1);
  datosCell.value = 'DATOS DEL CLIENTE';
  datosCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_DATOS_CLIENTE } };
  datosCell.font = { name: 'Calibri', bold: true, size: 12 };
  datosCell.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 2; c <= 9; c++) {
    row1.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_DATOS_CLIENTE } };
  }
  ws.mergeCells('A1:I1');

  // 6. Row 1 J:P merged = TÍTULO "SEGUIMIENTO DE LA SEMANA" verde limón
  //    (7 días L-D). Font 10 + wrap para que quepa en el espacio angosto.
  const tituloCell = row1.getCell(10);  // J
  tituloCell.value = 'SEGUIMIENTO DE LA SEMANA';
  tituloCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_SEGUIMIENTO } };
  tituloCell.font = { name: 'Calibri', bold: true, size: 10 };
  tituloCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let c = 11; c <= 16; c++) {
    row1.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_SEGUIMIENTO } };
  }
  ws.mergeCells('J1:P1');
  row1.height = 24;

  // 7. Insertar NEW row 3 antes de la data. Rows 2 y 3 forman el "bloque
  //    de headers": col headers A-I spans row 2-3 verticalmente (merged),
  //    mientras que J:P tiene rango merged en row 2 + letras individuales
  //    en row 3 (7 días L-D).
  ws.spliceRows(3, 0, [
    '', '', '', '', '', '', '', '', '',   // A-I row 3 vacías (mergeadas con row 2)
    'L', 'M', 'MI', 'J', 'V', 'S', 'D',   // J-P row 3 letras individuales
  ]);

  // 8. Row 2 A-I col headers individual, mergeados verticalmente con row 3
  const headers = [
    'FECHA DE LLAMADA', 'FECHAS SEGUIMIENTO', 'NOM DEL NEGOCIO', 'NOM DEL CLIENTE',
    'DIRECCION', 'TELEFONO', 'MOTIVO', 'COMENTARIO', 'VENDEDOR',
  ];
  for (let i = 0; i < headers.length; i++) {
    const colNum = i + 1;
    const cell = row2.getCell(colNum);
    cell.value = headers[i];
    cell.font = { name: 'Calibri', bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top:    { style: 'thin' },
      bottom: { style: 'medium' },
    };
    // Merge vertical A2:A3, B2:B3, etc para que header cubra 2 filas
    const letter = String.fromCharCode(64 + colNum);
    try { ws.mergeCells(`${letter}2:${letter}3`); } catch { /* ignore */ }
  }
  row2.height = 22;

  // 9. Row 2 J:P merged = RANGO de la semana (mitad ARRIBA del bloque, 7 días)
  const rangoCell = row2.getCell(10);  // J
  rangoCell.value = WEEK_RANGE_PLACEHOLDER;
  rangoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF4C4' } };
  rangoCell.font = { name: 'Calibri', bold: true, size: 11 };
  rangoCell.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 11; c <= 16; c++) {
    row2.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF4C4' } };
  }
  ws.mergeCells('J2:P2');

  // 10. Row 3 J-P individuales = letras L, M, MI, J, V, S, D (mitad ABAJO del bloque)
  const row3 = ws.getRow(3);
  row3.height = 22;
  for (let c = 10; c <= 16; c++) {
    const cell = row3.getCell(c);
    cell.font = { name: 'Calibri', bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top:    { style: 'thin' },
      bottom: { style: 'medium' },
    };
  }

  // 11. Widen cols para que headers quepan
  ws.getColumn(1).width  = 13;   // A FECHA DE LLAMADA
  ws.getColumn(2).width  = 20;   // B FECHAS SEGUIMIENTO (multi-línea con varios intentos)
  ws.getColumn(3).width  = 28;   // C NOM DEL NEGOCIO
  ws.getColumn(4).width  = 20;   // D NOM DEL CLIENTE
  ws.getColumn(5).width  = 42;   // E DIRECCION
  ws.getColumn(6).width  = 17;   // F TELEFONO (fits +52 + 10 dígitos)
  ws.getColumn(7).width  = 40;   // G MOTIVO
  ws.getColumn(8).width  = 26;   // H COMENTARIO
  ws.getColumn(9).width  = 16;   // I VENDEDOR
  for (let c = 10; c <= 16; c++) {
    ws.getColumn(c).width = 5.5;  // J-P grid días (7 cols), angostos pero
                                  //  suficientes para que "SEGUIMIENTO DE LA
                                  //  SEMANA" quepa en el título (~38 units total)
  }
  // Reset widths beyond P — no queremos cols anchas visibles con nada
  for (let c = 17; c <= 40; c++) {
    ws.getColumn(c).width = undefined as any;
  }

  // === CLEANUP FINAL ===
  // Estandarizar: solo 3 zonas coloreadas (verde fosfo DATOS row 1 A:I,
  // verde limón SEGUIMIENTO row 1 J:O, amarillo RANGO row 2 J:O). Todo lo
  // demás → sin fill.

  // 0. Limpiar fills SOLO en las zonas donde SÍ había residuos del template
  //    original: cols A-I filas 2-3 (bordes y cells H/I quedaban con
  //    amarillo/otros del template original) + cols P+ (cola de otras
  //    semanas). NO tocamos row 1 J:O (título) ni row 2 J:O (rango) porque
  //    ya tienen su color aplicado — tocarlos vía eachCell rompe los merges.
  for (let c = 1; c <= 9; c++) {
    ws.getRow(2).getCell(c).fill = { type: 'pattern', pattern: 'none' } as any;
    ws.getRow(3).getCell(c).fill = { type: 'pattern', pattern: 'none' } as any;
  }

  // 1. Bordes en la sección del grid J1:P3 (título + rango + letras, 7 días)
  //    para que se vea como tabla.
  for (let r = 1; r <= 3; r++) {
    for (let c = 10; c <= 16; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.border = {
        top:    { style: 'thin' },
        bottom: { style: 'thin' },
        left:   { style: 'thin' },
        right:  { style: 'thin' },
      };
    }
  }
  // Bordes también en row 1 A:I (título DATOS) + row 2-3 A:I (col headers)
  for (let c = 1; c <= 9; c++) {
    ws.getRow(1).getCell(c).border = {
      top:    { style: 'thin' },
      bottom: { style: 'thin' },
      left:   { style: 'thin' },
      right:  { style: 'thin' },
    };
    ws.getRow(2).getCell(c).border = {
      top:    { style: 'thin' },
      bottom: { style: 'thin' },
      left:   { style: 'thin' },
      right:  { style: 'thin' },
    };
    ws.getRow(3).getCell(c).border = {
      top:    { style: 'thin' },
      bottom: { style: 'thin' },
      left:   { style: 'thin' },
      right:  { style: 'thin' },
    };
  }

  // 2. Splice cols Q en adelante (col 17+). Elimina la "cola" del template
  //    original que tenía días de otras semanas con fills raros. Ahora el
  //    grid ocupa J-P (7 días), entonces cols Q+ son residuo.
  ws.spliceColumns(17, 30);

  // 2. Splice rows 4+ hasta el final (era data histórica 2023 con estilos
  //    heredados de las cells originales). El runtime clearHistoricalDataRows
  //    ya limpiaría data + estilos, pero mejor hacerlo aquí para que el xlsx
  //    en el bucket ya venga limpio.
  let lastRow = 0;
  ws.eachRow({ includeEmpty: false }, (_r, n) => { if (n > lastRow) lastRow = n; });
  if (lastRow >= 4) {
    for (let r = lastRow; r >= 4; r--) {
      ws.spliceRows(r, 1);
    }
  }

  // 3. Row 4 = template row para data. Sin fill, sin estilos coloreados,
  //    solo bordes finos para separar visualmente. 16 cols (A-P = 9 mapeadas + 7 grid).
  const row4 = ws.getRow(4);
  for (let c = 1; c <= 16; c++) {
    const cell = row4.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'none' } as any;
    cell.font = { name: 'Calibri', size: 10 };
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.border = {
      top:    { style: 'thin' },
      bottom: { style: 'thin' },
      left:   { style: 'thin' },
      right:  { style: 'thin' },
    };
  }
  row4.height = 20;

  // === RE-APPLY FILLS FINAL ===
  // Después de todos los splices/merges/borders, algunos fills se pierden por
  // efectos raros de exceljs. Re-aplicamos los 3 fills designados al último.
  // Aplicamos a TODAS las cells del merge (master + subs) por si acaso.
  const applyFill = (rowNum: number, colStart: number, colEnd: number, argb: string) => {
    const row = ws.getRow(rowNum);
    for (let c = colStart; c <= colEnd; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } } as any;
    }
  };
  applyFill(1, 1, 9, FILL_DATOS_CLIENTE);     // Row 1 A-I verde fosfo
  applyFill(1, 10, 16, FILL_SEGUIMIENTO);     // Row 1 J-P verde limón (7 días)
  applyFill(2, 10, 16, 'FFFAF4C4');           // Row 2 J-P amarillo (rango, 7 días)
}

main().catch(e => { console.error(e); process.exit(1); });
