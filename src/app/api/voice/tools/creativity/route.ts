/**
 * Voice tool endpoint for creativity tools.
 * Vapi calls: POST /api/voice/tools/creativity?agent_id=<id>&tool=<toolName>
 *
 * Dispatches to executeAgentTool with channel='voice'.
 * Whitelist: generar_propuesta_comercial | generar_cotizacion | generar_one_pager | generar_correo_estructurado
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeAgentTool } from '@/lib/tools/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_TOOLS = new Set([
  'generar_propuesta_comercial',
  'generar_cotizacion',
  'generar_one_pager',
  'generar_correo_estructurado',
]);

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agentId  = searchParams.get('agent_id');
  const toolName = searchParams.get('tool');

  if (!agentId || !toolName || !ALLOWED_TOOLS.has(toolName)) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid params' },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  type VapiCall = { id?: string; function?: { arguments?: Record<string, unknown> | string } };
  type VapiMsg  = { toolCallList?: VapiCall[] };
  const msg  = (body.message as VapiMsg | undefined) ?? (body as VapiMsg);
  const call = msg.toolCallList?.[0] ?? (body.toolCallList as VapiCall[] | undefined)?.[0];
  const rawArgs = call?.function?.arguments ?? body;
  const toolInput = (typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs) as Record<string, unknown>;
  const toolCallId: string = call?.id ?? 'call_1';

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, agent_name, business_name, portal_token')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });
  }

  const portalEmail  = (agent.portal_email  as string | null) ?? '';
  const agentName    = ((agent.agent_name   as string | null)?.trim()) || (agent.business_name as string) || 'Centinelia';
  const businessName = (agent.business_name as string) || '';
  const portalToken  = (agent.portal_token  as string) || '';

  try {
    const result = await executeAgentTool(
      toolName,
      toolInput,
      {
        agentId,
        portalEmail,
        agentName,
        businessName,
        portalToken,
        agent:   agent as Record<string, unknown>,
        supabase,
        channel: 'voice',
      },
    );

    const typed = result as { message?: string; ok?: boolean; error?: string } | null;
    const msg2  = typed?.message
      ?? (typed?.ok === false ? (typed?.error ?? 'No se pudo completar la acción.') : null)
      ?? JSON.stringify(result);

    return NextResponse.json({ results: [{ toolCallId, result: msg2 }] });
  } catch (err) {
    console.error(`[voice/tools/creativity/${toolName}] error:`, err);
    return NextResponse.json({
      results: [{ toolCallId, result: `Error al ejecutar la acción: ${String(err)}` }],
    });
  }
}
