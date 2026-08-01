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
  const teamNumbers  = typedAgent.team_numbers ?? [];
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

  // Load minutes for both monthly enforcement and owner low-balance alert
  const { data: acctMins } = typedAgent.portal_email
    ? await supabase.from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', typedAgent.portal_email).single()
    : { data: null };
  const minutesIncluded = acctMins?.minutes_included ?? typedAgent.minutes_included ?? 0;
  const minutesUsedThisMonth = acctMins?.minutes_used ?? typedAgent.minutes_used ?? 0;
  const minutesRemain = minutesIncluded > 0
    ? Math.max(0, minutesIncluded - minutesUsedThisMonth)
    : Infinity;

  // Enforce monthly cap — block non-owner callers when plan minutes are exhausted
  if (!isOwner && minutesIncluded > 0 && minutesUsedThisMonth >= minutesIncluded) {
    const pausedMsg = `Gracias por llamar a ${typedAgent.business_name}. En este momento el servicio automatizado se encuentra temporalmente pausado. Por favor contacte al negocio directamente. Gracias.`;
    return NextResponse.json({
      assistant: {
        name: 'PausedByLimit',
        model: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          messages: [{ role: 'system', content: 'Solo di el mensaje que se te indica y despídete. No respondas ninguna pregunta.' }],
        },
        voice: {
          provider: '11labs',
          voiceId: typedAgent.elevenlabs_voice_id ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID,
          model: 'eleven_turbo_v2_5',
          stability: 0.45,
          similarityBoost: 0.75,
          style: 0.30,
          speed: 1.05,
          useSpeakerBoost: true,
          optimizeStreamingLatency: 4,
        },
        firstMessage: pausedMsg,
        endCallAfterSilenceSeconds: 5,
      },
    });
  }

  // Enforce optional daily cap — per-account minute cap set by admin
  const dailyCap = typedAgent.daily_minutes_cap ?? null;
  if (!isOwner && dailyCap && dailyCap > 0 && typedAgent.portal_email) {
    const { data: todayRow } = await supabase
      .rpc('account_minutes_today', { p_portal_email: typedAgent.portal_email })
      .single();
    const minutesToday = Number(todayRow ?? 0);
    if (minutesToday >= dailyCap) {
      const dailyMsg = `Gracias por llamar a ${typedAgent.business_name}. En este momento el servicio ha alcanzado su capacidad diaria. Por favor intente mañana o contacte al negocio directamente. Gracias.`;
      return NextResponse.json({
        assistant: {
          name: 'DailyCapReached',
          model: {
            provider: 'anthropic',
            model: 'claude-haiku-4-5-20251001',
            messages: [{ role: 'system', content: 'Solo di el mensaje que se te indica y despídete. No respondas ninguna pregunta.' }],
          },
          voice: {
            provider: '11labs',
            voiceId: typedAgent.elevenlabs_voice_id ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID,
            model: 'eleven_turbo_v2_5',
            stability: 0.45,
            similarityBoost: 0.75,
            style: 0.30,
            speed: 1.05,
            useSpeakerBoost: true,
            optimizeStreamingLatency: 4,
          },
          firstMessage: dailyMsg,
          endCallAfterSilenceSeconds: 5,
        },
      });
    }
  }

  const LOW_MINS_THRESHOLD = Math.max(30, minutesIncluded * 0.20);
  const minsLow = isOwner && minutesIncluded > 0 && minutesRemain <= LOW_MINS_THRESHOLD;

  // Load active surveys with auto_apply and inject questions into the prompt
  let surveyPrompt = '';
  {
    const { data: activeSurveys } = await supabase
      .from('surveys')
      .select('id, nombre, descripcion, survey_questions(id, orden, texto, tipo, opciones, conditions)')
      .eq('agent_id', typedAgent.id)
      .eq('activa', true)
      .eq('auto_apply', true)
      .contains('triggers', ['end_of_inbound_call'])
      .limit(3);

    if (activeSurveys?.length) {
      const blocks: string[] = [];
      for (const s of activeSurveys) {
        const questions = ((s as Record<string, unknown>).survey_questions as Array<{ id: string; orden: number; texto: string; tipo: string; opciones: string[] | null; conditions: { if_rating_lte?: number; if_answer?: string; then_say?: string } | null }> | null) ?? [];
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
            const cond = q.conditions;
            let condLine = '';
            if (cond?.then_say?.trim()) {
              if (cond.if_rating_lte != null) {
                condLine = `\n     → Si responde ${cond.if_rating_lte} o menos, di exactamente: "${cond.then_say.trim()}"`;
              } else if (cond.if_answer) {
                condLine = `\n     → Si responde "${cond.if_answer}", di exactamente: "${cond.then_say.trim()}"`;
              }
            }
            return `  ${q.orden}. ${q.texto}${hint}${condLine}`;
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

  // Check if QuickBooks is connected for this account
  let qbConnected = false;
  if (typedAgent.portal_email) {
    const { data: qbRow } = await supabase
      .from('qb_integrations')
      .select('realm_id')
      .eq('portal_email', typedAgent.portal_email)
      .maybeSingle();
    qbConnected = !!qbRow?.realm_id;
  }

  const systemPrompt = await buildSystemPrompt(typedAgent, null, typedAgent.portal_email ?? undefined, supabase) + (teamCallerContext || callerContext) + surveyPrompt +
    (minsLow ? `\n\nAVISO INTERNO: Al inicio de esta llamada, antes de atender cualquier solicitud, avisa al dueño que le quedan ${minutesRemain} minutos este mes (de ${minutesIncluded} incluidos). Dilo de forma natural y breve, en una sola frase. Ejemplo: "Por cierto, te quedan ${minutesRemain} minutos este mes, puedes comprar más desde el portal." Luego atiende su solicitud normalmente.` : '');
  const tools = buildTools(typedAgent, qbConnected);

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
        stability: 0.35,
        similarityBoost: 0.75,
        style: 0.40,
        speed: 0.98,
        useSpeakerBoost: true,
        optimizeStreamingLatency: 3,
        chunkPlan: {
          enabled: true,
          minCharacters: 25,
          punctuationBoundaries: ['.', '!', '?'],
        },
      },
      firstMessage,
      endCallMessage: 'Hasta luego, que tenga un excelente día.',
      endCallPhrases: ['hasta luego', 'hasta pronto', 'que tenga un excelente día', 'que tenga buen día', 'adiós', 'fue un placer atenderle'],
      transcriber: {
        provider: 'deepgram',
        model: 'nova-3',
        language: typedAgent.features.multilingual ? 'multi' : 'es',
        smartFormat: false,
        endpointing: 150,
      },
      stopSpeakingPlan: {
        numWords: 3,
        voiceSeconds: 0.2,
      },
      backgroundSound: 'office',
      backchannelingEnabled: true,
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

function buildTools(agent: VoiceAgent, qbConnected = false) {
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
    const hasCalendar     = !!agent.calendar_type;
    const hasCalComApi    = agent.calendar_type === 'cal_com' && !!agent.calendar_api_key;
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

    if (agent.transfer_number) {
      tools.push({
        type: 'transferCall',
        function: {
          name: 'transferir_llamada',
          description: 'Transfiere la llamada en tiempo real al equipo. Úsala DESPUÉS de notificar_transferencia.',
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

  // Available to all agents: ask a sibling agent for info from their knowledge base
  tools.push({
    type: 'function',
    function: {
      name: 'consultar_agente',
      description: 'Consulta a un compañero del equipo digital cuando necesitas información que está fuera de tu área o de tu base de conocimiento. El compañero responde usando su propia especialidad y KB.',
      parameters: {
        type: 'object',
        properties: {
          rol:      { type: 'string', description: 'Nombre o rol del compañero a consultar. Ej: "Nox", "contabilidad", "soporte técnico".' },
          tarea:    { type: 'string', description: 'Qué necesitas que el compañero te responda o resuelva.' },
          contexto: { type: 'string', description: 'Contexto breve de la conversación con el cliente que ayude al compañero a responder mejor (opcional).' },
        },
        required: ['rol', 'tarea'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/consultar-agente?agent_id=${agent.id}`,
    },
  });

  // Available to all agents: delegate a task to a sibling agent
  tools.push({
    type: 'function',
    function: {
      name: 'delegar_tarea',
      description: 'Delega una tarea a un compañero del equipo digital para que la ejecute ahora mismo. El compañero usa sus propias herramientas y te reporta el resultado. Úsala cuando algo deba hacerse pero esté fuera de tu área o no puedas resolverlo en esta llamada.',
      parameters: {
        type: 'object',
        properties: {
          agente:           { type: 'string', description: 'Nombre o rol del compañero al que delegar. Ej: "Nox", "Nova", "contador".' },
          tarea:            { type: 'string', description: 'Descripción clara de lo que debe hacer el compañero.' },
          contexto:         { type: 'string', description: 'Contexto de la conversación que ayude al compañero a ejecutar mejor la tarea. Opcional.' },
          success_criteria: { type: 'string', description: 'Qué debe haber pasado para considerar la tarea completada. Si se define, el agente reintentará si no lo cumple.' },
          max_iterations:   { type: 'number', description: 'Intentos máximos para cumplir el criterio (1-5, default 3).' },
        },
        required: ['agente', 'tarea'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/delegar-tarea?agent_id=${agent.id}`,
    },
  });

  // Available to all agents: search files in connected Drive (Google Drive / OneDrive)
  tools.push({
    type: 'function',
    function: {
      name: 'buscar_archivo',
      description: 'Busca un archivo en el Drive conectado del negocio (Google Drive u OneDrive) por nombre o descripción. Devuelve el ID, nombre y tipo del archivo para usarlo como adjunto en enviar_correo.',
      parameters: {
        type: 'object',
        properties: {
          busqueda: { type: 'string', description: 'Nombre o descripción del archivo que buscas. Ej: "contrato de servicio", "catálogo de precios 2025".' },
        },
        required: ['busqueda'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/buscar-archivo?agent_id=${agent.id}`,
    },
  });

  // Available to all agents: read a file found with buscar_archivo
  tools.push({
    type: 'function',
    function: {
      name: 'leer_archivo',
      description: 'Lee el contenido de un archivo encontrado con buscar_archivo. Úsala para conocer el contenido de un documento y poder responder preguntas sobre él o resumirlo al cliente.',
      parameters: {
        type: 'object',
        properties: {
          file_id:   { type: 'string', description: 'ID del archivo obtenido de buscar_archivo.' },
          file_name: { type: 'string', description: 'Nombre del archivo con extensión.' },
          mime_type: { type: 'string', description: 'Tipo MIME del archivo. Ej: application/pdf, text/plain.' },
        },
        required: ['file_id', 'file_name'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/leer-archivo?agent_id=${agent.id}`,
    },
  });

  // Available to all agents: search the web for information not in KB or Drive
  tools.push({
    type: 'function',
    function: {
      name: 'buscar_en_web',
      description: 'Busca información en internet cuando no está en tu base de conocimiento ni en el Drive. Úsala para precios actuales, noticias, datos públicos o cualquier consulta que requiera información externa.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Términos de búsqueda en español o el idioma más apropiado.' },
        },
        required: ['query'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/buscar-en-web?agent_id=${agent.id}`,
    },
  });

  // Available to all agents: send email to client or any contact
  tools.push({
    type: 'function',
    function: {
      name: 'enviar_correo',
      description: 'Envía un correo electrónico al cliente u otro destinatario. Úsalo para enviar confirmaciones, información solicitada, cotizaciones, seguimientos o cualquier comunicación escrita que el cliente pida. Si el cliente pidió un documento, primero usa buscar_archivo para obtener el ID y luego adjúntalo aquí.',
      parameters: {
        type: 'object',
        properties: {
          to:                   { type: 'string', description: 'Dirección de correo del destinatario' },
          subject:              { type: 'string', description: 'Asunto del correo' },
          body:                 { type: 'string', description: 'Contenido del correo en texto plano' },
          attachment_file_id:   { type: 'string', description: 'ID del archivo a adjuntar, obtenido de buscar_archivo (opcional)' },
          attachment_file_name: { type: 'string', description: 'Nombre del archivo adjunto con extensión, ej: "catalogo.pdf" (opcional)' },
          attachment_mime_type: { type: 'string', description: 'Tipo MIME del archivo, ej: "application/pdf" (opcional)' },
        },
        required: ['to', 'subject', 'body'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/enviar-correo?agent_id=${agent.id}`,
    },
  });

  // Available to all agents: report a technical failure
  tools.push({
    type: 'function',
    function: {
      name: 'reportar_falla',
      description: 'Reporta una falla técnica del sistema Centinelia al equipo de soporte. Úsala cuando detectes un error real: timeout de herramienta, comportamiento inesperado, datos incorrectos o limitación técnica que impida tu trabajo.',
      parameters: {
        type: 'object',
        properties: {
          tipo:        { type: 'string', description: 'Categoría: "Bug de sistema", "Comportamiento inesperado", "Datos incorrectos", "Limitación técnica" u "Otro".' },
          descripcion: { type: 'string', description: 'Qué ocurrió, cuándo, y cuál debería ser el comportamiento correcto.' },
          contexto:    { type: 'string', description: 'Contexto de la llamada donde se detectó la falla (opcional).' },
        },
        required: ['tipo', 'descripcion'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/reportar-falla?agent_id=${agent.id}`,
    },
  });

  // crear_documento — generate a PDF document during the call
  tools.push({
    type: 'function',
    function: {
      name: 'crear_documento',
      description: 'Genera un documento PDF con el logo y colores del negocio y lo envía al correo del dueño. Usa template_type="proposal" para propuestas (incluye cliente y precio), "letter" para cartas formales, "factura" para facturas, "orden_compra" para órdenes de compra, "general" para cualquier otro documento.',
      parameters: {
        type: 'object',
        properties: {
          title:          { type: 'string', description: 'Título del documento' },
          content:        { type: 'string', description: 'Contenido. Usa # para secciones y ## para subsecciones.' },
          filename:       { type: 'string', description: 'Nombre del archivo sin extensión' },
          template_type:  { type: 'string', enum: ['general', 'proposal', 'letter', 'factura', 'orden_compra'], description: 'Tipo de plantilla' },
          client_name:    { type: 'string', description: 'Nombre del cliente (proposal, factura)' },
          client_email:   { type: 'string', description: 'Correo del cliente (proposal, factura)' },
          client_rfc:     { type: 'string', description: 'RFC del receptor (factura)' },
          total_price:    { type: 'string', description: 'Precio total. Ej: "$50,000 MXN" (proposal)' },
          validity_days:  { type: 'number', description: 'Días de validez (proposal)' },
          recipient_name: { type: 'string', description: 'Nombre del destinatario (letter)' },
          vendor_name:    { type: 'string', description: 'Nombre del proveedor (orden_compra)' },
          payment_terms:  { type: 'string', description: 'Condiciones de pago (factura, orden_compra)' },
          include_iva:    { type: 'boolean', description: 'Incluir IVA 16%' },
          items: {
            type: 'array',
            description: 'Conceptos (factura, orden_compra)',
            items: { type: 'object', properties: { descripcion: { type: 'string' }, cantidad: { type: 'number' }, precio_unitario: { type: 'number' } }, required: ['descripcion', 'cantidad', 'precio_unitario'] },
          },
        },
        required: ['title', 'content'],
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/exec/create_document?agent_id=${agent.id}`,
    },
  });

  // Outbound call — only for agents with outbound_calls feature
  if (agent.features.outbound_calls) {
    tools.push({
      type: 'function',
      function: {
        name: 'llamar_a',
        description: 'Realiza una llamada telefónica saliente a un número en nombre del dueño. Úsala cuando el dueño pida llamar a alguien durante la conversación.',
        parameters: {
          type: 'object',
          properties: {
            numero:  { type: 'string', description: 'Número de teléfono con código de país. Ej: +5218113333333' },
            nombre:  { type: 'string', description: 'Nombre del contacto a llamar' },
            mensaje: { type: 'string', description: 'Motivo de la llamada o mensaje para el contacto' },
          },
          required: ['numero', 'mensaje'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/llamar-a?agent_id=${agent.id}`,
      },
    });
  }

  // Surveys — only for agents with of_encuestas feature
  if (agent.features.of_encuestas) {
    tools.push({
      type: 'function',
      function: {
        name: 'registrar_encuesta',
        description: 'Registra las respuestas capturadas de una encuesta de satisfacción. Llámala cuando hayas recopilado las respuestas antes de cerrar la llamada.',
        parameters: {
          type: 'object',
          properties: {
            survey_id:    { type: 'string', description: 'ID de la encuesta activa (proporcionado en el prompt).' },
            respuestas:   { type: 'array', description: 'Lista de respuestas por pregunta.', items: { type: 'object', properties: { orden: { type: 'number' }, valor: { type: 'string' } }, required: ['orden', 'valor'] } },
            caller_number:{ type: 'string', description: 'Número del llamante (opcional).' },
            call_id:      { type: 'string', description: 'ID de la llamada Vapi (opcional).' },
          },
          required: ['survey_id', 'respuestas'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/registrar-encuesta?agent_id=${agent.id}`,
      },
    });
  }

  // Civic reports — for NARA (government/civic agents)
  const meerkatRole = agent.features.meerkat_role_id;
  if (meerkatRole === 'nara' || agent.features.civic_reports) {
    const execBase = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/exec`;
    tools.push(
      {
        type: 'function',
        function: {
          name: 'create_civic_report',
          description: 'Registra un nuevo reporte ciudadano (bache, luminaria, basura, agua, ruido, etc.) y genera un folio de seguimiento.',
          parameters: {
            type: 'object',
            properties: {
              category:      { type: 'string', enum: ['bache', 'luminaria', 'basura', 'agua', 'ruido', 'parque', 'transporte', 'otro'], description: 'Tipo de reporte' },
              description:   { type: 'string', description: 'Descripción del problema reportado' },
              location_text: { type: 'string', description: 'Dirección, colonia o intersección donde está el problema' },
              caller_name:   { type: 'string', description: 'Nombre del ciudadano (si lo proporcionó)' },
              caller_number: { type: 'string', description: 'Número telefónico del ciudadano' },
            },
            required: ['category', 'description'],
          },
          serverUrl: `${execBase}/create_civic_report?agent_id=${agent.id}`,
        },
      },
      {
        type: 'function',
        function: {
          name: 'lookup_civic_report',
          description: 'Consulta el estado de un reporte ciudadano por folio o por número de teléfono del ciudadano.',
          parameters: {
            type: 'object',
            properties: {
              folio:         { type: 'string', description: 'Número de folio del reporte. Ej: REP-2026-00001' },
              caller_number: { type: 'string', description: 'Teléfono del ciudadano para buscar todos sus reportes' },
            },
            required: [],
          },
          serverUrl: `${execBase}/lookup_civic_report?agent_id=${agent.id}`,
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_civic_report',
          description: 'Actualiza el estado o agrega notas a un reporte ciudadano existente.',
          parameters: {
            type: 'object',
            properties: {
              folio:  { type: 'string', description: 'Folio del reporte. Ej: REP-2026-00001' },
              status: { type: 'string', enum: ['abierto', 'en_proceso', 'resuelto', 'cerrado'], description: 'Nuevo estado del reporte' },
              notes:  { type: 'string', description: 'Notas internas de seguimiento' },
            },
            required: ['folio'],
          },
          serverUrl: `${execBase}/update_civic_report?agent_id=${agent.id}`,
        },
      },
    );
  }

  // Calendar tools — for agents with a connected calendar
  if (agent.calendar_type) {
    const execBase = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/exec`;
    tools.push(
      {
        type: 'function',
        function: {
          name: 'list_calendar_events',
          description: 'Consulta los eventos del calendario del dueño en un rango de fechas. Úsala para ver la agenda o verificar disponibilidad.',
          parameters: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Fecha y hora de inicio en ISO 8601. Ej: "2026-07-28T00:00:00"' },
              to:   { type: 'string', description: 'Fecha y hora de fin en ISO 8601. Ej: "2026-07-28T23:59:59"' },
            },
            required: ['from', 'to'],
          },
          serverUrl: `${execBase}/list_calendar_events?agent_id=${agent.id}`,
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_calendar_event',
          description: 'Crea un evento en el calendario del dueño.',
          parameters: {
            type: 'object',
            properties: {
              title:       { type: 'string', description: 'Título del evento' },
              start:       { type: 'string', description: 'Inicio en ISO 8601. Ej: "2026-07-28T10:00:00"' },
              end:         { type: 'string', description: 'Fin en ISO 8601. Ej: "2026-07-28T11:00:00"' },
              description: { type: 'string', description: 'Descripción o notas del evento (opcional)' },
              location:    { type: 'string', description: 'Lugar del evento (opcional)' },
              attendees:   { type: 'array', items: { type: 'string' }, description: 'Correos de invitados (opcional)' },
            },
            required: ['title', 'start', 'end'],
          },
          serverUrl: `${execBase}/create_calendar_event?agent_id=${agent.id}`,
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_calendar_event',
          description: 'Cancela un evento del calendario. Primero usa list_calendar_events para obtener el ID.',
          parameters: {
            type: 'object',
            properties: {
              event_id: { type: 'string', description: 'ID del evento a cancelar' },
            },
            required: ['event_id'],
          },
          serverUrl: `${execBase}/delete_calendar_event?agent_id=${agent.id}`,
        },
      },
    );
  }

  // create_contract_draft — for NOX and coordinator-type agents
  if (meerkatRole === 'nox' || agent.features.contract_drafts) {
    tools.push({
      type: 'function',
      function: {
        name: 'create_contract_draft',
        description: 'Crea un borrador de contrato de prestación de servicios. Úsala cuando el dueño pida preparar un contrato con un cliente.',
        parameters: {
          type: 'object',
          properties: {
            client_name:  { type: 'string', description: 'Nombre completo del cliente o razón social' },
            client_email: { type: 'string', description: 'Correo del cliente' },
            client_rfc:   { type: 'string', description: 'RFC del cliente (si se conoce)' },
            notes:        { type: 'string', description: 'Notas adicionales del contrato' },
            source_type:  { type: 'string', enum: ['llamada', 'correo', 'manual'], description: 'Origen del contrato' },
          },
          required: [],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/exec/create_contract_draft?agent_id=${agent.id}`,
      },
    });
  }

  // Drive write tools — NOX and NIVA
  if (meerkatRole === 'nox' || meerkatRole === 'niva') {
    const execBase = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/exec`;
    tools.push(
      {
        type: 'function',
        function: {
          name: 'save_to_drive',
          description: 'Guarda un documento generado (PDF, Excel, Word) en el Google Drive o OneDrive del negocio. Úsala después de crear_documento o crear_archivo.',
          parameters: {
            type: 'object',
            properties: {
              file_id:     { type: 'string', description: 'ID del archivo generado (obtenido de crear_documento o crear_archivo)' },
              filename:    { type: 'string', description: 'Nombre del archivo con extensión. Ej: "contrato-cliente.pdf"' },
              folder_name: { type: 'string', description: 'Nombre de la carpeta de destino en Drive (opcional, se usa la raíz si no se especifica)' },
            },
            required: ['file_id', 'filename'],
          },
          serverUrl: `${execBase}/save_to_drive?agent_id=${agent.id}`,
        },
      },
      {
        type: 'function',
        function: {
          name: 'crear_archivo',
          description: 'Crea un archivo Excel, Word o PowerPoint con el contenido indicado y lo guarda en Documentos. Para reportes y tablas usa Excel; para borradores y cartas usa Word; para presentaciones usa PowerPoint.',
          parameters: {
            type: 'object',
            properties: {
              format:   { type: 'string', enum: ['excel', 'word', 'powerpoint'], description: 'Formato del archivo' },
              title:    { type: 'string', description: 'Título del documento' },
              filename: { type: 'string', description: 'Nombre del archivo sin extensión (opcional)' },
              content:  { type: 'string', description: 'Contenido para Word/PowerPoint. Usa # para secciones.' },
              sheets: {
                type: 'array',
                description: 'Hojas para Excel. Cada hoja tiene nombre, encabezados y filas.',
                items: {
                  type: 'object',
                  properties: {
                    name:    { type: 'string' },
                    headers: { type: 'array', items: { type: 'string' } },
                    rows:    { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                  },
                  required: ['name', 'headers', 'rows'],
                },
              },
              slides: {
                type: 'array',
                description: 'Diapositivas para PowerPoint.',
                items: {
                  type: 'object',
                  properties: {
                    title:   { type: 'string' },
                    content: { type: 'string' },
                    bullets: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['title'],
                },
              },
            },
            required: ['format', 'title'],
          },
          serverUrl: `${execBase}/create_file?agent_id=${agent.id}`,
        },
      },
    );
  }

  // organize_files — NOX only (file/folder management)
  if (meerkatRole === 'nox') {
    tools.push({
      type: 'function',
      function: {
        name: 'organizar_drive',
        description: 'Mueve, renombra o crea carpetas en el Drive conectado del negocio. Úsala para mantener el Drive organizado según las instrucciones del dueño.',
        parameters: {
          type: 'object',
          properties: {
            action:      { type: 'string', enum: ['move', 'rename', 'create_folder'], description: 'Acción a realizar' },
            file_id:     { type: 'string', description: 'ID del archivo o carpeta (para move/rename)' },
            destination: { type: 'string', description: 'ID de la carpeta de destino (para move)' },
            new_name:    { type: 'string', description: 'Nuevo nombre (para rename)' },
            folder_name: { type: 'string', description: 'Nombre de la carpeta a crear (para create_folder)' },
          },
          required: ['action'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/exec/organize_files?agent_id=${agent.id}`,
      },
    });
  }

  // Prospecting tools — NIVA only
  if (meerkatRole === 'niva') {
    const execBase = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/exec`;
    tools.push(
      {
        type: 'function',
        function: {
          name: 'buscar_prospectos',
          description: 'Busca prospectos, clientes potenciales o información de mercado en internet. Devuelve URLs relevantes que puedes leer con leer_url para obtener detalles.',
          parameters: {
            type: 'object',
            properties: {
              topic:         { type: 'string', description: 'Qué tipo de prospectos o información buscar. Ej: "empresas de construcción en Monterrey"' },
              location:      { type: 'string', description: 'Ciudad, estado o región para acotar la búsqueda (opcional)' },
              keywords:      { type: 'array', items: { type: 'string' }, description: 'Palabras clave adicionales (opcional)' },
              research_type: { type: 'string', enum: ['general', 'local', 'competitor', 'industry'], description: 'Tipo de investigación (default: general)' },
            },
            required: ['topic'],
          },
          serverUrl: `${execBase}/search_leads?agent_id=${agent.id}`,
        },
      },
      {
        type: 'function',
        function: {
          name: 'leer_url',
          description: 'Lee el contenido de una página web. Úsala después de buscar_prospectos o buscar_en_web para obtener detalles de un resultado específico. Máximo 3 lecturas por llamada.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL completa de la página a leer. Ej: "https://empresa.com/contacto"' },
            },
            required: ['url'],
          },
          serverUrl: `${execBase}/read_url?agent_id=${agent.id}`,
        },
      },
    );
  }

  if (qbConnected) {
    tools.push({
      type: 'function',
      function: {
        name: 'qb_consultar_facturas',
        description: 'Consulta facturas en QuickBooks Online. Úsala cuando el cliente pregunte por facturas pendientes, saldo, o cuentas por cobrar.',
        parameters: {
          type: 'object',
          properties: {
            cliente:         { type: 'string', description: 'Nombre del cliente (opcional, si no se da trae todas las facturas pendientes)' },
            solo_pendientes: { type: 'boolean', description: 'true para solo facturas con saldo pendiente (default), false para todas' },
          },
          required: [],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/qb-consultar-facturas?agent_id=${agent.id}`,
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'qb_buscar_cliente',
        description: 'Busca un cliente en QuickBooks y muestra su saldo y facturas abiertas. Úsala cuando pregunten por el estado de cuenta de un cliente específico.',
        parameters: {
          type: 'object',
          properties: {
            nombre: { type: 'string', description: 'Nombre o razón social del cliente en QuickBooks' },
          },
          required: ['nombre'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/qb-buscar-cliente?agent_id=${agent.id}`,
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'qb_crear_factura',
        description: 'Crea una factura en QuickBooks. Confirma siempre los datos con el cliente antes de ejecutar. Consume 1 tarea.',
        parameters: {
          type: 'object',
          properties: {
            cliente_nombre:    { type: 'string', description: 'Nombre exacto del cliente en QuickBooks' },
            descripcion:       { type: 'string', description: 'Descripción del servicio o producto' },
            monto:             { type: 'number', description: 'Monto total de la factura' },
            fecha_vencimiento: { type: 'string', description: 'Fecha de vencimiento en formato YYYY-MM-DD (opcional)' },
          },
          required: ['cliente_nombre', 'descripcion', 'monto'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/qb-crear-factura?agent_id=${agent.id}`,
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'qb_registrar_pago',
        description: 'Registra un pago recibido en QuickBooks y lo aplica a la factura correspondiente. Confirma siempre los datos antes de ejecutar. Consume 1 tarea.',
        parameters: {
          type: 'object',
          properties: {
            cliente_nombre:  { type: 'string', description: 'Nombre del cliente que pagó' },
            monto:           { type: 'number', description: 'Monto recibido' },
            factura_numero:  { type: 'string', description: 'Número de factura específica a aplicar (opcional, si no se indica se aplica a la más antigua pendiente)' },
          },
          required: ['cliente_nombre', 'monto'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/qb-registrar-pago?agent_id=${agent.id}`,
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'qb_reporte_ingresos',
        description: 'Genera un reporte de ingresos, gastos y utilidad desde QuickBooks para un período determinado.',
        parameters: {
          type: 'object',
          properties: {
            periodo: {
              type: 'string',
              enum: ['este_mes', 'mes_pasado', 'este_año', 'año_pasado', 'este_trimestre', 'trimestre_pasado'],
              description: 'Período del reporte (default: este_mes)',
            },
          },
          required: [],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/qb-reporte-ingresos?agent_id=${agent.id}`,
      },
    });
  }

  // pedir_a_humano — disponible para agentes con human_handoff habilitado y trust_stage >= 2
  if (agent.features?.human_handoff_enabled !== false && (agent.trust_stage ?? 3) >= 2) {
    tools.push({
      type: 'function',
      function: {
        name: 'pedir_a_humano',
        description: `Pide a un humano del equipo del negocio: info que no tienes, una acción física, o confirmación de una decisión importante.

Úsala CUANDO:
- Necesitas datos/archivos que no están en Drive ni puedes obtener con otras tools
- Requiere una acción FÍSICA que solo un humano puede hacer (revisar stock, firmar documento en papel)
- Requiere aprobación de una decisión que excede tu autoridad

Para llamadas telefónicas:
- Si tienes minutos disponibles Y toda la info → usa trigger_outbound_call, NO pidas a humano
- Solo pide llamada a humano si: sin minutos, cliente pidió humano, o conversación delicada

NO la uses para:
- Info obtenible con search_files, buscar_en_web, o QB
- Cosas que puede hacer otro agente (usa delegate_task)
- Llamadas que puedes hacer tú (usa trigger_outbound_call primero)`,
        parameters: {
          type: 'object',
          properties: {
            type:         { type: 'string', enum: ['info', 'action', 'approval'] },
            target:       { type: 'string', enum: ['approver', 'owner', 'specific'] },
            target_email: { type: 'string' },
            title:        { type: 'string' },
            description:  { type: 'string' },
            urgency:      { type: 'string', enum: ['baja', 'media', 'alta'] },
            needed_by:    { type: 'string' },
          },
          required: ['type', 'target', 'title', 'description'],
        },
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/exec/pedir_a_humano?agent_id=${agent.id}`,
      },
    });
  }

  // Vapi requires serverUrl at tool top level, not inside the function object
  return tools.map(tool => {
    const t = tool as Record<string, unknown>;
    const fn = t.function as Record<string, unknown>;
    if (!fn || !fn.serverUrl) return tool;
    const { serverUrl, ...cleanFn } = fn;
    return { ...t, function: cleanFn, server: { url: serverUrl, headers: { 'x-vapi-secret': process.env.VAPI_SERVER_SECRET ?? '' } } };
  });
}
