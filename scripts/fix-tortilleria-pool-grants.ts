import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PORTAL = 'servicioalcliente@tortillasestrella.com.mx';

const TARGET_MINUTES = 1200;
const TARGET_OPS     = 520;

(async () => {
  const dryRun = !process.argv.includes('--apply');

  // Estado antes
  const { data: mBefore } = await s.from('account_minutes').select('minutes_included, minutes_used').eq('portal_email', PORTAL).maybeSingle();
  const { data: oBefore } = await s.from('account_ops').select('ops_included, ops_used').eq('portal_email', PORTAL).maybeSingle();
  console.log('ANTES:');
  console.log(`  account_minutes.minutes_included=${mBefore?.minutes_included} used=${mBefore?.minutes_used}`);
  console.log(`  account_ops.ops_included=${oBefore?.ops_included} used=${oBefore?.ops_used}`);

  console.log(`\nOBJETIVO: minutes=${TARGET_MINUTES}, ops=${TARGET_OPS}. USED se conserva.`);

  if (dryRun) { console.log('\n(dry-run — usa --apply para ejecutar)'); return; }

  // Aplicar
  const { error: mErr } = await s.from('account_minutes').update({ minutes_included: TARGET_MINUTES }).eq('portal_email', PORTAL);
  console.log(mErr ? `\naccount_minutes UPDATE FAILED: ${mErr.message}` : '\naccount_minutes: OK');

  const { error: oErr } = await s.from('account_ops').update({ ops_included: TARGET_OPS }).eq('portal_email', PORTAL);
  console.log(oErr ? `account_ops UPDATE FAILED: ${oErr.message}` : 'account_ops: OK');

  // Estado después
  const { data: mAfter } = await s.from('account_minutes').select('minutes_included, minutes_used, minutes_balance').eq('portal_email', PORTAL).maybeSingle();
  const { data: oAfter } = await s.from('account_ops').select('ops_included, ops_used, ops_balance').eq('portal_email', PORTAL).maybeSingle();
  console.log('\nDESPUÉS:');
  console.log(`  account_minutes: included=${mAfter?.minutes_included} used=${mAfter?.minutes_used} balance=${mAfter?.minutes_balance}`);
  console.log(`  account_ops:     included=${oAfter?.ops_included} used=${oAfter?.ops_used} balance=${oAfter?.ops_balance}`);
})().catch(e => { console.error(e); process.exit(1); });
