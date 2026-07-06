import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface Params { params: Promise<{ id: string }> }

// credit  → adds to minutes_included (client gains minutes)
// debit   → adds to minutes_used    (client loses minutes)
// set_used → sets minutes_used to exact value (correction)

export async function POST(req: NextRequest, { params }: Params) {
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
    .select('minutes_used, minutes_included, portal_email')
    .eq('id', id)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const portalEmail = agent.portal_email ?? null;
  let ledgerAmount = 0;
  let ledgerDescription = reason?.trim() || '';
  let result = { minutes_used: 0, minutes_included: 0 };

  if (portalEmail) {
    // Account-level minutes pool
    const { data: acct } = await supabase
      .from('account_minutes')
      .select('minutes_used, minutes_included')
      .eq('portal_email', portalEmail)
      .single();

    if (!acct) return NextResponse.json({ error: 'Account minutes not found' }, { status: 404 });

    let update: Record<string, number | string> = { updated_at: new Date().toISOString() };

    if (action === 'credit') {
      update.minutes_included = acct.minutes_included + amount;
      ledgerAmount = amount;
      if (!ledgerDescription) ledgerDescription = `Crédito manual, ${amount} min acreditados`;
    } else if (action === 'debit') {
      update.minutes_used = acct.minutes_used + amount;
      ledgerAmount = -amount;
      if (!ledgerDescription) ledgerDescription = `Descuento manual, ${amount} min descontados`;
    } else {
      const delta = amount - acct.minutes_used;
      update.minutes_used = Math.max(0, amount);
      ledgerAmount = -delta;
      if (!ledgerDescription) ledgerDescription = `Corrección, uso ajustado a ${amount} min`;
    }

    const { data: updated, error } = await supabase
      .from('account_minutes')
      .update(update)
      .eq('portal_email', portalEmail)
      .select('minutes_used, minutes_included')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = { minutes_used: updated!.minutes_used, minutes_included: updated!.minutes_included };

  } else {
    // Per-agent (demo / standalone agents without portal_email)
    let update: Record<string, number> = {};

    if (action === 'credit') {
      update = { minutes_included: agent.minutes_included + amount };
      ledgerAmount = amount;
      if (!ledgerDescription) ledgerDescription = `Crédito manual, ${amount} min acreditados`;
    } else if (action === 'debit') {
      update = { minutes_used: agent.minutes_used + amount };
      ledgerAmount = -amount;
      if (!ledgerDescription) ledgerDescription = `Descuento manual, ${amount} min descontados`;
    } else {
      const delta = amount - agent.minutes_used;
      update = { minutes_used: Math.max(0, amount) };
      ledgerAmount = -delta;
      if (!ledgerDescription) ledgerDescription = `Corrección, uso ajustado a ${amount} min`;
    }

    const { data, error } = await supabase
      .from('voice_agents')
      .update(update)
      .eq('id', id)
      .select('minutes_used, minutes_included')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = { minutes_used: data!.minutes_used, minutes_included: data!.minutes_included };
  }

  if (ledgerAmount !== 0) {
    await supabase.from('minutes_ledger').insert({
      agent_id:    id,
      amount:      ledgerAmount,
      description: ledgerDescription,
      source:      'ajuste',
    });
  }

  return NextResponse.json(result);
}
