export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, infraAlertHtml } from '@/lib/email/send';

const VAPI_LOW_THRESHOLD   = 20;   // USD
const TWILIO_LOW_THRESHOLD = 10;   // USD
const CLAUDE_COST_PER_OP   = 0.0024;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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

  if (alerts.length === 0) {
    return NextResponse.json({ ok: true, alerts: 0 });
  }

  const date = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const sent = await sendEmail({
    to:      'hola@centinelia.mx',
    subject: `[Centinelia] Alerta de infraestructura — ${alerts.map(a => a.service.split('—')[0].trim()).join(', ')}`,
    html:    infraAlertHtml({ date, alerts }),
  });

  return NextResponse.json({ ok: true, alerts: alerts.length, sent });
}
