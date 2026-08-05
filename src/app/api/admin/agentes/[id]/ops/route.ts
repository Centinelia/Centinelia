import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';

/**
 * Ajuste manual de tareas (ai_ops) a nivel cliente.
 * Similar a /minutes pero opera sobre ai_ops_used / ai_ops_limit en voice_agents,
 * bulk por portal_email (o legacy per-agent).
 *
 *   credit   → suma al ai_ops_limit del primer agente del pool
 *   debit    → suma al ai_ops_used  del primer agente del pool
 *   set_used → fija ai_ops_used a un valor exacto en el primer agente
 *
 * Nota: el modelo actual guarda ops per-agent. Como convención, el ajuste
 * manual del admin modifica el primer agente del pool; el consumo real
 * se sigue rastreando per-agent via consume_ai_ops RPC.
 */

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, ai_ops_used, ai_ops_limit')
    .eq('id', id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const currentUsed  = (agent.ai_ops_used  as number | null) ?? 0;
  const currentLimit = (agent.ai_ops_limit as number | null) ?? 0;

  let nextUsed  = currentUsed;
  let nextLimit = currentLimit;
  let ledgerAmount      = 0;
  let ledgerDescription = reason?.trim() || '';

  if (action === 'credit') {
    nextLimit = currentLimit + amount;
    ledgerAmount = amount;
    if (!ledgerDescription) ledgerDescription = `Crédito manual, ${amount} tareas acreditadas`;
  } else if (action === 'debit') {
    nextUsed = currentUsed + amount;
    ledgerAmount = -amount;
    if (!ledgerDescription) ledgerDescription = `Descuento manual, ${amount} tareas descontadas`;
  } else {
    const delta = amount - currentUsed;
    nextUsed = Math.max(0, amount);
    ledgerAmount = -delta;
    if (!ledgerDescription) ledgerDescription = `Corrección, uso ajustado a ${amount} tareas`;
  }

  const { error } = await supabase
    .from('voice_agents')
    .update({ ai_ops_used: nextUsed, ai_ops_limit: nextLimit })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Devolver el pool agregado del cliente para que el UI refresque
  let poolUsed  = nextUsed;
  let poolLimit = nextLimit;
  if (agent.portal_email) {
    const { data: poolAgents } = await supabase
      .from('voice_agents')
      .select('ai_ops_used, ai_ops_limit')
      .eq('portal_email', agent.portal_email);
    poolUsed  = (poolAgents ?? []).reduce((s, a) => s + ((a.ai_ops_used  as number | null) ?? 0), 0);
    poolLimit = (poolAgents ?? []).reduce((s, a) => s + ((a.ai_ops_limit as number | null) ?? 0), 0);
  }

  // Best-effort ledger audit trail (si la tabla existe; si no, seguimos)
  try {
    await supabase.from('ops_ledger').insert({
      agent_id:    id,
      amount:      ledgerAmount,
      description: ledgerDescription,
      source:      'ajuste',
    });
  } catch { /* tabla opcional */ }

  return NextResponse.json({ ops_used: poolUsed, ops_limit: poolLimit });
}
