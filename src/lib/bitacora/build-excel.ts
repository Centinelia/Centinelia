import { Workbook } from 'exceljs';
import type { IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import type { createAdminClient } from '@/lib/supabase/admin';
import { renderWithCustomTemplate } from './template-render';
import type { TemplateMapping } from './template-analyzer';

const DAYS = ['L', 'M', 'MI', 'J', 'V', 'S'];

export interface BuildBitacoraExcelInput {
  incidents:     IncidentRow[];
  businessName:  string;
  rangeStartISO: string;   // ISO — se usa para el nombre del sheet
  mode:          'weekly' | 'monthly';
}

interface TemplateConfig {
  url:      string;
  mapping:  TemplateMapping;
}

/**
 * Resuelve si la org tiene custom template. Si sí, descarga + renderiza con
 * mapping. Si no, cae al buildBitacoraExcel default (formato Centinelia).
 */
export async function buildBitacoraExcelForOrg(
  supabase:    ReturnType<typeof createAdminClient>,
  portalEmail: string,
  input:       BuildBitacoraExcelInput,
): Promise<Buffer> {
  const { data: org } = await supabase
    .from('organizations')
    .select('bitacora_template')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  const template = org?.bitacora_template as TemplateConfig | null;
  if (!template?.url || !template.mapping) {
    return buildBitacoraExcel(input);
  }

  try {
    const { data: fileData, error } = await supabase.storage
      .from('bitacora-templates')
      .download(template.url);
    if (error || !fileData) {
      console.warn('[bitacora] custom template download failed, falling back to default:', error);
      return buildBitacoraExcel(input);
    }
    const buffer = Buffer.from(await fileData.arrayBuffer());
    return await renderWithCustomTemplate(buffer, template.mapping, input.incidents);
  } catch (err) {
    console.error('[bitacora] custom template render failed, falling back to default:', err);
    return buildBitacoraExcel(input);
  }
}

/**
 * Genera el buffer xlsx de la bitácora. Extraído del endpoint /export para
 * poder reusarlo desde el cron de envío automático.
 *
 * Weekly: 1 sheet "Semana YYYY-MM-DD" con las incidencias de la semana.
 * Monthly: 1 sheet "Mes YYYY-MM" con las incidencias del mes acumuladas.
 * En ambos casos: columnas de seguimiento L/M/MI/J/V/S. En monthly, la marca
 * "OK" cae en el día de la semana del verification_called_at (útil para ver
 * qué días de la semana pasada se resolvieron).
 */
export async function buildBitacoraExcel(input: BuildBitacoraExcelInput): Promise<Buffer> {
  const { incidents, rangeStartISO, mode } = input;

  const wb = new Workbook();
  const sheetName = mode === 'monthly'
    ? `Mes ${rangeStartISO.slice(0, 7)}`
    : `Semana ${rangeStartISO.slice(0, 10)}`;
  const ws = wb.addWorksheet(sheetName);

  const DATOS_COLS = 11;
  ws.mergeCells(1, 1, 1, DATOS_COLS);
  ws.getCell(1, 1).value = 'DATOS DEL CLIENTE';
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE066' } };

  ws.mergeCells(1, DATOS_COLS + 1, 1, DATOS_COLS + DAYS.length);
  ws.getCell(1, DATOS_COLS + 1).value = 'SEGUIMIENTO DEL CLIENTE';
  ws.getCell(1, DATOS_COLS + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE066' } };

  const headers = ['Fecha', 'Tipo', 'Verificación', 'Negocio', 'Sucursal', 'Cliente', 'Dirección', 'Teléfono', 'Motivo', 'Resultado', 'Vendedor', ...DAYS];
  headers.forEach((h, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3B0' } };
    cell.font = { bold: true };
  });

  incidents.forEach((inc, rowIdx) => {
    const r = rowIdx + 3;
    let color: string | null = null;
    if (inc.is_new_client) color = 'FF1D4ED8';
    else if (inc.verification_result === 'no_visitado') color = 'FFDC2626';
    else if (inc.verification_result === 'sin_respuesta') color = 'FF6B7280';

    const values = [
      new Date(inc.created_at).toLocaleDateString('es-MX'),
      inc.type === 'alta' ? 'Alta' : 'Queja',
      inc.verification_scheduled_at
        ? new Date(inc.verification_scheduled_at).toLocaleDateString('es-MX')
        : '',
      inc.business_name,
      inc.sucursal ?? '',
      inc.contact_name ?? '',
      inc.address,
      inc.contact_phone,
      inc.motivo ?? '',
      inc.type === 'alta' ? '' : (inc.verification_result ?? 'pendiente'),
      inc.vendedor ?? '',
    ];

    values.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      if (color) cell.font = { color: { argb: color } };
    });

    if (inc.verification_result === 'ok' && inc.verification_called_at) {
      const day = new Date(inc.verification_called_at).getDay();
      const idx = day === 0 ? 6 : day - 1;
      if (idx < DAYS.length) {
        ws.getCell(r, DATOS_COLS + 1 + idx).value = 'OK';
      }
    }
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function sanitizeBusinessName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').toLowerCase();
}
