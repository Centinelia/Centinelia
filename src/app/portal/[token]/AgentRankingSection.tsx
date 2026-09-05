'use client';

import { useEffect, useState } from 'react';
import { Trophy, Bot, Zap } from 'lucide-react';
import Image from 'next/image';

type Period = 'semana' | 'mes' | 'año';

interface AgentStat {
  id:         string;
  name:       string;
  role:       string | null;
  roleColor:  string;
  avatarSrc:  string | null;
  initial:    string;
  color:      string;
  minutes:    number;
  ops:        number;
}

const COLORS = ['#6C3BFF', '#9B6DFF', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#06b6d4'];
function agentColor(id: string) {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

const PERIOD_LABELS: Record<Period, string> = { semana: 'Esta semana', mes: 'Este mes', año: 'Este año' };

const RANK_COLORS = ['#f59e0b', '#9ca3af', '#b45309'];
const RANK_ICONS  = ['🥇', '🥈', '🥉'];

function Avatar({ agent, size = 32 }: { agent: AgentStat; size?: number }) {
  const radius = size * 0.27;
  return (
    <div className="flex-shrink-0 overflow-hidden relative"
      style={{ width: size, height: size, borderRadius: radius, background: `${agent.roleColor || agent.color}20`, border: `1px solid ${agent.roleColor || agent.color}35` }}>
      {agent.avatarSrc
        ? <Image
            src={agent.avatarSrc}
            alt=""
            fill
            sizes={`${size}px`}
            style={{
              objectFit:      'contain',
              objectPosition: 'center bottom',
              padding:        `${size * 0.05}px ${size * 0.05}px 0`,
            }}
          />
        : <span className="w-full h-full flex items-center justify-center font-bold"
            style={{ color: agent.roleColor || agent.color, fontSize: size * 0.4 }}>{agent.initial}</span>
      }
    </div>
  );
}

function RankRow({ agent, rank, value, unit }: { agent: AgentStat; rank: number; value: number; unit: string }) {
  const medal = rank < 3 ? RANK_ICONS[rank] : null;
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors hover:bg-white/5">
      <span className="w-5 text-center text-sm font-bold flex-shrink-0" style={{ color: rank < 3 ? RANK_COLORS[rank] : '#9B8FB5' }}>
        {medal ?? rank + 1}
      </span>
      <Avatar agent={agent} size={34} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: '#1A0A3B' }}>{agent.name}</p>
        {agent.role && <p className="text-xs truncate" style={{ color: agent.roleColor }}>{agent.role}</p>}
      </div>
      <span className="text-sm font-bold flex-shrink-0" style={{ color: '#1A0A3B' }}>
        {value.toLocaleString('es-MX')}
        <span className="text-xs font-normal ml-1" style={{ color: '#6B6480' }}>{unit}</span>
      </span>
    </div>
  );
}

export default function AgentRankingSection({ token }: { token: string }) {
  const [period,  setPeriod]  = useState<Period>('mes');
  const [stats,   setStats]   = useState<AgentStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/portal/${token}/ranking?periodo=${period}`)
      .then(r => r.json())
      .then(d => { setStats(d.agents ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, period]);

  const byMinutes = [...stats].sort((a, b) => b.minutes - a.minutes);
  const byOps     = [...stats].sort((a, b) => b.ops     - a.ops);

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy size={15} style={{ color: '#f59e0b' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Ranking del equipo Digital</h2>
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
          {(['semana', 'mes', 'año'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
              style={period === p
                ? { background: 'rgba(108,59,255,0.15)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.3)' }
                : { color: '#6B6480' }}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
        </div>
      ) : stats.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: '#9B8FB5' }}>
          Sin datos para {PERIOD_LABELS[period].toLowerCase()}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Minutos */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <Bot size={12} style={{ color: '#3b82f6' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#3b82f6' }}>Minutos</span>
            </div>
            {byMinutes.map((a, i) => (
              <RankRow key={a.id} agent={a} rank={i} value={a.minutes} unit="min" />
            ))}
          </div>

          {/* Ops */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <Zap size={12} style={{ color: '#a855f7' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#a855f7' }}>Tareas</span>
            </div>
            {byOps.map((a, i) => (
              <RankRow key={a.id} agent={a} rank={i} value={a.ops} unit="tareas" />
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
