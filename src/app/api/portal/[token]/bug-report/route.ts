import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { sendEmail, bugReportHtml } from '@/lib/email/send';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, allow_bug_reports, client_name, client_email')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Token inválido' }, { status: 404 });
  if (!agent.allow_bug_reports) return NextResponse.json({ error: 'Función no habilitada' }, { status: 403 });

  const { category, description, reporter_name, reporter_email } = await req.json();
  if (!description?.trim()) return NextResponse.json({ error: 'Descripción requerida' }, { status: 400 });

  const to = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';

  await sendEmail({
    to,
    subject: `Reporte de falla: ${agent.business_name ?? 'Sin nombre'}`,
    html: bugReportHtml({
      businessName:  agent.business_name  ?? 'Sin nombre',
      reporterName:  reporter_name?.trim() || agent.client_name  || 'Desconocido',
      reporterEmail: reporter_email?.trim() || agent.client_email || '',
      category:      category ?? 'General',
      description:   description.trim(),
    }),
  });

  return NextResponse.json({ ok: true });
}
