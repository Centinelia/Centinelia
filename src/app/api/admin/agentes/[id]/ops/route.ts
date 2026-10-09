import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';

interface Params { params: Promise<{ id: string }> }

// credit  → suma al pool
// debit   → resta al pool
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { action, amount, reason } = await req.json() as {
    action: 'credit' | 'debit';
    amount: number;
    reason?: string;
  };

  if (!['credit', 'debit'].includes(action) || typeof amount !== 'number' || amount < 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fix T9 audit 2026-08-10: alertar ajustes >1000 tareas para review manual.
  if (amount > 1000) {
    await supabase.from('platform_incidents').insert({
      title:       `Admin adjustment grande — ${action} ${amount} tareas`,
      description: `Admin aplicó ajuste manual de ${amount} tareas (action=${action}) al agente ${id}. Reason: ${reason ?? '—'}. Revisar por posible error de entrada.`,
      priority:    'high',
      source:      'error_log',
      source_id:   `admin_adj_ops_${id}_${Date.now()}`,
      status:      'open',
      assigned_to: 'owner',
    });
  }
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', id)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const portalEmail = agent.portal_email ?? null;
  if (!portalEmail) {
    return NextResponse.json({ error: 'Agent sin portal_email (standalone no soportado post-cleanup)' }, { status: 400 });
  }

  const ledgerAmount = action === 'credit' ? amount : -amount;
  const description  = reason?.trim() || (action === 'credit' ? `Crédito manual: +${amount} tareas` : `Descuento manual: −${amount} tareas`);

  await supabase.rpc('apply_ops_ledger_entry', {
    p_portal_email: portalEmail,
    p_agent_id:     id,
    p_amount:       ledgerAmount,
    p_kind:         'admin_adjustment',
    p_reference_id: null,
    p_description:  description,
  });

  const { data: acct } = await supabase
    .from('account_ops')
    .select('ops_used, ops_included')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  return NextResponse.json({
    ops_used:     acct?.ops_used     ?? 0,
    ops_included: acct?.ops_included ?? 0,
  });
}
