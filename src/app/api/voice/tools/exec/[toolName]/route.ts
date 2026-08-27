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
  // Auth fail: HTTP 401 (no 200 con "No autorizado" que Vapi verbalizaba al
  // llamante). Vapi legítimo siempre firma bien; un 401 solo ocurre en tráfico
  // no-Vapi (probe/ataque) donde queremos rechazar duro. Ver Scope B Agent 2
  // silent-failure "Voice `exec` swallows errors".
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { toolName } = await params;
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error de configuración: agent_id requerido.' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const toolCall = (body.message?.toolCallList ?? body.toolCallList)?.[0];
  const toolCallId = toolCall?.id ?? 'tool';
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

    // Vapi requiere el formato { results: [{ toolCallId, result }] }. Antes
    // devolvíamos { result: msg } y Vapi respondía "No result returned",
    // dejando al LLM sin visibilidad del error/resultado. Bug crítico que
    // rompía silenciosamente TODAS las tools que rutean por /exec/*.
    return NextResponse.json({ results: [{ toolCallId, result: msg }] });
  } catch (err) {
    console.error(`[voice/exec/${toolName}] error:`, err);
    // NO exponer stack trace / mensaje raw de err — antes Vapi verbalizaba
    // "Error al ejecutar la acción: TypeError: cannot read property x…" al
    // cliente. Devolvemos HTTP 200 con message user-friendly (el modelo lo
    // ve como tool_result y puede decidir reintentar, delegar o escalar).
    return NextResponse.json({
      results: [{ toolCallId, result: 'No pude completar esa acción por un problema técnico. Intenta de otra forma o dime cómo prefieres continuar.' }],
    });
  }
}
