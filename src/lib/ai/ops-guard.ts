import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeAutoRefillOps } from '@/lib/billing/auto-refill';
import { consumePoolOps, fireOverageAlertIfNeeded } from '@/lib/annual-contracts/pool-consume';

export interface OpsResult {
  ok:    boolean;
  used:  number;
  limit: number;
}

export interface OpsMeta {
  source?:       string;   // 'heartbeat' | 'learn' | 'weekly_insights' | 'nox_brief' | 'agent_chat' | etc.
  reference_id?: string;   // task_id, report_id, meeting_id, etc.
  label?:        string;   // Texto legible corto para historial de consumo (fallback: source)
  context?:      string;   // Descripción completa expandida — se muestra al hacer hover en el historial
}

// Atomically checks and consumes AI ops from the account pool.
// 3 paths:
//   (a) annual_prepaid: descuenta del pool en organizations (nunca falla, tracks overage).
//   (b) stripe con portal_email: consume_ai_ops RPC con FOR UPDATE lock.
//   (c) stripe standalone: mismo RPC, account_email=null.
export async function consumeAiOp(agentId: string, count = 1, meta?: OpsMeta): Promise<OpsResult> {
  const supabase = createAdminClient();
  const logPayload = {
    source:       meta?.source       ?? 'unknown',
    reference_id: meta?.reference_id ?? null,
    label:        meta?.label        ?? null,
    context:      meta?.context      ?? null,
    count,
  };

  // Path (a): pool anual. Resolve org email primero, luego branch.
  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agentId)
    .maybeSingle();
  const portalEmail = (agentRow?.portal_email as string | null) ?? null;

  if (portalEmail) {
    const pool = await consumePoolOps(portalEmail, count, supabase);
    if (pool.consumed) {
      // E4: overage alert interno (fire and forget)
      void fireOverageAlertIfNeeded(portalEmail, {
        crossed_100_threshold: pool.crossed_100_threshold,
        crossed_120_threshold: pool.crossed_120_threshold,
      });
      // Audit log — usa after() para sobrevivir al fin de la response HTTP
      // en Vercel. Antes usaba `void` y el runtime mataba la promesa antes
      // de que el insert llegara a Supabase (por eso ai_ops_log llevaba
      // meses sin escrituras reales de producción).
      after(async () => {
        await supabase
          .from('ai_ops_log')
          .insert({ agent_id: agentId, portal_email: portalEmail, ...logPayload });
      });
      return { ok: true, used: pool.minutes_used_after, limit: pool.minutes_pool };
    }
  }

  // Path (b) y (c): Stripe legacy.
  const { data, error } = await supabase
    .rpc('consume_ai_ops', { p_agent_id: agentId, p_count: count })
    .single();

  if (error || !data) return { ok: false, used: 0, limit: 0 };

  const row = data as { ok: boolean; ops_used: number; ops_limit: number; account_email: string | null };

  if (row.ok && row.account_email) {
    const accountEmail = row.account_email;
    // Audit log — after() garantiza que corra post-response sin que Vercel
    // mate la promesa (bug histórico: los void supabase.insert nunca
    // llegaban a Supabase, dejando ai_ops_log vacío en producción).
    after(async () => {
      await supabase
        .from('ai_ops_log')
        .insert({ agent_id: agentId, portal_email: accountEmail, ...logPayload });
    });

    // Auto-refill: dispara cuando remaining acaba de cruzar el threshold
    const remaining = row.ops_limit - row.ops_used;
    const prevRemaining = remaining + count;
    after(async () => {
      const { data: cfg } = await supabase
        .from('voice_agents')
        .select('auto_refill_ops_enabled, auto_refill_ops_threshold, stripe_customer_id')
        .eq('id', agentId)
        .single();
      const threshold = (cfg?.auto_refill_ops_threshold as number) ?? 50;
      if (cfg?.auto_refill_ops_enabled && cfg?.stripe_customer_id && prevRemaining >= threshold && remaining < threshold) {
        await executeAutoRefillOps(agentId).catch(() => null);
      }
    });
  }

  return { ok: row.ok, used: row.ops_used, limit: row.ops_limit };
}

// Resetea el contador de ops del ciclo. Se llama en renovación mensual
// (billing webhook + cron reset-ops-pool). Resetea tanto el contador de la
// org (source of truth) como el per-agente (atribución).
export async function resetAiOps(portalEmail: string): Promise<void> {
  const supabase = createAdminClient();
  await Promise.all([
    supabase.from('organizations').update({ monthly_ops_used: 0 }).eq('portal_email', portalEmail),
    supabase.from('voice_agents').update({ ai_ops_used: 0 }).eq('portal_email', portalEmail),
  ]);
}

// Fija la cuota mensual de ops de la cuenta. El argumento aiOpsPerAgent viene
// de plans.ts (MONTHLY_CONFIG[plan][tier].aiOps) y mantiene semántica per-agente
// para no cambiar el pricing histórico: la cuenta paga aiOpsPerAgent × N.
// Escribe en dos lugares:
//   organizations.monthly_ops_pool  = source of truth del pool compartido
//   voice_agents.ai_ops_limit       = valor per-agente (fallback + UI legacy)
export async function setAiOpsLimit(portalEmail: string, aiOpsPerAgent: number): Promise<void> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('voice_agents')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', portalEmail);
  const agentCount = count ?? 0;
  const poolTotal = aiOpsPerAgent * Math.max(1, agentCount);
  await Promise.all([
    supabase.from('organizations').update({ monthly_ops_pool: poolTotal }).eq('portal_email', portalEmail),
    supabase.from('voice_agents').update({ ai_ops_limit: aiOpsPerAgent }).eq('portal_email', portalEmail),
  ]);
}
