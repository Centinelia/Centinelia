import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { extractBrandVoice } from '@/lib/brand/voice-guide';

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

  const raw = (args.muestras as unknown) ?? (args.samples as unknown) ?? [];
  const samples = Array.isArray(raw) ? (raw as unknown[]).map(s => String(s)) : [];

  const result = await extractBrandVoice({ portalEmail, samples, supabase });
  if (!result.ok) return reply(result.error ?? 'No se pudo extraer.');
  return reply('Listo. Guardé la guía de tono; tus empleados hablarán con este estilo desde ahora.');
}
