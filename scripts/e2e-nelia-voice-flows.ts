// E2E de los flujos completos de Nelia (voice):
//   1. registrar_incidencia con business nuevo → is_new_client=true + outbound_contact
//   2. registrar_incidencia con business existente → is_new_client=false
//   3. registrar_cliente_nuevo → type='alta' + sin outbound_contact
//   4. verificar_recepcion_incidencia (1er intento sin_respuesta) → attempts.length=1
//   5. Segunda invocación (2do intento no_visitado) → attempts.length=2
//   6. Webhook decision + auto-retry integrado
//
// Ejecuta contra DB real (Nelia agent). Cleanup automático al final.
// Emails NO se mandan realmente porque el agent test usa email_from falso
// sin domain_verified (sendMeerkatHtmlEmail falla silenciosamente y OK).
//
// Uso: npx tsx scripts/e2e-nelia-voice-flows.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL   = 'servicioalcliente@tortillaestrella.com.mx';
const TEST_TAG       = `E2E-VOICE-${Date.now()}`;

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { registrarIncidencia } = await import('../src/lib/tools/executors/registrar-incidencia');
  const { registrarClienteNuevo } = await import('../src/lib/tools/executors/registrar-cliente-nuevo');
  const { verificarRecepcionIncidencia } = await import('../src/lib/tools/executors/verificar-recepcion-incidencia');
  const { decideIncidentAutoRetry } = await import('../src/lib/incidents/auto-retry');
  const supabase = createAdminClient();

  const results = { pass: 0, fail: 0 };
  const check = (name: string, cond: boolean, extra?: string) => {
    console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
    cond ? results.pass++ : results.fail++;
  };

  // Cargar agent para ctx (real)
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, email_from, email_domain_verified')
    .eq('id', NELIA_AGENT_ID).single();
  if (!agent) throw new Error('Nelia agent not found');

  const insertedIncidentIds: string[] = [];
  const insertedContactPhones: string[] = [];

  const buildCtx = () => ({
    supabase,
    agent,
    channel: 'voice' as const,
    sourceCallId: null,  // source_call_id es UUID, null es válido
    org: { directory: [] }, // no recipient → skip email
  });

  try {
    console.log(`\n═══ TEST 1: registrar_incidencia con business nuevo ═══\n`);
    const biz1 = `${TEST_TAG} Abarrotes Nuevo`;
    const phone1 = '+528100000001';
    insertedContactPhones.push(phone1);
    let res1;
    try {
      res1 = await registrarIncidencia(buildCtx() as any, {
        business_name: biz1,
        contact_phone: phone1,
        address:       'Calle Ficticia 100',
        motivo:        'No ha llegado el pedido de test',
      });
    } catch (err) {
      console.error('  ❌ registrar_incidencia threw:', err);
      throw err;
    }
    insertedIncidentIds.push(res1.incident_id);
    check('registrar_incidencia devuelve ok=true', res1.ok === true);
    check('devuelve incident_id', typeof res1.incident_id === 'string' && res1.incident_id.length > 10);
    check('devuelve verification_at futuro', new Date(res1.verification_at).getTime() > Date.now());

    const { data: inc1 } = await supabase.from('client_incidents')
      .select('*').eq('id', res1.incident_id).single();
    check('DB tiene el incident', !!inc1);
    check('type = queja (default)', inc1?.type === 'queja');
    check('is_new_client = true (business nuevo)', inc1?.is_new_client === true);
    check('source_channel = voice', inc1?.source_channel === 'voice');
    check('verification_scheduled_at ≈ +3 días',
      Math.abs(new Date(inc1!.verification_scheduled_at).getTime() - (Date.now() + 3*86400*1000)) < 60_000);
    check('verification_attempts = [] (aún ningún intento)',
      Array.isArray(inc1?.verification_attempts) && inc1.verification_attempts.length === 0);

    const { data: contact1 } = await supabase.from('outbound_contacts')
      .select('*').eq('agent_id', NELIA_AGENT_ID).eq('telefono', phone1).maybeSingle();
    check('outbound_contact creado', !!contact1);
    check('outbound_contact status = pending', contact1?.status === 'pending');
    check('outbound_contact external_source = client_incident', contact1?.external_source === 'client_incident');
    check('outbound_contact external_id apunta al incident', contact1?.external_id === res1.incident_id);
    check('outbound_contact source = auto_incident_verification', contact1?.source === 'auto_incident_verification');

    console.log(`\n═══ TEST 2: registrar_incidencia con business existente ═══\n`);
    const phone2 = '+528100000002';
    insertedContactPhones.push(phone2);
    const res2 = await registrarIncidencia(buildCtx() as any, {
      business_name: biz1,  // mismo business
      contact_phone: phone2,
      address:       'Calle Ficticia 100',
      motivo:        'Otra queja del mismo negocio',
    });
    insertedIncidentIds.push(res2.incident_id);
    const { data: inc2 } = await supabase.from('client_incidents')
      .select('is_new_client').eq('id', res2.incident_id).single();
    check('is_new_client = false (business ya existía)', inc2?.is_new_client === false);

    console.log(`\n═══ TEST 3: registrar_cliente_nuevo ═══\n`);
    const biz3 = `${TEST_TAG} Fondita Alta`;
    const phone3 = '+528100000003';
    insertedContactPhones.push(phone3);
    const res3 = await registrarClienteNuevo(buildCtx() as any, {
      business_name: biz3,
      contact_name:  'Doña Test',
      contact_phone: phone3,
      address:       'Zaragoza 200',
      notas:         'Alta test para E2E',
    });
    insertedIncidentIds.push(res3.incident_id);
    const { data: inc3 } = await supabase.from('client_incidents')
      .select('*').eq('id', res3.incident_id).single();
    check('type = alta', inc3?.type === 'alta');
    check('is_new_client = true', inc3?.is_new_client === true);
    check('verification_scheduled_at es NULL (altas no tienen callback)', inc3?.verification_scheduled_at == null);
    check('motivo capturado como notas', inc3?.motivo === 'Alta test para E2E');

    const { data: contact3 } = await supabase.from('outbound_contacts')
      .select('external_source').eq('agent_id', NELIA_AGENT_ID).eq('telefono', phone3).maybeSingle();
    check('altas NO crean outbound_contact scheduled', !contact3);

    console.log(`\n═══ TEST 4: verificar_recepcion_incidencia (1er intento sin_respuesta) ═══\n`);
    const verifyCtx = { supabase, agent: { id: NELIA_AGENT_ID, portal_email: PORTAL_EMAIL } };
    const res4 = await verificarRecepcionIncidencia(verifyCtx as any, {
      incident_id: res1.incident_id,
      resultado:   'sin_respuesta',
      notas:       'No contestaron primer intento',
    });
    check('devuelve attempt_number=1', res4.attempt_number === 1);
    const { data: inc4 } = await supabase.from('client_incidents')
      .select('verification_result, verification_attempts, verification_called_at').eq('id', res1.incident_id).single();
    const attempts4 = inc4?.verification_attempts as Array<{ result: string; called_at: string; notes: string | null }>;
    check('verification_result actual = sin_respuesta', inc4?.verification_result === 'sin_respuesta');
    check('attempts.length = 1', attempts4?.length === 1);
    check('attempt[0].result = sin_respuesta', attempts4?.[0]?.result === 'sin_respuesta');
    check('attempt[0].notes preservado', attempts4?.[0]?.notes === 'No contestaron primer intento');
    check('verification_called_at está seteado', !!inc4?.verification_called_at);

    console.log(`\n═══ TEST 5: verificar_recepcion 2do intento (no_visitado) ═══\n`);
    // Pequeña espera para que called_at sea distinto (mismo test corriendo rápido)
    await new Promise(r => setTimeout(r, 10));
    const res5 = await verificarRecepcionIncidencia(verifyCtx as any, {
      incident_id: res1.incident_id,
      resultado:   'no_visitado',
      notas:       'No ha ido el vendedor',
    });
    check('devuelve attempt_number=2', res5.attempt_number === 2);
    const { data: inc5 } = await supabase.from('client_incidents')
      .select('verification_result, verification_attempts').eq('id', res1.incident_id).single();
    const attempts5 = inc5?.verification_attempts as Array<{ result: string }>;
    check('verification_result actualizado a no_visitado (último)', inc5?.verification_result === 'no_visitado');
    check('attempts.length = 2 (apendeado, no sobrescrito)', attempts5?.length === 2);
    check('attempt[0] preserva primer sin_respuesta', attempts5?.[0]?.result === 'sin_respuesta');
    check('attempt[1] es el nuevo no_visitado', attempts5?.[1]?.result === 'no_visitado');

    console.log(`\n═══ TEST 6: decideIncidentAutoRetry integrado con contact real ═══\n`);
    // Simular el webhook post-call: leer contact + decidir vs completar
    const decision = await decideIncidentAutoRetry(supabase as any, {
      external_source: 'client_incident',
      external_id:     res1.incident_id,
    });
    check('decision no es null (contact es de incident)', decision !== null);
    check('toStatus = pending (último attempt no_visitado, hay margen)', decision?.toStatus === 'pending');
    check('scheduledAt +2 días', decision?.scheduledAt
      ? Math.abs(new Date(decision.scheduledAt).getTime() - (Date.now() + 2*86400*1000)) < 60_000
      : false);
    check('reason indica retry after no_visitado', decision?.reason === 'incident_retry_after_no_visitado');

    // Test 6b: si el último attempt fuera ok
    await verificarRecepcionIncidencia(verifyCtx as any, {
      incident_id: res1.incident_id,
      resultado:   'ok',
      notas:       'confirmado recibido',
    });
    const decisionOk = await decideIncidentAutoRetry(supabase as any, {
      external_source: 'client_incident',
      external_id:     res1.incident_id,
    });
    check('con último=ok, decision.toStatus=completed', decisionOk?.toStatus === 'completed');

    console.log(`\n  RESULTADO: ${results.pass} pass / ${results.fail} fail\n`);
  } finally {
    console.log('═══ CLEANUP ═══');
    // Borrar incidents de test
    if (insertedIncidentIds.length > 0) {
      await supabase.from('client_incidents').delete().in('id', insertedIncidentIds);
      console.log(`  Removed ${insertedIncidentIds.length} test incidents`);
    }
    // Borrar outbound_contacts de test (por telefono)
    if (insertedContactPhones.length > 0) {
      await supabase.from('outbound_contacts')
        .delete()
        .eq('agent_id', NELIA_AGENT_ID)
        .in('telefono', insertedContactPhones);
      console.log(`  Removed test outbound_contacts`);
    }
    process.exit(results.fail === 0 ? 0 : 1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
