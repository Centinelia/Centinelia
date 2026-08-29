import { Workbook, Worksheet } from 'exceljs';
import type { IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import type { TemplateMapping, CanonicalField } from './template-analyzer';

/** Header interno de la col oculta que rastrea incident_id para merge. */
export const HIDDEN_ID_HEADER = '_incident_id';

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

export function colLetterToNumber(letter: string): number {
  const upper = letter.toUpperCase();
  let n = 0;
  for (let i = 0; i < upper.length; i++) {
    n = n * 26 + (upper.charCodeAt(i) - 64);
  }
  return n;
}

/**
 * Puebla una sheet existente vía UPSERT no destructivo: preserva rows del
 * cliente que no correspondan a incidents, preserva cols human_only, y solo
 * modifica cells de rows/cols específicas.
 *
 * - Rows con incident_id conocido: UPDATE cells de cols mapeadas no-human_only.
 * - Incidents sin row previa: INSERT nueva row al final del bloque de datos.
 * - Rows del cliente (sin incident_id): NO tocadas.
 * - Cols human_only: NO tocadas.
 * - Cols no mapeadas: NO tocadas (cliente puede haber agregado sus propias).
 *
 * Usada por el cron persistente cuando el live file existe y queremos
 * preservar cualquier edición estructural que el cliente haya hecho.
 */
export function upsertSheetWithIncidents(
  ws:        Worksheet,
  mapping:   TemplateMapping,
  incidents: IncidentRow[],
): void {
  const humanOnly = new Set((mapping.human_only_columns ?? []).map(c => c.toUpperCase()));

  // Determinar hidden col (o crearla si la sheet no la tiene)
  let hiddenCol = findHiddenIdCol(ws);
  if (!hiddenCol) {
    // Sheet nueva o cliente borró la col oculta. Ubicamos al final del rango
    // de cols mapeadas + 1 (fuera del área visible).
    let maxMapped = 1;
    for (const colLetter of Object.keys(mapping.columns)) {
      const n = colLetterToNumber(colLetter);
      if (n > maxMapped) maxMapped = n;
    }
    hiddenCol = maxMapped + 1;
    ws.getRow(1).getCell(hiddenCol).value = HIDDEN_ID_HEADER;
    ws.getColumn(hiddenCol).hidden = true;
  }

  // Escanear rows existentes con incident_id
  const existingRows = scanExistingIncidentRows(ws, mapping);

  // Determinar última row usada (para saber dónde apendear nuevas)
  let lastRow = mapping.insertion_row - 1;
  ws.eachRow({ includeEmpty: false }, (_row, rowNum) => {
    if (rowNum > lastRow) lastRow = rowNum;
  });

  // Cache estilos de la insertion_row (para aplicar a nuevas rows)
  const sampleRow = ws.getRow(mapping.insertion_row);
  const sampleStyles: (unknown | undefined)[] = [];
  sampleRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    sampleStyles[colNum] = cell.style;
  });

  for (const inc of incidents) {
    const existingRowNum = existingRows.get(inc.id);
    if (existingRowNum) {
      // UPDATE cols mapeadas no-human_only
      const row = ws.getRow(existingRowNum);
      for (const [colLetter, field] of Object.entries(mapping.columns)) {
        if (!field) continue;
        if (humanOnly.has(colLetter.toUpperCase())) continue;
        const colNum = colLetterToNumber(colLetter);
        row.getCell(colNum).value = fieldValue(inc, field);
      }
      // Reafirmar incident_id en col oculta (defensivo)
      row.getCell(hiddenCol).value = inc.id;
    } else {
      // INSERT nueva row al final
      lastRow++;
      const newRow = ws.getRow(lastRow);
      for (const [colLetter, field] of Object.entries(mapping.columns)) {
        if (!field) continue;
        const colNum = colLetterToNumber(colLetter);
        newRow.getCell(colNum).value = fieldValue(inc, field);
      }
      newRow.getCell(hiddenCol).value = inc.id;
      // Aplicar estilos base
      sampleStyles.forEach((style, colNum) => {
        if (style) newRow.getCell(colNum).style = JSON.parse(JSON.stringify(style));
      });
    }
  }
}

export interface RenderOptions {
  /** Map de incident_id → { colLetter → valor previamente escrito por humano }.
   *  Sirve para preservar ediciones manuales en cols marcadas como human_only
   *  cuando se re-genera el archivo persistente. Aplica a CUALQUIER col human_only
   *  (vendedor, notas, etc), no solo vendedor. */
  preservedValues?: Map<string, Map<string, string>>;
  /** Si true, agrega una col oculta al final con el incident_id de cada fila.
   *  Sirve para matchear rows al re-generar en modo persistente. */
  includeHiddenIncidentId?: boolean;
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
  options:        RenderOptions = {},
): Promise<Buffer> {
  const wb = new Workbook();
  await wb.xlsx.load(templateBuffer as unknown as ArrayBuffer);

  const ws = wb.getWorksheet(mapping.sheet_name) ?? wb.worksheets[0];
  if (!ws) throw new Error(`Sheet '${mapping.sheet_name}' no encontrado en el template`);

  populateSheetWithIncidents(ws, mapping, incidents, options);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Puebla una sheet ya existente en el workbook con las incidencias dadas.
 * Reusable entre el flow ephemeral (renderWithCustomTemplate) y el persistente
 * (live-workbook). La sheet debe tener ya la estructura del template.
 */
export function populateSheetWithIncidents(
  ws:        Worksheet,
  mapping:   TemplateMapping,
  incidents: IncidentRow[],
  options:   RenderOptions = {},
): void {
  // Cachear estilos de la fila template
  const sampleRow = ws.getRow(mapping.insertion_row);
  const sampleStyles: (unknown | undefined)[] = [];
  let maxCol = 1;
  sampleRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    sampleStyles[colNum] = cell.style;
    if (colNum > maxCol) maxCol = colNum;
  });
  for (const colLetter of Object.keys(mapping.columns)) {
    const n = colLetterToNumber(colLetter);
    if (n > maxCol) maxCol = n;
  }

  const hiddenIdCol = options.includeHiddenIncidentId ? maxCol + 1 : null;

  // Borrar la fila template
  ws.spliceRows(mapping.insertion_row, 1);

  const humanOnly = new Set((mapping.human_only_columns ?? []).map(c => c.toUpperCase()));

  // Insertar filas de datos
  incidents.forEach((inc, i) => {
    const rowIdx = mapping.insertion_row + i;
    const emptyRow = new Array((hiddenIdCol ?? maxCol) + 1).fill(null);
    const newRow = ws.insertRow(rowIdx, emptyRow);

    const preservedForRow = options.preservedValues?.get(inc.id);

    for (const [colLetter, field] of Object.entries(mapping.columns)) {
      if (!field) continue;
      const colNum = colLetterToNumber(colLetter);
      const colUpper = colLetter.toUpperCase();

      // Prioridad de valor:
      // 1. Preservado (humano ya escribió aquí en un envío previo) → respetarlo
      // 2. Si es human_only y no hay preserved: initial-write con valor de DB
      //    (queda como "sugerencia" inicial; si el humano lo cambia, próxima
      //    generación lo captura como preserved).
      // 3. DB value default.
      const preserved = preservedForRow?.get(colUpper);
      if (preserved !== undefined) {
        newRow.getCell(colNum).value = preserved;
      } else {
        newRow.getCell(colNum).value = fieldValue(inc, field);
      }
      // Marcamos la variable para futuros lints — humanOnly ya influye vía
      // extractHumanEditedValues (solo esas cols se extraen en el próximo ciclo).
      void humanOnly;
    }

    // Col oculta con incident_id
    if (hiddenIdCol) {
      newRow.getCell(hiddenIdCol).value = inc.id;
    }

    // Aplicar estilos cacheados a cada col (aunque no esté mapeada — respeta
    // el zebrado o formato base del cliente).
    sampleStyles.forEach((style, colNum) => {
      if (style) newRow.getCell(colNum).style = JSON.parse(JSON.stringify(style));
    });
  });

  // Hidden col config: header + hidden=true
  if (hiddenIdCol) {
    // Solo poner header si la row 1 tiene contenido para no perder posición
    const headerCell = ws.getRow(1).getCell(hiddenIdCol);
    if (!headerCell.value) headerCell.value = HIDDEN_ID_HEADER;
    ws.getColumn(hiddenIdCol).hidden = true;
  }
}

/**
 * Encuentra la col oculta con HIDDEN_ID_HEADER en una sheet ya poblada.
 * Retorna el número de columna o null si no existe.
 */
export function findHiddenIdCol(ws: Worksheet): number | null {
  let hiddenIdCol: number | null = null;
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (cell.value === HIDDEN_ID_HEADER) hiddenIdCol = colNum;
  });
  return hiddenIdCol;
}

/**
 * Escanea la sheet y retorna { incident_id → rowNum } de todas las rows que
 * ya tienen un incident_id en la col oculta. Sirve para el flow de upsert.
 */
export function scanExistingIncidentRows(
  ws:      Worksheet,
  mapping: TemplateMapping,
): Map<string, number> {
  const result = new Map<string, number>();
  const hiddenCol = findHiddenIdCol(ws);
  if (!hiddenCol) return result;
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < mapping.insertion_row) return;
    const id = row.getCell(hiddenCol).value;
    if (typeof id === 'string' && id.length > 0) {
      result.set(id, rowNum);
    }
  });
  return result;
}

/**
 * Extrae el map { incident_id → { colLetter → valor } } para todas las cols
 * marcadas como human_only en el mapping. Sirve para preservar cualquier
 * edición humana (vendedor, notas, prioridad, etc) al regenerar el archivo
 * persistente. Retorna map vacío si la sheet no tiene la col oculta o no hay
 * cols human_only.
 */
export function extractHumanEditedValues(
  ws:      Worksheet,
  mapping: TemplateMapping,
): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();

  const humanOnly = (mapping.human_only_columns ?? []).map(c => c.toUpperCase());
  if (humanOnly.length === 0) return result;

  // Encontrar la col oculta con incident_id: buscar en row 1 la celda con
  // HIDDEN_ID_HEADER como valor.
  let hiddenIdCol: number | null = null;
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    const v = cell.value;
    if (typeof v === 'string' && v === HIDDEN_ID_HEADER) hiddenIdCol = colNum;
  });
  if (!hiddenIdCol) return result;

  const humanOnlyColNums: Array<{ letter: string; num: number }> = humanOnly.map(letter => ({
    letter,
    num:    colLetterToNumber(letter),
  }));

  // Escanear filas de datos
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < mapping.insertion_row) return;
    const idCell = row.getCell(hiddenIdCol!);
    const id = idCell.value;
    if (typeof id !== 'string' || id.length === 0) return;

    const values = new Map<string, string>();
    for (const { letter, num } of humanOnlyColNums) {
      const cellVal = row.getCell(num).value;
      if (typeof cellVal === 'string' && cellVal.trim().length > 0) {
        values.set(letter, cellVal.trim());
      } else if (typeof cellVal === 'number') {
        values.set(letter, String(cellVal));
      }
    }
    if (values.size > 0) result.set(id, values);
  });

  return result;
}
