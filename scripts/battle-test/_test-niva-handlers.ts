/**
 * Test directo de handlers Niva (bypass LLM). Valida DB + lógica sin necesidad
 * de activar Niva en Vapi.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { reviewTeamPerformance, recordExpenseApproval } from '../../src/lib/ops/director-tools';

const NIVA_ID = 'b7e21b35-2082-47a9-a577-a20fc17269fc';
const PORTAL_EMAIL = 'studio@pneumastudio.mx';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log('══════════════ revisar_desempeno_equipo ══════════════\n');
  const perf = await reviewTeamPerformance({
    supabase: s as any, portalEmail: PORTAL_EMAIL, periodo: 'este_mes',
  });
  console.log('ok:', perf.ok, 'periodo:', perf.periodo);
  console.log('rows:', perf.rows.length);
  console.log('totales:', perf.totals);
  console.log('\nsummary head:');
  console.log(perf.summary.split('\n').slice(0, 6).join('\n'));

  console.log('\n\n══════════════ aprobar_gasto ══════════════\n');
  const beforeCount = (await s.from('expense_approvals').select('id', { count: 'exact', head: true })).count ?? 0;
  console.log(`Rows before: ${beforeCount}`);

  const approval = await recordExpenseApproval({
    supabase: s as any,
    portalEmail: PORTAL_EMAIL,
    approvedBy: NIVA_ID,
    concept: 'BATTLE TEST — publicidad Facebook agosto 2026',
    amountMxn: 2500,
    justification: 'Test automatizado. Borrar.',
    status: 'approved',
  });
  console.log('ok:', approval.ok);
  console.log('message:', approval.message);
  console.log('id:', approval.id);

  await new Promise(r => setTimeout(r, 1000));
  const afterCount = (await s.from('expense_approvals').select('id', { count: 'exact', head: true })).count ?? 0;
  console.log(`Rows after: ${afterCount}  (delta ${afterCount - beforeCount})`);

  // Read back the row
  const { data: row } = await s.from('expense_approvals').select('*').eq('id', approval.id).single();
  console.log('\nRow leído:');
  console.log(row);

  // Cleanup
  if (approval.id) {
    await s.from('expense_approvals').delete().eq('id', approval.id);
    console.log('\n✓ Row de prueba borrada.');
  }
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
