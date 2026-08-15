import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { sendEmail } from '@/lib/email/send';
import { checkAccount } from '@/lib/compliance/account-guard';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null; trust_stage: number | null }>(token, 'id, portal_email, trust_stage', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAccountAgentIds(supabase, acct.portal_email);
  const { data: items } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, email_from, email_subject, category, ai_summary, ai_draft, item_type, invoice_data, invoice_valid, invoice_discrepancy, status, attachments, sent_at, created_at, auto_mode_decision, auto_mode_reason, auto_mode_flagged_at, auto_mode_flag_reason, auto_mode_flag_category, client_replied_at, origin_scope, assigned_by, assignment_confidence, assignment_metadata, action_required')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: humanReqs } = await supabase
    .from('human_requests')
    .select('id, agent_id, request_type, title, description, urgency, target_email, status, created_at, client_replied_at')
    .in('agent_id', agentIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  // Integraciones que perdieron OAuth (afecta INGESTA de correo del cliente, no
  // el envío saliente que va por Resend). Sin este signal el usuario ve una
  // Bandeja vacía y cree que no llegaron correos — silent failure resuelto en
  // audit sesión 53 (ver [[audit-deferred-handoff]] sección G).
  const integrationsNeedingReauth: Array<{ provider: string; email: string; capability: string }> = [];
  if (acct.portal_email) {
    const { data: reauth } = await supabase
      .from('integration_accounts')
      .select('provider, account_label, capability')
      .eq('portal_email', acct.portal_email)
      .eq('status', 'needs_reauth');
    for (const row of reauth ?? []) {
      integrationsNeedingReauth.push({
        provider:   row.provider as string,
        email:      (row.account_label as string) ?? '',
        capability: (row.capability as string) ?? '',
      });
    }
  } else {
    const { data: emailReauth } = await supabase
      .from('email_integrations')
      .select('provider, email, needs_reauth')
      .in('agent_id', agentIds)
      .eq('needs_reauth', true);
    for (const row of emailReauth ?? []) {
      integrationsNeedingReauth.push({
        provider:   row.provider as string,
        email:      (row.email as string) ?? '',
        capability: 'email',
      });
    }
  }

  return NextResponse.json({
    items:                    items ?? [],
    humanRequests:            humanReqs ?? [],
    integrationsNeedingReauth,
    // Frontend usa trust_stage para decidir si mostrar botones Aprobar/Rechazar.
    // En Autónomo (3), solo aparecen para items con auto_mode_decision='human'
    // (el classifier explícitamente pidió ojos humanos).
    trustStage: (acct.trust_stage as number | null) ?? 3,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
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

  // Los info_requested son drafts en los que Nash/inbox pidió al humano
  // aprobar el "pedir más info al cliente" — mismo flow que pending para
  // approve/reject/edit. Antes 409 porque solo se aceptaba pending → borrador
  // atascado sin botones en el portal.
  if (item.status !== 'pending' && item.status !== 'info_requested') {
    return NextResponse.json({ error: 'Already processed' }, { status: 409 });
  }

  const newStatus = body.status as string;
  const update: Record<string, unknown> = {
    status:       newStatus,
    updated_at:   new Date().toISOString(),
  };
  if (body.owner_feedback) update.owner_feedback = body.owner_feedback;

  // Draft editado por el humano antes de aprobar: sobreescribe el ai_draft del modelo.
  // Se guarda en DB y se usa para el send del correo.
  const editedDraft = typeof body.ai_draft === 'string' && body.ai_draft.trim() ? body.ai_draft.trim() : null;
  if (editedDraft) update.ai_draft = editedDraft;

  if (newStatus === 'approved') {
    update.sent_at = new Date().toISOString();

    // Block email sending for terminated accounts
    const guard = await checkAccount(acct.portal_email, supabase);
    if (!guard.canUseOffice) {
      return NextResponse.json({ error: 'Cuenta rescindida. No se pueden enviar correos.' }, { status: 403 });
    }

    // Send the draft response if this is an email type
    const draftToSend = editedDraft ?? (item.ai_draft as string | null);
    if (item.item_type === 'email' && draftToSend && item.email_from) {
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
        html:    simpleResponseHtml(businessName, agentName, draftToSend),
      }).catch(console.error);
    }
  }

  // Pedir aclaración sobre factura recibida: enviar correo al proveedor con el mensaje del owner.
  // Aplica solo a item_type='invoice' + status='info_requested' + clarification_message provisto.
  const clarificationMessage = typeof body.clarification_message === 'string' && body.clarification_message.trim()
    ? body.clarification_message.trim()
    : null;
  if (newStatus === 'info_requested' && item.item_type === 'invoice' && clarificationMessage && item.email_from) {
    const guard = await checkAccount(acct.portal_email, supabase);
    if (!guard.canUseOffice) {
      return NextResponse.json({ error: 'Cuenta rescindida. No se pueden enviar correos.' }, { status: 403 });
    }
    const { data: agt } = await supabase
      .from('voice_agents')
      .select('business_name, agent_name')
      .eq('id', item.agent_id)
      .single();
    const agentName    = (agt?.agent_name as string | null) ?? 'Centinelia';
    const businessName = (agt?.business_name as string) ?? '';
    sendEmail({
      to:      item.email_from as string,
      subject: `Aclaración sobre factura: ${(item.email_subject as string) || ''}`.trim(),
      html:    simpleResponseHtml(businessName, agentName, clarificationMessage),
    }).catch(console.error);
    update.owner_feedback = clarificationMessage;
  }

  // Guard TOCTOU: dos requests simultáneos ambos pasaron la validación de línea 82;
  // el .eq('status','pending') asegura que solo el primero muta el estado.
  const { data: updated, error } = await supabase
    .from('ops_inbox')
    .update(update)
    .eq('id', item.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Already processed' }, { status: 409 });

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
