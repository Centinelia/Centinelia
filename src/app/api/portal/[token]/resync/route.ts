import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const supabase = createAdminClient();

  const agent = await getPrimaryAgentFromToken<VoiceAgent>(token, '*', supabase);
  if (!agent || agent.portal_email !== session.portalEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  if (!agent.vapi_agent_id) {
    return NextResponse.json({ error: 'El agente aún no tiene un ID de Vapi asignado' }, { status: 400 });
  }

  const ok = await updateVapiAssistant(agent.vapi_agent_id, agent);
  if (!ok) return NextResponse.json({ error: 'Error al sincronizar con Vapi' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
