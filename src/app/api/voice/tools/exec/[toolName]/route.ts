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
import { toolResponse } from '@/lib/voice/tool-response';

export const dynamic = 'force-dynamic';

export async function POST(
  req:     NextRequest,
  { params }: { params: Promise<{ toolName: string }> },
) {
  // Auth fail: HTTP 401 (no 200 con "No autorizado" que Vapi verbalizaba al
  // llamante). Vapi legítimo siempre firma bien; un 401 solo ocurre en tráfico
  // no-Vapi (probe/ataque) donde queremos rechazar duro. Ver Scope B Agent 2
  // silent-failure "Voice `exec` swallows errors".
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { toolName } = await params;
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  // Body parsing arriba (antes del check de agent_id) para que toolCallId
  // esté disponible en TODOS los returns — incluido el error de agent_id
  // missing. Con el helper toolResponse Nelia ve el mensaje como tool_result
  // y verbaliza "déjame reintentar" en vez de recibir un 400 ciego.
  const body = await req.json().catch(() => ({}));
  const toolCall = (body.message?.toolCallList ?? body.toolCallList)?.[0];
  // Default '' en vez de 'tool' para que toolResponse() caiga a formato
  // flat cuando no viene toolCall real (tests, curl directo). Con 'tool'
  // siempre envolvía — rompía backwards-compat silenciosamente.
  const toolCallId = toolCall?.id ?? '';
  if (!agent_id) return toolResponse(toolCallId, 'Error de configuración: agent_id requerido.');
  const rawArgs   = toolCall?.function?.arguments ?? body;
  // Vapi manda arguments como string JSON. Sin parseo el executor recibe
  // undefined en todos los campos y falla en silencio o cae al fallback.
  const toolInput: Record<string, unknown> = typeof rawArgs === 'string'
    ? (() => { try { return JSON.parse(rawArgs); } catch { return {}; } })()
    : (rawArgs as Record<string, unknown>);

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agent_id)
    .single();
  if (!agent) return toolResponse(toolCallId, 'Error: agente no encontrado.');

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

    // Response wrap custom-LLM via helper compartido (ver tool-response.ts).
    // Antes se usaba inline — el helper centraliza el fallback flat para
    // tests y llamadas legacy sin toolCallList.
    return toolResponse(toolCallId, msg);
  } catch (err) {
    console.error(`[voice/exec/${toolName}] error:`, err);
    // NO exponer stack trace / mensaje raw de err — antes Vapi verbalizaba
    // "Error al ejecutar la acción: TypeError: cannot read property x…" al
    // cliente. Devolvemos HTTP 200 con message user-friendly (el modelo lo
    // ve como tool_result y puede decidir reintentar, delegar o escalar).
    return toolResponse(
      toolCallId,
      'No pude completar esa acción por un problema técnico. Intenta de otra forma o dime cómo prefieres continuar.',
    );
  }
}
