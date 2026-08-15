import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { solicitarCancelacion } from '@/lib/invoicing/solicitar-cancelacion';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  const body = await req.json() as Record<string, unknown>;
  const call = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Array<Record<string, unknown>> | undefined)?.[0];
  const rawArgs = (call?.function as Record<string, unknown> | undefined)?.arguments ?? body;
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';
  const reply = (m: string) => NextResponse.json({ results: [{ toolCallId, result: m }] });

  if (!agent_id) return reply('Error de configuración.');
  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('portal_email').eq('id', agent_id).single();
  if (!agent) return reply('Agente no encontrado.');

  // I2 — defense in depth: verify org-level gate before delegating
  const { data: org } = await supabase
    .from('organizations')
    .select('invoicing_allow_agent_cancellation')
    .eq('portal_email', agent.portal_email)
    .single();
  if (!org?.invoicing_allow_agent_cancellation) {
    return reply('La cancelación de facturas por voz no está habilitada para esta organización.');
  }

  const res = await solicitarCancelacion({
    uuid_o_folio_corto: String(args.uuid_o_folio_corto ?? ''),
    motivo: String(args.motivo ?? '') as '01'|'02'|'03'|'04',
    uuid_sustituto: args.uuid_sustituto as string | undefined,
    razon_cliente: args.razon_cliente as string | undefined,
  }, { agentId: agent_id, portalEmail: agent.portal_email, supabase, channel: 'voice' });

  return reply(res.message);
}
