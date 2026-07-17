import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSystemPrompt } from '@/lib/voice/prompt-builder';
import { isWithinBusinessHours, nextOpenTime } from '@/lib/voice/business-hours';
import type { VoiceAgent } from '@/types/agent';
import { VAPI_MAX_CALL_SECONDS, VAPI_VOICE_MAX_TOKENS } from '@/lib/constants';

// Vapi calls this endpoint when a call comes in on an assigned phone number.
// We respond with the agent configuration (system prompt + tools) for this caller.
export async function POST(req: NextRequest) {
  const vapiSecret = process.env.VAPI_SERVER_SECRET;
  const providedSecret = req.headers.get('x-vapi-secret') ?? req.nextUrl.searchParams.get('secret');
  if (vapiSecret && providedSecret !== vapiSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { message } = body;

  // Vapi sends phoneNumber at message.phoneNumber (not nested inside call)
  const phoneNumber: string = message?.customer?.number ?? message?.call?.customer?.number ?? '';
  const vapiPhoneNumber: string = message?.phoneNumber?.number ?? message?.call?.phoneNumber?.number ?? '';

  const supabase = createAdminClient();

  // Find the agent assigned to this phone number
  const { data: agent, error } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('phone_number', vapiPhoneNumber)
    .eq('active', true)
    .single();

  if (error || !agent) {
    return NextResponse.json(
      { error: 'No agent configured for this number' },
      { status: 404 }
    );
  }

  const typedAgent = agent as VoiceAgent;
  const agentName  = typedAgent.agent_name?.trim() || 'Centinelia';

  // Check account status — suspended or terminated accounts cannot receive calls
  if (typedAgent.portal_email) {
    const { data: org } = await supabase
      .from('organizations')
      .select('account_status, suspended_until')
      .eq('portal_email', typedAgent.portal_email)
      .single();

    if (org) {
      const isSuspended = org.account_status === 'suspended' &&
        (!org.suspended_until || new Date(org.suspended_until) > new Date());
      const isTerminated = org.account_status === 'terminated';

      if (isSuspended || isTerminated) {
        return NextResponse.json(
          { error: 'Account suspended' },
          { status: 403 }
        );
      }
    }
  }

  // Proactive caller lookup for client memory (Pro) and existing_client_support
  let callerName    = '';
  let callerContext = '';
  const f = typedAgent.features ?? {};
  if (phoneNumber && (f.client_memory || f.existing_client_support)) {
    const normPhone = phoneNumber.replace(/\D/g, '').slice(-10);

    const [leadRes, histRes] = await Promise.all([
      supabase
        .from('leads_voice')
        .select('nombre, servicio, negocio')
        .eq('agent_id', typedAgent.id)
        .ilike('whatsapp', `%${normPhone}%`)
        .order('created_at', { ascending: false })
        .limit(1),
      // Only load calls with actual summaries — no unanswered or empty calls worth remembering
      supabase
        .from('voice_calls')
        .select('summary, outcome, created_at')
        .eq('agent_id', typedAgent.id)
        .ilike('caller_number', `%${normPhone}%`)
        .neq('outcome', 'unanswered')
        .not('summary', 'is', null)
        .order('created_at', { ascending: false })
        .limit(7),
    ]);

    const lead    = leadRes.data?.[0] ?? null;
    const history = histRes.data ?? [];

    if (lead?.nombre || history.length > 0) {
      const parts: string[] = [];
      if (lead?.nombre)   parts.push(`Nombre: ${lead.nombre}`);
      if (lead?.negocio)  parts.push(`Negocio: ${lead.negocio}`);
      if (lead?.servicio) parts.push(`Servicio de interés previo: ${lead.servicio}`);

      if (history.length > 0) {
        parts.push(`Interacciones previas relevantes (${history.length}):`);
        let charBudget = 2400;
        for (const c of history) {
          const line = `• ${new Date(c.created_at as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}: ${c.summary}`;
          if (line.length > charBudget) break;
          parts.push(line);
          charBudget -= line.length;
        }
      }

      callerName = lead?.nombre ?? '';
      if (callerName) {
        callerContext = `\n\nCONTEXTO DEL LLAMANTE (${phoneNumber}):\n${parts.join('\n')}\nNO preguntes su nombre, ya lo sabes. Salúdale por su nombre de pila y continúa la conversación naturalmente.`;
      } else {
        callerContext = `\n\nCONTEXTO DEL LLAMANTE (${phoneNumber}):\n${parts.join('\n')}\nSaluda cordialmente. Puedes preguntarle su nombre si es necesario para la solicitud.`;
      }
    }
  }

  // Team member identification
  const normCaller   = phoneNumber.replace(/\D/g, '').slice(-10);
  const teamNumbers  = ((typedAgent as any).team_numbers ?? []) as { number: string; name?: string; is_owner?: boolean }[];
  const callerTeamEntry = normCaller.length >= 7
    ? teamNumbers.find(t => t.number.replace(/\D/g, '').slice(-10) === normCaller) ?? null
    : null;

  // Owner bypass: transfer_number / transfer_whatsapp / is_owner team entry always get through
  const normTransfer = (typedAgent.transfer_number   ?? '').replace(/\D/g, '').slice(-10);
  const normWa       = (typedAgent.transfer_whatsapp ?? '').replace(/\D/g, '').slice(-10);
  const isOwner = normCaller.length >= 7 && (
    (normTransfer && normCaller === normTransfer) ||
    (normWa       && normCaller === normWa)       ||
    callerTeamEntry?.is_owner === true
  );

  // Check business hours, respond with closed message if outside schedule
  if (!isOwner && !isWithinBusinessHours(typedAgent.business_hours, typedAgent.timezone)) {
    const next = typedAgent.business_hours ? nextOpenTime(typedAgent.business_hours, typedAgent.timezone) : null;
    const closedMsg = next
      ? `Gracias por llamar a ${typedAgent.business_name}. En este momento estamos cerrados. Puedes llamarnos de nuevo ${next}. ¡Hasta luego!`
      : `Gracias por llamar a ${typedAgent.business_name}. En este momento estamos fuera de horario. Por favor intenta más tarde.`;

    return NextResponse.json({
      assistant: {
        name: 'Closed',
        model: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          messages: [{ role: 'system', content: 'Eres una recepcionista. Di únicamente el mensaje de cierre y despídete.' }],
        },
        voice: {
          provider: '11labs',
          voiceId: typedAgent.elevenlabs_voice_id ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID,
          model: 'eleven_turbo_v2_5',
          stability: 0.45,
          similarityBoost: 0.75,
          style: 0.30,
          speed: 1.1,
          useSpeakerBoost: true,
          optimizeStreamingLatency: 4,
        },
        firstMessage: closedMsg,
        endCallAfterSilenceSeconds: 5,
      },
    });
  }

  // Check remaining minutes (for owner low-balance alert)
  let minutesRemain = Infinity;
  let minutesIncluded = 0;
  if (isOwner) {
    const { data: acctMins } = typedAgent.portal_email
      ? await supabase.from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', typedAgent.portal_email).single()
      : { data: null };
    minutesIncluded = acctMins?.minutes_included ?? (typedAgent as any).minutes_included ?? 0;
    const minutesUsed = acctMins?.minutes_used ?? (typedAgent as any).minutes_used ?? 0;
    minutesRemain = Math.max(0, minutesIncluded - minutesUsed);
  }
  const LOW_MINS_THRESHOLD = Math.max(30, minutesIncluded * 0.20);
  const minsLow = isOwner && minutesIncluded > 0 && minutesRemain <= LOW_MINS_THRESHOLD;

  // Load active surveys with auto_apply and inject questions into the prompt
  let surveyPrompt = '';
  {
    const { data: activeSurveys } = await supabase
      .from('surveys')
      .select('id, nombre, descripcion, survey_questions(id, orden, texto, tipo, opciones)')
      .eq('agent_id', typedAgent.id)
      .eq('activa', true)
      .eq('auto_apply', true)
      .limit(3);

    if (activeSurveys?.length) {
      const blocks: string[] = [];
      for (const s of activeSurveys) {
        const questions = ((s as Record<string, unknown>).survey_questions as Array<{ id: string; orden: number; texto: string; tipo: string; opciones: string[] | null }> | null) ?? [];
        if (!questions.length) continue;
        const lines = [
          `ENCUESTA ACTIVA — "${s.nombre}"${s.descripcion ? ` (${s.descripcion})` : ''}`,
          `ID de encuesta: ${s.id}`,
          'Preguntas:',
          ...questions.map(q => {
            let hint = '';
            if (q.tipo === 'rating_5')  hint = ' [escala 1–5]';
            if (q.tipo === 'rating_10') hint = ' [escala 1–10]';
            if (q.tipo === 'si_no')     hint = ' [sí / no]';
            if (q.tipo === 'multiple' && q.opciones?.length) hint = ` [opciones: ${q.opciones.join(', ')}]`;
            return `  ${q.orden}. ${q.texto}${hint}`;
          }),
          '',
          'INSTRUCCIONES DE ENCUESTA:',
          '- Tu objetivo es obtener la respuesta a cada pregunta durante la llamada, de la manera más natural posible.',
          '- PREFERENCIA: Si en algún momento de la conversación surge un contexto natural para hacer una pregunta (por ejemplo, al cerrar un trámite, resolver un problema, o cuando el cliente exprese satisfacción o inconformidad), introdúcela en ese momento sin que parezca una encuesta formal. Ejemplo: si acabas de resolver un problema de acceso, puedes preguntar "¿Y en general, cómo calificaría el servicio de soporte del 1 al 5?" antes de pasar al siguiente tema.',
          '- FALLBACK: Si no surgió un momento natural durante la llamada, pide consentimiento antes de despedirte: "Antes de cerrar, ¿le importaría contestar una breve encuesta de satisfacción? Solo son [N] preguntas." Si dice que sí, procede. Si dice que no o que tiene prisa, agradece y cierra normalmente sin insistir.',
          '- Haz UNA pregunta a la vez y espera la respuesta. Nunca las enumeres todas de golpe.',
          '- Lleva la cuenta internamente de qué preguntas ya tienes respondidas y cuáles faltan.',
          '- Si el cliente no quiere participar o se despide sin responder, respeta su decisión y cierra normalmente.',
          '- En cuanto tengas todas las respuestas posibles (o al despedirte si el cliente se niega), llama a registrar_encuesta con el survey_id y las respuestas recopiladas. No esperes a tener todas — con al menos una respuesta ya vale registrar.',
        ];
        blocks.push(lines.join('\n'));
      }
      if (blocks.length) {
        surveyPrompt = '\n\n' + blocks.join('\n\n');
      }
    }
  }

  // Team caller context — overrides client context when caller is a known team member
  let teamCallerContext = '';
  if (callerTeamEntry) {
    const memberRole = callerTeamEntry.is_owner ? 'el dueño' : 'un miembro del equipo';
    const memberName = callerTeamEntry.name || 'un colaborador';
    teamCallerContext = `\n\nCONTEXTO INTERNO: Esta llamada proviene de ${memberName}, ${memberRole} de ${typedAgent.business_name} (número registrado). Trátale como equipo interno, no como cliente externo. Puedes compartir información operativa cuando te la pidan. Tutéale en todo momento. No apliques flujo de captura de leads ni agendamiento de citas a menos que te lo pidan explícitamente.`;
  }

  const systemPrompt = buildSystemPrompt(typedAgent) + (teamCallerContext || callerContext) + surveyPrompt +
    (minsLow ? `\n\nAVISO INTERNO: Al inicio de esta llamada, antes de atender cualquier solicitud, avisa al dueño que le quedan ${minutesRemain} minutos este mes (de ${minutesIncluded} incluidos). Dilo de forma natural y breve, en una sola frase. Ejemplo: "Por cierto, te quedan ${minutesRemain} minutos este mes, puedes comprar más desde el portal." Luego atiende su solicitud normalmente.` : '');
  const tools = buildTools(typedAgent);

  const defaultGreeting = typedAgent.speech_style === 'tu'
    ? `Hola, gracias por llamar a ${typedAgent.business_name}. Te habla ${agentName}. ¿En qué te puedo ayudar?`
    : `Hola, gracias por llamar a ${typedAgent.business_name}. Le habla ${agentName}. ¿En qué le puedo ayudar?`;

  const teamMemberName = callerTeamEntry?.name?.split(' ')[0];
  const firstMessage = teamMemberName
    ? `Hola ${teamMemberName}. ¿En qué te puedo ayudar?`
    : callerName
      ? (typedAgent.speech_style === 'tu'
          ? `Hola ${callerName.split(' ')[0]}. ¿En qué te puedo ayudar hoy?`
          : `Hola ${callerName.split(' ')[0]}. ¿En qué le puedo ayudar hoy?`)
      : (typedAgent.first_message?.trim() || defaultGreeting);

  // Return Vapi-compatible assistant configuration
  return NextResponse.json({
    assistant: {
      name: `${agentName}, ${typedAgent.business_name}`,
      model: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.4,
        maxTokens: VAPI_VOICE_MAX_TOKENS,
        tools,
      },
      voice: {
        provider: '11labs',
        voiceId: typedAgent.elevenlabs_voice_id ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID,
        model: 'eleven_turbo_v2_5',
        stability: 0.50,
        similarityBoost: 0.75,
        style: 0.20,
        speed: 1.0,
        useSpeakerBoost: true,
        optimizeStreamingLatency: 4,
        chunkPlan: {
          enabled: true,
          minCharacters: 30,
          punctuationBoundaries: ['.', '!', '?', ',', ';', ':'],
        },
      },
      firstMessage,
      endCallMessage: 'Hasta luego, que tenga un excelente día.',
      endCallPhrases: ['hasta luego', 'hasta pronto', 'que tenga un excelente día', 'que tenga buen día', 'adiós', 'fue un placer atenderle'],
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: typedAgent.features.multilingual ? 'multi' : 'es',
        smartFormat: true,
        endpointing: 100,
      },
      backgroundSound: 'office',
      backchannelingEnabled: true,
      backchannelPlan: {
        backchannels: ['Sí', 'Ajá', 'Claro', 'Mhm', 'Ya veo', 'Entiendo', 'Correcto', 'Perfecto', 'Tiene sentido', 'Sí te sigo'],
      },
      backgroundDenoisingEnabled: true,
      silenceTimeoutSeconds: 10,
      maxDurationSeconds: VAPI_MAX_CALL_SECONDS,
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
            cita_fecha:    { type: 'string', description: 'Fecha de la cita en formato YYYY-MM-DD' },
            cita_hora:     { type: 'string', description: 'Hora de la cita en formato HH:MM' },
            cita_telefono: { type: 'string', description: 'Teléfono de confirmación de la cita' },
            pedido_items:  { type: 'string', description: 'Productos o platillos pedidos si aplica' },
            pedido_tipo:        { type: 'string', description: 'Entrega o recoger si aplica' },
            tipo_contacto:      { type: 'string', description: 'lead | cita | pedido | informacion | transferencia' },
            nivel_interes:      { type: 'string', description: 'Nivel de interés del lead: alto, medio o bajo. Alto si mostró urgencia, está listo para comprar o tiene fecha definida. Bajo si solo quería información sin intención clara.' },
            acciones_pendientes: { type: 'string', description: 'Acciones concretas que el negocio debe tomar después de esta llamada, separadas por comas. Ej: "Enviar cotización, Confirmar cita, Llamar de regreso". Solo si aplica.' },
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
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook?secret=${process.env.VAPI_SERVER_SECRET ?? ''}`,
      metadata: {
        agent_id: typedAgent.id,
        plan: typedAgent.plan,
        caller_number: phoneNumber,
      },
    },
  });
}

function buildTools(agent: VoiceAgent) {
  const tools: object[] = [];
  const f = agent.features;

  if (f.lead_qualification) {
    tools.push({
      type: 'function',
      function: {
        name: 'crear_lead',
        description: 'Registra un nuevo prospecto interesado en los servicios del negocio.',
        parameters: {
          type: 'object',
          properties: {
            nombre:    { type: 'string', description: 'Nombre completo del prospecto' },
            negocio:   { type: 'string', description: 'Nombre de su negocio o empresa' },
            giro:      { type: 'string', description: 'A qué se dedica su negocio' },
            servicio:  { type: 'string', description: 'Qué servicio necesita' },
            presupuesto: { type: 'string', description: 'Presupuesto aproximado' },
            timeline:  { type: 'string', description: 'Para cuándo lo necesita' },
            email:     { type: 'string', description: 'Correo electrónico' },
            whatsapp:  { type: 'string', description: 'Número de WhatsApp' },
          },
          required: ['nombre', 'servicio'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/crear-lead?agent_id=${agent.id}`,
      },
    });
  }

  if (f.appointment_booking) {
    const hasCalendar     = !!(agent as any).calendar_type;
    const hasCalComApi    = (agent as any).calendar_type === 'cal_com' && !!(agent as any).calendar_api_key;
    if (hasCalendar) {
      if (hasCalComApi) {
        tools.push({
          type: 'function',
          function: {
            name: 'consultar_disponibilidad',
            description: 'Consulta los horarios disponibles en el calendario antes de agendar. SIEMPRE llama a esta herramienta primero cuando un cliente quiera una cita, para poder ofrecerle opciones reales disponibles.',
            parameters: {
              type: 'object',
              properties: {
                fecha_inicio: { type: 'string', description: 'Fecha inicio del rango a consultar (YYYY-MM-DD). Opcional, por defecto hoy.' },
                fecha_fin:    { type: 'string', description: 'Fecha fin del rango a consultar (YYYY-MM-DD). Opcional, por defecto 7 días.' },
              },
              required: [],
            },
            serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/consultar-disponibilidad?agent_id=${agent.id}`,
          },
        });
      }

      tools.push({
        type: 'function',
        function: {
          name: 'agendar_cita_externa',
          description: hasCalComApi
            ? 'Confirma y registra la cita en el calendario. Llama DESPUÉS de consultar_disponibilidad y de que el cliente haya elegido un horario disponible. No uses fechas u horas que no estén en la lista de disponibles.'
            : 'Registra la cita del cliente y envía el link de reserva por WhatsApp para que confirme.',
          parameters: {
            type: 'object',
            properties: {
              nombre:           { type: 'string', description: 'Nombre completo del cliente' },
              servicio:         { type: 'string', description: 'Servicio o tipo de cita' },
              fecha:            { type: 'string', description: 'Fecha de la cita (YYYY-MM-DD)' },
              hora:             { type: 'string', description: 'Hora de la cita (HH:MM, 24h)' },
              email:            { type: 'string', description: 'Email del cliente (opcional)' },
              whatsapp_cliente: { type: 'string', description: 'WhatsApp del cliente para enviar confirmación' },
            },
            required: ['nombre', 'fecha', 'hora'],
          },
          serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/agendar-cita-externa?agent_id=${agent.id}`,
        },
      });
    } else {
      tools.push({
        type: 'function',
        function: {
          name: 'agendar_cita',
          description: 'Agenda, modifica o cancela una cita.',
          parameters: {
            type: 'object',
            properties: {
              accion:   { type: 'string', enum: ['agendar', 'modificar', 'cancelar'] },
              nombre:   { type: 'string', description: 'Nombre del cliente' },
              servicio: { type: 'string', description: 'Servicio o tipo de cita' },
              fecha:    { type: 'string', description: 'Fecha preferida (YYYY-MM-DD)' },
              hora:     { type: 'string', description: 'Hora preferida (HH:MM)' },
              telefono: { type: 'string', description: 'Teléfono de confirmación' },
            },
            required: ['accion', 'nombre', 'fecha'],
          },
          serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/agendar-cita?agent_id=${agent.id}`,
        },
      });
    }
  }

  if (f.existing_client_support || f.client_memory) {
    tools.push({
      type: 'function',
      function: {
        name: 'buscar_cliente',
        description: 'Busca información de un cliente existente por nombre o teléfono.',
        parameters: {
          type: 'object',
          properties: {
            identificador: { type: 'string', description: 'Nombre, teléfono o número de cliente' },
          },
          required: ['identificador'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/buscar-cliente?agent_id=${agent.id}`,
      },
    });
  }

  if (f.order_taking) {
    tools.push({
      type: 'function',
      function: {
        name: 'registrar_pedido',
        description: 'Registra un pedido recibido por teléfono.',
        parameters: {
          type: 'object',
          properties: {
            nombre:    { type: 'string', description: 'Nombre del cliente' },
            telefono:  { type: 'string', description: 'Teléfono del cliente' },
            items:     { type: 'string', description: 'Lista de productos y cantidades' },
            tipo:      { type: 'string', enum: ['entrega', 'recoger'], description: 'Entrega a domicilio o para recoger' },
            direccion: { type: 'string', description: 'Dirección si es entrega' },
            notas:     { type: 'string', description: 'Instrucciones especiales' },
          },
          required: ['nombre', 'items', 'tipo'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/registrar-pedido?agent_id=${agent.id}`,
      },
    });
  }

  if (f.smart_transfer) {
    tools.push({
      type: 'function',
      function: {
        name: 'notificar_transferencia',
        description: 'Notifica al equipo por WhatsApp antes de transferir la llamada. Llama a esta herramienta PRIMERO, luego usa transferir_llamada.',
        parameters: {
          type: 'object',
          properties: {
            nombre:  { type: 'string', description: 'Nombre del cliente' },
            motivo:  { type: 'string', description: 'Razón de la transferencia' },
            resumen: { type: 'string', description: 'Resumen breve de la llamada hasta ahora' },
          },
          required: ['motivo'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/notificar-transferencia?agent_id=${agent.id}`,
      },
    });

    if ((agent as any).transfer_number) {
      tools.push({
        type: 'transferCall',
        function: {
          name: 'transferir_llamada',
          description: 'Transfiere la llamada en tiempo real al equipo. Úsala DESPUÉS de notificar_transferencia.',
          parameters: { type: 'object', properties: {} },
        },
        destinations: [{
          type: 'number',
          number: (agent as any).transfer_number,
          message: 'Un momento por favor, te estoy comunicando con el equipo.',
        }],
        messages: [{
          type: 'request-start',
          content: 'Claro, con mucho gusto te comunico con el equipo ahora mismo.',
        }],
      });
    }
  }

  if (f.whatsapp_escalation) {
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
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/enviar-whatsapp-escalacion?agent_id=${agent.id}`,
      },
    });
  }

  return tools;
}
