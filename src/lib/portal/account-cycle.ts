// Fuente única de verdad para el CICLO BILLING de una cuenta (portal_email).
// Toda alerta, UI o cálculo que muestre "días restantes", "próxima renovación"
// o "proyección a fin de ciclo" al cliente DEBE pasar por aquí. Nunca leer
// directo `voice_agents.minutes_reset_date` para cuentas con portal_email —
// ese campo queda stale (el cron `reset-minutes` solo actualiza
// `account_minutes.minutes_reset_date` para cuentas Stripe).
//
// Bug Tortillería 2026-10-12: pool-projection-alerts leía Nala.minutes_reset_date
// (2026-10-08, stale) y proyectaba cycleEnd = 2026-11-08 → "28 días restantes".
// La fuente correcta es account_minutes.minutes_reset_date = 2026-11-01 (día 1
// próximo mes, actualizado por reset-minutes cron). Con el divisor correcto la
// proyección cae de 110 min/día a 30 min/día y la alerta ni siquiera dispara.
//
// Semántica (CRÍTICA): `minutes_reset_date` representa la fecha del PRÓXIMO
// reset (futura = cycleEnd), consistente con nextResetDateInMexico().
// cycleStart se deriva restando 1 mes calendario.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccountCycle {
  resetDate:          string;
  cycleStart:         string;
  cycleEnd:           string;
  daysInCycle:        number;
  daysSinceReset:     number;
  daysLeftInCycle:    number;
  fromAccountMinutes: boolean;
}

export interface AccountCycleInput {
  accountResetDate?: string | null;
  agentResetDate?:   string | null;
  now?:              Date;
}

export function computeAccountCycle(input: AccountCycleInput): AccountCycle | null {
  const now        = input.now ?? new Date();
  const resetRaw   = (input.accountResetDate ?? input.agentResetDate ?? null);
  if (!resetRaw) return null;
  // Normalizamos a YYYY-MM-DD y parseamos en UTC — las fechas vienen de Supabase
  // como date (sin hora/tz); interpretarlas en tz local causa drift ±1 día.
  const resetIso = resetRaw.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(resetIso);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const cycleEndMs   = Date.UTC(y, mo - 1, d);
  const cycleStartMs = Date.UTC(y, mo - 2, d); // Date.UTC normaliza desbordes

  const dayMs           = 86400000;
  const daysInCycle     = Math.round((cycleEndMs - cycleStartMs) / dayMs);
  const daysSinceReset  = Math.max(1, Math.floor((now.getTime() - cycleStartMs) / dayMs));
  const daysLeftInCycle = Math.max(0, Math.ceil((cycleEndMs - now.getTime()) / dayMs));

  return {
    resetDate:          resetIso,
    cycleStart:         new Date(cycleStartMs).toISOString().slice(0, 10),
    cycleEnd:           new Date(cycleEndMs).toISOString().slice(0, 10),
    daysInCycle,
    daysSinceReset,
    daysLeftInCycle,
    fromAccountMinutes: !!input.accountResetDate,
  };
}

export async function loadAccountCycle(
  supabase:    SupabaseClient,
  portalEmail: string | null,
  fallback?:   { agentResetDate?: string | null },
  now?:        Date,
): Promise<AccountCycle | null> {
  let accountResetDate: string | null | undefined;
  if (portalEmail) {
    const { data } = await supabase
      .from('account_minutes')
      .select('minutes_reset_date')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    accountResetDate = (data as { minutes_reset_date?: string | null } | null)?.minutes_reset_date;
  }
  return computeAccountCycle({
    accountResetDate,
    agentResetDate: fallback?.agentResetDate ?? null,
    now,
  });
}
