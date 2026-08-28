import { createAdminClient } from '@/lib/supabase/admin';
import { buildOutboundSystemPrompt } from '@/lib/voice/outbound-prompt-builder';
import { expandForSpeech } from '@/lib/voice/tts-normalize';
import { resolveMeerkatConfig } from '@/lib/vapi/resolve-meerkat';
import { resolveMeerkatVersionForAgent } from '@/lib/feature-flags/version-flag-resolver';
import type { VoiceAgent } from '@/types/agent';

// Pausa al inicio del firstMessage. Sin esto, Vapi empieza a hablar en el
// instante que Twilio detecta que el cliente contestó — pero el cliente todavía
// no llegó el teléfono a la oreja, así que se pierde las primeras 2-3 palabras.
// `<break time="1500ms" />` es SSML soportado por ElevenLabs Turbo v2.5.
// Nazre lo pidió tras el primer test de Noah 2026-08-27.
const FIRST_MESSAGE_LEAD_PAUSE = '<break time="2500ms" /> ';

type SurveyQ = {
  id:         string;
  orden:      number;
  texto:      string;
  tipo:       string;
  opciones:   string[] | null;
  conditions: { if_rating_lte?: number; if_answer?: string; then_say?: string } | null;
};

async function buildOutboundSurveyBlock(agentId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data: surveys } = await supabase
    .from('surveys')
    .select('id, nombre, survey_questions(id, orden, texto, tipo, opciones, conditions)')
    .eq('agent_id', agentId)
    .eq('activa', true)
    .eq('auto_apply', true)
    .contains('triggers', ['end_of_outbound_call'])
    .limit(2);

  if (!surveys?.length) return '';

  const blocks: string[] = [];
  for (const s of surveys) {
    const questions = (s.survey_questions as SurveyQ[] | null) ?? [];
    if (!questions.length) continue;

    const lines = [
      `ENCUESTA AL CERRAR — "${s.nombre}"`,
      `ID de encuesta: ${s.id}`,
      'Preguntas:',
      ...questions.map(q => {
        let hint = '';
        if (q.tipo === 'rating_5')  hint = ' [escala 1–5]';
        if (q.tipo === 'rating_10') hint = ' [escala 1–10]';
        if (q.tipo === 'si_no')     hint = ' [sí / no]';
        if (q.tipo === 'multiple' && q.opciones?.length) hint = ` [opciones: ${q.opciones.join(', ')}]`;
        const cond = q.conditions;
        let condLine = '';
        if (cond?.then_say?.trim()) {
          if (cond.if_rating_lte != null)
            condLine = `\n     → Si responde ${cond.if_rating_lte} o menos, di exactamente: "${cond.then_say.trim()}"`;
          else if (cond.if_answer)
            condLine = `\n     → Si responde "${cond.if_answer}", di exactamente: "${cond.then_say.trim()}"`;
        }
        return `  ${q.orden}. ${q.texto}${hint}${condLine}`;
      }),
      '',
      'INSTRUCCIONES DE ENCUESTA:',
      '- Aplica esta encuesta de forma natural ANTES de despedirte, cuando el objetivo principal de la llamada ya esté cumplido.',
      '- Pide permiso brevemente: "Antes de cerrar, ¿le importaría responder una pregunta rápida?"',
      '- Haz UNA pregunta a la vez y espera la respuesta.',
      '- Si el cliente no quiere participar, respeta su decisión y cierra con normalidad.',
      '- En cuanto termines (o si el cliente se niega), llama a registrar_encuesta con el survey_id y las respuestas.',
    ];
    blocks.push(lines.join('\n'));
  }

  return blocks.length ? '\n\n' + blocks.join('\n\n') : '';
}

const VAPI_URL = 'https://api.vapi.ai';
const VAPI_KEY = process.env.VAPI_API_KEY!;

function headers() {
  return { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' };
}

async function resolveVapiPhoneNumberId(agentId: string, phoneNumber: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('voice_agents')
    .select('vapi_phone_number_id')
    .eq('id', agentId)
    .single();

  if (data?.vapi_phone_number_id) return data.vapi_phone_number_id;

  const res = await fetch(`${VAPI_URL}/phone-number`, { headers: headers() });
  if (!res.ok) return null;

  const phones: Array<{ id: string; number: string }> = await res.json();
  const phone = phones.find(p => p.number === phoneNumber);
  if (!phone) return null;

  await supabase
    .from('voice_agents')
    .update({ vapi_phone_number_id: phone.id })
    .eq('id', agentId);

  return phone.id;
}

export async function triggerOutboundCall({
  agent,
  customerNumber,
  customerName,
  motivo,
  isCallback = false,
  campaignInstructions,
  externalSource,
  externalId,
}: {
  agent:                 VoiceAgent;
  customerNumber:        string;
  customerName?:         string;
  motivo?:               string;
  isCallback?:           boolean;
  campaignInstructions?: string;
  externalSource?:       string;
  externalId?:           string;
}): Promise<{ ok: boolean; callId?: string; error?: string }> {
  if (!agent.vapi_agent_id) {
    return { ok: false, error: 'El agente no está sincronizado con Vapi' };
  }

  const phoneNumberId = await resolveVapiPhoneNumberId(agent.id, agent.phone_number);
  if (!phoneNumberId) {
    return { ok: false, error: `No se encontró el número ${agent.phone_number} en Vapi` };
  }

  // Proactive memory lookup for agents with client_memory or existing_client_support
  let resolvedName    = customerName;
  let customerContext = '';

  if (agent.features?.client_memory || agent.features?.existing_client_support) {
    const supabase  = createAdminClient();
    const normPhone = customerNumber.replace(/\D/g, '').slice(-10);

    const [leadRes, histRes] = await Promise.all([
      supabase
        .from('leads_voice')
        .select('nombre')
        .eq('agent_id', agent.id)
        .ilike('whatsapp', `%${normPhone}%`)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('voice_calls')
        .select('summary, outcome, created_at')
        .eq('agent_id', agent.id)
        .ilike('caller_number', `%${normPhone}%`)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    const lead    = leadRes.data;
    const history = histRes.data ?? [];

    if (lead?.nombre || history.length > 0) {
      resolvedName = resolvedName || lead?.nombre || '';
      const parts: string[] = [];
      if (resolvedName) parts.push(`Nombre: ${resolvedName}`);
      if (history.length > 0) {
        parts.push(`Ha llamado antes ${history.length} vez${history.length > 1 ? 'es' : ''}.`);
        if (history[0]?.summary) parts.push(`Última llamada: ${history[0].summary}`);
      }
      customerContext = `CONTEXTO DEL CLIENTE (${customerNumber}):\n${parts.join('\n')}`;
    }
  }

  const isFormal    = (agent.speech_style ?? 'usted') !== 'tu';
  const notice      = 'Esta llamada puede ser grabada.';
  const firstName   = resolvedName ? ` ${resolvedName.split(' ')[0]}` : '';
  const greeting    = resolvedName ? `Hola${firstName}` : 'Hola';
  // Expandir "Ave" → "Avenida", "Col." → "Colonia" etc antes de TTS. El motivo
  // suele venir con la dirección tal cual el cliente la dictó.
  const spokenMotivo = motivo ? expandForSpeech(motivo).toLowerCase() : '';

  const firstMessage = isCallback
    ? `${FIRST_MESSAGE_LEAD_PAUSE}Hola${firstName}, ${isFormal ? 'le' : 'te'} hablamos de ${agent.business_name}. ${notice} Nos llamaste hace un momento y no pudimos contestar, ${isFormal ? 'le ofrecemos una disculpa' : 'te pedimos una disculpa'}, pero ${isFormal ? 'díganos' : 'dinos'}, ¿en qué ${isFormal ? 'le' : 'te'} podemos servir?`
    : `${FIRST_MESSAGE_LEAD_PAUSE}${greeting}, le habla ${agent.business_name}. ${notice}${spokenMotivo ? ` Le llamo porque ${spokenMotivo}.` : ''} ¿Tiene un momento?`;

  // Inject end_of_outbound_call surveys unless this call already has an embedded survey
  let finalCampaignInstructions = campaignInstructions;
  if (!campaignInstructions?.includes('survey_id:')) {
    const surveyBlock = await buildOutboundSurveyBlock(agent.id);
    if (surveyBlock) {
      finalCampaignInstructions = (campaignInstructions ?? '') + surveyBlock;
    }
  }

  // Motivo expandido también al system prompt para que el LLM lo referencie
  // hablado (no solo el firstMessage). Si un cliente pregunta "¿por qué me
  // llamas?" a mitad de conversación, la respuesta también sonará expandida.
  const expandedMotivo = motivo ? expandForSpeech(motivo) : undefined;

  // Injectamos el external context al customerContext para que las tools de
  // verificación tengan el id que necesitan. Antes el LLM lo tenía que
  // adivinar → nunca invocaba verificar_recepcion_incidencia porque el arg
  // incident_id venía undefined. Bug 2026-08-28.
  const externalContextBlock = externalId && externalSource
    ? `\nCONTEXTO DE ORIGEN DE ESTA LLAMADA:\n- external_source: ${externalSource}\n- external_id: ${externalId}\n\nCuando invoques cualquier tool de verificación / seguimiento que requiera un identificador (ej. incident_id, pedido_id, lead_id), USA el external_id de arriba tal cual: "${externalId}".`
    : '';
  const enrichedContext = (customerContext ?? '') + externalContextBlock;

  const systemPrompt   = buildOutboundSystemPrompt(agent, resolvedName, expandedMotivo, enrichedContext, finalCampaignInstructions);

  // Resolver la config real del meerkat (mismo path que sync.ts inbound). Antes
  // este bloque hardcodeaba Haiku 4.5 ignorando la config → outbound de meerkats
  // con Sonnet corría en Haiku (mal), y meerkats con use_custom_llm=true
  // brincaban el cache prompt de Anthropic → costo y quality degradados. Bug
  // 2026-08-28 con Nelia: "hablaba con embolia" + switch a inglés = Haiku
  // confundido con el prompt largo destinado a Sonnet.
  const meerkatId       = (agent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;
  const pinnedVersion   = meerkatId ? await resolveMeerkatVersionForAgent(meerkatId, { portal_email: agent.portal_email ?? null, features: (agent.features ?? {}) as unknown as Record<string, unknown> }) : null;
  const meerkatCfg      = meerkatId ? await resolveMeerkatConfig(meerkatId, pinnedVersion) : null;
  const useCustomLlm    = !!(agent.features as unknown as Record<string, unknown>)?.use_custom_llm;
  const appUrl          = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const vapiSecret      = process.env.VAPI_SERVER_SECRET  ?? '';

  // Fetch assistant's current toolIds. Sin esto, assistantOverrides.model
  // borra los tools del assistant → LLM no tiene acceso a las tools →
  // no puede invocar (ni siquiera si el prompt lo manda). Bug 2026-08-28:
  // Nelia outbound alucinaba respuestas sin invocar verificar_recepcion_incidencia
  // porque el override le quitaba la tool.
  let existingToolIds: string[] = [];
  try {
    const asRes = await fetch(`${VAPI_URL}/assistant/${agent.vapi_agent_id}`, { headers: headers() });
    if (asRes.ok) {
      const asData = await asRes.json();
      existingToolIds = (asData?.model?.toolIds as string[] | undefined) ?? [];
    } else {
      console.warn('[triggerOutboundCall] fetch assistant failed:', asRes.status);
    }
  } catch (err) {
    console.warn('[triggerOutboundCall] fetch assistant threw:', err);
  }

  const modelOverride = useCustomLlm && meerkatCfg
    ? {
        provider:    'custom-llm',
        url:         vapiSecret ? `${appUrl}/api/voice/llm?secret=${encodeURIComponent(vapiSecret)}` : `${appUrl}/api/voice/llm`,
        model:       meerkatCfg.model,
        messages:    [{ role: 'system', content: systemPrompt }],
        temperature: meerkatCfg.temperature,
        maxTokens:   meerkatCfg.maxTokens,
        metadataSendMode: 'off',
        ...(existingToolIds.length > 0 ? { toolIds: existingToolIds } : {}),
      }
    : {
        provider:    meerkatCfg?.provider ?? 'anthropic',
        model:       meerkatCfg?.model    ?? 'claude-haiku-4-5-20251001',
        messages:    [{ role: 'system', content: systemPrompt }],
        ...(meerkatCfg ? { temperature: meerkatCfg.temperature, maxTokens: meerkatCfg.maxTokens } : {}),
        ...(existingToolIds.length > 0 ? { toolIds: existingToolIds } : {}),
      };

  const res = await fetch(`${VAPI_URL}/call`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      assistantId:  agent.vapi_agent_id,
      phoneNumberId,
      customer: {
        number: customerNumber,
        ...(customerName ? { name: customerName } : {}),
      },
      assistantOverrides: {
        firstMessage,
        model: modelOverride,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Vapi outbound call error:', err);
    return { ok: false, error: err };
  }

  const data = await res.json();
  return { ok: true, callId: data.id as string };
}
