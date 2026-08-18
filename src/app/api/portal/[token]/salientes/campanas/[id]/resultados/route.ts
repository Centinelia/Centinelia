import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';

interface Params { params: Promise<{ token: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  // La campaña puede pertenecer a cualquier peer del org, no solo al primary.
  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id')
    .eq('id', id)
    .in('agent_id', access.ids)
    .single();
  if (!campaign) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  // All outbound_calls logged for this campaign
  const { data: calls } = await supabase
    .from('outbound_calls')
    .select('id, contact_id, nombre, telefono, status, called_at, vapi_call_id')
    .eq('campaign_id', id)
    .order('called_at', { ascending: false });

  if (!calls?.length) return NextResponse.json([]);

  // Pull summaries from voice_calls via vapi_call_id
  const vapiIds = calls.map(c => c.vapi_call_id).filter(Boolean) as string[];
  const voiceMap: Record<string, { summary: string | null; duration_seconds: number | null; outcome: string | null }> = {};

  if (vapiIds.length) {
    const { data: voiceCalls } = await supabase
      .from('voice_calls')
      .select('vapi_call_id, summary, duration_seconds, outcome')
      .in('vapi_call_id', vapiIds);

    for (const vc of voiceCalls ?? []) {
      if (vc.vapi_call_id) {
        voiceMap[vc.vapi_call_id] = {
          summary:          vc.summary          ?? null,
          duration_seconds: vc.duration_seconds ?? null,
          outcome:          vc.outcome          ?? null,
        };
      }
    }
  }

  const results = calls.map(c => ({
    id:               c.id,
    contact_id:       c.contact_id       ?? null,
    nombre:           c.nombre           ?? null,
    telefono:         c.telefono,
    status:           c.status,
    called_at:        c.called_at        ?? null,
    vapi_call_id:     c.vapi_call_id     ?? null,
    summary:          c.vapi_call_id ? (voiceMap[c.vapi_call_id]?.summary          ?? null) : null,
    duration_seconds: c.vapi_call_id ? (voiceMap[c.vapi_call_id]?.duration_seconds ?? null) : null,
    outcome:          c.vapi_call_id ? (voiceMap[c.vapi_call_id]?.outcome          ?? null) : null,
  }));

  return NextResponse.json(results);
}
