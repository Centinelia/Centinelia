import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { VoiceAgent } from '@/types/agent';
import { buildSystemPrompt } from '@/lib/voice/prompt-builder';
import { VAPI_VOICE_MAX_TOKENS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createAdminClient();
  const { data: agents, error } = await supabase
    .from('voice_agents')
    .select('*')
    .not('vapi_agent_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const VAPI_KEY = process.env.VAPI_API_KEY!;
  const defaultVoiceId = (process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? 'j7e3J6ksqsziQcIGyAWI').trim();

  const results: { id: string; name: string; vapiId: string; ok: boolean; err?: string }[] = [];
  for (const agent of agents ?? []) {
    const voiceId = ((agent as any).elevenlabs_voice_id as string | null)?.trim() || defaultVoiceId;
    const body = {
      voice: { provider: '11labs', voiceId, stability: 0.5, similarityBoost: 0.75, useSpeakerBoost: true },
      model: {
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        messages: [{ role: 'system', content: await buildSystemPrompt(agent as VoiceAgent, null, (agent as Record<string, unknown>).org_id as string | undefined, supabase) }],
        temperature: 0.4,
        maxTokens: VAPI_VOICE_MAX_TOKENS,
      },
    };
    const res = await fetch(`https://api.vapi.ai/assistant/${agent.vapi_agent_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const ok = res.ok;
    const err = ok ? undefined : await res.text();
    if (!ok) console.error('sync-voices Vapi error for', agent.business_name, ':', err);
    results.push({ id: agent.id, name: agent.business_name, vapiId: agent.vapi_agent_id, ok, err });
  }

  return NextResponse.json({ synced: results.length, results });
}
