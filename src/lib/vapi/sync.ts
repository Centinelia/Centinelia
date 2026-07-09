import { buildSystemPrompt } from '@/lib/voice/prompt-builder';
import type { VoiceAgent } from '@/types/agent';

const VAPI_URL = 'https://api.vapi.ai';
const VAPI_KEY = process.env.VAPI_API_KEY!;

function headers() {
  return {
    'Authorization': `Bearer ${VAPI_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function createVapiTools(agent: VoiceAgent): Promise<string[]> {
  const base = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools`;
  const id = agent.id;
  const tools = [];

  if (agent.features.lead_qualification) {
    tools.push({
      type: 'function',
      function: {
        name: 'crear_lead',
        description: 'Registra los datos de un prospecto interesado en contratar servicios.',
        parameters: {
          type: 'object',
          properties: {
            nombre:      { type: 'string', description: 'Nombre completo del prospecto' },
            negocio:     { type: 'string', description: 'Nombre del negocio' },
            giro:        { type: 'string', description: 'Giro o industria del negocio' },
            servicio:    { type: 'string', description: 'Servicio que necesita' },
            presupuesto: { type: 'string', description: 'Presupuesto aproximado' },
            timeline:    { type: 'string', description: 'Para cuándo lo necesita' },
            email:       { type: 'string', description: 'Correo electrónico' },
            whatsapp:    { type: 'string', description: 'Número de WhatsApp' },
          },
          required: ['nombre', 'servicio'],
        },
      },
      server: { url: `${base}/crear-lead?agent_id=${id}` },
    });
  }

  if (agent.features.appointment_booking) {
    tools.push({
      type: 'function',
      function: {
        name: 'agendar_cita',
        description: 'Agenda, modifica o cancela una cita.',
        parameters: {
          type: 'object',
          properties: {
            accion:   { type: 'string', enum: ['agendar', 'modificar', 'cancelar'], description: 'Acción a realizar' },
            nombre:   { type: 'string', description: 'Nombre del cliente' },
            servicio: { type: 'string', description: 'Servicio para la cita' },
            fecha:    { type: 'string', description: 'Fecha de la cita (ej: lunes 23 de junio)' },
            hora:     { type: 'string', description: 'Hora de la cita' },
            telefono: { type: 'string', description: 'Teléfono de confirmación' },
          },
          required: ['accion', 'nombre'],
        },
      },
      server: { url: `${base}/agendar-cita?agent_id=${id}` },
    });
  }

  if (agent.features.order_taking) {
    tools.push({
      type: 'function',
      function: {
        name: 'registrar_pedido',
        description: 'Registra un pedido por teléfono.',
        parameters: {
          type: 'object',
          properties: {
            nombre:    { type: 'string', description: 'Nombre del cliente' },
            telefono:  { type: 'string', description: 'Teléfono del cliente' },
            items:     { type: 'string', description: 'Descripción de los productos o servicios pedidos' },
            tipo:      { type: 'string', enum: ['entrega', 'recoger'], description: 'Entrega a domicilio o recoger en sucursal' },
            direccion: { type: 'string', description: 'Dirección de entrega (solo si tipo es entrega)' },
            notas:     { type: 'string', description: 'Notas adicionales del pedido' },
          },
          required: ['nombre', 'items', 'tipo'],
        },
      },
      server: { url: `${base}/registrar-pedido?agent_id=${id}` },
    });
  }

  if (agent.features.existing_client_support || agent.features.client_memory) {
    tools.push({
      type: 'function',
      function: {
        name: 'buscar_cliente',
        description: 'Busca el historial e información de un cliente existente por nombre o teléfono.',
        parameters: {
          type: 'object',
          properties: {
            identificador: { type: 'string', description: 'Nombre completo, número de teléfono, o WhatsApp del cliente' },
          },
          required: ['identificador'],
        },
      },
      server: { url: `${base}/buscar-cliente?agent_id=${id}` },
    });
  }

  if (agent.features.smart_transfer) {
    // Step 1, notify owner via WhatsApp before the transfer
    tools.push({
      type: 'function',
      function: {
        name: 'notificar_transferencia',
        description: 'Notifica al equipo por WhatsApp que viene una transferencia. Llama a esta herramienta PRIMERO, luego usa transferir_llamada.',
        parameters: {
          type: 'object',
          properties: {
            nombre:  { type: 'string', description: 'Nombre del cliente' },
            motivo:  { type: 'string', description: 'Motivo de la transferencia' },
            resumen: { type: 'string', description: 'Resumen breve de la conversación' },
          },
          required: ['motivo'],
        },
      },
      server: { url: `${base}/notificar-transferencia?agent_id=${id}` },
    });

    // Step 2, native Vapi call transfer (only if a transfer number is configured)
    if (agent.transfer_number) {
      tools.push({
        type: 'transferCall',
        function: {
          name: 'transferir_llamada',
          description: 'Transfiere la llamada en tiempo real al equipo. Úsala DESPUÉS de notificar_transferencia cuando el cliente quiera hablar con un humano.',
          parameters: { type: 'object', properties: {} },
        },
        destinations: [{
          type: 'number',
          number: agent.transfer_number,
          message: 'Un momento por favor, te estoy comunicando con el equipo.',
        }],
        messages: [{
          type: 'request-start',
          content: 'Claro, con mucho gusto te comunico con el equipo ahora mismo.',
        }],
      });
    }
  }

  if (agent.features.whatsapp_escalation) {
    tools.push({
      type: 'function',
      function: {
        name: 'enviar_whatsapp_escalacion',
        description: 'Envía un WhatsApp al cliente diciéndole que pueden atenderle por ese canal cuando la llamada no pudo resolverse.',
        parameters: {
          type: 'object',
          properties: {
            numero_cliente: { type: 'string', description: 'Número del cliente con código de país, ej: +528112345678' },
            motivo:         { type: 'string', description: 'Breve motivo de la escalación' },
          },
          required: ['numero_cliente'],
        },
      },
      server: { url: `${base}/enviar-whatsapp-escalacion?agent_id=${id}` },
    });
  }

  const ids: string[] = [];
  for (const tool of tools) {
    const res = await fetch(`${VAPI_URL}/tool`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(tool),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.id) ids.push(data.id);
    } else {
      console.error('Vapi createTool error:', tool.function.name, await res.text());
    }
  }
  return ids;
}

function buildVapiAssistant(agent: VoiceAgent, toolIds: string[] = []) {
  const agentName = agent.agent_name?.trim() || 'Centinelia';

  return {
    name: `${agentName}, ${agent.business_name}`,
    model: {
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
      messages: [{ role: 'system', content: buildSystemPrompt(agent) }],
      temperature: 0.4,
      maxTokens: 300,
      ...(toolIds.length > 0 ? { toolIds } : {}),
    },
    voice: {
      provider: '11labs',
      voiceId: agent.elevenlabs_voice_id || 'jUxkp8eMgszgJX3XU2pV',
      model: 'eleven_turbo_v2_5',
      stability: 0.45,
      similarityBoost: 0.75,
      style: 0.30,
      speed: 1.1,
      useSpeakerBoost: true,
      optimizeStreamingLatency: 3,
      chunkPlan: {
        enabled: true,
        minCharacters: 80,
        punctuationBoundaries: ['.', '!', '?'],
      },
    },
    firstMessage: (() => {
      const notice = 'Esta llamada puede ser grabada.';
      const custom = agent.first_message?.trim();
      if (custom) {
        return custom.toLowerCase().includes('grabada') ? custom : `${custom} ${notice}`;
      }
      return `${agent.business_name}, buenos días. Le habla ${agentName}. ${notice} ¿En qué le puedo ayudar?`;
    })(),
    endCallMessage: 'Hasta luego, que tenga un excelente día.',
    endCallPhrases: ['hasta luego', 'hasta pronto', 'que tenga un excelente día', 'que tenga buen día', 'adiós', 'fue un placer atenderle'],
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: agent.features.multilingual ? 'multi' : 'es',
      smartFormat: true,
      endpointing: 100,
    },
    backgroundSound: 'office',
    backchannelingEnabled: true,
    backgroundDenoisingEnabled: true,
    silenceTimeoutSeconds: 10,
    maxDurationSeconds: 1800,
    serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook?secret=${process.env.VAPI_SERVER_SECRET ?? ''}`,
    recordingEnabled: true,
    analysisPlan: {
      summaryPrompt: 'Resume esta llamada en 2-3 oraciones en texto plano, sin markdown, sin encabezados, sin negritas: qué quería el cliente y cómo terminó la llamada.',
      successEvaluationPrompt: '¿Se resolvió la solicitud del cliente satisfactoriamente?',
      successEvaluationRubric: 'DescriptiveScale',
      structuredDataPrompt: 'Extrae la información recopilada en esta llamada. Solo incluye campos que el cliente mencionó explícitamente.',
      structuredDataSchema: {
        type: 'object',
        properties: {
          nombre:        { type: 'string', description: 'Nombre completo del cliente' },
          negocio:       { type: 'string', description: 'Nombre del negocio del cliente' },
          giro:          { type: 'string', description: 'Giro o industria del negocio' },
          servicio:      { type: 'string', description: 'Servicio o producto que necesita' },
          presupuesto:   { type: 'string', description: 'Presupuesto mencionado' },
          timeline:      { type: 'string', description: 'Para cuándo lo necesita' },
          email:         { type: 'string', description: 'Email de contacto' },
          whatsapp:      { type: 'string', description: 'Número de WhatsApp o teléfono con código de país, ej: +528112345678' },
          cita_fecha:    { type: 'string', description: 'Fecha de la cita en formato YYYY-MM-DD, ej: 2026-06-25. Calcula la fecha exacta basándote en lo que dijo el cliente.' },
          cita_hora:     { type: 'string', description: 'Hora de la cita en formato HH:MM, ej: 10:30' },
          cita_telefono: { type: 'string', description: 'Teléfono de confirmación de la cita con código de país' },
          pedido_items:  { type: 'string', description: 'Productos o platillos pedidos si aplica' },
          pedido_tipo:   { type: 'string', description: 'Entrega o recoger si aplica' },
          tipo_contacto: { type: 'string', description: 'lead | cita | pedido | informacion | transferencia' },
        },
      },
    },
    messagePlan: {
      idleMessages: [
        '¿Sigues ahí?',
        '¿Hay algo más en lo que te pueda ayudar?',
        'Estoy aquí si necesitas algo.',
        'Tómate el tiempo que necesites.',
      ],
    },
    metadata: { agent_id: agent.id, plan: agent.plan },
  };
}

export async function createVapiAssistant(agent: VoiceAgent): Promise<string | null> {
  const toolIds = await createVapiTools(agent);
  const res = await fetch(`${VAPI_URL}/assistant`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(buildVapiAssistant(agent, toolIds)),
  });
  if (!res.ok) {
    console.error('Vapi createAssistant error:', await res.text());
    return null;
  }
  const data = await res.json();
  return data.id ?? null;
}

export async function updateVapiAssistant(vapiAssistantId: string, agent: VoiceAgent): Promise<boolean> {
  // Fetch existing tool IDs to avoid recreating tools on every update
  const existing = await fetch(`${VAPI_URL}/assistant/${vapiAssistantId}`, { headers: headers() });
  const existingData = existing.ok ? await existing.json() : null;
  const existingToolIds: string[] = existingData?.model?.toolIds ?? [];

  const res = await fetch(`${VAPI_URL}/assistant/${vapiAssistantId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(buildVapiAssistant(agent, existingToolIds)),
  });
  if (!res.ok) {
    console.error('Vapi updateAssistant error:', await res.text());
    return false;
  }
  return true;
}

export async function assignAssistantToPhone(
  phoneNumber: string,
  vapiAssistantId: string,
  concurrencyLimit?: number,
): Promise<boolean> {
  // Find the Vapi phone number ID by number
  const listRes = await fetch(`${VAPI_URL}/phone-number`, { headers: headers() });
  if (!listRes.ok) return false;

  const phones: Array<{ id: string; number: string }> = await listRes.json();
  const phone = phones.find(p => p.number === phoneNumber);
  if (!phone) {
    console.error('Vapi phone not found for number:', phoneNumber);
    return false;
  }

  const patch: Record<string, unknown> = { assistantId: vapiAssistantId };
  if (concurrencyLimit !== undefined) patch.concurrencyLimit = concurrencyLimit;

  const res = await fetch(`${VAPI_URL}/phone-number/${phone.id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    console.error('Vapi assignAssistant error:', await res.text());
    return false;
  }
  return true;
}
