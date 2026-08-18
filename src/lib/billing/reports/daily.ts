/**
 * billing/reports/daily.ts
 *
 * buildDailyReport  — lee el Excel diario de Dropbox y la tabla billing_activity_log
 *                     para construir un resumen del cierre del dia.
 *
 * sendDailyReport   — formatea y envia el reporte por correo a los destinatarios
 *                     indicados, adjuntando el Excel diario.
 *
 * Lenguaje: espanol mexicano profesional. Sin em-dashes, sin emojis, sin "IA".
 */

import { DropboxClient } from '@/lib/billing/storage/dropbox';
import { ExcelWorkbook } from '@/lib/billing/excel/workbook';
import { DailySalesSchema } from '@/lib/billing/excel/schemas';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBillingMail } from '@/lib/billing/mail/send';

// ── Tipos publicos ────────────────────────────────────────────────────────────

export interface RequiereAtencionItem {
  notitaNum: number;
  motivo: string;
}

export interface DailyReport {
  /** Fecha del reporte (YYYY-MM-DD). */
  date: string;
  /** Total de registros de venta procesados en el dia. */
  processed: number;
  /** Registros que quedaron escalados (requieren revision humana). */
  escalated: number;
  /** Registros acumulados para facturacion semanal o mensual. */
  consulted: number;
  /** Suma de ventas con status listo_timbrar. */
  totalFacturado: number;
  /** Suma de ventas de publico general (sin cliente asignado). */
  totalNoFacturado: number;
  /** Conteo de filas de publico general (para el cuerpo del correo). */
  publicoGeneralCount?: number;
  /** Conteo de ventas listas para timbrar directamente. */
  listoTimbrarCount?: number;
  /** Items que requieren atencion del humano. */
  requiereAtencion: RequiereAtencionItem[];
  /** Ruta en Dropbox del XML generado para timbrar (opcional). */
  xmlPath?: string;
  /** Ruta en Dropbox del Excel diario. */
  dailyExcelPath: string;
}

export interface OrgCtxMinimal {
  portalEmail: string;
  integrationId: string;
  dropboxToken: string;
}

export interface SendDailyReportOpts {
  dropboxToken: string;
  dropboxBasePath: string;
}

// ── Helpers de fecha ──────────────────────────────────────────────────────────

/**
 * Convierte "2026-08-17" a "17/agosto".
 */
function formatFechaCierre(isoDate: string): string {
  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const [, monthStr, dayStr] = isoDate.split('-');
  const month = parseInt(monthStr, 10) - 1;
  const day   = parseInt(dayStr, 10);
  return `${day}/${MESES[month] ?? monthStr}`;
}

// ── buildDailyReport ──────────────────────────────────────────────────────────

/**
 * Construye el DailyReport para la fecha indicada.
 *
 * 1. Descarga el Excel diario de Dropbox (ventas_YYYY-MM-DD.xlsx o Ventas_YYYY-MM-DD.xlsx).
 * 2. Cuenta y totaliza filas por status.
 * 3. Consulta billing_activity_log para las escalaciones del dia.
 */
export async function buildDailyReport(
  date: string,
  ctx: OrgCtxMinimal,
  basePath: string,
): Promise<DailyReport> {
  const dropbox = new DropboxClient(ctx.dropboxToken);
  const supabase = createAdminClient();

  // Ruta del Excel diario
  const excelFileName  = `Ventas_${date}.xlsx`;
  const dailyExcelPath = `${basePath}/diario/${excelFileName}`;

  // Ruta del XML de timbrar (lo exponemos si hay ventas listo_timbrar)
  const xmlPath = `${basePath}/pendientes_importar/facturas_${date}.xml`;

  // ── 1. Leer Excel diario ────────────────────────────────────────────────────
  let rows: Record<string, unknown>[] = [];
  try {
    const buf = await dropbox.readFile(dailyExcelPath);
    const wb  = await ExcelWorkbook.fromBuffer(buf, DailySalesSchema);
    rows = wb.getRows('Ventas') as Record<string, unknown>[];
  } catch {
    // Si el archivo no existe aun, rows queda vacio (sin actividad).
  }

  // ── 2. Contar y totalizar ───────────────────────────────────────────────────
  let processed           = rows.length;
  let escalated           = 0;
  let consulted           = 0; // acumulados semanal/mensual
  let listoTimbrarCount   = 0;
  let totalFacturado      = 0;
  let totalNoFacturado    = 0;
  let publicoGeneralCount = 0;

  for (const row of rows) {
    const status = String(row.status ?? '');
    const total  = Number(row.total ?? 0);

    if (status === 'listo_timbrar') {
      totalFacturado  += total;
      listoTimbrarCount++;
    } else if (status === 'publico_general') {
      totalNoFacturado  += total;
      publicoGeneralCount++;
    } else if (status === 'acumulado_semanal' || status === 'acumulado_mensual') {
      consulted++;
    } else if (status === 'escalado' || status === 'monto_inusual') {
      escalated++;
    }
  }

  // processed incluye todos los rows del dia.
  processed = rows.length;

  // ── 3. Leer billing_activity_log para requiereAtencion ─────────────────────
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd   = `${date}T23:59:59.999Z`;

  const { data: logRows } = await supabase
    .from('billing_activity_log')
    .select('action_type, severity, entity_ref, context, timestamp')
    .eq('integration_id', ctx.integrationId)
    .gte('timestamp', dayStart)
    .lte('timestamp', dayEnd);

  const requiereAtencion: RequiereAtencionItem[] = [];

  for (const log of (logRows ?? [])) {
    const severity   = String(log.severity ?? '');
    const actionType = String(log.action_type ?? '');
    // Surface warnings, errors, escalations, and unusual amounts as items requiring attention.
    if (
      severity === 'error' ||
      severity === 'warning' ||
      actionType === 'escalation' ||
      actionType === 'monto_inusual'
    ) {
      const ctx_data = (log.context ?? {}) as Record<string, unknown>;
      const notitaNum = Number(ctx_data['notita_num'] ?? ctx_data['venta_num'] ?? 0);
      const motivo    = String(ctx_data['motivo'] ?? log.entity_ref ?? actionType);
      requiereAtencion.push({ notitaNum, motivo });
    }
  }

  return {
    date,
    processed,
    escalated,
    consulted,
    listoTimbrarCount,
    totalFacturado,
    totalNoFacturado,
    publicoGeneralCount,
    requiereAtencion,
    xmlPath:       listoTimbrarCount > 0 ? xmlPath : undefined,
    dailyExcelPath,
  };
}

// ── sendDailyReport ───────────────────────────────────────────────────────────

/**
 * Envía el reporte de cierre del dia por correo.
 *
 * Adjunta el Excel diario descargandolo de Dropbox.
 * Envia un correo independiente a cada destinatario.
 * Retorna el messageId del ultimo envio (uso tipico: un solo destinatario).
 */
export async function sendDailyReport(
  report: DailyReport,
  recipients: string[],
  opts: SendDailyReportOpts,
): Promise<{ messageId: string }> {
  const fechaCierre = formatFechaCierre(report.date);
  const excelFileName = `Ventas_${report.date}.xlsx`;

  // ── Descargar Excel adjunto ────────────────────────────────────────────────
  let excelBuffer: Buffer = Buffer.alloc(0);
  try {
    const dropbox = new DropboxClient(opts.dropboxToken);
    excelBuffer   = await dropbox.readFile(report.dailyExcelPath);
  } catch {
    // Si no se puede descargar, se envia sin adjunto.
  }

  // ── Construir cuerpo ───────────────────────────────────────────────────────
  const body = buildEmailBody(report, fechaCierre, excelFileName);

  // ── Enviar a cada destinatario ─────────────────────────────────────────────
  let lastResult = { messageId: '' };

  for (const to of recipients) {
    const attachments =
      excelBuffer.length > 0
        ? [{ filename: excelFileName, content: excelBuffer }]
        : undefined;

    lastResult = await sendBillingMail({
      to,
      subject: `Cierre del dia ${report.date} - Reporte de ventas`,
      body,
      ...(attachments ? { attachments } : {}),
    });
  }

  return lastResult;
}

// ── Formateo del cuerpo ───────────────────────────────────────────────────────

function buildEmailBody(
  report: DailyReport,
  fechaCierre: string,
  excelFileName: string,
): string {
  const lines: string[] = [];

  lines.push(`Cierre del dia ${fechaCierre}`);
  lines.push('');

  if (report.processed === 0) {
    lines.push('No hubo actividad de ventas hoy (sin actividad).');
    lines.push('');
    lines.push(`Adjunto: ${excelFileName}`);
    lines.push('');
    lines.push('Cuando importes en CONTPAQi y timbres, contestame con "OK timbrado" para actualizar el status.');
    return lines.join('\n');
  }

  lines.push(`Procese ${report.processed} notitas hoy.`);

  // Listo timbrar
  const listoTimbrarCount = report.listoTimbrarCount ?? 0;

  if (report.xmlPath) {
    const xmlRelativo = report.xmlPath.split('/').pop() ?? report.xmlPath;
    const xmlCarpeta  = report.xmlPath.includes('pendientes_importar')
      ? `pendientes_importar/${xmlRelativo}`
      : report.xmlPath;
    const countLabel  = listoTimbrarCount > 0 ? listoTimbrarCount : '';
    const prefix      = countLabel ? `${countLabel} ` : '';
    lines.push(`- ${prefix}facturas listas para timbrar (diarias) -> archivo en Dropbox: ${xmlCarpeta}`);
  }

  // Acumulados
  if (report.consulted > 0) {
    lines.push(`- ${report.consulted} ventas acumuladas para facturacion semanal/mensual.`);
  }

  // Publico general
  if (report.totalNoFacturado > 0) {
    const pgCount = report.publicoGeneralCount ?? 1;
    lines.push(`- ${pgCount} ventas sin cliente asignado (publico general): $${report.totalNoFacturado}.`);
  }

  lines.push('');

  // Requieren atencion
  if (report.requiereAtencion.length > 0) {
    lines.push('Requieren tu atencion:');
    for (const item of report.requiereAtencion) {
      lines.push(`- Notita #${item.notitaNum}: ${item.motivo}`);
    }
    lines.push('');
  }

  lines.push(`Adjunto: ${excelFileName}`);
  lines.push('');
  lines.push('Cuando importes en CONTPAQi y timbres, contestame con "OK timbrado" para actualizar el status.');

  return lines.join('\n');
}

