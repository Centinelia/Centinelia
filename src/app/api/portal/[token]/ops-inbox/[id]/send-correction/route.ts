// Envía un correo de corrección al remitente original del ops_inbox item.
// Requiere que el item ya esté flagged (auto_mode_flagged_at no null): el
// contexto operativo es "reconociste que Sofía envió algo mal, ahora mandas
// la versión correcta". Bloqueado si no está flagged.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { checkAccount } from '@/lib/compliance/account-guard';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ token: string; id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  // 1. Verificar agent por portal_token
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, agent_name, business_name')
    .eq('portal_token', token)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // 2. Cargar item + verificar ownership
  const { data: item } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, email_from, email_subject, auto_mode_flagged_at')
    .eq('id', id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (item.agent_id !== agent.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // 3. Guard: solo se puede corregir un correo que ya reportaste como mal envío
  if (!item.auto_mode_flagged_at) {
    return NextResponse.json({ error: 'Solo se pueden enviar correcciones de correos ya reportados' }, { status: 400 });
  }

  // 4. Guard: cuenta activa
  const guard = await checkAccount(agent.portal_email as string, supabase);
  if (!guard.canUseOffice) {
    return NextResponse.json({ error: 'Cuenta rescindida. No se pueden enviar correos.' }, { status: 403 });
  }

  // 5. Body
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const correctionText = typeof body.body === 'string' ? body.body.trim() : '';
  if (!correctionText) {
    return NextResponse.json({ error: 'Body vacío' }, { status: 400 });
  }
  if (!item.email_from) {
    return NextResponse.json({ error: 'No hay destinatario en el correo original' }, { status: 400 });
  }

  // 6. Enviar
  const agentName    = (agent.agent_name as string | null) ?? 'Centinelia';
  const businessName = (agent.business_name as string) ?? '';
  const subject      = `Re: ${(item.email_subject as string) || ''}`.trim();

  const sent = await sendEmail({
    to:      item.email_from as string,
    subject,
    html:    correctionEmailHtml(businessName, agentName, correctionText),
  });

  if (!sent) return NextResponse.json({ error: 'send_failed' }, { status: 500 });

  return NextResponse.json({ ok: true });
}

function correctionEmailHtml(businessName: string, agentName: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F7FF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(108,59,255,0.12);border-radius:12px;padding:28px">
      <p style="color:#1A0A3B;font-size:14px;line-height:1.7;margin:0 0 24px;white-space:pre-wrap">${escapeHtml(body)}</p>
      <p style="color:rgba(26,10,59,0.4);font-size:12px;margin:0">— ${escapeHtml(agentName)}, ${escapeHtml(businessName)}</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
