import { NextRequest, NextResponse } from 'next/server';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { brandKitFromAgent } from '@/lib/brand/kit';
import { GenericDocPDF, ProposalPDF, LetterPDF } from '@/lib/pdf/doc';
import { sendEmail } from '@/lib/email/send';
import { requireVapiAuth } from '@/lib/vapi/auth';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const { title, content, filename, template_type, client_name, client_email, total_price, validity_days, recipient_name, recipient_email } =
    args as { title: string; content: string; filename?: string; template_type?: string; client_name?: string; client_email?: string; total_price?: string; validity_days?: number; recipient_name?: string; recipient_email?: string };

  if (!title || !content) {
    return NextResponse.json({ result: 'Necesito el título y el contenido del documento.' });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agent_id)
    .single();
  if (!agent) return NextResponse.json({ result: 'Error: agente no encontrado' });

  const opsResult = await consumeAiOp(agent_id, 2);
  if (!opsResult.ok) {
    return NextResponse.json({ result: 'No tienes operaciones IA disponibles este mes para crear documentos.' });
  }

  try {
    const brand = brandKitFromAgent(agent as Record<string, unknown>);
    const slug = ((filename ?? title)
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40));
    const docFilename = `${slug}-${Date.now()}.pdf`;
    const path = `${agent_id}/${docFilename}`;

    let pdfElement: React.ReactElement;
    if (template_type === 'proposal') {
      pdfElement = createElement(ProposalPDF, { brand, title, content, clientName: client_name, clientEmail: client_email, totalPrice: total_price, validityDays: validity_days });
    } else if (template_type === 'letter') {
      pdfElement = createElement(LetterPDF, { brand, content, recipientName: recipient_name, recipientEmail: recipient_email });
    } else {
      pdfElement = createElement(GenericDocPDF, { brand, title, content });
    }
    const pdfBuffer = await renderToBuffer(pdfElement as any);

    const { error: uploadErr } = await supabase.storage
      .from('agent-documents')
      .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });

    if (uploadErr) {
      return NextResponse.json({ result: `Error al generar el documento: ${uploadErr.message}` });
    }

    const { data: signed } = await supabase.storage
      .from('agent-documents')
      .createSignedUrl(path, 86400);

    const ownerEmail = agent.portal_email as string | null;
    if (ownerEmail && signed?.signedUrl) {
      const businessName = agent.business_name as string;
      await sendEmail({
        to:      ownerEmail,
        subject: `Documento generado: ${title}`,
        html:    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
          <p>Tu agente generó el documento <strong>${title}</strong> durante la llamada.</p>
          <p><a href="${signed.signedUrl}" style="background:#6C3BFF;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Descargar documento</a></p>
          <p style="color:#999;font-size:12px">El enlace es válido por 24 horas.</p>
        </body></html>`,
        from: `${businessName} <notificaciones@centinelia.mx>`,
      });
    }

    return NextResponse.json({
      result: `Documento "${title}" generado y enviado a tu correo${ownerEmail ? ` ${ownerEmail}` : ''}. Puedes descargarlo desde el enlace que te enviamos.`,
    });
  } catch (err) {
    return NextResponse.json({ result: `Error al crear el documento: ${String(err)}` });
  }
}
