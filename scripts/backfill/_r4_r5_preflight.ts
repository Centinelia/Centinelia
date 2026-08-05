/**
 * Preflight R4 (transferir_llamada) + R5 (solicitar_factura via llamada real).
 * Confirma que Sofia está lista para ambos tests + snapshot state para comparar después.
 */
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const { data: sofia } = await supa.from('voice_agents')
    .select('agent_name, phone_number, transfer_number, transfer_whatsapp, features, portal_email, vapi_agent_id, jornada_type, active')
    .eq('id', SOFIA_ID).single();

  console.log('═══ Sofia state pre-tests ═══');
  console.log(`  agent_name:         ${sofia?.agent_name}`);
  console.log(`  phone_number:       ${sofia?.phone_number ?? '❌ SIN NÚMERO — no puedes llamar'}`);
  console.log(`  vapi_agent_id:      ${sofia?.vapi_agent_id ?? '❌ no synced'}`);
  console.log(`  active:             ${sofia?.active}`);
  console.log(`  jornada_type:       ${sofia?.jornada_type}`);
  console.log(`  portal_email:       ${sofia?.portal_email}`);

  console.log('\n═══ R4 transferir_llamada prereqs ═══');
  console.log(`  transfer_number:    ${sofia?.transfer_number ?? '❌ FALTA'}`);
  console.log(`  transfer_whatsapp:  ${sofia?.transfer_whatsapp ?? '❌ FALTA'}`);
  const feats = (sofia?.features as any) ?? {};
  console.log(`  outbound_calls:     ${feats.outbound_calls ?? false}`);

  console.log('\n═══ R5 solicitar_factura prereqs ═══');
  console.log(`  features.invoicing_email: ${feats.invoicing_email ?? 'no configurado (cae a portal_email: '+sofia?.portal_email+')'}`);
  // Check factura_requests table
  const { error: frErr } = await supa.from('factura_requests').select('id', { count: 'exact', head: true });
  console.log(`  factura_requests table: ${frErr ? '❌ '+frErr.message : '✅'}`);

  console.log('\n═══ Snapshot pre-test (para comparar después) ═══');
  const nowIso = new Date().toISOString();
  const { count: humanReqBefore } = await supa.from('human_requests')
    .select('*', { count: 'exact', head: true }).eq('agent_id', SOFIA_ID);
  const { count: facturaReqBefore } = await supa.from('factura_requests')
    .select('*', { count: 'exact', head: true }).eq('agent_id', SOFIA_ID);
  const { count: callsBefore } = await supa.from('voice_calls')
    .select('*', { count: 'exact', head: true }).eq('agent_id', SOFIA_ID);

  console.log(`  human_requests rows:    ${humanReqBefore}`);
  console.log(`  factura_requests rows:  ${facturaReqBefore}`);
  console.log(`  voice_calls rows:       ${callsBefore}`);
  console.log(`  snapshot timestamp:     ${nowIso}`);

  console.log('\n═══ SCRIPT R4 — Transferir llamada ═══');
  console.log(`  1. Llama a Sofia: ${sofia?.phone_number ?? '(no number)'}`);
  console.log(`  2. Cuando responda "En qué le puedo ayudar?", di algo como:`);
  console.log(`     "Hola, quisiera hablar con un humano por favor, es urgente"`);
  console.log(`  3. Sofia debe: preguntar tu nombre + motivo, luego decir "un momento por favor, te comunico con el equipo"`);
  console.log(`  4. Tu WhatsApp (${sofia?.transfer_whatsapp}) debe recibir "📞 Transferencia entrante, Pneuma Studio..."`);
  console.log(`  5. Tu teléfono (${sofia?.transfer_number}) debe SONAR con la llamada del cliente en línea`);

  console.log('\n═══ SCRIPT R5 — Solicitar factura ═══');
  console.log(`  1. Llama a Sofia: ${sofia?.phone_number ?? '(no number)'}`);
  console.log(`  2. Cuando responda, di:`);
  console.log(`     "Hola, necesito mi factura por favor"`);
  console.log(`  3. Sofia debe pedir 6 datos uno por uno:`);
  console.log(`     - Razón social (di: "Ferretería El Test, S.A. de C.V.")`);
  console.log(`     - RFC (di: "FET010101ABC")`);
  console.log(`     - Correo fiscal (di: "test@ferreteria-test.mx")`);
  console.log(`     - Uso CFDI (di: "G03 gastos generales")`);
  console.log(`     - Forma de pago (di: "03 transferencia")`);
  console.log(`     - Método de pago (di: "PUE, pago único")`);
  console.log(`  4. Sofia debe REPETIR todos los datos y confirmar contigo`);
  console.log(`  5. Sofia debe decir algo como "Le avisé al equipo, la factura llegará en 24hrs"`);
  console.log(`  6. El correo ${feats.invoicing_email ?? sofia?.portal_email} debe recibir un email formateado con TODOS los datos`);

  console.log('\n═══ Cómo verificar después ═══');
  console.log('  Ejecuta:');
  console.log('    npx tsx --env-file=.env.local scripts/backfill/_r4_r5_verify.ts');
  console.log(`  (compara contra snapshot: human_requests=${humanReqBefore}, factura_requests=${facturaReqBefore}, voice_calls=${callsBefore})`);
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
