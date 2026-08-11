import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { resumeVapiAgent } from '@/lib/vapi/control';
import { maybeNotifyPoolLoss } from '@/lib/billing/rollover-cap-notify';

const FIXED_PACKAGES: Record<number, number> = { 100: 1200, 200: 2400 };
const PRICE_PER_MIN = 12;
const IVA = 0.16;

function calcPrice(minutes: number): number {
  const base = FIXED_PACKAGES[minutes] ?? minutes * PRICE_PER_MIN;
  return Math.round(base * (1 + IVA));
}

export async function executeAutoRefill(
  agentId: string,
): Promise<{ ok: boolean; minutesAdded?: number; error?: string }> {
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, stripe_customer_id, portal_email, phone_number, vapi_agent_id, auto_refill_minutes')
    .eq('id', agentId)
    .single();

  if (!agent)                      return { ok: false, error: 'agent_not_found' };
  if (!agent.stripe_customer_id)   return { ok: false, error: 'no_stripe_customer' };

  const minutes   = agent.auto_refill_minutes ?? 100;
  const amountMxn = calcPrice(minutes);

  // Find the customer's most recently attached card
  const pms = await stripe.paymentMethods.list({ customer: agent.stripe_customer_id, type: 'card' });
  const pm  = pms.data[0];
  if (!pm) return { ok: false, error: 'no_payment_method' };

  // Idempotency key: one charge per agent per DAY-window (antes era por hora,
  // pero un cliente cruzando umbral 2 veces en misma hora podía disparar 2
  // cargos si Stripe cambiaba de intent — bug H5 audit). Con ventana diaria,
  // cualquier disparo repetido en el día reusa la key.
  const now    = new Date();
  const window = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const idempotencyKey = `auto_refill_${agentId}_${window}`;

  // Off-session charge — does NOT redirect the customer
  let pi;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount:         amountMxn * 100,
        currency:       'mxn',
        customer:       agent.stripe_customer_id,
        payment_method: pm.id,
        confirm:        true,
        off_session:    true,
        description:    `Auto-recarga ${minutes} min · ${agent.business_name}`,
        metadata: { type: 'auto_refill', agent_id: agentId, minutes: String(minutes) },
      },
      { idempotencyKey },
    );
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'stripe_error' };
  }

  if (pi.status !== 'succeeded') return { ok: false, error: `pi_status_${pi.status}` };

  // Fix T3 audit 2026-08-10: envolver ledger credit en try/catch. Si Stripe
  // charge OK + ledger fail = dinero cobrado sin acreditar (fraud risk crítico).
  // Ahora: platform_incident URGENT si divergen, evita throw silencioso.
  try {
    if (agent.portal_email) {
      const { error: ledErr } = await supabase.rpc('apply_ledger_entry', {
        p_portal_email: agent.portal_email,
        p_agent_id:     agentId,
        p_amount:       minutes,
        p_kind:         'auto_refill',
        p_reference_id: pi.id ?? null,
        p_description:  `Auto-recarga ${minutes} min · $${amountMxn.toLocaleString('es-MX')} MXN`,
      });
      if (ledErr) throw ledErr;
      // Reactivar solo el agente que se recargó (granularidad per-empleado)
      await supabase.from('voice_agents')
        .update({ active: true, billing_status: 'activo' }).eq('id', agentId);
      if (agent.phone_number && agent.vapi_agent_id) {
        await resumeVapiAgent(agent.phone_number, agent.vapi_agent_id);
      }
      if (agent.portal_email) {
        const { resetFallbackIfActive } = await import('./fallback-restore');
        await resetFallbackIfActive(supabase, agent.portal_email, agent.business_name ?? 'tu empleado');
      }
    } else {
      const { data: cur } = await supabase.from('voice_agents').select('minutes_included').eq('id', agentId).single();
      await supabase.from('voice_agents')
        .update({ minutes_included: (cur?.minutes_included ?? 0) + minutes, active: true, billing_status: 'activo' })
        .eq('id', agentId);
      if (agent.phone_number && agent.vapi_agent_id) {
        await resumeVapiAgent(agent.phone_number, agent.vapi_agent_id);
      }
      const { error: ledInsErr } = await supabase.from('minutes_ledger').insert({
        agent_id:    agentId,
        amount:      minutes,
        description: `Auto-recarga ${minutes} min · $${amountMxn.toLocaleString('es-MX')} MXN`,
        source:      'auto_recarga',
        kind:        'auto_refill',
      });
      if (ledInsErr) throw ledInsErr;
    }
  } catch (ledErr) {
    // MONEY-CRITICAL: charge succeeded (pi.status='succeeded') but ledger failed.
    // Insert URGENT incident para reconciliación manual + return error al caller
    // (fire-and-forget en caller no debe silenciar esto).
    const errMsg = ledErr instanceof Error ? ledErr.message : String(ledErr);
    console.error('[auto-refill] MONEY LEAK — charge OK but ledger failed', { agentId, pi_id: pi.id, err: errMsg });
    await supabase.from('platform_incidents').insert({
      title:                 `[URGENTE] Auto-refill money leak — Charge ${pi.id} OK pero ledger falló`,
      description:           `Stripe cobró $${amountMxn.toLocaleString('es-MX')} MXN al cliente pero la escritura al ledger falló.\nAgent: ${agentId}\nPaymentIntent: ${pi.id}\nMinutos que debieron acreditarse: ${minutes}\nError: ${errMsg}\n\nAcción manual: verificar si hay que aplicar ledger manualmente o refund en Stripe.`,
      priority:              'critical',
      source:                'error_log',
      source_id:             pi.id ?? null,
      affected_portal_email: agent.portal_email ?? null,
      status:                'open',
      assigned_to:           'owner',
    });
    return { ok: false, error: `ledger_failed_after_charge: ${errMsg}` };
  }

  return { ok: true, minutesAdded: minutes };
}

const OPS_PACKAGES: Record<number, number> = { 100: 800, 300: 2100 };
const PRICE_PER_OP = 8.5;

function calcOpsPrice(ops: number): number {
  const base = OPS_PACKAGES[ops] ?? Math.round(ops * PRICE_PER_OP);
  return Math.round(base * (1 + IVA));
}

export async function executeAutoRefillOps(
  agentId: string,
): Promise<{ ok: boolean; opsAdded?: number; error?: string }> {
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, stripe_customer_id, portal_email, auto_refill_ops_amount, ai_ops_limit')
    .eq('id', agentId)
    .single();

  if (!agent)                    return { ok: false, error: 'agent_not_found' };
  if (!agent.stripe_customer_id) return { ok: false, error: 'no_stripe_customer' };

  const ops       = (agent.auto_refill_ops_amount as number) ?? 100;
  const amountMxn = calcOpsPrice(ops);

  const pms = await stripe.paymentMethods.list({ customer: agent.stripe_customer_id, type: 'card' });
  const pm  = pms.data[0];
  if (!pm) return { ok: false, error: 'no_payment_method' };

  // Ventana diaria (ver comentario en executeAutoRefill arriba). Evita doble
  // cargo cuando el umbral se cruza varias veces el mismo día.
  const now    = new Date();
  const window = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const idempotencyKey = `auto_refill_ops_${agentId}_${window}`;

  let pi;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount:         amountMxn * 100,
        currency:       'mxn',
        customer:       agent.stripe_customer_id,
        payment_method: pm.id,
        confirm:        true,
        off_session:    true,
        description:    `Auto-recarga ${ops} tareas · ${agent.business_name}`,
        metadata: { type: 'auto_refill_ops', agent_id: agentId, ops: String(ops) },
      },
      { idempotencyKey },
    );
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'stripe_error' };
  }

  if (pi.status !== 'succeeded') return { ok: false, error: `pi_status_${pi.status}` };

  // Fix T3 audit 2026-08-10: envolver ledger credit en try/catch. Charge OK +
  // ledger fail = fraud risk (dinero cobrado sin acreditar). Platform_incident
  // URGENT si divergen.
  const currentLimit = (agent.ai_ops_limit as number) ?? 0;
  try {
    if (agent.portal_email) {
      const { data: org } = await supabase
        .from('organizations')
        .select('ops_ledger_enabled')
        .eq('portal_email', agent.portal_email)
        .maybeSingle();

      if (org?.ops_ledger_enabled) {
        const { error: ledErr } = await supabase.rpc('apply_ops_ledger_entry', {
          p_portal_email: agent.portal_email,
          p_agent_id:     agentId,
          p_amount:       ops,
          p_kind:         'auto_refill_ops',
          p_reference_id: pi.id ?? null,
          p_description:  `Auto-recarga ${ops} tareas · $${amountMxn.toLocaleString('es-MX')} MXN`,
        });
        if (ledErr) throw ledErr;
        await maybeNotifyPoolLoss(supabase, { portalEmail: agent.portal_email, referenceId: pi.id ?? null, resource: 'ops' });
      } else {
        // LEGACY: update directo a ai_ops_limit
        const { error: updErr } = await supabase
          .from('voice_agents')
          .update({ ai_ops_limit: currentLimit + ops })
          .eq('portal_email', agent.portal_email);
        if (updErr) throw updErr;
      }
    } else {
      // LEGACY: sin portal_email, update por agentId
      const { error: updErr } = await supabase
        .from('voice_agents')
        .update({ ai_ops_limit: currentLimit + ops })
        .eq('id', agentId);
      if (updErr) throw updErr;
    }
  } catch (ledErr) {
    const errMsg = ledErr instanceof Error ? ledErr.message : String(ledErr);
    console.error('[auto-refill-ops] MONEY LEAK — charge OK but ledger failed', { agentId, pi_id: pi.id, err: errMsg });
    await supabase.from('platform_incidents').insert({
      title:                 `[URGENTE] Auto-refill-ops money leak — Charge ${pi.id} OK pero ledger falló`,
      description:           `Stripe cobró $${amountMxn.toLocaleString('es-MX')} MXN pero ledger falló.\nAgent: ${agentId}\nPaymentIntent: ${pi.id}\nOps que debieron acreditarse: ${ops}\nError: ${errMsg}`,
      priority:              'critical',
      source:                'error_log',
      source_id:             pi.id ?? null,
      affected_portal_email: agent.portal_email ?? null,
      status:                'open',
      assigned_to:           'owner',
    });
    return { ok: false, error: `ledger_failed_after_charge: ${errMsg}` };
  }

  return { ok: true, opsAdded: ops };
}
