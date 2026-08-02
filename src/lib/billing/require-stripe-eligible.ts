// Guard: bloquea operaciones de Stripe cuando la organización opera bajo
// contrato anual. La UI del portal esconde los botones correspondientes; esto
// es defense-in-depth para curl manual / bugs futuros donde se olvide agregar
// el callout en la UI.

import { createAdminClient } from '@/lib/supabase/admin';
import type { BillingModel } from '@/types/annual-contract';

export interface StripeEligibleOk    { ok: true;  billing_model: BillingModel }
export interface StripeEligibleBlock { ok: false; billing_model: BillingModel; reason: string; message: string; contact: string }
export type StripeEligibleResult = StripeEligibleOk | StripeEligibleBlock;

const CONTACT = 'hola@centinelia.mx';

export async function requireStripeEligible(portalEmail: string | null | undefined): Promise<StripeEligibleResult> {
  if (!portalEmail) return { ok: true, billing_model: 'stripe' };

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('billing_model')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  if (!org) return { ok: true, billing_model: 'stripe' };  // primer signup

  const model = (org.billing_model as BillingModel) ?? 'stripe';

  if (model === 'annual_prepaid') {
    return {
      ok:            false,
      billing_model: 'annual_prepaid',
      reason:        'annual_contract_active',
      message:       'Este cliente opera bajo contrato anual. Para agregar o modificar empleados, minutos o tareas, contacta a Centinelia.',
      contact:       CONTACT,
    };
  }
  if (model === 'expired') {
    return {
      ok:            false,
      billing_model: 'expired',
      reason:        'annual_contract_expired',
      message:       'El contrato anual de este cliente expiró. Para reactivar la oficina, contacta a Centinelia.',
      contact:       CONTACT,
    };
  }
  return { ok: true, billing_model: 'stripe' };
}
