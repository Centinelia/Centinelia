/**
 * One-shot: enumerar y clasificar las orgs que dispara pool-provisioning-drift.
 * Permite distinguir test fixtures / demos / clientes reales.
 *
 * Uso: npx tsx scripts/inspect-pool-drift-oneshot.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { detectPoolProvisioningAnomalies } from '../src/lib/monitoring/pool-provisioning-drift';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function classify(email: string): string {
  if (/\+navi-test-\d+@gmail\.com$/.test(email)) return 'TEST (navi fixture)';
  if (/\+test-|\+e2e-|\+smoke-/.test(email)) return 'TEST (otro)';
  if (/^ipark-demo@/.test(email)) return 'DEMO (ipark)';
  if (/-demo@centinelia\.mx$/.test(email)) return 'DEMO (centinelia)';
  if (/@centinelia\.mx$/.test(email)) return 'INTERNO centinelia.mx';
  return 'PROD?';
}

async function main() {
  const anomalies = await detectPoolProvisioningAnomalies(sb as any);
  console.log(`Total anomalias: ${anomalies.length}\n`);

  const grouped: Record<string, typeof anomalies> = {};
  for (const a of anomalies) {
    const k = classify(a.portal_email);
    (grouped[k] ||= []).push(a);
  }

  for (const [k, list] of Object.entries(grouped)) {
    console.log(`== ${k}: ${list.length} ==`);
    for (const a of list) {
      // Pull org name + created + is_active voice_agents detail
      const { data: org } = await sb
        .from('organizations')
        .select('name, created_at')
        .eq('portal_email', a.portal_email)
        .maybeSingle();
      const { data: agents } = await sb
        .from('voice_agents')
        .select('agent_name, role, active, created_at, business_name')
        .eq('portal_email', a.portal_email);
      console.log(
        `  ${a.portal_email} | reason=${a.reason} bal=${a.ledger_balance} ops_used=${a.ops_used} agents_active=${a.active_agents}`,
      );
      console.log(
        `     org: name="${org?.name ?? '(none)'}" created=${org?.created_at ?? '?'}`,
      );
      for (const ag of agents ?? []) {
        console.log(
          `     agent: ${(ag as any).agent_name} (${(ag as any).role}) biz="${(ag as any).business_name}" active=${(ag as any).active} created=${(ag as any).created_at}`,
        );
      }
    }
    console.log();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
