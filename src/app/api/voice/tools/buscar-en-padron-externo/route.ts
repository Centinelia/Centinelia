import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getTramiteById } from '@/lib/tramites/config';
import { fetchLookup } from '@/lib/tramites/lookup';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json() as Record<string, unknown>;

  const call       = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Record<string, unknown>[])?.[0];
  const rawArgs    = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args       = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';
  const respond = (result: unknown) => NextResponse.json({ results: [{ toolCallId, result: typeof result === 'string' ? result : JSON.stringify(result) }] });

  const { tramite_id, lookup_key, valor } = args as { tramite_id: string; lookup_key: string; valor: string };
  if (!tramite_id || !lookup_key || !valor) return respond({ ok: false, error: 'tramite_id, lookup_key y valor son requeridos.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('portal_email').eq('id', agentId).maybeSingle();
  if (!agent?.portal_email) return respond({ ok: false, error: 'Agente sin organización.' });

  const tramite = await getTramiteById(tramite_id, agent.portal_email, supabase);
  if (!tramite) return respond({ ok: false, error: 'Trámite no encontrado o no pertenece a esta organización.' });

  const result = await fetchLookup(tramite, lookup_key, valor, supabase);
  return respond(result);
}
