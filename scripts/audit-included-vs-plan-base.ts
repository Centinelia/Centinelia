// Audit: cuántas cuentas tienen account_minutes.minutes_included (y account_ops.ops_included)
// desalineado del plan base real (SUM voice_agents activos o get_plan_base_minutes RPC).
//
// Contexto: bug Tortillería 2026-10-12 mostró "71% sobre plan de 2,000" cuando
// el plan contratado era 1,000 (scale combinada). El 2,000 era cap acumulado
// (plan base × 2 por rollover_cap), no el plan real. Confuso al cliente.
//
// Uso: npx tsx scripts/audit-included-vs-plan-base.ts

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const { data: accounts } = await s
    .from('account_minutes')
    .select('portal_email, minutes_included, minutes_used, minutes_balance, minutes_reset_date')
    .order('minutes_included', { ascending: false });

  console.log(`Cuentas con account_minutes: ${accounts?.length ?? 0}\n`);
  console.log('portal_email'.padEnd(55), 'incl', 'base', 'delta', 'cap=base*2?', 'balance');
  console.log('-'.repeat(110));

  const issues: Array<{ email: string; delta: number; included: number; base: number }> = [];
  for (const acct of accounts ?? []) {
    const email = acct.portal_email as string;
    // Plan base via RPC (fuente de verdad del plan contratado activo).
    const { data: planBase } = await s.rpc('get_plan_base_minutes', { p_portal_email: email });
    const base = (planBase as number | null) ?? 0;
    const included = (acct.minutes_included as number) ?? 0;
    const balance  = (acct.minutes_balance  as number) ?? 0;
    const delta = included - base;
    const isDoubleBase = base > 0 && included === base * 2;
    const flag = base > 0 && Math.abs(delta) > base * 0.1 ? '⚠' : ' ';
    console.log(
      email.padEnd(55),
      String(included).padStart(5),
      String(base).padStart(5),
      String(delta).padStart(6),
      isDoubleBase ? '  SÍ 2×  ' : '    no   ',
      String(balance).padStart(6),
      flag,
    );
    if (base > 0 && Math.abs(delta) > base * 0.1) {
      issues.push({ email, delta, included, base });
    }
  }

  console.log(`\n=== Cuentas con delta > 10% del plan base: ${issues.length} ===`);
  for (const i of issues) {
    console.log(`  ${i.email}: incl=${i.included} base=${i.base} delta=${i.delta}`);
  }

  // Mismo audit para ops
  console.log('\n\n=== OPS ===');
  const { data: ops } = await s
    .from('account_ops')
    .select('portal_email, ops_included, ops_used, ops_balance')
    .order('ops_included', { ascending: false });
  console.log(`Cuentas con account_ops: ${ops?.length ?? 0}\n`);
  console.log('portal_email'.padEnd(55), 'incl', 'balance');
  console.log('-'.repeat(80));
  for (const o of ops ?? []) {
    const email = o.portal_email as string;
    console.log(email.padEnd(55), String((o.ops_included as number) ?? 0).padStart(5), String((o.ops_balance as number) ?? 0).padStart(6));
  }
})().catch(e => { console.error(e); process.exit(1); });
