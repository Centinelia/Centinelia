/**
 * scripts/drift-check-oneshot.ts
 *
 * Verificación manual del pool drift detector — util para chequear sin esperar
 * el próximo tick horario de Nash. Reporta:
 *   1. Estado del detector (last_drift_check_at + last_anomaly_check_at).
 *   2. Drifts notificados en las últimas 48h.
 *   3. Match manual envíos vs cobros en 24h (outbound_emails.ok=true vs
 *      ai_ops_log sum(count) filtrado a sources de correo).
 *
 * Uso:
 *   npx tsx scripts/drift-check-oneshot.ts
 *
 * Requiere `.env.local` con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Ver [[project-centinelia-pool-drift-detector]] para contexto del detector.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const EMAIL_SOURCES = [
  'tool_enviar_correo',
  'incidencia_notif',
  'alta_cliente_notif',
  'bitacora_semanal_send',
  'bitacora_mensual_send',
  'ticket_email_notify',
  'invoice_email_sent',
];

async function main() {
  const now = new Date();
  const since48h = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const since24h = new Date(now.getTime() - 24 * 3_600_000).toISOString();

  // 1) Detector state
  const { data: settings } = await sb
    .from('platform_settings')
    .select('key,value')
    .in('key', ['nash_last_drift_check_at', 'nash_last_anomaly_check_at']);
  console.log('=== Detector state ===');
  for (const s of settings ?? []) console.log(`  ${s.key}: ${s.value}`);
  console.log(`  now:                    ${now.toISOString()}`);

  // 2) Drifts notificados
  const { data: drifts } = await sb
    .from('notification_events')
    .select('portal_email, created_at, urgent, payload')
    .eq('kind', 'outbound_drift')
    .gte('created_at', since48h)
    .order('created_at', { ascending: false });
  console.log(`\n=== Drifts (últimas 48h): ${drifts?.length ?? 0} ===`);
  console.log(JSON.stringify(drifts, null, 2));

  // 3) Match manual envíos vs cobros
  const { data: outs } = await sb
    .from('outbound_emails')
    .select('agent_id, to_email, subject, created_at')
    .eq('ok', true)
    .gte('created_at', since24h)
    .order('created_at', { ascending: false });
  const { data: ops } = await sb
    .from('ai_ops_log')
    .select('agent_id, count, source, label, created_at')
    .gte('created_at', since24h)
    .in('source', EMAIL_SOURCES);

  const opsSum = (ops ?? []).reduce((s: number, r: any) => s + (r.count ?? 1), 0);
  console.log(`\n=== Match envíos vs cobros (últimas 24h) ===`);
  console.log(`  Envíos ok:               ${outs?.length ?? 0}`);
  console.log(`  Ops filas:               ${ops?.length ?? 0}`);
  console.log(`  Ops sum(count):          ${opsSum}`);
  console.log(`  Delta (envíos - ops):    ${(outs?.length ?? 0) - opsSum}${(outs?.length ?? 0) === opsSum ? ' ✓' : ' ⚠ mismatch'}`);

  if ((outs?.length ?? 0) > 0) {
    console.log('\nEnvíos:');
    for (const o of outs!) console.log(`  ${o.created_at} → ${o.to_email} · ${o.subject}`);
  }
  if ((ops?.length ?? 0) > 0) {
    console.log('\nOps:');
    for (const o of ops!) console.log(`  ${o.created_at} · ${o.source} · count=${o.count} · ${o.label}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
