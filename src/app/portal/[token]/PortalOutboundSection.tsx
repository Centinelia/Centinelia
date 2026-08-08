// Dead component removed. The UI now lives in OutboundSection.tsx / PortalContactsSection.tsx.
// Only the shared type shapes are kept because they are still imported as `type` from other files.

export interface OutboundAgent {
  token: string;
  name:  string;
  role?: string;
}

export interface OutboundCall {
  id: string;
  telefono: string;
  nombre?: string | null;
  motivo?: string | null;
  status: string;
  outcome?: string | null;
  attempt: number;
  wa_fallback_sent: boolean;
  next_retry_at?: string | null;
  scheduled_at: string;
  called_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}
