import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeSendEmail } from '@/lib/services/connector-tools';
import { checkAccount } from '@/lib/compliance/account-guard';
import { agentInboxAddressFor } from '@/lib/email/inbox';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const {
    to, subject, body: emailBody,
    attachment_file_id:   attFileId,
    attachment_file_name: attFileName,
    attachment_mime_type: attMimeType,
  } = args as { to: string; subject: string; body: string; attachment_file_id?: string; attachment_file_name?: string; attachment_mime_type?: string };

  const startedAt = Date.now();
  const sessionId = (((body.message as Record<string, unknown> | undefined)?.call as Record<string, unknown> | undefined)?.id as string) ?? null;
  const traceInput = { to, subject, body_preview: String(emailBody ?? '').slice(0, 200), has_attachment: !!attFileId, attFileName, attMimeType };
  const traceResp = (result: unknown, ok = true) => {
    traceVoiceCall({ toolName: 'enviar_correo', agentId: agent_id, sessionId, input: traceInput, result, ok, startedAt });
  };

  if (!to || !subject || !emailBody) {
    const msg = 'Necesito el destinatario, asunto y cuerpo del correo.';
    traceResp({ error: 'missing_params', message: msg }, false);
    return NextResponse.json({ result: msg });
  }

  // Anti-teatro de adjunto: el modelo a veces escribe "📎 archivo.pdf" o dice
  // "adjunto el documento" en el body pero olvida attachment_file_id, dejando
  // un correo que MIENTE al destinatario sobre tener adjunto. Bloqueamos y
  // devolvemos error para forzar al modelo a hacerlo bien.
  if (!attFileId) {
    const bodyStr  = String(emailBody);
    const clipEmojis = /📎|📄|📃|📑|📁|📂|📇/.test(bodyStr);
    const claimsAdjunto = /\b(adjunt[oa]s?|anex[oa]s?|se\s+anex|te\s+env[ií]o\s+adjunt|env[ií]o\s+adjunt|attached|enclosed|incluy[oe]\s+el\s+(archivo|documento|contrato|pdf|excel|word))\b/i.test(bodyStr);
    if (clipEmojis || claimsAdjunto) {
      const msg = 'ERROR: Tu correo dice que adjuntas un archivo pero NO pasaste attachment_file_id / attachment_file_name / attachment_mime_type. El correo NO se envió porque sería engañoso al destinatario. Corrige de una de estas dos formas: (a) invoca buscar_archivo para localizar el archivo, luego enviar_correo de nuevo con los 3 campos de attachment completos, o (b) reescribe el body sin mencionar adjuntos y envía el contenido en texto.';
      traceResp({ error: 'attachment_theater_blocked', message: msg }, false);
      return NextResponse.json({ result: msg });
    }
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email')
    .eq('id', agent_id)
    .single();
  if (!agent) {
    traceResp({ error: 'agent_not_found' }, false);
    return NextResponse.json({ result: 'Error: agente no encontrado' });
  }

  const guard = await checkAccount((agent as any).portal_email, supabase);
  if (!guard.canUseOffice) {
    const msg = 'Esta cuenta no puede enviar correos. Contacta a soporte.';
    traceResp({ error: 'account_blocked', message: msg }, false);
    return NextResponse.json({ result: msg });
  }

  const opsResult = await consumeAiOp(agent_id, 1);
  if (!opsResult.ok) {
    const msg = 'No tienes operaciones IA disponibles este mes para enviar correos.';
    traceResp({ error: 'ops_exhausted', message: msg }, false);
    return NextResponse.json({ result: msg });
  }

  const result = await executeSendEmail(
    { agentId: agent_id, to, subject, body: emailBody, businessName: agent.business_name as string, replyTo: agentInboxAddressFor(agent_id), attFileId, attFileName, attMimeType },
    supabase,
  );

  const finalMsg = result.message ?? result.error ?? 'Error desconocido.';
  traceResp({
    ok:              result.ok,
    sent_to:         to,
    subject,
    has_attachment:  !!attFileId,
    attFileName,
    ...(result.message ? { message: result.message } : {}),
    ...(result.ok ? {} : { error: result.error ?? 'unknown' }),
  }, result.ok);
  return NextResponse.json({ result: finalMsg });
}
