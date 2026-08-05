/**
 * Graph engineering — DAG editable de handoffs entre meerkats.
 *
 * 2 helpers:
 *   isHandoffAllowed(from, to, tool, portalEmail) → boolean
 *     Consulta meerkat_handoff_edges. Devuelve false SOLO cuando hay un edge
 *     explícito con enabled=false. Default: true (backward compatible).
 *
 *   recordMeerkatHandoff(...) → void (fire-and-forget)
 *     Escribe una fila en meerkat_handoff_log cada vez que ocurre un handoff.
 *     Alimenta el dashboard admin del DAG.
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type HandoffTool = 'consultar_agente' | 'delegar_tarea';

/**
 * Devuelve false si hay un edge explícito deshabilitado.
 * Precedencia: org-specific > global. Si el más específico está deshabilitado, bloquea.
 */
export async function isHandoffAllowed(args: {
  supabase:    SupabaseClient;
  fromMeerkat: string;
  toMeerkat:   string;
  tool:        HandoffTool;
  portalEmail: string | null;
}): Promise<{ allowed: boolean; reason?: string }> {
  const { supabase, fromMeerkat, toMeerkat, tool, portalEmail } = args;

  const { data: edges } = await supabase
    .from('meerkat_handoff_edges')
    .select('portal_email, tool_name, enabled, reason')
    .eq('from_meerkat', fromMeerkat)
    .eq('to_meerkat', toMeerkat);

  if (!edges?.length) return { allowed: true };

  // Priority: org+tool > org+null > null+tool > null+null
  const scored = edges.map((e: Record<string, unknown>) => {
    let score = 0;
    if (e.portal_email === portalEmail) score += 2;
    if (e.tool_name === tool)           score += 1;
    if (e.tool_name === null && e.portal_email === null) score = -1; // baseline
    return { edge: e, score };
  }).sort((a, b) => b.score - a.score);

  const winner = scored[0]?.edge;
  if (!winner) return { allowed: true };

  const enabled = (winner as { enabled?: boolean }).enabled ?? true;
  const reason  = (winner as { reason?: string  }).reason;
  return { allowed: enabled, reason: enabled ? undefined : reason };
}

export interface HandoffRecordArgs {
  supabase:      SupabaseClient;
  portalEmail:   string;
  fromMeerkat:   string;
  toMeerkat:     string;
  tool:          HandoffTool;
  fromAgentId?:  string | null;
  toAgentId?:    string | null;
  taskSummary?:  string | null;
  outcome:       'success' | 'rejected' | 'failed';
  agentTaskId?:  string | null;
  metadata?:     Record<string, unknown>;
}

/** Fire-and-forget. */
export function recordMeerkatHandoff(args: HandoffRecordArgs): void {
  void (async () => {
    try {
      await args.supabase.from('meerkat_handoff_log').insert({
        portal_email:  args.portalEmail,
        from_meerkat:  args.fromMeerkat,
        to_meerkat:    args.toMeerkat,
        tool_name:     args.tool,
        from_agent_id: args.fromAgentId ?? null,
        to_agent_id:   args.toAgentId ?? null,
        task_summary:  args.taskSummary?.slice(0, 200) ?? null,
        outcome:       args.outcome,
        agent_task_id: args.agentTaskId ?? null,
        metadata:      args.metadata ?? null,
      });
    } catch (err) {
      console.warn('[handoff-dag] record failed:', err);
    }
  })();
}
