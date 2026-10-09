/**
 * Diagnóstico one-shot: ¿qué consumió el pool de AC Proyectos?
 *
 * Hipótesis a verificar:
 *  - 500 ops seeded, bal=-1 → se consumieron ~501
 *  - Usuario reporta: Nami solo mandó 6 correos ayer
 *  - Delta esperado: ~6-12 (cobro por correo + 1 por chat trigger)
 *  - Delta real: 501 → overcharge masivo o consumo fantasma
 *
 * Uso: npx tsx scripts/inspect-ac-ledger.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PORTAL_EMAIL = 'camila@acproyectos.com';

async function main() {
  // 1) Snapshot de account_ops / organizations
  const { data: org } = await sb
    .from('organizations')
    .select('id, portal_email, name, plan, account_status, created_at')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();
  console.log('ORG:', org);

  const { data: ops } = await sb
    .from('account_ops')
    .select('*')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();
  console.log('\nACCOUNT_OPS:', ops);

  // 2) Agents
  const { data: agents } = await sb
    .from('voice_agents')
    .select('id, agent_name, role, active, billing_status, ai_ops_limit, ai_ops_used, jornada_type, created_at, activated_at')
    .eq('portal_email', PORTAL_EMAIL);
  console.log('\nAGENTS:', JSON.stringify(agents, null, 2));

  // 3) Full ops_ledger history (ordered)
  const { data: ledger, error: lerr } = await sb
    .from('ops_ledger')
    .select('*')
    .eq('portal_email', PORTAL_EMAIL)
    .order('created_at', { ascending: true });
  if (lerr) console.error('ledger err:', lerr);
  console.log(`\nOPS_LEDGER (${ledger?.length ?? 0} entries):`);
  let running = 0;
  for (const l of ledger ?? []) {
    const delta = (l as any).delta ?? (l as any).amount ?? 0;
    running += Number(delta);
    console.log(
      `  ${(l as any).created_at}  Δ=${String(delta).padStart(5)}  running=${String(running).padStart(5)}  kind=${(l as any).kind}  ref=${(l as any).reference_id}`,
    );
  }

  // 4) ai_ops_log breakdown last 7 days
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: aiops } = await sb
    .from('ai_ops_log')
    .select('created_at, kind, count, reference_id, metadata')
    .eq('portal_email', PORTAL_EMAIL)
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  console.log(`\nAI_OPS_LOG last 7d (${aiops?.length ?? 0} rows):`);
  const byKind: Record<string, { count: number; rows: number }> = {};
  for (const r of aiops ?? []) {
    const k = (r as any).kind ?? 'unknown';
    byKind[k] ||= { count: 0, rows: 0 };
    byKind[k].rows++;
    byKind[k].count += Number((r as any).count ?? 1);
  }
  console.log('\nBY KIND:');
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${k.padEnd(40)}  rows=${String(v.rows).padStart(4)}  total_count=${String(v.count).padStart(5)}`);
  }

  // 5) Last 20 entries detail
  console.log('\nLAST 20 ai_ops_log entries:');
  for (const r of (aiops ?? []).slice(-20)) {
    console.log(
      `  ${(r as any).created_at}  kind=${(r as any).kind}  count=${(r as any).count}  ref=${(r as any).reference_id}`,
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
