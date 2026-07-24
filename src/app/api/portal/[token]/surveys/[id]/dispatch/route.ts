import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail && session.portalEmail !== access.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { phone } = await req.json() as { phone?: string };
  if (!phone?.trim()) return NextResponse.json({ error: 'phone requerido' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: survey } = await supabase
    .from('surveys')
    .select('id, nombre')
    .eq('id', id)
    .in('agent_id', access.ids)
    .single();

  if (!survey) return NextResponse.json({ error: 'Encuesta no encontrada' }, { status: 404 });

  await supabase.from('agent_tasks').insert({
    portal_email: access.portalEmail,
    created_by:   access.primaryId,
    assigned_to:  access.primaryId,
    title:        `Encuesta manual: llamar a ${phone.trim()}`,
    description:  `Llama al número ${phone.trim()} y aplica la encuesta "${survey.nombre}" (survey_id: ${survey.id}). Registra las respuestas al terminar.`,
    status:       'pending',
    trigger_type: 'survey_manual',
  });

  return NextResponse.json({ ok: true });
}
