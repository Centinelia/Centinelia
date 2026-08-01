/**
 * Diagnostico: muestra las appointments activas de Sofia para entender
 * si el conflict check estan funcionando y por que no atrapo el empalme.
 */
import '../_bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, agent_name')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .eq('agent_name', 'Sofía')
    .single();
  if (!agent) { console.error('Sofia no encontrada'); process.exit(1); }

  const { data: appts } = await supabase
    .from('appointments_voice')
    .select('id, nombre, servicio, fecha, hora, starts_at, status, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`Ultimas ${appts?.length ?? 0} citas de Sofia:`);
  for (const a of appts ?? []) {
    console.log('---');
    console.log(`  id:         ${a.id}`);
    console.log(`  nombre:     ${a.nombre}`);
    console.log(`  servicio:   ${a.servicio}`);
    console.log(`  fecha:      ${a.fecha}`);
    console.log(`  hora:       ${a.hora}`);
    console.log(`  starts_at:  ${a.starts_at ?? '(NULL — creada con executor viejo)'}`);
    console.log(`  status:     ${a.status}`);
    console.log(`  created_at: ${a.created_at}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
