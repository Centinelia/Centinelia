import { Workbook, Worksheet } from 'exceljs';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import type { TemplateMapping } from './template-analyzer';
import { upsertSheetWithIncidents, clearHistoricalDataRows } from './template-render';

/** Placeholder que el cliente puede poner en su template. Se reemplaza en
 *  cada sheet clonada con el rango real de la semana ("24-30 AGO"). */
const WEEK_RANGE_PLACEHOLDER = '{{RANGO_SEMANA}}';

const MONTHS_ES_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mDay = monday.getDate();
  const sDay = sunday.getDate();
  const mMon = MONTHS_ES_SHORT[monday.getMonth()];
  const sMon = MONTHS_ES_SHORT[sunday.getMonth()];
  if (monday.getMonth() === sunday.getMonth()) {
    return `${mDay}-${sDay} ${mMon}`;
  }
  return `${mDay} ${mMon} - ${sDay} ${sMon}`;
}

/**
 * Reemplaza todas las celdas de la sheet que contengan `{{RANGO_SEMANA}}`
 * con el rango real de la semana en formato "24-30 AGO" o "28 AGO - 3 SEP"
 * si cruza mes. Se llama al clonar/inicializar cada Semana N.
 */
function injectWeekRange(ws: Worksheet, weekStart: Date): void {
  const label = formatWeekRange(weekStart);
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === 'string' && cell.value.includes(WEEK_RANGE_PLACEHOLDER)) {
        cell.value = cell.value.replace(WEEK_RANGE_PLACEHOLDER, label);
      }
    });
  });
}

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface WeekSpec {
  /** 1-indexed. "Semana N del mes". Basado en el sábado del cron cuando se
   *  generó (Sábado 1-7 = 1, 8-14 = 2, 15-21 = 3, 22-28 = 4, 29-31 = 5). */
  weekNumber: number;
  /** Lunes 00:00 MX de la semana. */
  weekStart:  Date;
  /** Lunes 00:00 MX de la semana siguiente (exclusivo). */
  weekEnd:    Date;
  incidents:  IncidentRow[];
}

export interface UpdateLiveInput {
  supabase:       SupabaseClient;
  templateBuffer: Buffer;
  /** Path en el bucket `bitacora-live`, ej. `{portal}/{agent_id}/2026-09.xlsx`. */
  livePath:       string;
  mapping:        TemplateMapping;
  weeks:          WeekSpec[];
}

/**
 * Actualiza el archivo persistente del mes vía UPSERT no destructivo.
 *
 * Filosofía: el archivo del cliente es la fuente de verdad para todo lo que
 * no sean cols mapeadas no-human_only. Rows nuevas del cliente, cols que
 * agregó, formato personalizado, hojas extra que armó: todo se preserva.
 *
 * Flujo:
 * 1. Descarga el live existente (si hay). Si no, crea uno nuevo desde el
 *    template como base (primer envío del mes).
 * 2. Para cada semana requerida:
 *    a. Busca la sheet "Semana N" en el workbook.
 *    b. Si no existe: la clona del template (mismo estructura visual).
 *    c. Corre upsertSheetWithIncidents en ella: UPDATE cols mapeadas no-human
 *       en rows con incident_id conocido, INSERT rows nuevas al final. NO toca
 *       nada más (rows sin incident_id, cols no mapeadas, cols human_only).
 * 3. Retorna el buffer.
 *
 * Sheets extra del cliente (que no correspondan a "Semana N"): se preservan.
 * Rows manuales del cliente dentro de una sheet: se preservan.
 * Ediciones del cliente en cols human_only: se preservan.
 * Ediciones del cliente en cols mapeadas no-human: se sobrescriben con DB
 *   (DB es fuente de verdad para esas). Si quiere que persistan, marque la
 *   col como human_only en el toggle del template.
 */
export async function updateLiveWorkbook(input: UpdateLiveInput): Promise<Buffer> {
  if (input.weeks.length === 0) throw new Error('no weeks to render');

  // 1. Load existing live o create fresh desde template
  let outWb: Workbook | null = null;
  try {
    const { data, error } = await input.supabase.storage.from('bitacora-live').download(input.livePath);
    if (data && !error) {
      const buf = Buffer.from(await data.arrayBuffer());
      outWb = new Workbook();
      await outWb.xlsx.load(buf as unknown as ArrayBuffer);
    }
  } catch (err) {
    console.warn('[bitacora-live] existing file load failed, starting fresh:', err);
    outWb = null;
  }

  if (!outWb) {
    // Primer envío del mes: cargar template como base
    outWb = new Workbook();
    await outWb.xlsx.load(input.templateBuffer as unknown as ArrayBuffer);
    const templateSheet = outWb.getWorksheet(input.mapping.sheet_name) ?? outWb.worksheets[0];
    if (!templateSheet) throw new Error('template sheet missing after load');
    // Descartar sheets extras del template (queda solo la target)
    const targetName = templateSheet.name;
    for (const ws of [...outWb.worksheets]) {
      if (ws.name !== targetName) outWb.removeWorksheet(ws.id);
    }
    // Limpiar data histórica del cliente (rows debajo del insertion_row del
    // template que son data de meses/años previos que no aplica al nuevo mes).
    clearHistoricalDataRows(templateSheet, input.mapping.insertion_row);
    // Renombrar template sheet a "Semana N" del primer week + inyectar rango
    templateSheet.name = `Semana ${input.weeks[0].weekNumber}`;
    injectWeekRange(templateSheet, input.weeks[0].weekStart);
  }

  // 2. Para cada semana: upsert
  for (const week of input.weeks) {
    const sheetName = `Semana ${week.weekNumber}`;
    let ws = outWb.getWorksheet(sheetName);
    if (!ws) {
      // Sheet no existe (nueva semana del mes) — clonar del template
      ws = await cloneSheetIntoWorkbook(
        input.templateBuffer,
        input.mapping.sheet_name,
        outWb,
        sheetName,
      );
      // Limpiar data histórica clonada del template (misma razón que arriba).
      clearHistoricalDataRows(ws, input.mapping.insertion_row);
      // Inyectar rango de fechas de esta semana en el placeholder del header
      injectWeekRange(ws, week.weekStart);
    }
    upsertSheetWithIncidents(ws, input.mapping, week.incidents, week.weekStart, week.weekEnd);
  }

  return Buffer.from(await outWb.xlsx.writeBuffer());
}

/**
 * Clona un sheet del template (cargado fresh desde el buffer) dentro de un
 * workbook existente. Copia: values, styles, col widths, hidden cols, row
 * heights, merges. NO copia: imágenes embebidas, data validation, conditional
 * formatting (edge cases raros en plantillas de bitácora de negocios).
 */
async function cloneSheetIntoWorkbook(
  templateBuffer:    Buffer,
  templateSheetName: string,
  destWorkbook:      Workbook,
  destSheetName:     string,
): Promise<Worksheet> {
  const tempWb = new Workbook();
  await tempWb.xlsx.load(templateBuffer as unknown as ArrayBuffer);
  const srcSheet = tempWb.getWorksheet(templateSheetName) ?? tempWb.worksheets[0];
  if (!srcSheet) throw new Error(`template sheet '${templateSheetName}' not found`);

  const destSheet = destWorkbook.addWorksheet(destSheetName);

  // Col properties (widths + hidden)
  const srcCols = (srcSheet as unknown as { columns: unknown[] }).columns;
  if (Array.isArray(srcCols)) {
    srcCols.forEach((col: unknown, idx) => {
      if (!col || typeof col !== 'object') return;
      const c = col as { width?: number; hidden?: boolean };
      const destCol = destSheet.getColumn(idx + 1);
      if (c.width != null) destCol.width = c.width;
      if (c.hidden != null) destCol.hidden = c.hidden;
    });
  }

  // Rows + cells
  srcSheet.eachRow({ includeEmpty: true }, (row, rowNum) => {
    const destRow = destSheet.getRow(rowNum);
    if (row.height != null) destRow.height = row.height;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const destCell = destRow.getCell(colNum);
      destCell.value = cell.value;
      if (cell.style) destCell.style = JSON.parse(JSON.stringify(cell.style));
    });
  });

  // Merges — ExcelJS los expone en model.merges como array de A1-notation strings
  const model = (srcSheet as unknown as { model?: { merges?: unknown } }).model;
  const merges = model?.merges;
  if (Array.isArray(merges)) {
    for (const mergeSpec of merges) {
      if (typeof mergeSpec === 'string') {
        try { destSheet.mergeCells(mergeSpec); } catch { /* ya mergeada o inválida */ }
      }
    }
  }

  return destSheet;
}
