// E2E test del flujo completo de Nelia:
// 1. Simula llamada QUEJA de cliente existente → registrar_incidencia
// 2. Simula llamada ALTA de cliente nuevo → registrar_cliente_nuevo
// Valida: row en DB, correo al encargado, outbound scheduling (solo queja),
// visibilidad en bitácora.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL = 'servicioalcliente@tortillaestrella.com.mx';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { registrarIncidencia } = await import('../src/lib/tools/executors/registrar-incidencia');
  const { registrarClienteNuevo } = await import('../src/lib/tools/executors/registrar-cliente-nuevo');

  const supabase = createAdminClient();
  const { data: agent, error } = await supabase.from('voice_agents').select('*').eq('id', AGENT_ID).single();
  if (error || !agent) { console.error('Agent lookup failed:', error); process.exit(1); }
  const { data: org } = await supabase.from('organizations').select('directory').eq('portal_email', PORTAL_EMAIL).single();

  const ctx = { supabase, agent, org, channel: 'voice' as const, sourceCallId: null };

  console.log('\n═══ TEST 1: QUEJA (registrar_incidencia) ═══\n');
  const queja = await registrarIncidencia(ctx as any, {
    business_name: 'Abarrotes Charro (E2E-TEST)',
    sucursal:      'Apodaca',
    contact_name:  'Doña Meche',
    contact_phone: '+528112345678',
    address:       'Calle Hidalgo 123, Colonia Centro, Apodaca',
    motivo:        'No me han surtido tortillas esta semana',
  });
  console.log('Resultado:', queja);

  console.log('\n═══ TEST 2: ALTA (registrar_cliente_nuevo) ═══\n');
  const alta = await registrarClienteNuevo(ctx as any, {
    business_name: 'La Fondita de Doña Rosa (E2E-TEST)',
    sucursal:      'Nogalar',
    contact_name:  'Don Pedro',
    contact_phone: '+528123456789',
    address:       'Avenida Cuauhtémoc 456, Colonia Nogalar, San Nicolás',
    notas:         'Pedidos semanales de 30kg de tortilla azul',
  });
  console.log('Resultado:', alta);

  console.log('\n═══ VERIFICACIÓN DB ═══\n');
  const { data: rows } = await supabase
    .from('client_incidents')
    .select('id, type, business_name, sucursal, contact_name, contact_phone, motivo, is_new_client, verification_scheduled_at, email_sent_at, encargado_email, encargado_name, verification_outbound_id')
    .in('id', [queja.incident_id, alta.incident_id]);
  for (const r of rows ?? []) {
    console.log(`\n  [${r.type}] ${r.business_name}${r.sucursal ? ' · Suc ' + r.sucursal : ''}`);
    console.log('    contact:', r.contact_name, r.contact_phone);
    console.log('    motivo :', r.motivo ?? '(null)');
    console.log('    nuevo? :', r.is_new_client);
    console.log('    verif  :', r.verification_scheduled_at ?? '(null → alta sin callback ✓)');
    console.log('    email  :', r.email_sent_at ? 'enviado a ' + r.encargado_email : 'NO enviado');
    console.log('    outbnd :', r.verification_outbound_id ?? '(null → alta sin outbound ✓)');
  }

  console.log('\n═══ VERIFICACIÓN OUTBOUND SCHEDULING ═══\n');
  if (queja.incident_id) {
    const { data: oc } = await supabase
      .from('outbound_contacts')
      .select('id, telefono, nombre, motivo, scheduled_at, source, external_source, external_id, status')
      .eq('external_source', 'client_incident')
      .eq('external_id', queja.incident_id)
      .maybeSingle();
    console.log('outbound_contact para queja:', oc ?? '(NO agendado ✗)');
  }
  if (alta.incident_id) {
    const { data: oc } = await supabase
      .from('outbound_contacts')
      .select('id')
      .eq('external_source', 'client_incident')
      .eq('external_id', alta.incident_id)
      .maybeSingle();
    console.log('outbound_contact para alta:', oc ? '(existe ✗ - no debería)' : '(NO agendado ✓)');
  }

  console.log('\n═══ IDs para monitor / cleanup ═══\n');
  console.log('QUEJA incident_id:', queja.incident_id);
  console.log('ALTA  incident_id:', alta.incident_id);
}

main().catch(err => { console.error(err); process.exit(1); });
