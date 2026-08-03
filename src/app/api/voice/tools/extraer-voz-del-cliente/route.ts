import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { extractVoiceOfCustomer, formatVoCForAgent, type VoCSource } from '@/lib/voc/extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const msg  = body.message ?? body;
  const call = msg.toolCallList?.[0] ?? body.toolCallList?.[0];
  const rawArgs = call?.function?.arguments ?? body;
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
  const toolCallId: string = call?.id ?? 'call_1';

  const reply = (m: string) => NextResponse.json({ results: [{ toolCallId, result: m }] });

  if (!agent_id) return reply('Error de configuración: falta agent_id.');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent_id)
    .single();

  const portalEmail = agent?.portal_email as string | undefined;
  if (!portalEmail) return reply('No se pudo identificar la organización.');

  const source     = ((args.fuente as string | undefined) ?? 'all') as VoCSource;
  const days       = Math.min(Math.max(Number(args.dias) || 30, 7), 180);
  const minSamples = Math.min(Math.max(Number(args.min_muestras) || 20, 5), 100);

  const result = await extractVoiceOfCustomer({
    portalEmail,
    source,
    days,
    minSamples,
    supabase,
    requestedBy: agent_id,
  });

  return reply(formatVoCForAgent(result));
}
