/**
 * Graph engineering — helper para registrar decisiones humanas de forma unificada.
 *
 * Cada endpoint de approval/reject existente llama recordHumanDecision para
 * que quede en un ledger común (human_gate_decisions), permitiendo:
 *   - Dashboard admin unificado (/admin/human-gates).
 *   - Métricas: cuántas decisiones/día, por tipo, por actor.
 *   - Auditoría LFPDPPP / compliance: quién autorizó qué y cuándo.
 *   - Base futura para gate genérico (POST /api/human-gate/[token]).
 *
 * NO reemplaza la lógica existente — solo registra en paralelo.
 * Fire-and-forget: nunca bloquea la respuesta del endpoint.
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type GateType =
  | 'agent_task_plan'      // delegar_tarea → plan approval
  | 'ops_inbox'            // bandeja: aprobar/rechazar draft de correo
  | 'contract_send'        // enviar contrato al cliente
  | 'expense'              // aprobar gasto (Niva)
  | 'invoice'              // aprobar factura entrante
  | 'onboarding'           // dueño cierra onboarding
  | 'ml_publication';      // aprobar publicación Mercado Libre

export type Decision = 'approve' | 'reject' | 'edit' | 'send' | 'cancel';

export type Channel = 'email_magic_link' | 'portal_ui' | 'admin_ui' | 'chat' | 'whatsapp';

export interface HumanGateRecord {
  supabase:         SupabaseClient;
  gateType:         GateType;
  resourceId:       string;
  decision:         Decision;
  actor?:           string;                     // 'user', 'admin', etc.; default 'user'
  actorIdentifier?: string | null;              // portal_email
  channel:          Channel;
  reason?:          string | null;
  metadata?:        Record<string, unknown>;
  portalEmail?:     string | null;
}

/** Fire-and-forget. Falla silencioso — nunca bloquea la decisión. */
export function recordHumanDecision(rec: HumanGateRecord): void {
  void (async () => {
    try {
      await rec.supabase.from('human_gate_decisions').insert({
        gate_type:        rec.gateType,
        resource_id:      rec.resourceId,
        decision:         rec.decision,
        actor:            rec.actor ?? 'user',
        actor_identifier: rec.actorIdentifier ?? null,
        channel:          rec.channel,
        reason:           rec.reason ?? null,
        metadata:         rec.metadata ?? null,
        portal_email:     rec.portalEmail ?? null,
      });
    } catch (err) {
      console.warn('[human-gates] record failed:', err);
    }
  })();
}
