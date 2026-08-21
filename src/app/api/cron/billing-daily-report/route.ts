/**
 * GET /api/cron/billing-daily-report
 *
 * Runs daily at 22:00 UTC (~16-17 CST Mexico). For each active billing integration
 * (organization_integrations type='contpaqi') builds the daily closure report and
 * sends it by email to the configured recipients.
 *
 * Recipients: integration.config.report_recipients (array of emails).
 * Fallback:   BILLING_ESCALATION_EMAIL environment variable.
 *
 * Auth: Bearer CRON_SECRET (same pattern as all other cron routes).
 *
 * Response: { processed: number, results: Array<{ portal_email, ...result }> }
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { buildDailyReport, sendDailyReport } from '@/lib/billing/reports/daily';
import { decryptDropboxToken } from '@/lib/billing/adapters';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingIntegration {
  id:           string;
  portal_email: string;
  config:       Record<string, unknown> | null;
}

export interface DailyReportResult {
  portal_email: string;
  sent?:        boolean;
  messageId?:   string;
  skipped?:     string;
  error?:       string;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today    = new Date().toISOString().slice(0, 10);

  // -------------------------------------------------------------------------
  // 1. Fetch billing integrations
  // -------------------------------------------------------------------------
  const { data: integrations, error: dbError } = await supabase
    .from('organization_integrations')
    .select('id, portal_email, config')
    .eq('type', 'contpaqi')
    .not('config', 'is', null);

  if (dbError) {
    console.error('[billing-daily-report] DB query error:', dbError.message);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const activeIntegrations = (integrations ?? []) as BillingIntegration[];

  if (activeIntegrations.length === 0) {
    return NextResponse.json({ processed: 0, results: [] });
  }

  const fallbackEmail = process.env.BILLING_ESCALATION_EMAIL;

  // -------------------------------------------------------------------------
  // 2. Build and send report per integration
  // -------------------------------------------------------------------------
  const results: DailyReportResult[] = [];

  for (const integ of activeIntegrations) {
    const cfg          = integ.config ?? {};
    const dropboxToken = decryptDropboxToken(cfg['dropbox_token'] as string | undefined) ?? process.env.BILLING_DROPBOX_TOKEN ?? '';
    const basePath     = (cfg['dropbox_base_path'] as string | undefined) ?? process.env.BILLING_DROPBOX_BASE_PATH ?? '/Facturacion';

    const configuredRecipients = (cfg['report_recipients'] as string[] | undefined) ?? [];
    const recipients: string[] = configuredRecipients.length > 0
      ? configuredRecipients
      : fallbackEmail
        ? [fallbackEmail]
        : [];

    if (recipients.length === 0) {
      console.warn('[billing-daily-report] no recipients for', integ.portal_email, '-- skipping send');
      results.push({ portal_email: integ.portal_email, skipped: 'no_recipients' });
      continue;
    }

    try {
      const report = await buildDailyReport(
        today,
        { portalEmail: integ.portal_email, integrationId: integ.id, dropboxToken },
        basePath,
      );

      const { messageId } = await sendDailyReport(report, recipients, {
        dropboxToken,
        dropboxBasePath: basePath,
      });

      results.push({ portal_email: integ.portal_email, sent: true, messageId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[billing-daily-report] error for', integ.portal_email, ':', msg);
      results.push({ portal_email: integ.portal_email, error: msg });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
