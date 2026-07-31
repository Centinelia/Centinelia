import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { sendEmail } from '@/lib/email/send';
import { checkAccount } from '@/lib/compliance/account-guard';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAccountAgentIds(supabase, acct.portal_email);
  const { data: items } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, email_from, email_subject, category, ai_summary, ai_draft, item_type, invoice_data, invoice_valid, invoice_discrepancy, status, attachments, sent_at, created_at, auto_mode_decision, auto_mode_reason, auto_mode_flagged_at')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: humanReqs } = await supabase
    .from('human_requests')
    .select('id, agent_id, request_type, title, description, urgency, target_email, status, created_at')
    .in('agent_id', agentIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return NextResponse.json({ items: items ?? [], humanRequests: humanReqs ?? [] });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAccountAgentIds(supabase, acct.portal_email);

  // Fetch the item first (needed for email sending on approve)
  const { data: item } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, email_from, email_subject, ai_draft, item_type, status, category')
    .eq('id', body.id)
    .in('agent_id', agentIds)
    .single();

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Rescatar: mover un correo marcado spam de vuelta a pending para revisión humana.
  // Solo aplica a items status='skipped' + category='spam' (false positives del clasificador).
  if (body.status === 'unspam') {
    if (item.status !== 'skipped' || item.category !== 'spam') {
      return NextResponse.json({ error: 'Solo correos marcados spam se pueden rescatar' }, { status: 400 });
    }
    const { error } = await supabase
      .from('ops_inbox')
      .update({ status: 'pending', category: 'otro', updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (item.status !== 'pending') return NextResponse.json({ error: 'Already processed' }, { status: 409 });

  const newStatus = body.status as string;
  const update: Record<string, unknown> = {
    status:       newStatus,
    updated_at:   new Date().toISOString(),
  };
  if (body.owner_feedback) update.owner_feedback = body.owner_feedback;

  if (newStatus === 'approved') {
    update.sent_at = new Date().toISOString();

    // Block email sending for terminated accounts
    const guard = await checkAccount(acct.portal_email, supabase);
    if (!guard.canUseOffice) {
      return NextResponse.json({ error: 'Cuenta rescindida. No se pueden enviar correos.' }, { status: 403 });
    }

    // Send the draft response if this is an email type
    if (item.item_type === 'email' && item.ai_draft && item.email_from) {
      const { data: agt } = await supabase
        .from('voice_agents')
        .select('business_name, agent_name')
        .eq('id', item.agent_id)
        .single();

      const agentName    = (agt?.agent_name as string | null) ?? 'Centinelia';
      const businessName = (agt?.business_name as string) ?? '';

      sendEmail({
        to:      item.email_from as string,
        subject: `Re: ${(item.email_subject as string) || ''}`.trim(),
        html:    simpleResponseHtml(businessName, agentName, item.ai_draft as string),
      }).catch(console.error);
    }
  }

  const { error } = await supabase.from('ops_inbox').update(update).eq('id', item.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

function simpleResponseHtml(businessName: string, agentName: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F7FF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(108,59,255,0.12);border-radius:12px;padding:28px">
      <p style="color:#1A0A3B;font-size:14px;line-height:1.7;margin:0 0 24px;white-space:pre-wrap">${body}</p>
      <p style="color:rgba(26,10,59,0.4);font-size:12px;margin:0">— ${agentName}, ${businessName}</p>
    </div>
  </div>
</body>
</html>`;
}

async function getAccountAgentIds(
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  portalEmail: string | null,
): Promise<string[]> {
  if (!portalEmail) return [];
  const { data } = await supabase.from('voice_agents').select('id').eq('portal_email', portalEmail);
  return (data ?? []).map(a => a.id as string);
}
