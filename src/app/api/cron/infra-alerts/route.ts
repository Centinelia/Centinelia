export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, infraAlertHtml } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

// ──────────────────────────────────────────────────────────────
// Invoicing alert thresholds
// ──────────────────────────────────────────────────────────────
// SF error codes that indicate invalid/expired credentials
const SF_CRED_ERROR_CODES = ['[601]', '[603]'];
// Minimum failed stamps in the last 2 h to consider creds bad
const CRED_FAIL_MIN = 2;
// Minimum total stamps in the last 1 h before we evaluate fail rate
const FAIL_RATE_MIN_TOTAL = 5;
// Fail rate threshold (0.10 = 10 %)
const FAIL_RATE_THRESHOLD = 0.1;

const VAPI_LOW_THRESHOLD   = 20;   // USD
const TWILIO_LOW_THRESHOLD = 10;   // USD
const CLAUDE_COST_PER_OP   = 0.0024;

// Storage cuota alerts (Supabase Pro tier: 100 GB included, overage $0.021/GB/mo)
// Buckets vigilados: csd, cfdi, cfdi-cancellations
const STORAGE_BUCKETS_WATCH = ['csd', 'cfdi', 'cfdi-cancellations'];
const STORAGE_WARN_BYTES     = 50 * 1024 * 1024 * 1024;  // 50 GB early warning
const STORAGE_CRITICAL_BYTES = 80 * 1024 * 1024 * 1024;  // 80 GB before overage

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const claudeBudget = parseFloat(process.env.CLAUDE_MONTHLY_BUDGET ?? '50');

  // Fetch all three in parallel
  const [vapiRes, twilioRes, opsRes] = await Promise.all([
    fetch('https://api.vapi.ai/account', {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
    }).then(r => r.ok ? r.json() : null).catch(() => null),

    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ? fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Balance.json`,
          { headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}` } }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),

    createAdminClient()
      .from('voice_agents')
      .select('ai_ops_used')
      .neq('id', process.env.DEMO_AGENT_ID ?? ''),
  ]);

  const vapiBalance  = typeof vapiRes?.balance   === 'number' ? vapiRes.balance   : null;
  const twilioBalance = twilioRes?.balance ? parseFloat(twilioRes.balance) : null;
  const totalOpsUsed  = ((opsRes.data ?? []) as { ai_ops_used: number }[])
    .reduce((s, a) => s + (a.ai_ops_used ?? 0), 0);
  const claudeCost    = totalOpsUsed * CLAUDE_COST_PER_OP;

  // Build alert list
  type Alert = { service: string; current: string; threshold: string; action: string; actionUrl: string; color: string };
  const alerts: Alert[] = [];

  if (vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD) {
    alerts.push({
      service:   'Vapi — saldo de llamadas',
      current:   `$${vapiBalance.toFixed(2)} USD`,
      threshold: `< $${VAPI_LOW_THRESHOLD} USD`,
      action:    'Recargar cuenta Vapi',
      actionUrl: 'https://dashboard.vapi.ai/billing',
      color:     '#ef4444',
    });
  }

  if (twilioBalance !== null && twilioBalance < TWILIO_LOW_THRESHOLD) {
    alerts.push({
      service:   'Twilio — saldo de telefonía',
      current:   `$${twilioBalance.toFixed(2)} USD`,
      threshold: `< $${TWILIO_LOW_THRESHOLD} USD`,
      action:    'Recargar cuenta Twilio',
      actionUrl: 'https://console.twilio.com/billing',
      color:     '#ef4444',
    });
  }

  if (claudeCost >= claudeBudget * 0.9) {
    const pct = Math.round((claudeCost / claudeBudget) * 100);
    alerts.push({
      service:   'Anthropic / Claude — gasto mensual',
      current:   `~$${claudeCost.toFixed(2)} USD (${pct}% del presupuesto)`,
      threshold: claudeCost >= claudeBudget
        ? `Presupuesto de $${claudeBudget} USD superado`
        : `≥ 90% del presupuesto ($${claudeBudget} USD)`,
      action:    'Ver uso en Anthropic Console',
      actionUrl: 'https://console.anthropic.com/settings/billing',
      color:     claudeCost >= claudeBudget ? '#ef4444' : '#f59e0b',
    });
  }

  // ── Invoicing alerts ──────────────────────────────────────────

  const supabase = createAdminClient();

  // 1. Orgs with persistent credential errors (SF codes 601 / 603) in last 2 h
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: recentFailed } = await supabase
    .from('factura_requests')
    .select('portal_email, stamp_last_error')
    .eq('status', 'stamp_failed')
    .gte('stamp_last_error_at', twoHoursAgo);

  const credErrorsByOrg = new Map<string, number>();
  for (const row of recentFailed ?? []) {
    const isCredError = SF_CRED_ERROR_CODES.some(code =>
      (row.stamp_last_error as string | null)?.includes(code),
    );
    if (isCredError && row.portal_email) {
      credErrorsByOrg.set(
        row.portal_email,
        (credErrorsByOrg.get(row.portal_email) ?? 0) + 1,
      );
    }
  }
  const badCreds = [...credErrorsByOrg.entries()]
    .filter(([, count]) => count >= CRED_FAIL_MIN)
    .map(([org, count]) => ({ org, count }));

  // 2. Orgs with fail rate > 10 % in last 1 h (minimum 5 stamps)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentAll } = await supabase
    .from('factura_requests')
    .select('portal_email, status')
    .gte('created_at', oneHourAgo);

  const orgStats = new Map<string, { total: number; failed: number }>();
  for (const row of recentAll ?? []) {
    if (!row.portal_email) continue;
    const s = orgStats.get(row.portal_email) ?? { total: 0, failed: 0 };
    s.total++;
    if (row.status === 'stamp_failed') s.failed++;
    orgStats.set(row.portal_email, s);
  }
  const highFail = [...orgStats.entries()]
    .filter(([, s]) => s.total >= FAIL_RATE_MIN_TOTAL && s.failed / s.total > FAIL_RATE_THRESHOLD)
    .map(([org, s]) => ({ org, failRate: Math.round((s.failed / s.total) * 100), total: s.total }));

  if (badCreds.length > 0 || highFail.length > 0) {
    await sendEmail({
      to: 'hola@centinelia.mx',
      subject: 'Alerta invoicing — creds inválidas o fail rate alto',
      html: `<pre>${JSON.stringify({ badCreds, highFail }, null, 2)}</pre>`,
      from: 'Centinelia <alerts@centinelia.mx>',
    }).catch(err => console.error('[infra-alerts] invoicing email failed:', err));
  }

  // ── Storage cuota alerts (obligación fiscal SAT: 5 años retención CFDI) ──

  const storageStats: { bucket: string; bytes: number; objects: number }[] = [];
  for (const bucket of STORAGE_BUCKETS_WATCH) {
    // Supabase Storage no expone sum(size) directamente; usamos SQL sobre storage.objects
    const { data } = await supabase.rpc('sum_storage_bucket_bytes', { p_bucket_id: bucket })
      .single<{ total_bytes: number; total_objects: number }>();
    if (data) storageStats.push({ bucket, bytes: data.total_bytes ?? 0, objects: data.total_objects ?? 0 });
  }
  const totalStorageBytes = storageStats.reduce((s, b) => s + b.bytes, 0);

  const storageAlert =
    totalStorageBytes >= STORAGE_CRITICAL_BYTES ? 'critical'
    : totalStorageBytes >= STORAGE_WARN_BYTES   ? 'warn'
    : null;

  if (storageAlert) {
    const gb = (totalStorageBytes / (1024 ** 3)).toFixed(1);
    const pct = Math.round((totalStorageBytes / (100 * 1024 ** 3)) * 100);
    alerts.push({
      service:   `Supabase Storage — cuota invoicing (${storageAlert === 'critical' ? 'crítico' : 'aviso'})`,
      current:   `${gb} GB · ${pct}% del plan Pro (100 GB)`,
      threshold: storageAlert === 'critical' ? `≥ 80 GB (próximo a overage)` : `≥ 50 GB`,
      action:    'Ver breakdown por bucket + considerar cold tiering',
      actionUrl: 'https://supabase.com/dashboard/project/_/storage',
      color:     storageAlert === 'critical' ? '#ef4444' : '#f59e0b',
    });
  }

  // ─────────────────────────────────────────────────────────────

  if (alerts.length === 0 && badCreds.length === 0 && highFail.length === 0) {
    return NextResponse.json({ ok: true, alerts: 0, storage: { totalBytes: totalStorageBytes, buckets: storageStats } });
  }

  const date = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const sent = await sendEmail({
    to:      'hola@centinelia.mx',
    subject: `[Centinelia] Alerta de infraestructura — ${alerts.map(a => a.service.split('—')[0].trim()).join(', ')}`,
    html:    infraAlertHtml({ date, alerts }),
  });

  return NextResponse.json({
    ok: true,
    alerts: alerts.length,
    sent,
    invoicing: { badCreds: badCreds.length, highFail: highFail.length },
    storage: { totalBytes: totalStorageBytes, buckets: storageStats, alert: storageAlert },
  });
}
