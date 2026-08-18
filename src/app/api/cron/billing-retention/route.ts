/**
 * GET /api/cron/billing-retention
 *
 * Runs monthly on the 1st at 03:00 UTC. For each active billing integration
 * (organization_integrations type='contpaqi'), applies file retention policies
 * to keep Dropbox storage lean:
 *
 *   Diarios/           -- files older than `diarios_active_months` months (default 6)
 *                         are moved to _Historico/Diarios/
 *   Importables_CONTPAQi/procesados/
 *                      -- files older than `importables_processed_days` days (default 30)
 *                         are moved to _Historico/Importables/
 *
 * Year-end protection: when the cron fires on January 1st (month=1), no
 * rotation is performed. Historial_YYYY.xlsx files for the new year are
 * created on demand by the billing worker, not here.
 *
 * After processing all integrations, a summary report is sent to
 * BILLING_ESCALATION_EMAIL.
 *
 * Auth: Bearer CRON_SECRET (same pattern as all other cron routes).
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { DropboxClient } from '@/lib/billing/storage/dropbox';
import { SnapshotStorage } from '@/lib/billing/storage/snapshot';
import { sendBillingMail } from '@/lib/billing/mail/send';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DIARIOS_ACTIVE_MONTHS       = 6;
const DEFAULT_IMPORTABLES_PROCESSED_DAYS  = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingIntegration {
  id:           string;
  portal_email: string;
  config:       Record<string, unknown> | null;
}

export interface RetentionResult {
  portal_email:        string;
  diariosRotated?:     number;
  importablesRotated?: number;
  snapshotsPruned?:    number;
  skipped?:            string;
  error?:              string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normBase(basePath: string): string {
  return basePath.replace(/\/$/, '');
}

function daysOld(serverModified: string | undefined): number {
  if (!serverModified) return 0;
  return Math.floor((Date.now() - new Date(serverModified).getTime()) / 86_400_000);
}

function monthsOld(serverModified: string | undefined): number {
  return daysOld(serverModified) / 30;
}

// ---------------------------------------------------------------------------
// applyRetentionForIntegration
// ---------------------------------------------------------------------------

/**
 * Applies Diarios and Importables retention policies for one billing integration.
 *
 * Exported for unit testing.
 */
export async function applyRetentionForIntegration(
  integ: BillingIntegration,
  nowMonth: number,
): Promise<RetentionResult> {
  const cfg    = integ.config ?? {};
  const token  = (cfg['dropbox_token']  as string | undefined) ?? process.env.BILLING_DROPBOX_TOKEN ?? '';
  const base   = normBase((cfg['dropbox_base_path'] as string | undefined) ?? process.env.BILLING_DROPBOX_BASE_PATH ?? '/Facturacion');

  const diariosActiveMonths      = (cfg['diarios_active_months']       as number | undefined) ?? DEFAULT_DIARIOS_ACTIVE_MONTHS;
  const importablesProcessedDays = (cfg['importables_processed_days']  as number | undefined) ?? DEFAULT_IMPORTABLES_PROCESSED_DAYS;

  // Year-end protection: January 1 run skips rotation.
  if (nowMonth === 1) {
    return { portal_email: integ.portal_email, skipped: 'year_end' };
  }

  const dropbox = new DropboxClient(token);

  const diariosPath       = `${base}/Diarios`;
  const historicoDiarios  = `${base}/_Historico/Diarios`;
  const importablesPath   = `${base}/Importables_CONTPAQi/procesados`;
  const historicoImport   = `${base}/_Historico/Importables`;

  // Attempt to list Diarios; if folder absent, skip the whole integration.
  let diariosEntries;
  try {
    diariosEntries = await dropbox.listFolder(diariosPath);
  } catch {
    return { portal_email: integ.portal_email, skipped: 'folder_not_found' };
  }

  // Rotate old Diarios files
  let diariosRotated = 0;
  for (const entry of diariosEntries) {
    if (!entry.isFile) continue;
    if (monthsOld(entry.serverModified) > diariosActiveMonths) {
      const dest = `${historicoDiarios}/${entry.name}`;
      await dropbox.moveFile(entry.path, dest);
      diariosRotated++;
    }
  }

  // Rotate old Importables files (folder may not exist -- tolerated)
  let importablesRotated = 0;
  try {
    const importEntries = await dropbox.listFolder(importablesPath);
    for (const entry of importEntries) {
      if (!entry.isFile) continue;
      if (daysOld(entry.serverModified) > importablesProcessedDays) {
        const dest = `${historicoImport}/${entry.name}`;
        await dropbox.moveFile(entry.path, dest);
        importablesRotated++;
      }
    }
  } catch {
    // Importables folder absent is not fatal; continue.
    console.warn('[billing-retention] importables folder not found for', integ.portal_email);
  }

  // Prune old snapshots for this organization, keeping the 30 most recent per file path.
  // Non-fatal: errors are logged but do not fail the integration result.
  let snapshotsPruned = 0;
  try {
    const snapshots = new SnapshotStorage();
    snapshotsPruned = await snapshots.pruneAllSnapshotsForOrg(integ.portal_email, 30);
  } catch (pruneErr) {
    console.warn(
      '[billing-retention] snapshot prune error for',
      integ.portal_email,
      ':',
      pruneErr instanceof Error ? pruneErr.message : String(pruneErr),
    );
  }

  return {
    portal_email:      integ.portal_email,
    diariosRotated,
    importablesRotated,
    snapshotsPruned,
  };
}

// ---------------------------------------------------------------------------
// buildReportBody
// ---------------------------------------------------------------------------

function buildReportBody(results: RetentionResult[], runDate: string): string {
  const lines: string[] = [
    `<h2>Reporte de retencion de archivos de facturacion</h2>`,
    `<p>Fecha de ejecucion: ${runDate}</p>`,
    `<table border="1" cellpadding="6" cellspacing="0">`,
    `<thead><tr><th>Integracion</th><th>Diarios rotados</th><th>Importables rotados</th><th>Snapshots eliminados</th><th>Nota</th></tr></thead>`,
    `<tbody>`,
  ];

  for (const r of results) {
    const diarios     = r.diariosRotated     ?? '-';
    const importables = r.importablesRotated ?? '-';
    const snapshots   = r.snapshotsPruned    ?? '-';
    const note        = r.skipped ?? r.error ?? '';
    lines.push(
      `<tr><td>${r.portal_email}</td><td>${diarios}</td><td>${importables}</td><td>${snapshots}</td><td>${note}</td></tr>`,
    );
  }

  lines.push('</tbody></table>');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase  = createAdminClient();
  const now       = new Date();
  const nowMonth  = now.getUTCMonth() + 1; // 1-based
  const runDate   = now.toISOString().slice(0, 10);

  // -------------------------------------------------------------------------
  // 1. Fetch active billing integrations
  // -------------------------------------------------------------------------
  const { data: integrations, error: dbError } = await supabase
    .from('organization_integrations')
    .select('id, portal_email, config')
    .eq('type', 'contpaqi')
    .not('config', 'is', null);

  if (dbError) {
    console.error('[billing-retention] DB query error:', dbError.message);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const activeIntegrations = (integrations ?? []) as BillingIntegration[];

  if (activeIntegrations.length === 0) {
    return NextResponse.json({ processed: 0, results: [] });
  }

  // -------------------------------------------------------------------------
  // 2. Apply retention per integration
  // -------------------------------------------------------------------------
  const results: RetentionResult[] = [];

  for (const integ of activeIntegrations) {
    try {
      const result = await applyRetentionForIntegration(integ, nowMonth);
      results.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[billing-retention] error for', integ.portal_email, ':', msg);
      results.push({ portal_email: integ.portal_email, error: msg });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Send report mail
  // -------------------------------------------------------------------------
  const escalationEmail = process.env.BILLING_ESCALATION_EMAIL;
  if (escalationEmail) {
    try {
      await sendBillingMail({
        to:      escalationEmail,
        subject: `Reporte de retencion de archivos facturacion ${runDate}`,
        body:    buildReportBody(results, runDate),
      });
    } catch (mailErr) {
      console.error('[billing-retention] mail send error:', mailErr);
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
