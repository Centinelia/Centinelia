import type { WaMessagesPlan } from '@/lib/billing/plans';
export type { WaMessagesPlan };

// ─── Plans ────────────────────────────────────────────────────────────────────

export type Plan = 'comercial' | 'pro';
export type MinutesPlan = 'starter' | 'growth' | 'scale' | 'enterprise';
export type JornadaType = 'combinada' | 'minutos' | 'tareas';


// ─── Feature flags ────────────────────────────────────────────────────────────

export interface AgentFeatures {
  // Nivel 1, todos los planes
  receptionist: boolean;        // Info del negocio 24/7
  lead_qualification: boolean;  // Calificar prospectos → CRM
  appointment_booking: boolean; // Agendar / modificar / cancelar citas

  // Nivel 2, estándar y pro
  existing_client_support: boolean; // Consultar info del cliente en tiempo real
  smart_transfer: boolean;          // Transferir a humano + notificar por WhatsApp
  order_taking: boolean;            // Tomar pedidos y registrarlos

  // Nivel 3, solo pro
  multilingual: boolean;        // Español + inglés automático
  client_memory: boolean;       // Recordar historial del cliente

  // Fase 2 — llamadas salientes (por activar cuando Phase 2 lance)
  outbound_calls: boolean;      // Permite disparar llamadas salientes desde el portal

  // Vertical del cliente — controla qué secciones de Oficina se muestran
  vertical?: 'negocio' | 'gobierno';

  // IT Helpdesk — activa las tools de tickets, incidentes y directorio
  helpdesk?: boolean;

  // Nox — agente coordinador puro (sin voz, solo ops)
  is_coordinator?: boolean;

  // Meerkat personality + prompt flags
  meerkat_role_id?: string;
  lite_prompt?: boolean;
  skip_aup?: boolean;
  skip_recording_notice?: boolean;
  of_encuestas?: boolean;
}

// ─── Business hours ───────────────────────────────────────────────────────────

export interface BusinessHours {
  monday:    DaySchedule;
  tuesday:   DaySchedule;
  wednesday: DaySchedule;
  thursday:  DaySchedule;
  friday:    DaySchedule;
  saturday:  DaySchedule;
  sunday:    DaySchedule;
}

export interface DaySchedule {
  open:  boolean;
  from?: string; // "09:00"
  to?:   string; // "18:00"
}

// ─── Voice Agent ──────────────────────────────────────────────────────────────

export interface VoiceAgent {
  id: string;
  client_name: string;
  business_name: string;
  business_description: string;
  business_address?: string;
  business_phone_display: string; // número que el agente menciona verbalmente
  phone_number: string;           // número Twilio/Vapi asignado
  vapi_agent_id?: string;
  vapi_phone_number_id?: string;  // ID del número Vapi asignado (necesario para outbound)
  elevenlabs_voice_id?: string;
  plan: Plan;
  features: AgentFeatures;
  business_hours: BusinessHours;
  timezone: string;               // 'America/Monterrey'
  transfer_number?: string;       // número al que transferir en smart_transfer
  client_email?: string;          // email del cliente para alertas
  transfer_whatsapp?: string;     // WhatsApp del dueño para notificaciones
  calendar_url?: string;          // Calendly / Google Cal link para citas
  crm_webhook?: string;           // webhook externo del sistema del cliente
  knowledge_base?: string;        // catálogo, precios y FAQs del negocio (entrantes)
  outbound_knowledge_base?: string; // instrucciones específicas para llamadas salientes
  business_website?: string;      // URL del sitio web del negocio
  website_knowledge?: string;     // contenido extraído del sitio web (servidor lo llena)
  agent_name?: string;            // nombre propio del agente (solo Pro, default: Centinelia)
  giro_template?: string;         // template de industria: restaurante, consultorio, estetica, agencia, retail, general
  role?: string;                  // segundo rol del agente — nombre libre definido por el usuario (ej: "Procesador de facturas")
  role_knowledge_base?: string;   // base de conocimiento específica del segundo rol
  portal_token?: string;          // UUID único para el portal del cliente
  portal_email?: string;          // email del cliente; todos los agentes con el mismo email comparten el pool de minutos
  minutes_plan?: MinutesPlan;
  jornada_type?: JornadaType;
  minutes_included: number;
  minutes_used: number;
  minutes_reset_date: string;     // ISO date del próximo reset
  notify_whatsapp?: boolean;       // enviar resumen de llamada por WhatsApp al dueño (default false, opt-in)
  notify_email?: boolean;          // enviar notificación de lead/cita/pedido por email (default true)
  speech_style?: 'tu' | 'usted';        // trato al cliente: 'tu' (informal) | 'usted' (formal, default)
  missed_call_recovery?: boolean;       // devolver llamada automáticamente si queda sin contestar
  first_message?: string;          // primer mensaje del agente al contestar (personalizable)
  transfer_rules?: string;         // reglas de cuándo transferir la llamada a un humano
  owner_passphrase?: string | null; // frase secreta para que el dueño/equipo se identifique desde cualquier teléfono
  google_review_url?: string;      // link de reseñas de Google del negocio
  notion_client_id?: string;      // link al cliente en Pneuma Studio CRM
  notion_access_token?: string | null;    // Notion OAuth token for CRM integration
  notion_db_id?: string | null;           // Notion database ID for call logging
  contract_text?: string | null;          // custom contract override (null = use template)
  contract_accepted_at?: string | null;   // ISO timestamp of client acceptance
  contract_ip?: string | null;            // IP at acceptance
  // Email branding (custom domain sender)
  email_from?: string | null;
  email_domain_verified?: boolean | null;
  logo_url?: string | null;
  email_logo_url?: string | null;
  email_brand_color?: string | null;
  email_footer_text?: string | null;
  brand_website?: string | null;
  brand_address?: string | null;
  // AGENT Framework fields (sessions 18-23)
  organization_mission?: string | null;
  service_definition?: string | null;
  owner_profile?: string | null;
  definition_of_done?: string | null;
  agent_guardrails?: string | null;
  guardrails_learnings?: string | null;
  trust_stage?: number | null;
  heartbeat_config?: Record<string, unknown> | null;

  // Billing
  stripe_customer_id?: string | null;
  auto_refill_enabled?: boolean | null;
  auto_refill_threshold?: number | null;
  auto_refill_minutes?: number | null;
  auto_refill_ops_enabled?: boolean | null;
  auto_refill_ops_threshold?: number | null;
  auto_refill_ops_amount?: number | null;
  // Outbound role
  outbound_role?: string | null;
  // WhatsApp capabilities (Fase 2)
  wa_phone_number?: string;        // número Twilio asignado para WhatsApp
  capture_leads: boolean;          // capturar prospectos por WA
  capture_appointments: boolean;   // agendar citas por WA
  capture_orders: boolean;         // tomar pedidos por WA
  wa_messages_plan?: WaMessagesPlan;
  wa_messages_included: number;    // plan base + rollover del mes anterior
  wa_messages_used: number;        // mensajes usados este mes
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Call log ─────────────────────────────────────────────────────────────────

export type CallOutcome =
  | 'lead_created'
  | 'appointment_booked'
  | 'order_taken'
  | 'transferred'
  | 'info_provided'
  | 'unanswered'
  | 'escalated_whatsapp'
  | 'other';

export interface VoiceCall {
  id: string;
  agent_id: string;
  vapi_call_id?: string;
  caller_number: string;
  duration_seconds: number;
  transcript?: string;
  summary?: string;
  outcome: CallOutcome;
  lead_created: boolean;
  appointment_created: boolean;
  order_created: boolean;
  transferred: boolean;
  recording_url?: string;
  cost_usd?: number;
  self_eval_score?: number;
  self_eval_notes?: string;
  self_eval_at?: string;
  created_at: string;
}

// ─── Plan defaults ────────────────────────────────────────────────────────────

export const PLAN_FEATURES: Record<Plan, AgentFeatures> = {
  comercial: {
    receptionist:            true,
    lead_qualification:      true,
    appointment_booking:     true,
    existing_client_support: false,
    smart_transfer:          true,
    order_taking:            false,
    multilingual:            false,
    client_memory:           false,
    outbound_calls:          false,
  },
  pro: {
    receptionist:            true,
    lead_qualification:      true,
    appointment_booking:     true,
    existing_client_support: true,
    smart_transfer:          true,
    order_taking:            true,
    multilingual:            true,
    client_memory:           true,
    outbound_calls:          false,
  },
};

export const PLAN_MINUTES: Record<Plan, number> = {
  comercial: 300,
  pro:       300,
};

export const PLAN_LABELS: Record<Plan, string> = {
  comercial: 'Empleado Centinelia',
  pro:       'Empleado Centinelia',
};

export const PLAN_CONCURRENT_CALLS: Record<Plan, number> = {
  comercial: 1,
  pro:       3,
};

export const FEATURE_LABELS: Record<keyof AgentFeatures, string> = {
  receptionist:            'Recepcionista 24/7',
  lead_qualification:      'Calificación de prospectos',
  appointment_booking:     'Agendamiento de citas',
  existing_client_support: 'Atención a clientes existentes',
  smart_transfer:          'Transferencia inteligente',
  order_taking:            'Toma de pedidos',
  multilingual:            'Multiidioma (ES + EN)',
  client_memory:           'Memoria de cliente',
  outbound_calls:          'Llamadas salientes',
  vertical:                '',
  helpdesk:                'Mesa de ayuda IT',
  is_coordinator:          'Coordinador de equipo',
  meerkat_role_id:         '',
  lite_prompt:             '',
  skip_aup:                '',
  skip_recording_notice:   '',
  of_encuestas:            '',
};
