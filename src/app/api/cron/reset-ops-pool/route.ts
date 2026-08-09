import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';

// Resetea el pool mensual de ops cuando el ciclo cumple. Cubre el hueco que
// dejaba el flujo Stripe: el webhook de renovación llama a resetAiOps solo
// cuando Stripe emite invoice.paid — cuentas sin suscripción activa (dev,
// piloto, cortesía) acumulaban ops para siempre. Corría con Pneuma:
// Sofía llevaba 50 días sin reset y quedó en 343/100.
//
// Cuentas annual_prepaid se resetean en annual-contracts-lifecycle y no
// tocamos aquí.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today    = new Date().toISOString().slice(0, 10);

  // Orgs stripe cuyo pool_reset_date ya venció.
  const { data: due, error } = await supabase
    .from('organizations')
    .select('portal_email, pool_reset_date, monthly_ops_used, monthly_ops_pool')
    .eq('billing_model', 'stripe')
    .lte('pool_reset_date', today);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let reset = 0;
  const errors: string[] = [];

  for (const org of due ?? []) {
    const email    = org.portal_email as string;
    const usedBefore = (org.monthly_ops_used as number | null) ?? 0;
    const next     = nextPoolResetDate();

    // Reset atómico: contador org + atribución per-agente + próxima fecha
    const [orgUpd, agentUpd] = await Promise.all([
      supabase
        .from('organizations')
        .update({ monthly_ops_used: 0, pool_reset_date: next })
        .eq('portal_email', email),
      supabase
        .from('voice_agents')
        .update({ ai_ops_used: 0 })
        .eq('portal_email', email),
    ]);

    if (orgUpd.error || agentUpd.error) {
      errors.push(`${email}: ${orgUpd.error?.message ?? agentUpd.error?.message}`);
      continue;
    }

    reset++;
    console.log(`[reset-ops-pool] ${email}: ${usedBefore}→0 · próximo reset ${next}`);
  }

  return NextResponse.json({
    ok:         true,
    checked:    due?.length ?? 0,
    reset,
    errors:     errors.length ? errors : undefined,
  });
}

// Ciclo mensual = today + 30 días. No usamos "día 1 del mes" porque cada
// cuenta se activó en día distinto y queremos que el ciclo cuente desde
// activación (más justo que un cutoff calendario común).
function nextPoolResetDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}
