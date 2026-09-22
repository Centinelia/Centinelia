// scripts/sync-landing-demo-agent.ts
// One-shot: crea el assistant en Vapi para el agente demo Nia del landing
// y (opcional) asigna el número Twilio si está disponible en Vapi.
//
// Uso: `pnpm tsx scripts/sync-landing-demo-agent.ts` (o npm/npx tsx)
// Requiere en .env.local:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   VAPI_API_KEY, ELEVENLABS_DEFAULT_VOICE_ID (opcional)

import 'dotenv/config';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { createVapiAssistant, assignAssistantToPhone } = await import('../src/lib/vapi/sync');
  const { PLAN_CONCURRENT_CALLS } = await import('../src/types/agent');
  const type = await import('../src/types/agent');

  const supabase = createAdminClient();
  const id = '00000000-0000-0000-0000-000000000001';

  const { data: agent, error } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !agent) {
    console.error('Agente demo no encontrado:', error?.message);
    process.exit(1);
  }

  const typed = agent as type.VoiceAgent;
  console.log('Agente encontrado:', {
    id:              typed.id,
    agent_name:      typed.agent_name,
    business_name:   typed.business_name,
    vapi_agent_id:   typed.vapi_agent_id ?? 'null',
    phone_number:    typed.phone_number || '(vacío)',
    active:          typed.active,
  });

  // Paso 1: crear assistant en Vapi si no tiene
  if (!typed.vapi_agent_id) {
    console.log('\n→ Creando assistant en Vapi...');
    const vapiId = await createVapiAssistant(typed);
    if (!vapiId) {
      console.error('createVapiAssistant retornó null. Ver logs Vapi arriba.');
      process.exit(1);
    }
    console.log('  Assistant creado en Vapi:', vapiId);

    await supabase
      .from('voice_agents')
      .update({ vapi_agent_id: vapiId })
      .eq('id', id);
    console.log('  vapi_agent_id guardado en DB.');
    typed.vapi_agent_id = vapiId;
  } else {
    console.log('\n→ Agente ya tiene vapi_agent_id, skip crear.');
  }

  // Paso 2: asignar phone_number si no tiene
  const PHONE = '+528121888490';
  if (!typed.phone_number) {
    console.log('\n→ Asignando phone_number', PHONE, '...');
    await supabase
      .from('voice_agents')
      .update({ phone_number: PHONE })
      .eq('id', id);
    console.log('  phone_number guardado en DB.');

    try {
      await assignAssistantToPhone(PHONE, typed.vapi_agent_id!, PLAN_CONCURRENT_CALLS.pro);
      console.log('  Asignado en Vapi (assignAssistantToPhone OK).');
    } catch (err) {
      console.error('  ⚠️ assignAssistantToPhone falló:', err instanceof Error ? err.message : err);
      console.error('  Probable causa: el número', PHONE, 'no está registrado en Vapi como Twilio Phone.');
      console.error('  Registrar en Vapi Dashboard → Phone Numbers → Add Twilio Phone (con tu SID + Auth Token).');
      console.error('  Después re-corre este script.');
    }
  } else {
    console.log('\n→ Agente ya tiene phone_number', typed.phone_number, ', skip asignar.');
  }

  console.log('\n✓ Terminado.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
