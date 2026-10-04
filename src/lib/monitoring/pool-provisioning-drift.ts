// Drift detector para orgs con agentes activos pero pool sin sembrar.
//
// Bug 2026-09-30 (AC Proyectos): la provisioning script (commit 24b35ff8) no
// insertó grant inicial en ops_ledger. Nami quedó `active=true` pero cada
// chat request golpeaba `consume_pool_ops` → newBalance<0 → ops-guard.ok=false
// → 429 → FAB "Ocurrió un error". Tomó ~2h diagnosticar. Camila no pudo
// chatear con Nami en su primer día.
//
// Este detector corre en Nash (o cron dedicado) y flag cualquier org que
// tenga voice_agents.active=true pero ledger balance <= 0 y `ai_ops_used > 0`
// (i.e. ya intentaron consumir). Con esto lo detectamos en <1h en lugar de
// esperar a que el owner reporte "no funciona".

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PoolProvisioningAnomaly {
  portal_email:   string;
  active_agents:  number;
  ledger_balance: number;
  ops_used:       number;
  reason:         'never_seeded' | 'exhausted_no_refill';
}

/**
 * Detecta orgs con provisioning incompleto (active agents + non-positive
 * ledger balance) o pool agotado sin refill. Retorna las que necesitan
 * atención humana.
 *
 * `never_seeded`: ledger nunca tuvo grant → cualquier consumo devuelve 429.
 * `exhausted_no_refill`: ledger sí tuvo grant pero se consumió todo y no
 *   hay refill programado.
 */
export async function detectPoolProvisioningAnomalies(
  supabase: SupabaseClient,
): Promise<PoolProvisioningAnomaly[]> {
  const anomalies: PoolProvisioningAnomaly[] = [];

  const { data: activeAgents } = await supabase
    .from('voice_agents')
    .select('portal_email, active')
    .eq('active', true)
    .not('portal_email', 'is', null);

  const byOrg = new Map<string, number>();
  for (const a of (activeAgents ?? []) as { portal_email: string }[]) {
    byOrg.set(a.portal_email, (byOrg.get(a.portal_email) ?? 0) + 1);
  }

  for (const [portalEmail, activeCount] of byOrg.entries()) {
    const { data: balance } = await supabase.rpc('get_ops_pool_balance', {
      p_portal_email: portalEmail,
    });
    const bal = typeof balance === 'number' ? balance : 0;
    if (bal > 0) continue;

    // Gate on `ops_used > 0` para evitar flagear orgs sin tráfico: test fixtures
    // zombie (Navi afterAll que falló), demos sin uso, orgs recién provisionadas
    // dentro de la ventana de seeding. Si nadie ha intentado consumir aún no hay
    // 429 ni dolor del cliente — alertar aquí sería ruido. Precedente 2026-10-03:
    // alerta de 20 orgs con 17 zombies.
    const { data: acct } = await supabase
      .from('account_ops')
      .select('ops_used')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    const opsUsed = (acct?.ops_used as number | undefined) ?? 0;
    if (opsUsed === 0) continue;

    const { data: hasGrant } = await supabase
      .from('ops_ledger')
      .select('id')
      .eq('portal_email', portalEmail)
      .in('kind', ['initial_grant', 'annual_grant', 'monthly_grant', 'topup'])
      .limit(1);

    anomalies.push({
      portal_email:   portalEmail,
      active_agents:  activeCount,
      ledger_balance: bal,
      ops_used:       opsUsed,
      reason:         (hasGrant?.length ?? 0) === 0 ? 'never_seeded' : 'exhausted_no_refill',
    });
  }

  return anomalies;
}
