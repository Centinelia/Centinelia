/**
 * Voice tool: enviar_documento_oficina — adjunta un ops_document existente
 * a un correo saliente. Requiere document_id previamente obtenido via
 * buscar_documento_oficina.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { checkAccount } from '@/lib/compliance/account-guard';
import { sendOfficeDocumentByEmail } from '@/lib/documents/ops-docs-search';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agent_id = new URL(req.url).searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const toolCallId = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.id ?? 'call_1';
  const parsed = (typeof args === 'string' ? JSON.parse(args) : args) as {
    document_id?: string; to?: string; subject?: string; body?: string;
  };

  if (!parsed.document_id || !parsed.to || !parsed.subject || !parsed.body) {
    return NextResponse.json({ results: [{ toolCallId, result: 'Necesito document_id, destinatario, asunto y cuerpo del correo.' }] });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('portal_email').eq('id', agent_id).single();
  if (!agent?.portal_email) return NextResponse.json({ results: [{ toolCallId, result: 'Cuenta no encontrada.' }] });

  const guard = await checkAccount(agent.portal_email as string, supabase);
  if (!guard.canUseOffice) {
    return NextResponse.json({ results: [{ toolCallId, result: 'Esta cuenta no puede enviar correos ahora.' }] });
  }

  const opsResult = await consumeAiOp(agent_id, 1);
  if (!opsResult.ok) {
    return NextResponse.json({ results: [{ toolCallId, result: 'No hay operaciones IA disponibles este mes.' }] });
  }

  const res = await sendOfficeDocumentByEmail({
    supabase, portalEmail: agent.portal_email as string, agentId: agent_id,
    documentId: parsed.document_id, to: parsed.to, subject: parsed.subject, body: parsed.body,
  });

  return NextResponse.json({
    results: [{ toolCallId, result: res.ok ? (res.message ?? 'Correo enviado.') : `No se pudo enviar: ${res.error}` }],
  });
}
