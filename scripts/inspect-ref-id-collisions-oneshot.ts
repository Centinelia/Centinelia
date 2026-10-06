/**
 * scripts/inspect-ref-id-collisions-oneshot.ts
 * Diagnóstico de la alerta reference_id collisions. V2: query directa por
 * reference_id en email_jobs + inspección del flag isEmailJobsEnabled para
 * Tortillería + muestra de ai_ops_log alrededor del momento del colisionado.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TARGETS = [
  { ref: '162a57c9-1ce1-43f8-80a6-b5cbc1168cf2:notif', at: '2026-10-05T21:43:33.585208+00:00' },
  { ref: '4167e0ae-dd64-4d32-9e2e-6755db2881e9:notif', at: '2026-10-05T17:49:26.377834+00:00' },
  { ref: 'b689723e-73f1-4b72-bcf1-92673e08e7c6:notif', at: '2026-10-05T16:32:26.765397+00:00' },
];

async function main() {
  const PORTAL = 'servicioalcliente@tortillasestrella.com.mx';

  const { data: flagRows } = await sb
    .from('voice_agents')
    .select('id, agent_name, features')
    .eq('portal_email', PORTAL);
  console.log('=== Tortillería agentes y feature flags ===');
  for (const r of flagRows ?? []) {
    const f = r.features ?? {};
    console.log(`  ${r.agent_name} (${r.id})`);
    console.log(`    email_jobs_enabled: ${f.email_jobs_enabled}`);
    console.log(`    email_jobs:         ${f.email_jobs}`);
  }

  const { data: orgFlag } = await sb
    .from('platform_settings')
    .select('value')
    .eq('key', 'email_jobs_enabled_orgs')
    .maybeSingle();
  console.log(`\n  platform_settings.email_jobs_enabled_orgs: ${JSON.stringify(orgFlag?.value)}`);

  for (const t of TARGETS) {
    console.log('\n─────────────────────────────────────────────');
    console.log(`Target ref_id: ${t.ref}`);
    const incidentId = t.ref.split(':')[0];

    const { data: jobs } = await sb
      .from('email_jobs')
      .select('id, status, attempts, created_at, delivered_at, source, charge_source, reference_id, source_row_id')
      .eq('reference_id', t.ref);
    console.log(`  email_jobs con reference_id exacto: ${jobs?.length ?? 0}`);
    for (const j of jobs ?? []) {
      console.log(`    ${j.created_at} · status=${j.status} · attempts=${j.attempts} · delivered_at=${j.delivered_at ?? '(null)'}`);
    }

    const { data: jobsBySrcId } = await sb
      .from('email_jobs')
      .select('id, status, attempts, created_at, delivered_at, source, charge_source, reference_id, source_row_id')
      .eq('source_row_id', incidentId);
    console.log(`  email_jobs con source_row_id = ${incidentId}: ${jobsBySrcId?.length ?? 0}`);
    for (const j of jobsBySrcId ?? []) {
      console.log(`    ${j.created_at} · status=${j.status} · attempts=${j.attempts} · ref=${j.reference_id}`);
    }

    const { data: incident } = await sb
      .from('client_incidents')
      .select('id, business_name, sucursal, contact_phone, email_sent_at, created_at, source_channel, source_call_id')
      .eq('id', incidentId)
      .maybeSingle();
    if (incident) {
      console.log(`  client_incidents row:`);
      console.log(`    created_at:      ${incident.created_at}`);
      console.log(`    business:        ${incident.business_name} · sucursal=${incident.sucursal} · phone=${incident.contact_phone}`);
      console.log(`    email_sent_at:   ${incident.email_sent_at}`);
      console.log(`    source_channel:  ${incident.source_channel} · source_call_id=${incident.source_call_id}`);
    } else {
      console.log(`  client_incidents row NO existe para id=${incidentId}`);
    }

    const windowStart = new Date(new Date(t.at).getTime() - 30_000).toISOString();
    const windowEnd   = new Date(new Date(t.at).getTime() + 10_000).toISOString();
    const { data: allOps } = await sb
      .from('ai_ops_log')
      .select('created_at, source, count, reference_id, label, context')
      .eq('portal_email', PORTAL)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .order('created_at');
    console.log(`  ai_ops_log en ventana ±30s del colisionado:`);
    for (const o of allOps ?? []) {
      const ctx = o.context ? String(o.context).slice(0, 60) : '';
      console.log(`    ${o.created_at} · ${o.source} · count=${o.count} · ref=${o.reference_id} · ${ctx}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
