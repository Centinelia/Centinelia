// WAAgent is deprecated — WhatsApp capabilities are now part of VoiceAgent.
// These supporting types are kept for the webhook and conversation logic.

export interface WAConversation {
  id: string;
  agent_id: string;
  customer_number: string;
  messages: WAMessage[];
  lead_captured: boolean;
  created_at: string;
  updated_at: string;
}

export interface WAMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export interface WACapturedLead {
  nombre?: string;
  whatsapp?: string;
  email?: string;
  negocio?: string;
  giro?: string;
  servicio?: string;
  presupuesto?: string;
  timeline?: string;
  notas?: string;
}
