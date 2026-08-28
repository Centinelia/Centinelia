// scripts/e2e-test-incidencia-flow.ts
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const TEST_PORTAL_EMAIL = 'nazre+test-followup@centinelia.mx';
const TEST_AGENT_ID = '76eefdd2-7416-44f1-a94c-2cd9bf5f0ad5';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { registrarIncidencia } = await import('../src/lib/tools/executors/registrar-incidencia');
  const { verificarRecepcionIncidencia } = await import('../src/lib/tools/executors/verificar-recepcion-incidencia');

  const supabase = createAdminClient();

  // 1. Habilitar feature flag en test org
  const { data: org } = await supabase.from('organizations')
    .select('features, directory').eq('portal_email', TEST_PORTAL_EMAIL).single();
  const featuresPatched = { ...(org?.features ?? {}), incidencia_flow_enabled: true };
  await supabase.from('organizations')
    .update({ features: featuresPatched }).eq('portal_email', TEST_PORTAL_EMAIL);

  // 2. Asegurar que directory tiene receives_incident_reports
  const dir = org?.directory ?? [];
  const withRecipient = dir.some((p: any) => p.receives_incident_reports)
    ? dir
    : [...dir, {
        id: 'test-encargado', name: 'Encargado Test', phone: '+528112803360',
        email: 'nazre20@gmail.com', receives_incident_reports: true,
      }];
  await supabase.from('organizations')
    .update({ directory: withRecipient }).eq('portal_email', TEST_PORTAL_EMAIL);

  // 3. Cargar agent
  const { data: agent } = await supabase.from('voice_agents')
    .select('*').eq('id', TEST_AGENT_ID).single();

  // 4. Registrar incidencia
  const ctx = { supabase, agent, org: { directory: withRecipient }, channel: 'voice' as const, sourceCallId: null };
  const result = await registrarIncidencia(ctx as any, {
    business_name: 'Abarrotes Test E2E',
    contact_name:  'Doña Prueba',
    contact_phone: '8112803360',
    address:       'Calle Test 123, Col Prueba, MTY',
    motivo:        'Reporta que no le han surtido en toda la semana',
  });
  console.log('registrarIncidencia result:', result);
  if (!result.ok) throw new Error('failed');

  // 5. Verificar row en DB
  const { data: incident } = await supabase.from('client_incidents')
    .select('*').eq('id', result.incident_id).single();
  console.log('Incident row:', {
    id: incident.id,
    email_sent: !!incident.email_sent_at,
    verification_scheduled_at: incident.verification_scheduled_at,
    verification_outbound_id: incident.verification_outbound_id,
    encargado_email: incident.encargado_email,
  });

  // 6. Verificar outbound_contacts row
  const { data: oc } = await supabase.from('outbound_contacts')
    .select('*').eq('id', incident.verification_outbound_id).single();
  console.log('Outbound contact row:', {
    id: oc.id, source: oc.source, external_id: oc.external_id, scheduled_at: oc.scheduled_at,
  });

  // 7. Simular llamada de verificación exitosa
  const vRes = await verificarRecepcionIncidencia({ supabase, agent } as any, {
    incident_id: incident.id, resultado: 'ok', notas: 'Cliente confirmó surtido el martes',
  });
  console.log('verificar result:', vRes);

  // 8. Confirmar update en DB
  const { data: finalIncident } = await supabase.from('client_incidents')
    .select('verification_result, verification_called_at, verification_result_notes')
    .eq('id', incident.id).single();
  console.log('Final state:', finalIncident);
  if (finalIncident.verification_result !== 'ok') throw new Error('verification_result mismatch');

  console.log('\nE2E test PASSED');
}

main().catch(err => { console.error('E2E FAILED:', err); process.exit(1); });
