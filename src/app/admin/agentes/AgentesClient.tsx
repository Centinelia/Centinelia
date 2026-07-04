'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, PhoneCall, CheckCircle, XCircle, Search } from 'lucide-react';
import type { VoiceAgent } from '@/types/agent';
import { PLAN_LABELS } from '@/types/agent';

type StatusFilter = 'todos' | 'activos' | 'pausados';
type PlanFilter   = 'todos' | 'comercial' | 'pro';

const PLAN_COLORS: Record<string, string> = {
  comercial: '#3b82f6', pro: '#a855f7',
};

export default function AgentesClient({ list }: { list: VoiceAgent[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('todos');
  const [plan,   setPlan]   = useState<PlanFilter>('todos');

  const filtered = useMemo(() => {
    let result = list;
    if (status === 'activos')  result = result.filter(a => a.active);
    if (status === 'pausados') result = result.filter(a => !a.active);
    if (plan !== 'todos')      result = result.filter(a => a.plan === plan);
    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter(a =>
      a.business_name.toLowerCase().includes(q) ||
      a.client_name.toLowerCase().includes(q) ||
      (a.phone_number ?? '').includes(q)
    );
  }, [list, search, status, plan]);

  const activeCount = list.filter(a => a.active).length;
  const pausedCount = list.filter(a => !a.active).length;
  const planCounts  = {
    comercial: list.filter(a => a.plan === 'comercial').length,
    pro:       list.filter(a => a.plan === 'pro').length,
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Agentes de Voz</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
            {list.length} agente{list.length !== 1 ? 's' : ''} configurado{list.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/admin/agentes/nuevo"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#6C3BFF', color: '#FAFBFF' }}
        >
          <Plus size={15} />
          Nuevo agente
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-24" style={{ color: 'var(--c-text-3)' }}>
          <PhoneCall size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg" style={{ color: 'var(--c-text-2)' }}>Sin agentes configurados</p>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>Crea tu primer agente para empezar.</p>
        </div>
      ) : (
        <>
          {/* Filters + Search */}
          <div className="flex flex-col gap-2 mb-5">
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Status */}
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                {([
                  { key: 'todos',    label: `Todos (${list.length})` },
                  { key: 'activos',  label: `Activos (${activeCount})` },
                  { key: 'pausados', label: `Pausados (${pausedCount})` },
                ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setStatus(key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: status === key ? '#6C3BFF' : 'transparent',
                      color: status === key ? '#fff' : 'var(--c-text-3)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Plan */}
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                {([
                  { key: 'todos',     label: 'Todos',                              color: undefined },
                  { key: 'comercial', label: `Comercial (${planCounts.comercial})`, color: PLAN_COLORS.comercial },
                  { key: 'pro',       label: `Pro (${planCounts.pro})`,             color: PLAN_COLORS.pro },
                ] as { key: PlanFilter; label: string; color?: string }[]).map(({ key, label, color }) => {
                  const active = plan === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setPlan(key)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: active ? (color ?? '#6C3BFF') : 'transparent',
                        color:      active ? '#fff' : (color ?? 'var(--c-text-3)'),
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Search */}
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text-3)' }} />
                <input
                  type="text"
                  placeholder="Buscar por nombre, cliente o número…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--c-input-bg)',
                    border: '1px solid var(--c-input-border)',
                    color: 'var(--c-text)',
                  }}
                />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--c-text-3)' }}>
              <p className="text-sm">Sin resultados para &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/admin/agentes/${agent.id}`}
                  className="flex items-center justify-between p-5 rounded-xl border transition-all hover:border-purple-500/40"
                  style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(108,59,255,0.12)' }}>
                      <PhoneCall size={18} style={{ color: '#9B6DFF' }} />
                    </div>
                    <div>
                      <div className="font-semibold" style={{ color: 'var(--c-text)' }}>{agent.business_name}</div>
                      <div className="text-sm" style={{ color: 'var(--c-text-3)' }}>{agent.client_name} · {agent.phone_number || 'Sin número'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <PlanBadge plan={agent.plan} />
                    <MinutesBadge used={agent.minutes_used} included={agent.minutes_included} />
                    {agent.active
                      ? <CheckCircle size={18} color="#22c55e" />
                      : <XCircle size={18} color="#ef4444" />
                    }
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlanBadge({ plan }: { plan: VoiceAgent['plan'] }) {
  const colors: Record<string, string> = {
    basico: '#6b7280', estandar: '#3b82f6', pro: '#a855f7',
  };
  const c = colors[plan] ?? '#6b7280';
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: `${c}22`, color: c, border: `1px solid ${c}44` }}>
      {PLAN_LABELS[plan]}
    </span>
  );
}

function MinutesBadge({ used, included }: { used: number; included: number }) {
  const pct = included > 0 ? Math.min((used / included) * 100, 100) : 0;
  const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
  return (
    <div className="text-right">
      <div className="text-xs font-semibold" style={{ color }}>{used} / {included} min</div>
      <div className="w-20 h-1 rounded-full mt-1" style={{ background: 'var(--c-border)' }}>
        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
