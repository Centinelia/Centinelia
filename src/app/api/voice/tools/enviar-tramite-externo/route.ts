import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getTramiteById } from '@/lib/tramites/config';
import { submitTramite } from '@/lib/tramites/submit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json() as Record<string, unknown>;

  const call       = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Record<string, unknown>[])?.[0];
  const rawArgs    = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args       = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';
  const callObj    = ((body.message as Record<string, unknown> | undefined)?.call ?? body.call) as Record<string, unknown> | undefined;
  const callId     = (callObj?.id as string) ?? undefined;
  const respond = (result: unknown) => NextResponse.json({ results: [{ toolCallId, result: typeof result === 'string' ? result : JSON.stringify(result) }] });

  const { tramite_id, campos } = args as { tramite_id: string; campos: Record<string, unknown> };
  if (!tramite_id || !campos) return respond({ ok: false, error: 'tramite_id y campos son requeridos.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('org_id').eq('id', agentId).maybeSingle();
  if (!agent?.org_id) return respond({ ok: false, error: 'Agente sin organización.' });

  const tramite = await getTramiteById(tramite_id, agent.org_id, supabase);
  if (!tramite) return respond({ ok: false, error: 'Trámite no encontrado.' });

  const result = await submitTramite(tramite, campos, { channel: 'voice', agentId, callId }, supabase);
  return respond(result);
}
