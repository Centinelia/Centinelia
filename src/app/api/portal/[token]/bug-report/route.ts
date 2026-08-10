import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { sendEmail, bugReportHtml } from '@/lib/email/send';
import { rateLimit, limiters } from '@/lib/ratelimit';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const rl = await rateLimit(req, limiters.bugReport);
  if (rl) return rl;

  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{
    id: string;
    business_name: string | null;
    client_name: string | null;
    client_email: string | null;
    portal_email: string | null;
  }>(token, 'id, business_name, client_name, client_email, portal_email', supabase);

  if (!agent) return NextResponse.json({ error: 'Token inválido' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  // Reportes de fallas siempre disponibles: no consumen tareas ni minutos y
  // son parte fundamental del ciclo de feedback. Ver commit 2026-08-06.

  const { category, description } = await req.json();
  if (!description?.trim()) return NextResponse.json({ error: 'Descripción requerida' }, { status: 400 });

  const to = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';

  await sendEmail({
    to,
    subject: `Reporte de falla: ${agent.business_name ?? 'Sin nombre'}`,
    html: bugReportHtml({
      businessName:  agent.business_name  ?? 'Sin nombre',
      reporterName:  agent.client_name  || 'Desconocido',
      reporterEmail: agent.client_email || '',
      category:      category ?? 'General',
      description:   description.trim(),
    }),
  });

  // Alimentar a Nash: log en tool_call_log con la shape que espera
  // revisar_incidentes_plataforma. Sin este insert, Nash es ciego a los
  // bug reports que vienen del footer del portal (solo veía los del tool
  // reportar_falla llamado por agentes).
  await supabase.from('tool_call_log').insert({
    agent_id:     agent.id as string,
    portal_email: agent.portal_email as string | null,
    channel:      'portal',
    tool_name:    'reportar_falla',
    input_json:   { tipo: category ?? 'General', descripcion: description.trim(), source: 'portal_footer' },
    ok:           true,
    latency_ms:   0,
    attempt:      1,
  });

  // Trigger event-driven: Nash procesa este signal en background si el
  // debounce (5min) lo permite. Fallback: cron horario.
  const { triggerNashMonitor } = await import('@/lib/ops/nash-trigger');
  triggerNashMonitor(`portal footer bug-report from ${auth.portalEmail ?? 'unknown'}`);

  return NextResponse.json({ ok: true });
}
