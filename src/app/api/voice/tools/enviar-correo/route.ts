import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeSendEmail } from '@/lib/services/connector-tools';
import { checkAccount } from '@/lib/compliance/account-guard';
import { agentInboxAddressFor } from '@/lib/email/inbox';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const {
    to, subject, body: emailBody,
    attachment_file_id:   attFileId,
    attachment_file_name: attFileName,
    attachment_mime_type: attMimeType,
  } = args as { to: string; subject: string; body: string; attachment_file_id?: string; attachment_file_name?: string; attachment_mime_type?: string };

  if (!to || !subject || !emailBody)
    return NextResponse.json({ result: 'Necesito el destinatario, asunto y cuerpo del correo.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email')
    .eq('id', agent_id)
    .single();
  if (!agent) return NextResponse.json({ result: 'Error: agente no encontrado' });

  const guard = await checkAccount((agent as any).portal_email, supabase);
  if (!guard.canUseOffice) {
    return NextResponse.json({ result: 'Esta cuenta no puede enviar correos. Contacta a soporte.' });
  }

  const opsResult = await consumeAiOp(agent_id, 1);
  if (!opsResult.ok)
    return NextResponse.json({ result: 'No tienes operaciones IA disponibles este mes para enviar correos.' });

  const result = await executeSendEmail(
    { agentId: agent_id, to, subject, body: emailBody, businessName: agent.business_name as string, replyTo: agentInboxAddressFor(agent_id), attFileId, attFileName, attMimeType },
    supabase,
  );

  return NextResponse.json({ result: result.message ?? result.error ?? 'Error desconocido.' });
}
