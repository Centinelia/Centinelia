import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createVapiAssistant, resyncPeerAgents } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';
import { timingSafeCompareStrings } from '@/lib/auth/cron-auth';

// One-time demo setup route — creates or updates the Monterrey personalized demo agent.
// Protected by ADMIN_SECRET. Hit GET /api/demo/setup-monterrey?secret=<ADMIN_SECRET>
// to create the agent; add &resync=1 to force-resync an existing one.

const ROLE_KNOWLEDGE_BASE = `Atiendes llamadas de ciudadanos con dudas sobre multas, anuencias y trámites de ingresos municipales del H. Ayuntamiento de Monterrey.

MULTAS DE TRÁNSITO
Montos según tipo de infracción:
- Leves (no usar cinturón, uso de celular al volante, placas no visibles): de ochocientos a mil quinientos pesos
- Medias (exceso de velocidad, no respetar señales, dar vuelta prohibida): de mil ochocientos a tres mil doscientos pesos
- Graves (semáforo en rojo, maniobras peligrosas, conducir sin licencia vigente): de cuatro mil a seis mil quinientos pesos

Descuentos disponibles:
- Pronto pago: veinticinco por ciento de descuento si se paga dentro de los primeros quince días naturales
- Adultos mayores con credencial INAPAM vigente: cincuenta por ciento de descuento
- Personas con discapacidad con documentación IMSS o ISSSTE: cuarenta por ciento de descuento
- Los descuentos no son acumulables

Para consultar el monto exacto el ciudadano necesita el número de infracción (que viene en el papel de la multa) o la placa del vehículo.

Formas de pago:
- Ventanilla central: Dirección de Ingresos, Washington dos mil poniente, Centro, Monterrey. Lunes a viernes de las ocho de la mañana a las cinco de la tarde
- Delegaciones municipales: Mitras Centro, Cumbres, Valle, Linda Vista, Anáhuac, Ciudad Solidaridad, San Bernabé, Independencia, Tierra Propia. Mismo horario
- En línea las veinticuatro horas en pago punto monterrey punto gob punto mx, solo se necesita el número de infracción
- OXXO Pay con referencia impresa: solo para multas menores a dos mil pesos

MULTAS DE LIMPIA Y ECOLOGÍA
- Tirar basura en vía pública (primera infracción): mil doscientos pesos
- Tirar basura en vía pública (reincidencia): dos mil quinientos pesos
- Quema de residuos sólidos: tres mil doscientos pesos
- Residuos en áreas verdes o parques: mil ochocientos pesos
- Descargas no autorizadas en drenaje pluvial: cinco mil quinientos pesos
Mismas formas de pago que multas de tránsito.

CAJA GENERAL
- Certificación de cheques: quinientos veinte pesos por cheque. El cheque original debe presentarse en ventanilla junto con identificación oficial del titular. Resolución en el mismo día antes de las tres de la tarde
- Cheque devuelto: cargo administrativo de novecientos ochenta pesos más el monto original del cheque. Requiere el cheque devuelto, carta del banco con motivo de rechazo e identificación oficial
- Horario de caja: lunes a viernes de las ocho de la mañana a las cuatro de la tarde

ANUENCIAS — Permisos de operación comercial
Costos de alta:
- Comercio (venta de productos en establecimiento fijo): dos mil cuatrocientos pesos
- Alcohol categoría B (cerveza y bebidas de baja graduación): cuatro mil ochocientos pesos
- Alcohol categoría A (destilados, cantina, restaurante-bar): seis mil doscientos pesos
- Eventos temporales (conciertos, ferias, exposiciones): mil ochocientos pesos por evento

Renovación anual: setenta por ciento del costo original. Vigencia: doce meses desde la fecha de expedición.

Cambio de datos o titular: cuatrocientos ochenta pesos
Baja de anuencia: gratuita antes del vencimiento, trescientos veinte pesos si ya está vencida

Carta de no adeudo: doscientos ochenta pesos, vigencia treinta días naturales

Tiempos de resolución:
- Alta nueva: cinco días hábiles con documentación completa
- Renovación o cambio: dos días hábiles

Documentos para alta o renovación: identificación oficial vigente, comprobante de domicilio del negocio no mayor a tres meses, RFC, CURP del titular, acta constitutiva o contrato de arrendamiento. Para alcohol adicionalmente: plano de distribución del local y licencia de uso de suelo.

PAGO DE EXCLUSIVOS
- Cajón de estacionamiento en vía pública: tres mil seiscientos pesos anuales por cajón
- Terraza o área de mesas en banqueta: tres mil seiscientos pesos por metro cuadrado al año
- Kiosco o módulo comercial en área pública: cinco mil doscientos pesos anuales
Para tramitarlo: solicitud por escrito, plano con dimensiones del área, identificación y RFC del solicitante. Resolución en ocho días hábiles.

ÓRDENES DE PAGO — LICITACIONES Y DEPENDENCIAS
Cuando una empresa o dependencia no puede pagar directamente en la dependencia contratante (Secretaría de Obras, SIMEPRODE, Agua y Drenaje, etc.), el pago se canaliza a la Dirección de Ingresos mediante una orden de pago.
Descuento por pago anticipado: cinco por ciento si el pago se realiza dentro de los primeros tres días hábiles desde que se emite la orden. Para montos mayores a quinientos mil pesos puede llegar a diez por ciento con aprobación del director.
Qué se necesita: número de licitación o contrato, RFC de la empresa, monto exacto, nombre del representante legal. Presentarse en ventanilla central con documentación original.

LO QUE NO ATIENDES — REDIRECCIONA SIN DEMORA
- Predial → Dirección de Recaudación, no es esta dirección
- Lotes baldíos → Recaudación
- ISAI (Impuesto sobre Adquisición de Inmuebles, traslado de dominio) → Recaudación
- Permisos de construcción o uso de suelo → Secretaría de Desarrollo Urbano
- Agua y drenaje → SADM (Servicios de Agua y Drenaje de Monterrey)
Frase de redireccionamiento: "Ese trámite lo atiende [área]. No es parte de nuestra dirección, le recomiendo comunicarse directamente con ellos."`;

const DEMO_CONFIG = {
  // ── Account ────────────────────────────────────────────────────────────────
  portal_email: 'centinelia.dev@gmail.com',

  // ── Agent identity ─────────────────────────────────────────────────────────
  client_name:             'Demo Personalizado — Municipio de Monterrey',
  business_name:           'H. Ayuntamiento de Monterrey',
  business_description:    'Dirección de Ingresos del H. Ayuntamiento de Monterrey — Atención a Contribuyentes. Atendemos consultas y trámites sobre multas de tránsito, multas ambientales, anuencias comerciales, pagos de caja general y órdenes de pago para licitaciones.',
  agent_name:              'Nia',
  role:                    'Recepcionista de Atención a Contribuyentes',
  role_knowledge_base:     ROLE_KNOWLEDGE_BASE,
  timezone:                'America/Monterrey',
  business_address:        'Washington 2000 Pte., Centro, Monterrey, N.L.',
  business_phone_display:  '81 8340 0000',

  // First message — no "Esta llamada puede ser grabada" for government demo.
  // Vapi plays this verbatim so we use a time-neutral opening.
  first_message: 'Atención a Contribuyentes del Municipio de Monterrey. ¿En qué le puedo ayudar?',

  // ── Phone & transfer ───────────────────────────────────────────────────────
  // phone_number: the Twilio number assigned to this demo line — fill once bought.
  phone_number:    process.env.DEMO2_PHONE_NUMBER ?? '',
  // transfer_number: Nazre's personal cell for testing; swap before live demos.
  transfer_number: '+528112803360',

  // ── Features ───────────────────────────────────────────────────────────────
  features: {
    meerkat_role_id:        'nia',
    lead_qualification:     true,   // crear_lead
    appointment_booking:    true,   // agendar_cita
    smart_transfer:         true,   // notificar_transferencia + transferir_llamada
    skip_recording_notice:  true,   // no "Esta llamada puede ser grabada" para demo gobierno
    lite_prompt:            true,   // skip HCP+CCE+DNA (~2,400 palabras) → respuestas más rápidas
    skip_aup:               true,   // agente de confianza — sin bloque de prohibiciones
  },

  plan: 'pro',
};

const DEMO_PHONE_E164     = '+528121889489';
const VAPI_URL            = 'https://api.vapi.ai';
const VAPI_ASSISTANT_ID   = '9f074691-f8d2-4a38-a6b5-05b78e05f53d';

function vapiHeaders() {
  return { Authorization: `Bearer ${process.env.VAPI_API_KEY!}`, 'Content-Type': 'application/json' };
}

async function assignPhoneToAssistant(): Promise<{ ok: boolean; vapiPhoneId?: string; error?: string }> {
  // 1. Find the Vapi phone number ID that matches our E.164 number
  const listRes = await fetch(`${VAPI_URL}/phone-number?limit=100`, { headers: vapiHeaders() });
  if (!listRes.ok) return { ok: false, error: `Vapi list error: ${await listRes.text()}` };

  const phones: Array<{ id: string; number: string }> = await listRes.json();
  const match = phones.find(p => p.number?.replace(/\s/g, '') === DEMO_PHONE_E164);
  if (!match) return { ok: false, error: `Número ${DEMO_PHONE_E164} no encontrado en Vapi. ¿Está importado?` };

  // 2. Assign the assistant + serverUrl
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const secret    = process.env.VAPI_SERVER_SECRET ?? '';
  const serverUrl = `${appUrl}/api/voice/inbound?secret=${secret}`;

  const patchRes = await fetch(`${VAPI_URL}/phone-number/${match.id}`, {
    method:  'PATCH',
    headers: vapiHeaders(),
    body: JSON.stringify({ assistantId: VAPI_ASSISTANT_ID, serverUrl }),
  });
  if (!patchRes.ok) return { ok: false, error: `Vapi assign error: ${await patchRes.text()}` };

  return { ok: true, vapiPhoneId: match.id };
}

function auth(req: NextRequest): boolean {
  const secret   = req.nextUrl.searchParams.get('secret') ?? '';
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !secret) return false;
  return timingSafeCompareStrings(secret, expected);
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Standalone phone assignment (no agent creation)
  if (req.nextUrl.searchParams.get('assign_phone') === '1') {
    const result = await assignPhoneToAssistant();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

    // Save phone number back to DB
    const supabase = createAdminClient();
    await supabase.from('voice_agents')
      .update({ phone_number: DEMO_PHONE_E164, vapi_phone_id: result.vapiPhoneId })
      .eq('id', '6e086bf2-ba22-40d0-8458-7439ba7d546d');

    return NextResponse.json({ ok: true, message: `Número ${DEMO_PHONE_E164} asignado a Nia en Vapi.`, vapiPhoneId: result.vapiPhoneId });
  }

  const supabase = createAdminClient();
  const resync   = req.nextUrl.searchParams.get('resync') === '1';

  // Check if agent already exists
  const { data: existing } = await supabase
    .from('voice_agents')
    .select('id, vapi_agent_id, agent_name')
    .eq('portal_email', DEMO_CONFIG.portal_email)
    .eq('agent_name', 'Nia')
    .maybeSingle();

  if (existing && !resync) {
    return NextResponse.json({
      ok: true,
      message: 'Agente ya existe. Agrega &resync=1 para forzar re-sincronización con Vapi.',
      agent_id:      existing.id,
      vapi_agent_id: existing.vapi_agent_id,
    });
  }

  if (existing && resync && existing.vapi_agent_id) {
    const { updateVapiAssistant } = await import('@/lib/vapi/sync');
    const { data: full } = await supabase.from('voice_agents').select('*').eq('id', existing.id).single();
    if (full) {
      // org-level fields go to organizations table
      await supabase.from('organizations').upsert({
        portal_email:         DEMO_CONFIG.portal_email,
        business_description: DEMO_CONFIG.business_description,
      }, { onConflict: 'portal_email' });

      await supabase.from('voice_agents').update({
        business_name:       DEMO_CONFIG.business_name,
        role:                DEMO_CONFIG.role,
        role_knowledge_base: DEMO_CONFIG.role_knowledge_base,
        first_message:       DEMO_CONFIG.first_message,
        features:            DEMO_CONFIG.features,
        transfer_number:     DEMO_CONFIG.transfer_number || null,
      }).eq('id', existing.id);

      const patched = { ...full, ...DEMO_CONFIG } as unknown as VoiceAgent;
      await updateVapiAssistant(existing.vapi_agent_id, patched);
    }
    return NextResponse.json({ ok: true, message: 'Re-sincronizado con Vapi.', agent_id: existing.id, vapi_agent_id: existing.vapi_agent_id });
  }

  // Create new agent — business_description lives in organizations, not voice_agents
  const { data: agent, error } = await supabase
    .from('voice_agents')
    .insert({
      client_name:             DEMO_CONFIG.client_name,
      portal_email:            DEMO_CONFIG.portal_email,
      business_name:           DEMO_CONFIG.business_name,
      agent_name:              DEMO_CONFIG.agent_name,
      role:                    DEMO_CONFIG.role,
      role_knowledge_base:     DEMO_CONFIG.role_knowledge_base,
      business_address:        DEMO_CONFIG.business_address,
      business_phone_display:  DEMO_CONFIG.business_phone_display,
      timezone:                DEMO_CONFIG.timezone,
      phone_number:            DEMO_CONFIG.phone_number,
      transfer_number:         DEMO_CONFIG.transfer_number || null,
      first_message:           DEMO_CONFIG.first_message,
      features:                DEMO_CONFIG.features,
      plan:                    DEMO_CONFIG.plan,
      minutes_included:        600,
      minutes_reset_date:      new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      active:                  true,
    })
    .select()
    .single();

  if (!error) {
    // Upsert org-level fields
    await supabase.from('organizations').upsert({
      portal_email:         DEMO_CONFIG.portal_email,
      business_description: DEMO_CONFIG.business_description,
    }, { onConflict: 'portal_email' });
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vapiAssistantId = await createVapiAssistant(agent as unknown as VoiceAgent);

  if (vapiAssistantId) {
    await supabase.from('voice_agents').update({ vapi_agent_id: vapiAssistantId }).eq('id', agent.id);
    resyncPeerAgents(DEMO_CONFIG.portal_email, agent.id).catch(console.error);
  }

  return NextResponse.json({
    ok: true,
    message: 'Agente Nia — Municipio de Monterrey creado correctamente.',
    agent_id:       agent.id,
    vapi_agent_id:  vapiAssistantId,
    portal_email:   DEMO_CONFIG.portal_email,
    next_step:      vapiAssistantId
      ? 'Agente listo en Vapi. Asigna el número de teléfono demo en el dashboard de Vapi si aún no está asignado.'
      : 'ADVERTENCIA: Vapi no respondió. Revisa VAPI_API_KEY en .env.local.',
  }, { status: 201 });
}
