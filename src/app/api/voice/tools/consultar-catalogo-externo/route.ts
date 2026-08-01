import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getTramiteById } from '@/lib/tramites/config';
import { fetchCatalogo } from '@/lib/tramites/catalog';

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

  const { tramite_id, catalogo_key, filtros } = args as { tramite_id: string; catalogo_key: string; filtros?: Record<string, string> };
  if (!tramite_id || !catalogo_key) return respond({ ok: false, error: 'tramite_id y catalogo_key son requeridos.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('org_id').eq('id', agentId).maybeSingle();
  if (!agent?.org_id) return respond({ ok: false, error: 'Agente sin organización.' });

  const tramite = await getTramiteById(tramite_id, agent.org_id, supabase);
  if (!tramite) return respond({ ok: false, error: 'Trámite no encontrado o no pertenece a esta organización.' });

  const result = await fetchCatalogo(tramite, catalogo_key, filtros ?? {}, supabase);
  return respond(result);
}
