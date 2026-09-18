// Wrapper de triggerOutboundCall para el pipeline de demo de landing.
// Lee el VoiceAgent demo de Supabase, construye las campaignInstructions
// con el contexto de industria y dispara la llamada saliente.
//
// El agente 'Nia Landing Demo' debe estar seeded via migration
// 20260917200000_seed_landing_demo_agent.sql y sincronizado con Vapi
// (POST /api/admin/agents/[id]/sync) para que vapi_agent_id este presente.

import { triggerOutboundCall }     from './outbound';
import { createAdminClient }       from '@/lib/supabase/admin';
import { LANDING_DEMO_AGENT_ID }   from '@/lib/landing/constants';
import { setVapiCall }             from '@/lib/landing/callback-store';
import type { IndustryKey }        from '@/app/(landing)/sections/CallbackForm';
import type { VoiceAgent }         from '@/types/agent';

// Etiqueta humana de cada industria para el script de la llamada demo
const INDUSTRY_LABEL: Record<IndustryKey, string> = {
  tortilleria_abarrotes:   'tortillería, abarrotes o distribuidor de ruta',
  construccion:            'constructora u obra',
  despacho_contable:       'despacho contable o de facturación',
  servicios_profesionales: 'servicios profesionales',
  otro:                    'negocio',
};

/**
 * Construye el texto de campaignInstructions inyectado en la llamada demo.
 * El system prompt del agente ya tiene el guion base; este contexto
 * adapta la llamada a la industria especifica del prospecto.
 */
function buildCampaignInstructions(industry: IndustryKey): string {
  const label = INDUSTRY_LABEL[industry];
  return `
CONTEXTO DE ESTA LLAMADA DE DEMOSTRACIÓN:
- La persona a la que llamas dejó su teléfono en la landing de Centinelia.
- Dijo que su negocio es: ${label}.

OBJETIVO:
En 2 a 3 minutos: preséntate como empleada digital de Centinelia, pregunta
a qué se dedica exactamente y cuál es su dolor operativo más grande, describe
cómo trabajarías con su negocio (con ejemplos concretos para ${label}), y
ofrece agendar una llamada con Nazre para cerrar detalles.

REGLAS ESTRICTAS:
- Nunca digas "IA", "AI", "chatbot", "GPT" ni "automatización". Eres empleada
  digital, punto.
- Máximo 3 minutos. Si a los 2:30 aún no hay cierre, agenda directamente.
- Si preguntan precio: "el plan más chico arranca en 2,997 pesos al mes más
  IVA, con una incorporación de 14,990 pesos", y ofrece que Nazre les mande
  cotización por correo.
- No prometas features que no sabes si están hoy.
`.trim();
}

/**
 * Dispara una llamada demo saliente para un prospecto de landing.
 *
 * @param input.phone     Numero local MX de 10 digitos (sin prefijo).
 * @param input.industry  Industria seleccionada en el form.
 * @param input.requestId ID de la solicitud en landing_callback_requests.
 */
export async function triggerLandingDemoCall(input: {
  phone:     string;
  industry:  IndustryKey;
  requestId: string;
}): Promise<{ ok: boolean; vapiCallId?: string; error?: string }> {
  // Leer el agente demo de Supabase — debe estar seeded y con vapi_agent_id
  const supabase = createAdminClient();
  const { data: agent, error: agentErr } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', LANDING_DEMO_AGENT_ID)
    .single();

  if (agentErr || !agent) {
    return { ok: false, error: 'landing_demo_agent_not_seeded' };
  }

  // Disparar llamada outbound via Vapi
  const result = await triggerOutboundCall({
    agent:                agent as VoiceAgent,
    customerNumber:       `+52${input.phone}`,
    motivo:               'quiere conocer como trabaja un empleado digital de Centinelia',
    campaignInstructions: buildCampaignInstructions(input.industry),
    externalSource:       'landing_demo',
    externalId:           input.requestId,
  });

  if (!result.ok || !result.callId) {
    return { ok: false, error: result.error ?? 'vapi_call_failed' };
  }

  // Guardar el callId y actualizar estado a 'dialing'
  await setVapiCall(input.requestId, result.callId, 'dialing');
  return { ok: true, vapiCallId: result.callId };
}
