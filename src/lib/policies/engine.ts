import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type PolicyResult =
  | { allowed: true;  provider: string | null }
  | { allowed: false; message: string };

interface CheckParams {
  agentId:    string;
  capability: string;
  action:     string;
  supabase:   SupabaseClient;
  details?:   Record<string, unknown>;
}

// capability → human-readable name for error messages
const CAPABILITY_NAMES: Record<string, string> = {
  email:    'correo',
  files:    'archivos',
  phone:    'llamadas salientes',
  calendar: 'calendario',
  crm:      'CRM',
};

export async function checkPolicy({
  agentId, capability, action, supabase, details = {},
}: CheckParams): Promise<PolicyResult> {
  const { data: policy } = await supabase
    .from('agent_policies')
    .select('enabled, preferred_provider, requires_approval, audit_log')
    .eq('agent_id', agentId)
    .eq('capability', capability)
    .maybeSingle();

  // No row = default allow, default audit
  const enabled           = policy?.enabled            ?? true;
  const requiresApproval  = policy?.requires_approval  ?? false;
  const shouldAudit       = policy?.audit_log          ?? true;
  const preferredProvider = (policy?.preferred_provider as string | null) ?? null;

  let status: 'completed' | 'blocked' | 'pending_approval' = 'completed';
  let allowed = true;
  let message = '';

  if (!enabled) {
    status  = 'blocked';
    allowed = false;
    const label = CAPABILITY_NAMES[capability] ?? capability;
    message = `El agente no tiene permiso para usar ${label}. El administrador puede habilitarlo en el portal → Políticas.`;
  } else if (requiresApproval) {
    status  = 'pending_approval';
    allowed = false;
    message = `Esta acción requiere aprobación del administrador antes de ejecutarse. La solicitud ha sido registrada.`;
  }

  // Audit log — fire and forget, never block execution on failure
  if (shouldAudit) {
    void supabase
      .from('policy_audit_log')
      .insert({ agent_id: agentId, capability, action, details, status });
  }

  if (!allowed) return { allowed: false, message };
  return { allowed: true, provider: preferredProvider };
}

// Map from tool name to capability string
export const TOOL_CAPABILITIES: Record<string, string> = {
  send_email:           'email',
  search_files:         'files',
  read_file:            'files',
  save_to_drive:        'files',
  organize_files:       'files',
  trigger_outbound_call:'phone',
};
