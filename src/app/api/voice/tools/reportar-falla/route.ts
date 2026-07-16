import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { sendEmail, bugReportHtml } from '@/lib/email/send';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body  = await req.json();
  const args  = body.toolCallList?.[0]?.function?.arguments ?? body;
  const { tipo, descripcion, contexto } = args as {
    tipo:        string;
    descripcion: string;
    contexto?:   string;
  };

  if (!agent_id || !descripcion?.trim()) {
    return NextResponse.json({ result: 'Reporte no enviado por falta de información.' });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('agent_name, business_name, client_email')
    .eq('id', agent_id)
    .single();

  const to = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';

  const fullDescription = contexto
    ? `${descripcion.trim()}\n\nContexto de la conversación:\n${contexto.trim()}`
    : descripcion.trim();

  await sendEmail({
    to,
    subject: `Reporte de falla (agente): ${agent?.agent_name ?? 'Agente'} — ${agent?.business_name ?? ''}`,
    html: bugReportHtml({
      businessName:  agent?.business_name  ?? 'Sin nombre',
      reporterName:  agent?.agent_name     ?? 'Agente IA',
      reporterEmail: agent?.client_email   ?? '',
      category:      tipo ?? 'Detectado por agente',
      description:   fullDescription,
    }),
  });

  return NextResponse.json({ result: 'Reporte enviado al equipo de Centinelia. Gracias por notificarnos.' });
}
