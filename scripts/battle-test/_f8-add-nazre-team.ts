/**
 * Agrega el número de Nazre a los team_numbers de Sofia (Pneuma Studio) para
 * que el guard en webhook lo reconozca como internal caller y NO envíe
 * notificaciones "un cliente hizo X" al dueño mismo.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const NAZRE_PHONE = '+528112803360';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: agent } = await s
    .from('voice_agents')
    .select('team_numbers, transfer_number, transfer_whatsapp')
    .eq('id', SOFIA_ID)
    .single();

  const current = (agent?.team_numbers ?? []) as Array<{ number: string; name?: string; is_owner?: boolean }>;
  const normalize = (p: string) => p.replace(/\D/g, '').slice(-10);
  const already = current.some(t => normalize(t.number ?? '') === normalize(NAZRE_PHONE));

  console.log('team_numbers actual:');
  console.log(JSON.stringify(current, null, 2));
  console.log('transfer_number:', agent?.transfer_number);
  console.log('transfer_whatsapp:', agent?.transfer_whatsapp);

  if (already) {
    console.log(`\n✓ ${NAZRE_PHONE} ya está en team_numbers, no hago nada.`);
    return;
  }

  const nazreNorm = normalize(NAZRE_PHONE);
  const transferNorm = normalize(agent?.transfer_whatsapp ?? '');
  const inTransferWa = transferNorm && transferNorm === nazreNorm;
  const transferNumNorm = normalize(agent?.transfer_number ?? '');
  const inTransferNum = transferNumNorm && transferNumNorm === nazreNorm;

  if (inTransferWa || inTransferNum) {
    console.log(`\n✓ ${NAZRE_PHONE} ya está en transfer_${inTransferWa ? 'whatsapp' : 'number'} (owner bypass). No hace falta agregarlo a team_numbers.`);
    return;
  }

  const next = [...current, { number: NAZRE_PHONE, name: 'Nazre (dueño)', is_owner: true }];
  const { error } = await s.from('voice_agents').update({ team_numbers: next }).eq('id', SOFIA_ID);
  if (error) { console.error(error); process.exit(1); }
  console.log(`\n✓ Agregado ${NAZRE_PHONE} como team_number con is_owner=true.`);
}
main().catch(err => { console.error(err); process.exit(1); });
