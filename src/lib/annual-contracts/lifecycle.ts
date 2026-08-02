// Lifecycle del contrato anual: reset mensual del pool, recordatorios de
// renovación 60d y 15d, auto-expiración al día siguiente de end_date.
// Idempotente: reset marca pool_reset_date al próximo mes, reminders marcan
// booleanas para no re-enviar.

import { createAdminClient } from '@/lib/supabase/admin';
import type { AnnualContract } from '@/types/annual-contract';

type Supabase = ReturnType<typeof createAdminClient>;

function addMonth(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00Z').getTime();
  const b = new Date(toISO + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export interface LifecycleResult {
  pool_resets:              number;
  reminders_60d_sent:       string[];   // contract ids
  reminders_15d_sent:       string[];
  auto_expired:             string[];
}

// Ejecuta un tick del lifecycle sobre todos los contratos activos.
// Devuelve resumen para el response del cron.
export async function runLifecycleTick(
  supabase?: Supabase,
  now?: string,
): Promise<LifecycleResult> {
  const sb = supabase ?? createAdminClient();
  const today = now ?? todayISO();

  const result: LifecycleResult = {
    pool_resets:        0,
    reminders_60d_sent: [],
    reminders_15d_sent: [],
    auto_expired:       [],
  };

  const { data: activeContracts, error } = await sb
    .from('annual_contracts')
    .select('*')
    .eq('status', 'active');
  if (error || !activeContracts) return result;

  for (const c of activeContracts as AnnualContract[]) {
    // 1. Reset mensual del pool si toca
    const orgReset = await maybeResetPool(sb, c.organization_email, today);
    if (orgReset) result.pool_resets++;

    // 2. Auto-expiración si end_date < today
    if (daysBetween(today, c.end_date) < 0) {
      await autoExpire(sb, c);
      result.auto_expired.push(c.id);
      continue;
    }

    // 3. Recordatorios: 60d y 15d antes de expirar
    const daysToExpiry = daysBetween(today, c.end_date);
    if (daysToExpiry <= 60 && daysToExpiry >= 0 && !c.renewal_reminder_60d_sent) {
      await sb.from('annual_contracts')
        .update({ renewal_reminder_60d_sent: true })
        .eq('id', c.id);
      result.reminders_60d_sent.push(c.id);
      // El envío del correo lo hace el caller/cron (separación email vs state).
    }
    if (daysToExpiry <= 15 && daysToExpiry >= 0 && !c.renewal_reminder_15d_sent) {
      await sb.from('annual_contracts')
        .update({ renewal_reminder_15d_sent: true })
        .eq('id', c.id);
      result.reminders_15d_sent.push(c.id);
    }
  }

  return result;
}

// Resetea el pool si pool_reset_date <= today.
async function maybeResetPool(sb: Supabase, portalEmail: string, today: string): Promise<boolean> {
  const { data: org } = await sb
    .from('organizations')
    .select('pool_reset_date, billing_model')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  if (!org || org.billing_model !== 'annual_prepaid') return false;
  const resetDate = org.pool_reset_date as string | null;
  if (!resetDate) return false;
  if (daysBetween(today, resetDate) > 0) return false;   // reset date en el futuro

  await sb.from('organizations')
    .update({
      monthly_minutes_used: 0,
      monthly_ops_used:     0,
      overage_minutes:      0,
      overage_ops:          0,
      pool_reset_date:      addMonth(resetDate),
    })
    .eq('portal_email', portalEmail);

  return true;
}

// Marca contrato como expired y cambia billing_model de la org.
async function autoExpire(sb: Supabase, contract: AnnualContract): Promise<void> {
  await sb.from('annual_contracts')
    .update({ status: 'expired' })
    .eq('id', contract.id);

  await sb.from('organizations')
    .update({
      billing_model:      'expired',
      active_contract_id: null,
    })
    .eq('portal_email', contract.organization_email);
}

// Auto-activa contratos en draft cuyo start_date llegó (permite renovaciones
// programadas con anticipación).
export async function activateScheduledDrafts(supabase?: Supabase, now?: string): Promise<string[]> {
  const sb = supabase ?? createAdminClient();
  const today = now ?? todayISO();

  const { data: drafts } = await sb
    .from('annual_contracts')
    .select('*')
    .eq('status', 'draft')
    .lte('start_date', today);

  const activated: string[] = [];
  for (const draft of (drafts ?? []) as AnnualContract[]) {
    // Verifica que no exista active para la org (podría haber un anterior aún vigente)
    const { data: activeExisting } = await sb
      .from('annual_contracts')
      .select('id, end_date')
      .eq('organization_email', draft.organization_email)
      .eq('status', 'active')
      .maybeSingle();

    if (activeExisting && daysBetween(today, activeExisting.end_date as string) >= 0) {
      // Contrato anterior aún vigente; auto-expira el anterior si su end_date ya pasó
      // ya lo maneja el paso principal. Skippea por ahora.
      continue;
    }

    // Si hay uno anterior expirable, primero lo expira
    if (activeExisting) {
      await sb.from('annual_contracts').update({ status: 'expired' }).eq('id', activeExisting.id);
    }

    // Activa el draft
    await sb.from('annual_contracts')
      .update({ status: 'active', payment_received_at: draft.payment_received_at ?? new Date().toISOString() })
      .eq('id', draft.id);

    await sb.from('organizations')
      .update({
        billing_model:        'annual_prepaid',
        active_contract_id:   draft.id,
        monthly_minutes_used: 0,
        monthly_ops_used:     0,
        overage_minutes:      0,
        overage_ops:          0,
        pool_reset_date:      addMonth(draft.start_date),
      })
      .eq('portal_email', draft.organization_email);

    activated.push(draft.id);
  }

  return activated;
}
