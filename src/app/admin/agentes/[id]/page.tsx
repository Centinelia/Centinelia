export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import type { VoiceAgent } from '@/types/agent';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import AgentDetailClient from './AgentDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AgentDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: agentData } = await supabase.from('voice_agents').select('*').eq('id', id).single();
  if (!agentData) notFound();

  const agent = agentData as VoiceAgent;

  const isOpen = getIsOpenNow(agent.business_hours, agent.timezone ?? 'America/Monterrey');

  const meerkatId   = ((agent.features as unknown as Record<string, unknown>)?.meerkat_role_id as string | null) ?? null;
  const jornadaType = ((agent as unknown as Record<string, unknown>).jornada_type as string | null) ?? null;

  // Fetch active global version del meerkat del agente
  let activeGlobalVersion: number | null = null;
  if (meerkatId) {
    const { data } = await supabase
      .from('meerkat_active_versions')
      .select('active_version')
      .eq('meerkat_id', meerkatId)
      .maybeSingle();
    activeGlobalVersion = data?.active_version ?? null;
  }
  const availableVersions = meerkatId
    ? Object.keys(MEERKAT_CONFIGS[meerkatId] ?? {}).map(Number).sort((a, b) => a - b)
    : [];
  const pinnedVersion =
    ((agent.features as unknown as Record<string, unknown>)?.pinned_meerkat_version as number | null) ?? null;

  // Display name preference: agent_name (Nia, Noah) fallback to meerkat or business
  const displayName  = agent.agent_name || cap(meerkatId ?? '') || agent.business_name;
  const meerkatLabel = meerkatId ? cap(meerkatId) : null;
  const showMeerkatPill = !!meerkatLabel && (!agent.agent_name || agent.agent_name.toLowerCase() !== meerkatId);

  return (
    <AgentDetailClient
      agent={agent}
      meerkatId={meerkatId}
      meerkatLabel={meerkatLabel}
      showMeerkatPill={showMeerkatPill}
      displayName={displayName}
      isOpen={isOpen}
      jornadaType={jornadaType}
      availableVersions={availableVersions}
      activeGlobalVersion={activeGlobalVersion}
      pinnedVersion={pinnedVersion}
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cap(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getIsOpenNow(hours: any, timezone: string): boolean | null {
  if (!hours) return null;
  try {
    const now   = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(now);
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() ?? '';
    const hour    = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const minute  = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const current = hour * 60 + minute;
    const schedule = hours[weekday];
    if (!schedule?.open || !schedule.from || !schedule.to) return false;
    const [fh, fm] = (schedule.from as string).split(':').map(Number);
    const [th, tm] = (schedule.to as string).split(':').map(Number);
    return current >= fh * 60 + fm && current < th * 60 + tm;
  } catch { return null; }
}
