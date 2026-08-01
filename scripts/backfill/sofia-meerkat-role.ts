/**
 * Backfill puntual: setea features.meerkat_role_id = 'nia' en Sofia
 * (agent legacy pre-meerkats de studio@pneumastudio.mx).
 *
 * Motivacion: Sofia fue creada antes del roster de meerkats. Sin
 * meerkat_role_id, el resolver de version/flags no aplica → sus llamadas
 * caen en "unattributed" en observabilidad y no reciben el rollout gradual
 * del pilar 3.
 *
 * Efecto:
 * - meerkat_id=nia para observabilidad
 * - Aplica flags meerkat.nia.v<n> para rollout gradual
 * - NO cambia nada perceptible al usuario final (Sofia sigue siendo Sofia,
 *   con su first_message, prompt y voz actual)
 *
 * Uso:
 *   npx tsx scripts/backfill/sofia-meerkat-role.ts        # dry run (imprime antes/despues)
 *   npx tsx scripts/backfill/sofia-meerkat-role.ts --apply
 */

import '../_bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';

const SOFIA_PORTAL_EMAIL = 'studio@pneumastudio.mx';
const TARGET_ROLE = 'nia';

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createAdminClient();

  const { data: agents, error } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, features')
    .eq('portal_email', SOFIA_PORTAL_EMAIL);

  if (error) {
    console.error('ERROR fetch:', error.message);
    process.exit(1);
  }
  if (!agents || agents.length === 0) {
    console.error(`No agents found for ${SOFIA_PORTAL_EMAIL}`);
    process.exit(1);
  }

  for (const a of agents) {
    const features = (a.features as Record<string, unknown>) ?? {};
    const currentRole = features.meerkat_role_id;
    console.log('---');
    console.log(`Agent:        ${a.agent_name} (${a.id})`);
    console.log(`Business:     ${a.business_name}`);
    console.log(`Portal email: ${a.portal_email}`);
    console.log(`Before role:  ${currentRole ?? '(unset)'}`);

    if (currentRole === TARGET_ROLE) {
      console.log(`Skip: ya es ${TARGET_ROLE}`);
      continue;
    }
    if (currentRole != null && currentRole !== '') {
      console.log(`Skip: ya tiene role='${currentRole}', NO sobrescribo (script solo llena unset)`);
      continue;
    }

    const newFeatures = { ...features, meerkat_role_id: TARGET_ROLE };
    console.log(`After role:   ${TARGET_ROLE}`);

    if (!apply) {
      console.log('DRY RUN. Pasa --apply para ejecutar.');
      continue;
    }

    const { error: updErr } = await supabase
      .from('voice_agents')
      .update({ features: newFeatures })
      .eq('id', a.id);

    if (updErr) {
      console.error('UPDATE error:', updErr.message);
      process.exit(1);
    }
    console.log('APPLIED ✓');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
