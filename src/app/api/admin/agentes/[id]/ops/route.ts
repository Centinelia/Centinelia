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
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email, ai_ops_used, ai_ops_limit')
    .eq('id', id)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const portalEmail  = agent.portal_email ?? null;
  const ledgerAmount = action === 'credit' ? amount : -amount;
  const description  = reason?.trim() || (action === 'credit' ? `Credito manual: +${amount} tareas` : `Descuento manual: -${amount} tareas`);

  if (portalEmail) {
    const { data: org } = await supabase
      .from('organizations')
      .select('ops_ledger_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    if (org?.ops_ledger_enabled) {
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
  }

  // LEGACY: update directo a voice_agents
  const currentLimit = (agent.ai_ops_limit as number) ?? 0;
  const currentUsed  = (agent.ai_ops_used  as number) ?? 0;
  if (action === 'credit') {
    await supabase.from('voice_agents').update({ ai_ops_limit: currentLimit + amount }).eq('id', id);
  } else {
    await supabase.from('voice_agents').update({ ai_ops_used: currentUsed + amount }).eq('id', id);
  }

  const { data: after } = await supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('id', id).single();
  return NextResponse.json({
    ops_used:     (after?.ai_ops_used  as number) ?? 0,
    ops_included: (after?.ai_ops_limit as number) ?? 0,
  });
}
