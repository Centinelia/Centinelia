import type { VoiceAgent } from '@/types/agent';

export function buildOutboundSystemPrompt(
  agent: VoiceAgent,
  customerName?: string,
  motivo?: string,
): string {
  const agentName = agent.agent_name?.trim() || 'Centinelia';

  const now = new Date().toLocaleString('es-MX', {
    timeZone: agent.timezone,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const blocks: string[] = [];

  const callTarget = customerName ? `a ${customerName}` : 'a un cliente';
  const motivoLine = motivo ? `\nMotivo de esta llamada: ${motivo}` : '';

  blocks.push(
    `Eres ${agentName}, agente de ${agent.business_name}.
${agent.business_description}

Estás realizando una LLAMADA SALIENTE ${callTarget}.${motivoLine}

Preséntate con tu nombre y el nombre del negocio al inicio de la llamada.
Ve directo al punto: di el motivo de tu llamada en las primeras dos frases.
Sé cordial y conciso. No insistas si el cliente no tiene tiempo o no está interesado.
Si no puede atenderte ahora, pregunta cuándo sería buen momento para volver a llamar.
Nunca menciones que eres una IA a menos que te pregunten directamente.`
  );

  blocks.push(`FECHA Y HORA ACTUAL: ${now}`);

  if (agent.outbound_knowledge_base?.trim()) {
    blocks.push(
      `INSTRUCCIONES PARA ESTA CAMPAÑA:\n${agent.outbound_knowledge_base.trim()}`
    );
  }

  if (agent.knowledge_base?.trim()) {
    blocks.push(
      `INFORMACIÓN DEL NEGOCIO (referencia):\n${agent.knowledge_base.trim()}`
    );
  }

  return blocks.join('\n\n');
}
