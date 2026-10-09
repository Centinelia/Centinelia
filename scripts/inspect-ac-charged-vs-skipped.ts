/**
 * Cross-ref: de los correos de notificaciones@centinelia.mx que entraron a AC,
 * ¿cuáles fueron CHARGED (:processed en ledger) vs skipped (sin ledger)?
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
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', PORTAL_EMAIL);
  const agentIds = (agents ?? []).map((a: any) => a.id);

  const { data: inboxRows } = await sb
    .from('ops_inbox')
    .select('raw_message_id, email_from, email_subject, status, created_at')
    .in('agent_id', agentIds)
    .gte('created_at', '2026-10-06T00:00:00Z');

  const { data: ledgerRows } = await sb
    .from('ops_ledger')
    .select('reference_id, created_at, amount')
    .eq('portal_email', PORTAL_EMAIL)
    .eq('kind', 'consumption')
    .gte('created_at', '2026-10-06T00:00:00Z');

  // Build set of charged base reference_ids
  const chargedBases = new Map<string, number>();
  for (const r of ledgerRows ?? []) {
    const ref = (r as any).reference_id as string | null;
    if (!ref) continue;
    const base = ref.replace(/:(iter\d+|processed|observador)$/, '');
    chargedBases.set(base, (chargedBases.get(base) ?? 0) + Math.abs(Number((r as any).amount)));
  }
  console.log(`Unique base refs charged (10-06+): ${chargedBases.size}`);
  console.log(`Total ops charged: ${[...chargedBases.values()].reduce((a, b) => a + b, 0)}`);

  // Classify each inbox row
  const buckets: Record<string, { count: number; opsCharged: number; subjects: string[] }> = {
    'centinelia_notif_CHARGED':  { count: 0, opsCharged: 0, subjects: [] },
    'centinelia_notif_skipped':  { count: 0, opsCharged: 0, subjects: [] },
    'other_CHARGED':             { count: 0, opsCharged: 0, subjects: [] },
    'other_skipped':             { count: 0, opsCharged: 0, subjects: [] },
  };
  for (const r of inboxRows ?? []) {
    const row = r as any;
    const isCentineliaNotif = /notificaciones@centinelia\.mx/i.test(row.email_from ?? '');
    const refBase = row.raw_message_id ?? '';
    const ops = chargedBases.get(refBase) ?? 0;
    const charged = ops > 0;
    const key = `${isCentineliaNotif ? 'centinelia_notif' : 'other'}_${charged ? 'CHARGED' : 'skipped'}`;
    buckets[key].count++;
    buckets[key].opsCharged += ops;
    if (buckets[key].subjects.length < 5) {
      buckets[key].subjects.push(`${ops}ops | ${(row.email_subject ?? '').slice(0, 70)}`);
    }
  }

  console.log('\n=== Breakdown ===');
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`${k}:  count=${v.count}  ops=${v.opsCharged}`);
    for (const s of v.subjects) console.log(`    ${s}`);
  }

  // Specifically: of the charged notif rows, what's the status in ops_inbox and were they bypassing via "[Factura]" subject?
  console.log('\n=== Detail: centinelia_notif CHARGED ===');
  for (const r of inboxRows ?? []) {
    const row = r as any;
    if (!/notificaciones@centinelia\.mx/i.test(row.email_from ?? '')) continue;
    const ops = chargedBases.get(row.raw_message_id ?? '') ?? 0;
    if (ops === 0) continue;
    const subj = (row.email_subject ?? '').slice(0, 80);
    const hasFactura = /factura|invoice|bill|cobro|pago/i.test(subj);
    console.log(`  ${ops}ops  status=${row.status}  facturaMatch=${hasFactura}  "${subj}"`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
