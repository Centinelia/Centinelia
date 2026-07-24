import { createAdminClient } from '@/lib/supabase/admin';
import Image from 'next/image';

const COLORS = ['#6C3BFF', '#9B6DFF', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#06b6d4'];
function agentColor(id: string) {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

interface AgentStatus {
  id:         string;
  name:       string;
  role:       string | null;
  roleColor:  string;
  avatarSrc:  string | null;
  initial:    string;
  color:      string;
  callsToday: number;
  opsToday:   number;
}

function statusLabel(agent: AgentStatus): { text: string; color: string } {
  if (agent.callsToday > 0 && agent.opsToday > 0)  return { text: 'En servicio', color: '#22c55e' };
  if (agent.callsToday > 0)                          return { text: 'En servicio', color: '#22c55e' };
  if (agent.opsToday > 0)                            return { text: 'Coordinando', color: '#3b82f6' };
  return { text: 'Disponible', color: '#9ca3af' };
}

function activityText(agent: AgentStatus): string {
  const parts: string[] = [];
  if (agent.callsToday > 0) parts.push(`${agent.callsToday} conversación${agent.callsToday !== 1 ? 'es' : ''}`);
  if (agent.opsToday > 0)   parts.push(`${agent.opsToday} tarea${agent.opsToday !== 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(' · ') : 'Sin actividad hoy';
}

export default async function EquipoHoySection({ token }: { token: string }) {
  const supabase = createAdminClient();

  const { data: base } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!base?.portal_email) return null;

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, role, features')
    .eq('portal_email', base.portal_email);
  if (!agents?.length) return null;

  const agentIds = agents.map(a => a.id);
  // Use a 24-hour rolling window so the cutoff is consistent regardless of server timezone
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: callRows }, { data: opsRows }] = await Promise.all([
    supabase.from('voice_calls').select('agent_id').in('agent_id', agentIds).gte('created_at', since),
    supabase.from('ai_ops_log').select('agent_id').in('agent_id', agentIds).gte('created_at', since),
  ]);

  const callsMap: Record<string, number> = {};
  for (const r of callRows  ?? []) callsMap[r.agent_id] = (callsMap[r.agent_id] ?? 0) + 1;

  const opsMap: Record<string, number> = {};
  for (const r of opsRows ?? []) opsMap[r.agent_id] = (opsMap[r.agent_id] ?? 0) + 1;

  const team: AgentStatus[] = agents.map(a => {
    const features  = (a.features ?? {}) as Record<string, unknown>;
    const roleColor = (features.role_color as string | null) || '#6C3BFF';
    const avatarSrc = (features.avatar    as string | null) || null;
    const name      = (a.agent_name as string | null)?.trim() || (a.business_name as string);
    return {
      id:         a.id,
      name,
      role:       (a.role as string | null) || null,
      roleColor,
      avatarSrc,
      initial:    name.charAt(0).toUpperCase(),
      color:      agentColor(a.id),
      callsToday: callsMap[a.id] ?? 0,
      opsToday:   opsMap[a.id]   ?? 0,
    };
  });

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
    >
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Tu equipo hoy</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {team.filter(a => a.callsToday > 0 || a.opsToday > 0).length} de {team.length} con actividad
          </p>
        </div>
        <div
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e80' }}
        />
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
        {team.map(agent => {
          const status = statusLabel(agent);
          const accent = agent.roleColor || agent.color;
          return (
            <div
              key={agent.id}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--c-surface-2)]"
            >
              {/* Avatar */}
              <div
                className="relative flex-shrink-0 overflow-hidden"
                style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}20`, border: `1px solid ${accent}35` }}
              >
                {agent.avatarSrc
                  ? <Image src={agent.avatarSrc} alt="" fill sizes="36px" style={{ objectFit: 'contain', padding: 2 }} />
                  : <span className="w-full h-full flex items-center justify-center font-bold text-sm" style={{ color: accent }}>{agent.initial}</span>
                }
                <span
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                  style={{ background: status.color, borderColor: 'var(--c-surface)' }}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>{agent.name}</p>
                {agent.role && (
                  <p className="text-xs truncate" style={{ color: accent, opacity: 0.8 }}>{agent.role}</p>
                )}
              </div>

              {/* Status + activity */}
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-medium" style={{ color: status.color }}>{status.text}</p>
                <p className="text-[10px] tabular-nums" style={{ color: 'var(--c-text-4)' }}>
                  {activityText(agent)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
