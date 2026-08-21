/**
 * GET /api/cron/billing-periodic-cuts
 *
 * Runs daily at 18:00 UTC. Filters billing_client_rules for clients whose
 * periodic cut falls on today (weekly by day-of-week name, monthly by day-of-month
 * string '1'..'31') and consolidates their pending sales into a single invoice
 * record per client.
 *
 * Auth: Bearer CRON_SECRET (same pattern as all other cron routes).
 *
 * Response: { processed: number, results: Array<{ rfc, ...result }> }
 *
 * processPeriodicCutForClient(rule):
 *   a. Reads Pendientes.xlsx for the client. If file missing or empty -> { skipped: 'empty' }.
 *   b. Consolidates all pending rows into one invoice record for the period.
 *   c. Appends a row to facturas_YYYY-MM-DD.xml stub (represented as a JSON row in
 *      Historial_YYYY.xlsx for now; a proper XML write would require a timbrado path).
 *   d. Moves all pending rows to the current-month sheet of Historial_YYYY.xlsx.
 *   e. Clears Pendientes.xlsx (overwrites with an empty workbook).
 *   f. Takes a snapshot before each write.
 *   g. Logs action_type='periodic_cut' in billing_activity_log.
 *   h. Returns { invoiced: N, folioTemp: string }.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { DropboxClient } from '@/lib/billing/storage/dropbox';
import { SnapshotStorage } from '@/lib/billing/storage/snapshot';
import { ExcelWorkbook } from '@/lib/billing/excel/workbook';
import { PendingClientSchema, HistoryMonthlySchema } from '@/lib/billing/excel/schemas';
import { sanitizeRfc } from '@/lib/billing/util/rfc';
import { buildPendingPath } from '@/lib/billing/rules/paths';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOW_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;

const MONTH_SHEET_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingClientRule {
  id:                     string;
  portal_email:           string;
  integration_id:         string;
  rfc:                    string;
  frequency:              'weekly' | 'monthly';
  cut_day:                string | null;
  default_payment_method: string | null;
}

export interface PeriodicCutResult {
  skipped?:   string;
  invoiced?:  number;
  folioTemp?: string;
  error?:     string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHistoryPath(basePath: string, rfc: string, year: number): string {
  const cleanBase = basePath.replace(/\/$/, '');
  return `${cleanBase}/Clientes_Periodicos/${sanitizeRfc(rfc)}/Historial_${year}.xlsx`;
}

function buildFolioTemp(rule: BillingClientRule): string {
  const now = new Date();
  const ts  = now.toISOString().replace(/[:.TZ-]/g, '').slice(0, 14);
  return `PCT-${sanitizeRfc(rule.rfc)}-${ts}`;
}

// ---------------------------------------------------------------------------
// processPeriodicCutForClient
// ---------------------------------------------------------------------------

/**
 * Processes a single periodic billing cut for one client.
 *
 * Exported for unit testing. Not part of the public API surface.
 */
export async function processPeriodicCutForClient(
  rule:     BillingClientRule,
): Promise<PeriodicCutResult> {
  const supabase  = createAdminClient();
  const snapshots = new SnapshotStorage();

  // Resolve Dropbox token: prefer per-integration config, fall back to env.
  const { data: integration } = await supabase
    .from('organization_integrations')
    .select('config')
    .eq('id', rule.integration_id)
    .maybeSingle();

  const dropboxToken: string =
    (integration?.config as Record<string, unknown> | null)?.['dropbox_token'] as string
    ?? process.env.BILLING_DROPBOX_TOKEN
    ?? '';

  const dropboxBasePath: string =
    (integration?.config as Record<string, unknown> | null)?.['dropbox_base_path'] as string
    ?? process.env.BILLING_DROPBOX_BASE_PATH
    ?? '/Facturacion';

  const dropbox     = new DropboxClient(dropboxToken);
  const pendingPath = buildPendingPath(dropboxBasePath, rule.rfc);

  // -------------------------------------------------------------------------
  // a. Read Pendientes.xlsx; if missing or empty, skip
  // -------------------------------------------------------------------------
  let pendingBuffer: Buffer;
  let isNew = false;

  try {
    pendingBuffer = await dropbox.readFile(pendingPath);
  } catch {
    // File does not exist yet -- nothing to consolidate.
    return { skipped: 'empty' };
  }

  // Snapshot before touching anything
  await snapshots.snapshot(rule.portal_email, pendingPath, pendingBuffer);

  const pendingWb  = await ExcelWorkbook.fromBuffer(pendingBuffer, PendingClientSchema);
  const pendingRows = pendingWb.getRows('Pendientes');

  if (pendingRows.length === 0) {
    return { skipped: 'empty' };
  }

  // -------------------------------------------------------------------------
  // b. Consolidate: sum totals, concatenate product descriptions
  // -------------------------------------------------------------------------
  const totalAmount: number = pendingRows.reduce(
    (acc, r) => acc + (typeof r['total'] === 'number' ? r['total'] : Number(r['total'] ?? 0)),
    0,
  );
  const productsSummary = pendingRows
    .map(r => String(r['productos'] ?? ''))
    .filter(Boolean)
    .join('; ');
  const ventasSources = pendingRows
    .map(r => String(r['ventasSources'] ?? ''))
    .filter(Boolean)
    .join(', ');

  const invoiceDate = new Date().toISOString().slice(0, 10);
  const folioTemp   = buildFolioTemp(rule);

  // -------------------------------------------------------------------------
  // d. Append to Historial_YYYY.xlsx on the current-month sheet
  //    (creates the file if it doesn't exist yet)
  // -------------------------------------------------------------------------
  const now        = new Date();
  const year       = now.getUTCFullYear();
  const monthIdx   = now.getUTCMonth(); // 0-based
  const monthSheet = MONTH_SHEET_NAMES[monthIdx];
  const historyPath = buildHistoryPath(dropboxBasePath, rule.rfc, year);

  let historyBuffer: Buffer;
  let historyWb: ExcelWorkbook;

  try {
    historyBuffer = await dropbox.readFile(historyPath);
    // Snapshot before write
    await snapshots.snapshot(rule.portal_email, historyPath, historyBuffer);
    historyWb = await ExcelWorkbook.fromBuffer(historyBuffer, HistoryMonthlySchema);
  } catch {
    // Create new history workbook for the year
    historyWb = ExcelWorkbook.empty(HistoryMonthlySchema);
    historyBuffer = await historyWb.toBuffer();
    await snapshots.snapshot(rule.portal_email, historyPath, historyBuffer);
  }

  historyWb.appendRow(monthSheet, {
    fechaCorte:    invoiceDate,
    folio:         folioTemp,
    periodo:       `${rule.frequency} · ${rule.cut_day ?? ''}`,
    lineas:        productsSummary,
    total:         totalAmount,
    ventasSources,
  });

  const newHistoryBuffer = await historyWb.toBuffer();
  await dropbox.writeFile(historyPath, newHistoryBuffer);

  // -------------------------------------------------------------------------
  // e. Clear Pendientes.xlsx (overwrite with empty workbook)
  // -------------------------------------------------------------------------
  const emptyWb         = ExcelWorkbook.empty(PendingClientSchema);
  const clearedBuffer   = await emptyWb.toBuffer();
  await snapshots.snapshot(rule.portal_email, pendingPath, clearedBuffer);
  await dropbox.writeFile(pendingPath, clearedBuffer);

  // -------------------------------------------------------------------------
  // g. Log activity
  // -------------------------------------------------------------------------
  const { error: logError } = await supabase.from('billing_activity_log').insert({
    portal_email:   rule.portal_email,
    integration_id: rule.integration_id,
    action_type:    'periodic_cut',
    severity:       'info',
    entity_ref:     rule.rfc,
    context: {
      frequency:   rule.frequency,
      cut_day:     rule.cut_day,
      invoiced:    pendingRows.length,
      total:       totalAmount,
      folio_temp:  folioTemp,
    },
  });

  if (logError) {
    console.error('[billing-periodic-cuts] log_activity error:', logError.message);
  }

  // -------------------------------------------------------------------------
  // h. Return result
  // -------------------------------------------------------------------------
  return { invoiced: pendingRows.length, folioTemp };
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now      = new Date();

  const dayOfWeek  = DOW_NAMES[now.getUTCDay()];
  const dayOfMonth = String(now.getUTCDate());

  // -------------------------------------------------------------------------
  // 1. Query rules that apply today (weekly by DOW name, monthly by day string)
  // -------------------------------------------------------------------------
  const { data: rules, error: rulesError } = await supabase
    .from('billing_client_rules')
    .select('id, portal_email, integration_id, rfc, frequency, cut_day, default_payment_method')
    .or(
      `and(frequency.eq.weekly,cut_day.eq.${dayOfWeek}),` +
      `and(frequency.eq.monthly,cut_day.eq.${dayOfMonth})`,
    );

  if (rulesError) {
    console.error('[billing-periodic-cuts] DB query error:', rulesError.message);
    return NextResponse.json({ error: rulesError.message }, { status: 500 });
  }

  const matchingRules = (rules ?? []) as BillingClientRule[];

  // -------------------------------------------------------------------------
  // 2. Process each rule independently
  // -------------------------------------------------------------------------
  const results: Array<{ rfc: string } & PeriodicCutResult> = [];

  for (const rule of matchingRules) {
    try {
      const result = await processPeriodicCutForClient(rule);
      results.push({ rfc: rule.rfc, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[billing-periodic-cuts] error for RFC', rule.rfc, ':', msg);
      results.push({ rfc: rule.rfc, error: msg });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
