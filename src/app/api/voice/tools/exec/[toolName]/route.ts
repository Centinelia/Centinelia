/**
 * Generic voice tool executor.
 * Handles any tool via the shared executor so voice automatically gets
 * every tool added to src/lib/tools/executor.ts.
 *
 * Vapi calls: POST /api/voice/tools/exec/[toolName]?agent_id=<id>
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeAgentTool } from '@/lib/tools/executor';

export const dynamic = 'force-dynamic';

export async function POST(
  req:     NextRequest,
  { params }: { params: Promise<{ toolName: string }> },
) {
  if (!requireVapiAuth(req)) return NextResponse.json({ result: 'No autorizado.' });

  const { toolName } = await params;
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error de configuración: agent_id requerido.' });

  const body = await req.json().catch(() => ({}));
  const toolInput = (body.toolCallList?.[0]?.function?.arguments ?? body) as Record<string, unknown>;

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agent_id)
    .single();
  if (!agent) return NextResponse.json({ result: 'Error: agente no encontrado.' });

  const portalEmail  = (agent.portal_email  as string | null) ?? '';
  const agentName    = (agent.agent_name    as string | null)?.trim() || (agent.business_name as string) || 'Centinelia';
  const businessName = (agent.business_name as string) || '';
  const portalToken  = (agent.portal_token  as string) || '';

  try {
    const result = await executeAgentTool(
      toolName,
      toolInput,
      {
        agentId:     agent_id,
        portalEmail,
        agentName,
        businessName,
        portalToken,
        agent:       agent as Record<string, unknown>,
        supabase,
      },
    );

    const typed = result as { message?: string; ok?: boolean; error?: string };
    const msg   = typed?.message
      ?? (typed?.ok === false ? (typed?.error ?? 'No se pudo completar la acción.') : null)
      ?? JSON.stringify(result);

    return NextResponse.json({ result: msg });
  } catch (err) {
    console.error(`[voice/exec/${toolName}] error:`, err);
    return NextResponse.json({ result: `Error al ejecutar la acción: ${String(err)}` });
  }
}
