// TEMPORARY debug endpoint: lets an admin invoke any agent tool directly to
// smoke-test the executor without going through the portal chat auth. Remove
// after piloto Palacio Monterrey (~2026-07-31).

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeAgentTool, type AgentToolContext } from '@/lib/tools/executor';
import type { VoiceAgent } from '@/types/agent';


export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agentId, toolName, toolInput } = await req.json() as {
    agentId:   string;
    toolName:  string;
    toolInput: Record<string, unknown>;
  };

  if (!agentId || !toolName) {
    return NextResponse.json({ error: 'agentId + toolName required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: agent, error } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const ctx = {
    agentId,
    portalEmail:  (agent as any).portal_email ?? '',
    agentName:    (agent as any).agent_name ?? 'Sofia',
    businessName: (agent as any).business_name ?? '',
    portalToken:  (agent as any).portal_token ?? '',
    agent:        agent as unknown as Record<string, unknown>,
    supabase,
  } as unknown as AgentToolContext;

  try {
    const result = await executeAgentTool(toolName, toolInput ?? {}, ctx);
    return NextResponse.json({ ok: true, tool: toolName, result });
  } catch (err) {
    return NextResponse.json({ ok: false, tool: toolName, error: String(err), stack: err instanceof Error ? err.stack?.slice(0, 500) : null }, { status: 500 });
  }
}
