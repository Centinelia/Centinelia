import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { alertCronPartialFailure } from '@/lib/cron/alert-partial-failure';

export const dynamic = 'force-dynamic';

// Reconciliación semanal ledger vs cache (fix M3 audit 2026-08-10) +
// pool-vs-sum-per-agente drift (fix read-path fidelity 2026-08-11).
//
// Check 1 (M3): SUM(minutes_ledger.amount) por portal_email == account_minutes.minutes_balance
// Check 2 (nuevo): account_minutes.minutes_included == SUM(voice_agents.minutes_included WHERE active=true)
//   → cierra blindspot: cliente veía "Jornada sin minutos" en portal porque
//     cache tenía 0 pero agents individuales tenían minutos. Ver
//     [[feedback-audit-read-path-fidelity]].
//
// Ejecuta domingos 4am (después del cleanup-cancelled dominical 3am, para
// dar chance a que el archivo/purge ocurra primero y evitar false positives).

const DRIFT_THRESHOLD_MIN = 5;  // ± 5 min de diferencia es aceptable (redondeos)
const POOL_INCLUDED_THRESHOLD = 1;  // Diferencia > 1 en cap = anomalía real

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Sacar TODAS las orgs (no solo account_minutes). Un org con agents que
  //    tienen minutos individuales pero SIN row en account_minutes tampoco
  //    debería quedar sin cachear — este check lo caza.
  const { data: allOrgs } = await supabase
    .from('organizations')
    .select('portal_email');
  const orgEmails = (allOrgs ?? []).map(o => o.portal_email as string);

  const { data: accounts } = await supabase
    .from('account_minutes')
    .select('portal_email, minutes_balance, minutes_used, minutes_included');
  const acctByEmail = new Map(
    (accounts ?? []).map(a => [a.portal_email as string, a])
  );

  // Pre-fetch todos los voice_agents activos con minutos por email
  const { data: allAgents } = await supabase
    .from('voice_agents')
    .select('portal_email, minutes_included, active')
    .in('portal_email', orgEmails.length > 0 ? orgEmails : ['__none__']);
  const sumByEmail = new Map<string, number>();
  for (const a of (allAgents ?? [])) {
    if (a.active === false) continue;
    const em = a.portal_email as string;
    sumByEmail.set(em, (sumByEmail.get(em) ?? 0) + ((a.minutes_included as number) ?? 0));
  }

  const drifts: Array<{
    portal_email: string;
    ledger_sum:   number;
    cache_balance: number;
    delta:        number;
  }> = [];
  const poolIncludedDrifts: Array<{
    portal_email: string;
    cache_included: number;
    agents_sum:     number;
    delta:          number;
  }> = [];
  const errors: string[] = [];
  let checked = 0;

  for (const email of orgEmails) {
    try {
      const acct = acctByEmail.get(email);
      // ── Check 1: ledger sum vs cache balance ─────────────────────────────
      const { data: ledgerRows } = await supabase
        .from('minutes_ledger')
        .select('amount')
        .eq('portal_email', email);
      const ledgerSum = (ledgerRows ?? []).reduce((s, r) => s + ((r.amount as number) ?? 0), 0);
      const cacheBalance = (acct?.minutes_balance as number) ?? 0;
      const delta = ledgerSum - cacheBalance;
      checked++;

      if (Math.abs(delta) > DRIFT_THRESHOLD_MIN) {
        drifts.push({
          portal_email:  email,
          ledger_sum:    ledgerSum,
          cache_balance: cacheBalance,
          delta,
        });
      }

      // ── Check 2 (NUEVO): pool.minutes_included vs SUM(agents.minutes_included WHERE active) ──
      // Cliente veía "Jornada sin minutos" en portal aunque agents individuales tuvieran minutos:
      // cache included=0 mientras sum-per-agente > 0. Alertar cuando divergen.
      const agentsSum = sumByEmail.get(email) ?? 0;
      const cacheIncluded = (acct?.minutes_included as number) ?? 0;
      const poolDelta = cacheIncluded - agentsSum;
      if (Math.abs(poolDelta) > POOL_INCLUDED_THRESHOLD && (cacheIncluded === 0 || agentsSum === 0 || Math.abs(poolDelta) > cacheIncluded * 0.1)) {
        poolIncludedDrifts.push({
          portal_email:    email,
          cache_included:  cacheIncluded,
          agents_sum:      agentsSum,
          delta:           poolDelta,
        });
      }
    } catch (err) {
      errors.push(`${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2a. Alerta drifts ledger vs cache
  if (drifts.length > 0) {
    const summary = drifts.slice(0, 10).map(d =>
      `${d.portal_email}: ledger=${d.ledger_sum} cache=${d.cache_balance} Δ=${d.delta > 0 ? '+' : ''}${d.delta}`
    ).join('\n');
    await supabase.from('platform_incidents').insert({
      title:       `Ledger drift: ${drifts.length}/${checked} cuentas divergen`,
      description: [
        `Drift detectado en ${drifts.length} de ${checked} cuentas.`,
        `Umbral: ±${DRIFT_THRESHOLD_MIN} min.`,
        ``,
        `Primeras ${Math.min(10, drifts.length)}:`,
        summary,
        ``,
        `Sugerencias:`,
        `- Correr refresh_pool_cache(portal_email) por cada cliente afectado`,
        `- Investigar si algún UPDATE bypass el ledger`,
        `- Verificar RPC apply_ledger_entry y consume_pool_minutes en Supabase`,
      ].join('\n'),
      priority:    drifts.length > checked / 5 ? 'critical' : 'high',
      source:      'error_log',
      source_id:   `reconcile-ledger:${new Date().toISOString().slice(0, 10)}`,
      status:      'open',
      assigned_to: 'owner',
    });
  }

  // 2b. Alerta pool-vs-agents drift (NUEVO)
  if (poolIncludedDrifts.length > 0) {
    const summary = poolIncludedDrifts.slice(0, 10).map(d =>
      `${d.portal_email}: cache.included=${d.cache_included} agents.sum=${d.agents_sum} Δ=${d.delta > 0 ? '+' : ''}${d.delta}`
    ).join('\n');
    await supabase.from('platform_incidents').insert({
      title:       `Pool included drift: ${poolIncludedDrifts.length} orgs con account_minutes.minutes_included ≠ SUM(agents.minutes_included)`,
      description: [
        `Detectado ${poolIncludedDrifts.length} orgs con cap del pool cache divergiendo de suma de agents activos.`,
        `Este blindspot ocultó bugs en portal cliente (mostraba "Jornada sin minutos" con cache=0 aunque agents tuvieran minutos individuales).`,
        ``,
        `Primeras ${Math.min(10, poolIncludedDrifts.length)}:`,
        summary,
        ``,
        `Acción:`,
        `- Correr refresh_pool_cache(portal_email) para sincronizar cache`,
        `- Si persiste, revisar RPCs setup_new_agent / renewal / plan_change que deben actualizar cache post-agent-change`,
      ].join('\n'),
      priority:    poolIncludedDrifts.length > checked / 5 ? 'high' : 'med',
      source:      'error_log',
      source_id:   `reconcile-pool-included:${new Date().toISOString().slice(0, 10)}`,
      status:      'open',
      assigned_to: 'owner',
    });
  }

  // 3. Errores de procesamiento (independiente de drifts)
  await alertCronPartialFailure(supabase, {
    cronName:  'reconcile-ledger',
    expected:  orgEmails.length,
    processed: checked,
    errors,
  });

  return NextResponse.json({
    ok:                true,
    checked,
    drifts:            drifts.length,
    pool_included_drifts: poolIncludedDrifts.length,
    threshold_balance: DRIFT_THRESHOLD_MIN,
    threshold_pool:    POOL_INCLUDED_THRESHOLD,
    errors:            errors.length,
  });
}
