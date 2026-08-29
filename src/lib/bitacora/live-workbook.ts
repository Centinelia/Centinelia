import { Workbook, Worksheet } from 'exceljs';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import type { TemplateMapping } from './template-analyzer';
import { populateSheetWithIncidents, extractHumanEditedValues } from './template-render';

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
 * Regenera el archivo persistente del mes preservando valores humanos.
 *
 * Flujo:
 * 1. Descarga el archivo live existente (si hay). Extrae { incident_id →
 *    { colLetter → valor } } para cols marcadas como human_only (vendedor,
 *    notas, etc). Esto captura cualquier edición manual del cliente.
 * 2. Crea workbook fresh desde el template. Ese template tiene 1 sheet
 *    estructural.
 * 3. Renombra la sheet a "Semana 1" (o la weekNumber correspondiente) y la
 *    llena con los incidents de la semana 1. Overlay los valores preservados
 *    en cols human_only.
 * 4. Para cada semana adicional del mes: clona el template en una nueva
 *    sheet, la llena. Overlay preservados.
 * 5. Retorna el buffer resultante.
 *
 * El caller es responsable de guardar el buffer al storage bucket.
 */
export async function updateLiveWorkbook(input: UpdateLiveInput): Promise<Buffer> {
  if (input.weeks.length === 0) throw new Error('no weeks to render');

  // 1. Descargar live existente y extraer preserved values
  const allPreserved = new Map<string, Map<string, string>>();
  try {
    const { data, error } = await input.supabase.storage.from('bitacora-live').download(input.livePath);
    if (data && !error) {
      const buf = Buffer.from(await data.arrayBuffer());
      const oldWb = new Workbook();
      await oldWb.xlsx.load(buf as unknown as ArrayBuffer);
      for (const ws of oldWb.worksheets) {
        const perSheet = extractHumanEditedValues(ws, input.mapping);
        for (const [id, vals] of perSheet) allPreserved.set(id, vals);
      }
    }
  } catch (err) {
    console.warn('[bitacora-live] existing file load failed, starting fresh:', err);
  }

  // 2. Crear workbook base desde el template
  const outWb = new Workbook();
  await outWb.xlsx.load(input.templateBuffer as unknown as ArrayBuffer);

  const templateSheet = outWb.getWorksheet(input.mapping.sheet_name) ?? outWb.worksheets[0];
  if (!templateSheet) throw new Error('template sheet missing after load');

  // Descartar sheets extras que no sean la target (si el template tenía varias)
  const targetName = templateSheet.name;
  for (const ws of [...outWb.worksheets]) {
    if (ws.name !== targetName) outWb.removeWorksheet(ws.id);
  }

  // 3. Renombrar la primera sheet y llenar con semana[0]
  templateSheet.name = `Semana ${input.weeks[0].weekNumber}`;
  populateSheetWithIncidents(templateSheet, input.mapping, input.weeks[0].incidents, {
    preservedValues:         allPreserved,
    includeHiddenIncidentId: true,
  });

  // 4. Semanas adicionales: clone del template + populate
  for (let i = 1; i < input.weeks.length; i++) {
    const week = input.weeks[i];
    const clonedSheet = await cloneSheetIntoWorkbook(
      input.templateBuffer,
      input.mapping.sheet_name,
      outWb,
      `Semana ${week.weekNumber}`,
    );
    populateSheetWithIncidents(clonedSheet, input.mapping, week.incidents, {
      preservedValues:         allPreserved,
      includeHiddenIncidentId: true,
    });
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
