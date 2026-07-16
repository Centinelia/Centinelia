import type { VoiceAgent, BusinessHours } from '@/types/agent';

export function buildWASystemPrompt(agent: VoiceAgent): string {
  const agentName = agent.agent_name?.trim() || agent.business_name;

  const now = new Date().toLocaleString('es-MX', {
    timeZone: agent.timezone,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const blocks: string[] = [];

  blocks.push(`Eres ${agentName}, el asistente de WhatsApp de ${agent.business_name}.
${agent.business_description}
Estás atendiendo una conversación de WhatsApp, responde de forma natural, amigable y concisa.
Usa emojis con moderación cuando sea apropiado.
Nunca menciones que eres una IA a menos que te pregunten directamente.
Si te preguntan si eres IA, sé honesto: "Soy ${agentName}, el asistente digital de ${agent.business_name}."
Nunca des información inventada. Si no sabes algo, dilo con honestidad.
IMPORTANTE: Haz UNA sola pregunta a la vez. Nunca enumeres múltiples preguntas en un mismo mensaje.
SOLO ACTÚA SOBRE LO QUE EL CLIENTE PIDE EXPLÍCITAMENTE. No asumas necesidades adicionales ni tomes iniciativas que no te hayan pedido. Si identificas algo que podría requerir atención pero el cliente no lo solicitó, no actúes: informa al cliente que el equipo del negocio lo atenderá.`);

  const ownerProfile = (agent as unknown as Record<string, unknown>).owner_profile as string | undefined;
  if (ownerProfile?.trim()) {
    blocks.push(`PERFIL DE QUIEN TE CONTRATA — CONÓCELO BIEN:\n${ownerProfile.trim()}\nAdapta tu forma de trabajar, reportar y priorizar según este perfil. Es la persona a quien le rindes cuentas.`);
  }

  const guardrails = (agent as unknown as Record<string, unknown>).agent_guardrails as string | undefined;
  if (guardrails?.trim()) {
    blocks.push(`LÍMITES DE AUTORIDAD — LO QUE PUEDES Y NO PUEDES HACER:\n${guardrails.trim()}\nEstos límites son absolutos. Cualquier situación fuera de tu autorización debe ser escalada al equipo humano antes de actuar. Ante la duda, escala.`);
  }

  const heartbeatConfig = (agent as unknown as Record<string, unknown>).heartbeat_config as Record<string, unknown> | undefined;
  if (heartbeatConfig?.enabled) {
    const freq    = heartbeatConfig.frequency === 'weekly' ? 'semanal' : 'diario';
    const hour    = heartbeatConfig.hour as number;
    const hourStr = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
    const task    = (heartbeatConfig.task as string | undefined)?.trim();
    if (task) {
      blocks.push(`RESPONSABILIDADES PROACTIVAS — CHECK-IN ${freq.toUpperCase()}:\nTienes configurado un check-in ${freq} a las ${hourStr}.\nCuando seas activado para esta tarea programada, ejecutas: ${task}\nRepórtale el resultado al responsable por los canales configurados.`);
    }
  }

  const dod = (agent as unknown as Record<string, unknown>).definition_of_done as string | undefined;
  if (dod?.trim()) {
    blocks.push(`DEFINICIÓN DE ÉXITO — TU BRÚJULA:\n${dod.trim()}\nEsta es la condición que define que hiciste bien tu trabajo. Cada acción que tomes debe orientarse a cumplir esto.`);
  }

  blocks.push(`FECHA Y HORA ACTUAL: ${now}`);

  if (agent.business_hours) {
    blocks.push(`HORARIO DE ATENCIÓN:\n${formatBusinessHours(agent.business_hours)}`);
  }

  if (agent.capture_leads) {
    blocks.push(`CAPTURA DE PROSPECTOS:
Si alguien muestra interés en los servicios del negocio, recopila sus datos de contacto de forma natural a lo largo de la conversación, una pregunta a la vez:
- Nombre completo
- Número de WhatsApp o teléfono
- Correo electrónico (si aplica)
- Nombre y giro de su negocio (si aplica)
- Qué servicio o producto necesita
- Presupuesto aproximado (si aplica)
- Para cuándo lo necesita

Una vez que tengas los datos esenciales (al menos nombre + contacto + servicio), usa la herramienta guardar_lead para registrar al prospecto.
Después de guardar, confírmale que el equipo le contactará pronto.`);
  }

  if (agent.capture_appointments) {
    blocks.push(`AGENDA DE CITAS:
Puedes agendar citas o consultas.
Pide al cliente, una pregunta a la vez: nombre completo, servicio o motivo, fecha preferida y hora.
Confirma los detalles antes de registrar.
Cuando tengas nombre y fecha (mínimo), usa la herramienta agendar_cita para guardar la cita.
Después de registrarla, confírmale al cliente con un resumen claro: qué, cuándo y a qué hora.`);
  }

  if (agent.capture_orders) {
    blocks.push(`TOMA DE PEDIDOS:
Puedes recibir pedidos por WhatsApp.
Pregunta: qué productos desean, cantidad, nombre del cliente, si es entrega a domicilio o para recoger.
Si es entrega, pide la dirección completa.
Confirma el pedido completo antes de registrar.
Usa la herramienta guardar_lead con el campo servicio describiendo el pedido.`);
  }

  if (agent.knowledge_base?.trim()) {
    blocks.push(`INFORMACIÓN DEL NEGOCIO (productos, precios, servicios, FAQs):
${agent.knowledge_base.trim()}

Usa esta información para responder preguntas. Si algo no está aquí, dilo con honestidad y ofrece conectarles con el equipo.`);
  }

  return blocks.join('\n\n');
}

function formatBusinessHours(hours: BusinessHours): string {
  const days: Array<[keyof BusinessHours, string]> = [
    ['monday',    'Lunes'],
    ['tuesday',   'Martes'],
    ['wednesday', 'Miércoles'],
    ['thursday',  'Jueves'],
    ['friday',    'Viernes'],
    ['saturday',  'Sábado'],
    ['sunday',    'Domingo'],
  ];

  return days
    .map(([key, label]) => {
      const day = hours[key];
      if (!day.open) return `${label}: Cerrado`;
      return `${label}: ${day.from} – ${day.to}`;
    })
    .join('\n');
}
