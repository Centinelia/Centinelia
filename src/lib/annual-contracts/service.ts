// Service layer para contratos anuales prepagados.
// Encapsula la lógica de creación, activación, renovación, cancelación y
// consulta atómica de contratos. Las rutas API son thin wrappers sobre esto.

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  AnnualContract,
  CreateAnnualContractInput,
  ContractStatus,
} from '@/types/annual-contract';

type Supabase = ReturnType<typeof createAdminClient>;

export class AnnualContractError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AnnualContractError';
  }
}

// Suma 1 mes a una fecha ISO manteniendo el día si es posible.
// (start=2026-08-15 → next=2026-09-15). Postgres lo hace igual con
// interval '1 month' pero necesitamos calcularlo en JS al activar.
function addMonth(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z');
  const target = new Date(d);
  target.setUTCMonth(target.getUTCMonth() + 1);
  return target.toISOString().slice(0, 10);
}

// ── Read ────────────────────────────────────────────────────────────────────

export async function getContract(id: string, supabase?: Supabase): Promise<AnnualContract | null> {
  const sb = supabase ?? createAdminClient();
  const { data, error } = await sb
    .from('annual_contracts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as AnnualContract;
}

export async function listContracts(supabase?: Supabase): Promise<AnnualContract[]> {
  const sb = supabase ?? createAdminClient();
  const { data, error } = await sb
    .from('annual_contracts')
    .select('*')
    .order('end_date', { ascending: true });
  if (error) throw new AnnualContractError(error.message, 'list_failed');
  return (data ?? []) as AnnualContract[];
}

export async function getActiveContractForOrg(orgEmail: string, supabase?: Supabase): Promise<AnnualContract | null> {
  const sb = supabase ?? createAdminClient();
  const { data } = await sb
    .from('annual_contracts')
    .select('*')
    .eq('organization_email', orgEmail)
    .eq('status', 'active')
    .maybeSingle();
  return (data as AnnualContract | null) ?? null;
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createContract(
  input: CreateAnnualContractInput,
  createdBy: string,
  supabase?: Supabase,
): Promise<AnnualContract> {
  const sb = supabase ?? createAdminClient();

  // Verifica que la org exista
  const { data: org } = await sb
    .from('organizations')
    .select('portal_email, billing_model, active_contract_id')
    .eq('portal_email', input.organization_email)
    .single();
  if (!org) throw new AnnualContractError('Organización no encontrada', 'org_not_found');

  // Si activate=true y la org ya tiene contrato activo, error
  if (input.activate && org.billing_model === 'annual_prepaid') {
    throw new AnnualContractError(
      `La organización ya tiene un contrato activo (${org.active_contract_id})`,
      'already_active',
    );
  }

  // Verifica que el folio sea único
  const { data: existing } = await sb
    .from('annual_contracts')
    .select('id')
    .eq('contract_folio', input.contract_folio)
    .maybeSingle();
  if (existing) throw new AnnualContractError(`Folio ${input.contract_folio} ya existe`, 'folio_duplicate');

  // Insert
  const paymentStatus = input.payment_status ?? (input.payment_received_at ? 'received' : 'pending');
  const { data, error } = await sb
    .from('annual_contracts')
    .insert({
      organization_email:   input.organization_email,
      contract_folio:       input.contract_folio,
      status:               input.activate ? 'active' : 'draft',
      start_date:           input.start_date,
      end_date:             input.end_date,
      amount_mxn:           input.amount_mxn,
      monthly_minutes_pool: input.monthly_minutes_pool,
      monthly_ops_pool:     input.monthly_ops_pool,
      included_employees:   input.included_employees ?? null,
      invoice_folio:        input.invoice_folio ?? null,
      payment_status:       paymentStatus,
      payment_received_at:  input.payment_received_at ?? null,
      notes:                input.notes ?? null,
      created_by:           createdBy,
    })
    .select('*')
    .single();
  if (error) throw new AnnualContractError(error.message, 'insert_failed');

  const contract = data as AnnualContract;
  if (input.activate) {
    await applyActivation(contract, sb);
  }
  return contract;
}

// ── Activate ────────────────────────────────────────────────────────────────

// Transición draft → active. Cambia la org a annual_prepaid.
// NO cancela subs Stripe aquí — eso es responsabilidad del caller vía Stripe API.
export async function activateContract(id: string, supabase?: Supabase): Promise<AnnualContract> {
  const sb = supabase ?? createAdminClient();
  const contract = await getContract(id, sb);
  if (!contract) throw new AnnualContractError('Contrato no encontrado', 'not_found');
  if (contract.status === 'active') return contract;  // idempotente
  if (contract.status !== 'draft') {
    throw new AnnualContractError(`No se puede activar contrato en estado ${contract.status}`, 'invalid_state');
  }

  // Verifica que no haya otro active para la misma org
  const conflict = await getActiveContractForOrg(contract.organization_email, sb);
  if (conflict) {
    throw new AnnualContractError(
      `La organización ya tiene contrato activo ${conflict.contract_folio}`,
      'already_active',
    );
  }

  await sb
    .from('annual_contracts')
    .update({ status: 'active', payment_received_at: contract.payment_received_at ?? new Date().toISOString() })
    .eq('id', id);

  const activated = await getContract(id, sb);
  if (!activated) throw new AnnualContractError('Contrato no encontrado post-activación', 'not_found');
  await applyActivation(activated, sb);
  return activated;
}

// Aplica los efectos de activación en organizations + voice_agents.
async function applyActivation(contract: AnnualContract, sb: Supabase): Promise<void> {
  await sb
    .from('organizations')
    .update({
      billing_model:        'annual_prepaid',
      active_contract_id:   contract.id,
      monthly_minutes_used: 0,
      monthly_ops_used:     0,
      overage_minutes:      0,
      overage_ops:          0,
      pool_reset_date:      addMonth(contract.start_date),
    })
    .eq('portal_email', contract.organization_email);

  // Reset señalización de voice_agents: sin cuota individual, consumen del pool.
  await sb
    .from('voice_agents')
    .update({ minutes_used: 0, minutes_included: 0 })
    .eq('portal_email', contract.organization_email);
}

// ── Renew ──────────────────────────────────────────────────────────────────

// Crea nuevo contrato con start_date = end_date del anterior. El nuevo queda
// como draft hasta que el cron lifecycle lo auto-active al llegar su start_date
// (o se active manualmente antes desde admin).
export async function renewContract(
  previousContractId: string,
  overrides: Partial<CreateAnnualContractInput>,
  createdBy: string,
  supabase?: Supabase,
): Promise<AnnualContract> {
  const sb = supabase ?? createAdminClient();
  const prev = await getContract(previousContractId, sb);
  if (!prev) throw new AnnualContractError('Contrato previo no encontrado', 'not_found');

  const nextStart = prev.end_date;
  const nextEnd = (() => {
    const d = new Date(nextStart + 'T12:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
  })();

  return createContract(
    {
      organization_email:   prev.organization_email,
      contract_folio:       overrides.contract_folio ?? '',  // caller debe pasarlo
      start_date:           overrides.start_date ?? nextStart,
      end_date:             overrides.end_date ?? nextEnd,
      amount_mxn:           overrides.amount_mxn ?? prev.amount_mxn,
      monthly_minutes_pool: overrides.monthly_minutes_pool ?? prev.monthly_minutes_pool,
      monthly_ops_pool:     overrides.monthly_ops_pool ?? prev.monthly_ops_pool,
      included_employees:   overrides.included_employees ?? prev.included_employees,
      invoice_folio:        overrides.invoice_folio,
      payment_received_at:  overrides.payment_received_at,
      payment_status:       overrides.payment_status ?? 'pending',
      notes:                overrides.notes,
      activate:             false,  // renovaciones no auto-activan
    },
    createdBy,
    sb,
  );
}

// ── Cancel ──────────────────────────────────────────────────────────────────

// Cancela un contrato activo o draft. Regresa la org a Stripe (billing_model
// vuelve a 'stripe' y re-hidrata voice_agents.minutes_included desde el plan).
export async function cancelContract(
  id: string,
  reason: string,
  supabase?: Supabase,
): Promise<AnnualContract> {
  const sb = supabase ?? createAdminClient();
  const contract = await getContract(id, sb);
  if (!contract) throw new AnnualContractError('Contrato no encontrado', 'not_found');
  if (contract.status === 'cancelled') return contract;

  await sb
    .from('annual_contracts')
    .update({
      status:           'cancelled',
      cancelled_at:     new Date().toISOString(),
      cancelled_reason: reason,
    })
    .eq('id', id);

  // Si era el active de la org, regresa la org a stripe
  if (contract.status === 'active') {
    await sb
      .from('organizations')
      .update({
        billing_model:        'stripe',
        active_contract_id:   null,
        monthly_minutes_used: 0,
        monthly_ops_used:     0,
        overage_minutes:      0,
        overage_ops:          0,
        pool_reset_date:      null,
      })
      .eq('portal_email', contract.organization_email);
  }

  return (await getContract(id, sb))!;
}

// ── Update ──────────────────────────────────────────────────────────────────

const EDITABLE_FIELDS = new Set([
  'contract_folio',
  'end_date',
  'amount_mxn',
  'monthly_minutes_pool',
  'monthly_ops_pool',
  'included_employees',
  'invoice_folio',
  'invoice_pdf_url',
  'payment_status',
  'payment_received_at',
  'notes',
]);

export async function updateContract(
  id: string,
  patch: Partial<AnnualContract>,
  supabase?: Supabase,
): Promise<AnnualContract> {
  const sb = supabase ?? createAdminClient();
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (EDITABLE_FIELDS.has(k) && v !== undefined) clean[k] = v;
  }
  if (Object.keys(clean).length === 0) {
    const current = await getContract(id, sb);
    if (!current) throw new AnnualContractError('Contrato no encontrado', 'not_found');
    return current;
  }
  const { data, error } = await sb
    .from('annual_contracts')
    .update(clean)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new AnnualContractError(error.message, 'update_failed');
  return data as AnnualContract;
}
