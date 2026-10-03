/**
 * One-shot: hard-delete 17 orgs zombie residuales de tests (12 Navi fixtures +
 * 5 schema-check/smoke) + seed 100 ops a landing-demo y santiago-dev.
 *
 * Precedente 2026-10-03: alert pool-provisioning-drift mostró 20 orgs. 17 eran
 * fixtures de tests cuyo afterAll falló silenciosamente (social_accounts NO
 * cascada desde organizations). Las 2 restantes son dolor real menor (demos).
 *
 * Uso:
 *   npx tsx scripts/cleanup-zombie-test-orgs.ts            # DRY-RUN (default)
 *   npx tsx scripts/cleanup-zombie-test-orgs.ts --apply    # ejecuta
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const MODE  = APPLY ? 'APPLY' : 'DRY-RUN';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Zombies verificadas via inspect-pool-drift-oneshot (ops_used=0, nunca usadas).
const ZOMBIE_ORGS = [
  'nazre20+navi-test-1789443584120@gmail.com',
  'nazre20+navi-test-1789445088076@gmail.com',
  'nazre20+navi-test-1789436012807@gmail.com',
  'nazre20+navi-test-1789452087548@gmail.com',
  'nazre20+navi-test-1789438957838@gmail.com',
  'nazre20+navi-test-1789452214141@gmail.com',
  'nazre20+navi-test-1789439041303@gmail.com',
  'nazre20+navi-test-1789452740289@gmail.com',
  'nazre20+navi-test-1789439107633@gmail.com',
  'nazre20+navi-test-1789439698766@gmail.com',
  'nazre20+navi-test-1789439734619@gmail.com',
  'nazre20+navi-test-1789440187513@gmail.com',
  'nazre20+pv-smoke-1790280089464@gmail.com',
  'nazre20+schema-check5-1789508132644@gmail.com',
  'nazre20+schema-check8-1789508199855@gmail.com',
  'nazre20+schema-check6-1789508144881@gmail.com',
  'nazre20+schema-check7-1789508179196@gmail.com',
];

const SEED_ORGS: Array<{ portal_email: string; amount: number; description: string }> = [
  {
    portal_email: 'landing-demo@centinelia.mx',
    amount:       100,
    description:  'Seed inicial demo landing — flujo público de prueba (precedente alerta 2026-10-03).',
  },
  {
    portal_email: 'santiago-dev@centinelia.mx',
    amount:       100,
    description:  'Seed dev twin Santiago NL — testing interno (precedente alerta 2026-10-03).',
  },
];

// Child tables sin ON DELETE CASCADE desde organizations.portal_email que
// pueden tener rows huérfanas si el afterAll del test falló. Orden importa:
// las que referencian a social_accounts/content_drafts primero.
// Tables con portal_email que no cascadean desde organizations. Orden importa
// (hojas primero, raíces después). social_metrics y editorial_calendar_slots
// no tienen portal_email — cascadean desde su parent (content_drafts y
// editorial_calendars respectivamente).
const NON_CASCADING_CHILDREN = [
  'social_interactions',     // portal_email text (sin FK), FK a social_accounts
  'user_media_uploads',      // FK a organizations.portal_email (sin cascada)
  'content_drafts',          // FK a organizations.portal_email (sin cascada) → cascade a social_metrics
  'editorial_calendars',     // FK a organizations.portal_email (sin cascada) → cascade a slots
  'brand_templates',         // FK a organizations.portal_email (sin cascada)
  'social_accounts',         // FK a organizations.portal_email (sin cascada)
];

async function countChildren(portalEmail: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of NON_CASCADING_CHILDREN) {
    const { count } = await sb
      .from(t)
      .select('*', { count: 'exact', head: true })
      .eq('portal_email', portalEmail);
    if ((count ?? 0) > 0) counts[t] = count ?? 0;
  }
  const { count: vaCount } = await sb
    .from('voice_agents')
    .select('*', { count: 'exact', head: true })
    .eq('portal_email', portalEmail);
  if ((vaCount ?? 0) > 0) counts['voice_agents'] = vaCount ?? 0;
  return counts;
}

async function deleteOrg(portalEmail: string) {
  // Delete in reverse FK order. voice_agents cascade handles most, but Navi
  // children referencing organizations.portal_email directly need manual delete.
  for (const t of NON_CASCADING_CHILDREN) {
    const { error } = await sb.from(t).delete().eq('portal_email', portalEmail);
    if (error) throw new Error(`${t} delete failed for ${portalEmail}: ${error.message}`);
  }
  const { error: vaErr } = await sb.from('voice_agents').delete().eq('portal_email', portalEmail);
  if (vaErr) throw new Error(`voice_agents delete failed for ${portalEmail}: ${vaErr.message}`);
  // ops_ledger + account_ops cascade from organizations
  const { error: orgErr } = await sb.from('organizations').delete().eq('portal_email', portalEmail);
  if (orgErr) throw new Error(`organizations delete failed for ${portalEmail}: ${orgErr.message}`);
}

async function seedPool(portalEmail: string, amount: number, description: string) {
  // Idempotencia: si ya hay cualquier grant, no duplicamos
  const { data: existing } = await sb
    .from('ops_ledger')
    .select('id, amount, kind')
    .eq('portal_email', portalEmail)
    .in('kind', ['initial_grant', 'annual_grant', 'monthly_grant', 'topup'])
    .limit(1);
  if ((existing?.length ?? 0) > 0) {
    console.log(`  SKIP seed ${portalEmail} — ya existe grant previo:`, existing);
    return;
  }
  const { error } = await sb.from('ops_ledger').insert({
    portal_email: portalEmail,
    agent_id:     null,
    amount,
    kind:         'initial_grant',
    source:       'cleanup_zombie_test_orgs_script',
    description,
  });
  if (error) throw new Error(`seed failed for ${portalEmail}: ${error.message}`);
}

async function main() {
  console.log(`=== Mode: ${MODE} ===\n`);
  console.log('--- Zombies cleanup plan ---');
  for (const email of ZOMBIE_ORGS) {
    const counts = await countChildren(email);
    const summary = Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(', ') || '(sin children)';
    console.log(`  ${email} → delete [${summary}]`);
  }
  console.log();

  console.log('--- Seeds plan ---');
  for (const s of SEED_ORGS) {
    console.log(`  ${s.portal_email} → +${s.amount} ops`);
  }
  console.log();

  if (!APPLY) {
    console.log('DRY-RUN. Re-correr con --apply para ejecutar.');
    return;
  }

  console.log('--- Applying ---');
  let okDel = 0;
  for (const email of ZOMBIE_ORGS) {
    try {
      await deleteOrg(email);
      okDel++;
      console.log(`  deleted: ${email}`);
    } catch (err) {
      console.error(`  ERROR deleting ${email}:`, err);
    }
  }
  console.log(`  → ${okDel}/${ZOMBIE_ORGS.length} orgs borradas\n`);

  let okSeed = 0;
  for (const s of SEED_ORGS) {
    try {
      await seedPool(s.portal_email, s.amount, s.description);
      okSeed++;
      console.log(`  seeded: ${s.portal_email}`);
    } catch (err) {
      console.error(`  ERROR seeding ${s.portal_email}:`, err);
    }
  }
  console.log(`  → ${okSeed}/${SEED_ORGS.length} orgs seedeadas`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
