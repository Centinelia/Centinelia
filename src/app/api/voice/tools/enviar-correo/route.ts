import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { gmailSendNew, gmailRefreshToken, gmailDownloadDriveFile } from '@/lib/email/gmail';
import { outlookSendNew, outlookRefreshToken, outlookDownloadFile } from '@/lib/email/outlook';
import { sendEmail } from '@/lib/email/send';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const {
    to, subject, body: emailBody,
    attachment_file_id: attFileId,
    attachment_file_name: attFileName,
    attachment_mime_type: attMimeType,
  } = args as { to: string; subject: string; body: string; attachment_file_id?: string; attachment_file_name?: string; attachment_mime_type?: string };

  if (!to || !subject || !emailBody) {
    return NextResponse.json({ result: 'Necesito el destinatario, asunto y cuerpo del correo.' });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email')
    .eq('id', agent_id)
    .single();
  if (!agent) return NextResponse.json({ result: 'Error: agente no encontrado' });

  const opsResult = await consumeAiOp(agent_id, 1);
  if (!opsResult.ok) {
    return NextResponse.json({ result: 'No tienes operaciones IA disponibles este mes para enviar correos.' });
  }

  const { data: integration } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', agent_id)
    .single();

  // Helper: get fresh access token
  async function getFreshToken(): Promise<string> {
    if (!integration) return '';
    let tok = integration.access_token as string;
    const exp = integration.token_expires_at ? new Date(integration.token_expires_at as string) : null;
    if (!exp || exp.getTime() - Date.now() < 5 * 60 * 1000) {
      try {
        const refreshed = integration.provider === 'gmail'
          ? await gmailRefreshToken(integration.refresh_token as string)
          : await outlookRefreshToken(integration.refresh_token as string);
        tok = refreshed.access_token;
        await supabase.from('email_integrations').update({
          access_token:     tok,
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }).eq('id', integration.id);
      } catch { /* use existing */ }
    }
    return tok;
  }

  // Download attachment from Drive/OneDrive if requested
  let attachment: { filename: string; content: Buffer; mimeType: string } | undefined;
  if (attFileId && integration) {
    const tok = await getFreshToken();
    const dl = integration.provider === 'gmail'
      ? await gmailDownloadDriveFile(tok, attFileId, attMimeType ?? '')
      : await outlookDownloadFile(tok, attFileId, attMimeType ?? '');
    if (dl) attachment = { filename: attFileName ?? 'adjunto', content: dl.buffer, mimeType: dl.contentType };
  }

  let sent = false;

  if (integration) {
    const tok = await getFreshToken();
    try {
      if (integration.provider === 'gmail') await gmailSendNew(tok, to, subject, emailBody, attachment);
      else await outlookSendNew(tok, to, subject, emailBody, attachment);
      sent = true;
    } catch { /* fall through to Resend */ }
  }

  if (!sent) {
    const businessName = agent.business_name as string;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
      ${emailBody.split('\n').map((p: string) => p.trim() ? `<p style="margin:0 0 12px">${p}</p>` : '<br>').join('')}
      <p style="color:#666;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">— ${businessName}</p>
    </body></html>`;
    const resendAtts = attachment ? [{ filename: attachment.filename, content: attachment.content.toString('base64') }] : undefined;
    await sendEmail({ to, subject, html, from: `${businessName} <notificaciones@centinelia.mx>`, attachments: resendAtts });
  }

  const attNote = attachment ? ` con el archivo "${attachment.filename}" adjunto` : '';
  return NextResponse.json({ result: `Correo enviado a ${to} con asunto: "${subject}"${attNote}.` });
}
