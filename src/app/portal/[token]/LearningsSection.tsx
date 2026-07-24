'use client';

import { useState, useEffect, useCallback } from 'react';
import { Brain, Check, X, Clock, ChevronDown, BookOpen, ShieldCheck } from 'lucide-react';

interface AgentRef {
  agent_name:    string | null;
  business_name: string;
  role:          string | null;
}

interface Learning {
  id:           string;
  content:      string;
  status:       'pending' | 'approved' | 'rejected';
  created_at:   string;
  vapi_call_id: string | null;
  agent_id:     string;
  source?:      'call' | 'email' | 'chat' | null;
  confidence?:  number | null;
  category?:    'role_kb' | 'guardrails' | null;
  voice_agents: AgentRef | null;
}

interface AgentGroup {
  agent_id:   string;
  label:      string;
  role:       string | null;
  learnings:  Learning[];
}

const CATEGORY_LABELS: Record<'role_kb' | 'guardrails', { label: string; icon: typeof BookOpen }> = {
  role_kb:    { label: 'Instrucciones del puesto', icon: BookOpen },
  guardrails: { label: 'Límites de autoridad',     icon: ShieldCheck },
};

const SOURCE_LABELS: Record<string, string> = {
  call:  'llamada',
  email: 'correo',
  chat:  'chat',
};

function sourceColor(source: string | null | undefined): string {
  if (source === 'email') return '#0ea5e9';
  if (source === 'chat')  return '#22c55e';
  return '#9B6DFF';
}

function agentLabel(l: Learning): string {
  const va = l.voice_agents;
  if (!va) return 'Empleado';
  return va.agent_name ?? va.business_name;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)   return 'Ahora';
  if (mins < 60)  return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

function groupByAgent(list: Learning[]): AgentGroup[] {
  const map = new Map<string, AgentGroup>();
  for (const l of list) {
    if (!map.has(l.agent_id)) {
      map.set(l.agent_id, {
        agent_id:  l.agent_id,
        label:     agentLabel(l),
        role:      l.voice_agents?.role ?? null,
        learnings: [],
      });
    }
    map.get(l.agent_id)!.learnings.push(l);
  }
  return Array.from(map.values());
}

export default function LearningsSection({ token, canApprove = true }: { token: string; canApprove?: boolean }) {
  const [learnings,  setLearnings]  = useState<Learning[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [acting,     setActing]     = useState<Record<string, boolean>>({});
  const [actError,   setActError]   = useState<Record<string, string>>({});
  const [edited,     setEdited]     = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, 'role_kb' | 'guardrails'>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/portal/${token}/learnings`)
      .then(r => r.json())
      .then(d => {
        const list: Learning[] = Array.isArray(d) ? d : [];
        setLearnings(list);
        setCategories(Object.fromEntries(
          list.map(l => [l.id, (l.category ?? 'role_kb') as 'role_kb' | 'guardrails'])
        ));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setActing(p => ({ ...p, [id]: true }));
    setActError(p => ({ ...p, [id]: '' }));
    const content  = edited[id];
    const category = categories[id];
    try {
      const res  = await fetch(`/api/portal/${token}/learnings/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action,
          ...(content !== undefined ? { content } : {}),
          ...(action === 'approve'  ? { category } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActError(p => ({ ...p, [id]: data.error ?? 'Error al procesar. Intenta de nuevo.' }));
        return;
      }
      setLearnings(prev =>
        prev.map(l => l.id === id
          ? {
              ...l,
              status:   action === 'approve' ? 'approved' : 'rejected',
              content:  content ?? l.content,
              category: action === 'approve' ? (category ?? l.category) : l.category,
            }
          : l,
        ),
      );
      setExpandedId(null);
    } catch {
      setActError(p => ({ ...p, [id]: 'Error de conexion. Intenta de nuevo.' }));
    } finally {
      setActing(p => ({ ...p, [id]: false }));
    }
  }

  const [showAllApproved, setShowAllApproved] = useState(false);

  const pending  = learnings.filter(l => l.status === 'pending');
  const approved = learnings.filter(l => l.status === 'approved');
  const rejected = learnings.filter(l => l.status === 'rejected');
  const groups   = groupByAgent(pending);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <Brain size={18} style={{ color: '#9B6DFF' }} />
        <h3 className="font-semibold text-base" style={{ color: 'var(--c-text)' }}>
          Aprendizajes
        </h3>
        {pending.length > 0 && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(108,59,255,0.15)', color: '#9B6DFF' }}
          >
            {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
      )}

      {!loading && pending.length === 0 && approved.length === 0 && (
        <div className="rounded-xl p-5 text-center" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
            Los aprendizajes aparecen aquí cuando el equipo termina llamadas.
            <br />Puedes aprobarlos para que tu empleado los incorpore a su conocimiento.
          </p>
        </div>
      )}

      {/* Pending — grouped by agent */}
      {groups.length > 0 && (
        <div className="flex flex-col gap-3 mb-7">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>
            Pendientes de revisión
          </p>

          {groups.map(group => (
            <div
              key={group.agent_id}
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(108,59,255,0.2)' }}
            >
              {/* Agent header */}
              <div
                className="flex items-center gap-2.5 px-4 py-2.5"
                style={{ background: 'rgba(108,59,255,0.06)', borderBottom: '1px solid rgba(108,59,255,0.12)' }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(108,59,255,0.15)', color: '#9B6DFF' }}
                >
                  {group.label.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                  {group.label}
                </span>
                {group.role && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF' }}>
                    {group.role}
                  </span>
                )}
                <span className="ml-auto text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>
                  {group.learnings.length} {group.learnings.length === 1 ? 'aprendizaje' : 'aprendizajes'}
                </span>
              </div>

              {/* Learning rows */}
              <div style={{ background: 'var(--c-surface)' }}>
                {group.learnings.map((l, idx) => {
                  const isExpanded = expandedId === l.id;
                  const isLast     = idx === group.learnings.length - 1;

                  return (
                    <div
                      key={l.id}
                      style={{ borderBottom: isLast ? 'none' : '1px solid var(--c-border)' }}
                    >
                      {/* Collapsed row — always visible */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : l.id)}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[var(--c-surface-2)]"
                      >
                        <ChevronDown
                          size={13}
                          style={{
                            color:      '#9B6DFF',
                            flexShrink: 0,
                            transform:  isExpanded ? 'rotate(180deg)' : 'rotate(-90deg)',
                            transition: 'transform 0.18s',
                          }}
                        />
                        <p
                          className="flex-1 text-xs leading-relaxed truncate"
                          style={{ color: 'var(--c-text-2)' }}
                        >
                          {l.content}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {l.source && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: `${sourceColor(l.source)}20`, color: sourceColor(l.source) }}
                            >
                              {SOURCE_LABELS[l.source] ?? l.source}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--c-text-3)' }}>
                            <Clock size={9} />
                            {timeAgo(l.created_at)}
                          </span>
                        </div>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div
                          className="px-4 pb-4 pt-2"
                          style={{ background: 'var(--c-bg)', borderTop: '1px solid var(--c-border)' }}
                        >
                          {canApprove ? (
                            <>
                              <textarea
                                rows={3}
                                value={edited[l.id] ?? l.content}
                                onChange={e => setEdited(p => ({ ...p, [l.id]: e.target.value }))}
                                className="w-full text-sm leading-relaxed mb-3 rounded-lg px-3 py-2 resize-y outline-none"
                                style={{
                                  background: 'var(--c-surface)',
                                  border:     '1px solid rgba(108,59,255,0.2)',
                                  color:      'var(--c-text)',
                                  fontFamily: 'inherit',
                                }}
                              />

                              {/* Category selector */}
                              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Destino:</span>
                                {(['role_kb', 'guardrails'] as const).map(cat => {
                                  const active = (categories[l.id] ?? 'role_kb') === cat;
                                  const cfg    = CATEGORY_LABELS[cat];
                                  const Icon   = cfg.icon;
                                  return (
                                    <button
                                      key={cat}
                                      onClick={() => setCategories(p => ({ ...p, [l.id]: cat }))}
                                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
                                      style={{
                                        background: active ? 'rgba(108,59,255,0.12)' : 'transparent',
                                        color:      active ? '#9B6DFF' : 'var(--c-text-3)',
                                        border:     active ? '1px solid rgba(108,59,255,0.3)' : '1px solid var(--c-border)',
                                      }}
                                    >
                                      <Icon size={11} />
                                      {cfg.label}
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => act(l.id, 'approve')}
                                  disabled={acting[l.id]}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
                                  style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.3)' }}
                                >
                                  <Check size={13} /> Incorporar
                                </button>
                                <button
                                  onClick={() => act(l.id, 'reject')}
                                  disabled={acting[l.id]}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
                                  style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                                >
                                  <X size={13} /> Descartar
                                </button>
                                {actError[l.id] && (
                                  <span className="text-xs" style={{ color: '#f87171' }}>{actError[l.id]}</span>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="text-sm leading-relaxed py-1" style={{ color: 'var(--c-text)' }}>
                              {l.content}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approved history — flat, compact */}
      {approved.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--c-text-3)' }}>
            Ya incorporado
          </p>
          <div className="space-y-2">
            {(showAllApproved ? approved : approved.slice(0, 12)).map(l => (
              <div
                key={l.id}
                className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
              >
                <Check size={13} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text)' }}>
                    {l.content}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] font-medium" style={{ color: 'var(--c-text-3)' }}>
                      {agentLabel(l)}
                    </span>
                    {l.source && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: `${sourceColor(l.source)}18`, color: sourceColor(l.source) }}
                      >
                        {SOURCE_LABELS[l.source] ?? l.source}
                        {l.confidence && l.confidence >= 0.85 ? ' · auto' : ''}
                      </span>
                    )}
                    {l.category && CATEGORY_LABELS[l.category] && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}
                      >
                        {l.category === 'guardrails' ? <ShieldCheck size={9} /> : <BookOpen size={9} />}
                        {CATEGORY_LABELS[l.category].label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {approved.length > 12 && (
            <button
              onClick={() => setShowAllApproved(v => !v)}
              className="mt-2 w-full text-xs py-2 rounded-lg transition-opacity hover:opacity-70"
              style={{ color: 'var(--c-text-3)', background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
            >
              {showAllApproved ? 'Ver menos' : `Ver ${approved.length - 12} más`}
            </button>
          )}
        </div>
      )}

      {/* Rejected — compact, collapsible */}
      {rejected.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-4)' }}>
            Descartados ({rejected.length})
          </p>
          <div className="space-y-1.5">
            {rejected.map(l => (
              <div
                key={l.id}
                className="flex items-start gap-2.5 rounded-lg px-3 py-2"
                style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}
              >
                <X size={12} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs leading-relaxed line-through" style={{ color: 'var(--c-text-4)' }}>
                  {l.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
