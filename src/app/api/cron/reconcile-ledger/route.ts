import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { alertCronPartialFailure } from '@/lib/cron/alert-partial-failure';

export const dynamic = 'force-dynamic';

// Reconciliación semanal ledger vs cache (fix M3 audit 2026-08-10).
// Verifica que SUM(minutes_ledger.amount) por portal_email coincida con
// account_minutes.minutes_balance. Cualquier drift = bug (write directo al
// cache sin ledger, o RPC roto). Alerta a Nazre + platform_incident.
//
// Ejecuta domingos 4am (después del cleanup-cancelled dominical 3am, para
// dar chance a que el archivo/purge ocurra primero y evitar false positives).
//
// El mismo helper se puede extender fácilmente a ops_ledger vs monthly_ops_pool
// cuando H9 (cap 2× ops) esté completo.

const DRIFT_THRESHOLD_MIN = 5; // ± 5 min de diferencia es aceptable (redondeos)

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Sacar todos los accounts activos.
  const { data: accounts } = await supabase
    .from('account_minutes')
    .select('portal_email, minutes_balance, minutes_used, minutes_included');

  const drifts: Array<{
    portal_email: string;
    ledger_sum:   number;
    cache_balance: number;
    delta:        number;
  }> = [];
  const errors: string[] = [];
  let checked = 0;

  for (const acct of (accounts ?? [])) {
    const email = acct.portal_email as string;
    try {
      // Suma completa del ledger de este cliente (todos los kinds).
      const { data: ledgerRows } = await supabase
        .from('minutes_ledger')
        .select('amount')
        .eq('portal_email', email);
      const ledgerSum = (ledgerRows ?? []).reduce((s, r) => s + ((r.amount as number) ?? 0), 0);
      const cacheBalance = (acct.minutes_balance as number) ?? 0;
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
    } catch (err) {
      errors.push(`${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Reportar drifts si los hay
  if (drifts.length > 0) {
    const summary = drifts.slice(0, 10).map(d =>
      `${d.portal_email}: ledger=${d.ledger_sum} cache=${d.cache_balance} Δ=${d.delta > 0 ? '+' : ''}${d.delta}`
    ).join('\n');
    const description = [
      `Drift detectado en ${drifts.length} de ${checked} cuentas.`,
      `Umbral: ±${DRIFT_THRESHOLD_MIN} min.`,
      ``,
      `Primeras ${Math.min(10, drifts.length)}:`,
      summary,
      ``,
      `Sugerencias:`,
      `- Correr refresh_pool_cache(portal_email) por cada cliente afectado`,
      `- Investigar si algún UPDATE bypass el ledger (bug conocido: annual path pool-consume.ts:160)`,
      `- Verificar RPC apply_ledger_entry y consume_pool_minutes en Supabase`,
    ].join('\n');

    await supabase.from('platform_incidents').insert({
      title:       `Ledger drift: ${drifts.length}/${checked} cuentas divergen`,
      description,
      priority:    drifts.length > checked / 5 ? 'critical' : 'high',
      source:      'error_log',
      source_id:   `reconcile-ledger:${new Date().toISOString().slice(0, 10)}`,
      status:      'open',
      assigned_to: 'owner',
    });
  }

  // 3. Reportar errores de procesamiento (independiente de drifts)
  await alertCronPartialFailure(supabase, {
    cronName:  'reconcile-ledger',
    expected:  accounts?.length ?? 0,
    processed: checked,
    errors,
  });

  return NextResponse.json({
    ok:        true,
    checked,
    drifts:    drifts.length,
    threshold: DRIFT_THRESHOLD_MIN,
    errors:    errors.length,
  });
}
