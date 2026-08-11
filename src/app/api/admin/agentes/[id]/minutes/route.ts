import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';

interface Params { params: Promise<{ id: string }> }

// credit  → adds to minutes_included (client gains minutes)
// debit   → adds to minutes_used    (client loses minutes)
// set_used → sets minutes_used to exact value (correction)

export async function POST(req: NextRequest, { params }: Params) {
  // Fix T1 audit 2026-08-10: sin este gate CUALQUIERA podía tampering ledger
  // (endpoint expuesto sin auth). El route paralelo de ops ya lo tenía.
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { action, amount, reason } = await req.json() as {
    action: 'credit' | 'debit' | 'set_used';
    amount: number;
    reason?: string;
  };

  if (!['credit', 'debit', 'set_used'].includes(action) || typeof amount !== 'number' || amount < 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fix T9 audit 2026-08-10: alertar ajustes >500 min para review. Sirve como
  // sanity check contra typo (10 vs 100) y como registro de acciones grandes.
  if (amount > 500) {
    await supabase.from('platform_incidents').insert({
      title:       `Admin adjustment grande — ${action} ${amount} min`,
      description: `Admin aplicó ajuste manual de ${amount} min (action=${action}) al agente ${id}. Reason: ${reason ?? '—'}. Revisar por posible error de entrada.`,
      priority:    'high',
      source:      'error_log',
      source_id:   `admin_adj_min_${id}_${Date.now()}`,
      status:      'open',
      assigned_to: 'owner',
    });
  }

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('minutes_used, minutes_included, portal_email')
    .eq('id', id)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const portalEmail = agent.portal_email ?? null;
  let ledgerAmount = 0;
  let ledgerDescription = reason?.trim() || '';

  if (action === 'credit') {
    ledgerAmount = amount;
    if (!ledgerDescription) ledgerDescription = `Crédito manual: +${amount} min`;
  } else if (action === 'debit') {
    ledgerAmount = -amount;
    if (!ledgerDescription) ledgerDescription = `Descuento manual: −${amount} min`;
  } else {
    // set_used: ajustar 'consumo total' a un valor exacto. Se traduce a delta contra
    // el "used últimos 30d" actual del cache (representa consumo del ciclo activo).
    const { data: acctForSet } = portalEmail
      ? await supabase.from('account_minutes').select('minutes_used').eq('portal_email', portalEmail).single()
      : { data: { minutes_used: agent.minutes_used } };
    const currentUsed = acctForSet?.minutes_used ?? 0;
    const delta = amount - currentUsed;
    ledgerAmount = -delta; // más used = ledger negativo, menos used = ledger positivo
    if (!ledgerDescription) ledgerDescription = `Corrección: uso ajustado a ${amount} min`;
  }

  if (ledgerAmount !== 0) {
    if (portalEmail) {
      // Via ledger event-sourced (respeta cap 2x en credits, trigger refresca cache).
      await supabase.rpc('apply_ledger_entry', {
        p_portal_email: portalEmail,
        p_agent_id:     id,
        p_amount:       ledgerAmount,
        p_kind:         'admin_adjustment',
        p_reference_id: null,
        p_description:  ledgerDescription,
      });
    } else {
      // Legacy standalone agent — update directo a voice_agents + ledger legacy
      let update: Record<string, number> = {};
      if (ledgerAmount > 0) update = { minutes_included: agent.minutes_included + ledgerAmount };
      else                  update = { minutes_used:     agent.minutes_used     + (-ledgerAmount) };
      await supabase.from('voice_agents').update(update).eq('id', id);
      await supabase.from('minutes_ledger').insert({
        agent_id:    id,
        amount:      ledgerAmount,
        description: ledgerDescription,
        source:      'ajuste',
        kind:        'admin_adjustment',
      });
    }
  }

  // Devolver el estado actualizado
  const { data: finalAcct } = portalEmail
    ? await supabase.from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', portalEmail).single()
    : { data: null };
  const { data: finalAgent } = !portalEmail
    ? await supabase.from('voice_agents').select('minutes_used, minutes_included').eq('id', id).single()
    : { data: null };

  return NextResponse.json({
    minutes_used:     finalAcct?.minutes_used     ?? finalAgent?.minutes_used     ?? 0,
    minutes_included: finalAcct?.minutes_included ?? finalAgent?.minutes_included ?? 0,
  });
}
