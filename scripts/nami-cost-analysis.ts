import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // Correos OC + factura TRANE procesados hoy
  const { data: inboxes } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, raw_message_id, status, category')
    .eq('agent_id', agentId)
    .gte('created_at', '2026-10-07T19:00:00Z')
    .ilike('email_subject', '%OC6203%')
    .order('created_at', { ascending: true });

  console.log(`Correos OC6203 analizados: ${inboxes?.length ?? 0}`);

  for (const r of inboxes ?? []) {
    const row = r as any;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`CORREO: ${row.email_subject}`);
    console.log(`id=${row.id}  created=${row.created_at.slice(11, 19)}  status=${row.status}  cat=${row.category}`);

    // Ops cobradas por este correo (base + iters)
    const refBase = row.raw_message_id ?? row.id;
    const { data: ops } = await sb.from('ops_ledger')
      .select('created_at, amount, reference_id, kind')
      .eq('portal_email', 'camila@acproyectos.com')
      .eq('kind', 'consumption')
      .like('reference_id', `${refBase}%`)
      .order('created_at', { ascending: true });

    console.log(`\n  Ops cobradas para este correo:`);
    let total = 0;
    for (const o of ops ?? []) {
      const row2 = o as any;
      const suffix = (row2.reference_id ?? '').slice(refBase.length).slice(0, 20);
      total += Math.abs(Number(row2.amount));
      console.log(`    ${row2.created_at.slice(11, 19)}  Δ=${row2.amount}  suffix=${suffix}`);
    }
    console.log(`\n  TOTAL ops: ${total}`);
  }

  // Suma total de ops cobradas por Nami hoy
  const { data: today } = await sb.from('ops_ledger')
    .select('amount, source, kind')
    .eq('portal_email', 'camila@acproyectos.com')
    .eq('kind', 'consumption')
    .gte('created_at', '2026-10-07T00:00:00Z');
  const sumToday = (today ?? []).reduce((s, r: any) => s + Math.abs(Number(r.amount)), 0);
  console.log(`\n\n=== TOTAL ops consumidas por Nami HOY: ${sumToday} ===`);
}
main().catch(e => { console.error(e); process.exit(1); });
