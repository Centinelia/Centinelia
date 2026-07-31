import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ token: string; id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const supabase = createAdminClient();

  // 1. Resolver agent_id vía portal_token
  const { data: agent, error: agentErr } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_token', token)
    .maybeSingle();

  if (agentErr || !agent) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Verificar ownership del inbox item
  const { data: item, error: itemErr } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, auto_mode_decision, auto_mode_signals, auto_mode_flagged_at')
    .eq('id', id)
    .maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (item.agent_id !== agent.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 3. Idempotencia: primer flag gana
  if (item.auto_mode_flagged_at) {
    return NextResponse.json({ ok: true, alreadyFlagged: true });
  }

  // 4. Parse body
  const body = (await req.json().catch(() => ({}))) as {
    flagged?:  boolean;
    reason?:   string;
    category?: string;
  };

  if (body.flagged !== true) {
    return NextResponse.json(
      { error: 'flagged=true requerido' },
      { status: 400 }
    );
  }

  const reason =
    typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;

  const VALID_CATEGORIES = new Set(['alucinacion', 'tono', 'info_incorrecta', 'no_debia_responder', 'otro']);
  const category = typeof body.category === 'string' && VALID_CATEGORIES.has(body.category)
    ? body.category
    : null;

  // 5. UPDATE inbox
  const { error: updErr } = await supabase
    .from('ops_inbox')
    .update({
      auto_mode_flagged_at:    new Date().toISOString(),
      auto_mode_flag_reason:   reason,
      auto_mode_flag_category: category,
    })
    .eq('id', item.id);

  if (updErr) {
    console.error('[flag-auto-mode] update failed:', updErr);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  // 6. INSERT en feedback log (no-blocking si falla)
  const { error: feedbackErr } = await supabase
    .from('auto_mode_feedback_log')
    .insert({
      agent_id:      agent.id,
      inbox_id:      item.id,
      decision:      item.auto_mode_decision ?? 'unknown',
      signals:       item.auto_mode_signals ?? [],
      flag_reason:   reason,
      flag_category: category,
    });

  if (feedbackErr) {
    console.error('[flag-auto-mode] feedback log insert failed:', feedbackErr);
  }

  return NextResponse.json({ ok: true });
}
