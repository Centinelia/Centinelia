'use client';

import { useState, useEffect, useCallback } from 'react';
import { Brain, Check, X, Clock, ChevronDown, BookOpen, ShieldCheck } from 'lucide-react';
import { EmptyState } from '@/components/portal-ui';

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
  source?:      'call' | 'email' | 'chat' | 'document' | 'task' | null;
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
  call:     'llamada',
  email:    'correo',
  chat:     'chat',
  document: 'documento',
  task:     'tarea',
};

function sourceColor(source: string | null | undefined): string {
  if (source === 'email')    return '#0ea5e9';
  if (source === 'chat')     return '#22c55e';
  if (source === 'document') return '#f59e0b';
  if (source === 'task')     return '#ec4899';
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

  const visibleApproved = showAllApproved ? approved : approved.slice(0, 12);

  return (
    <div className="flex flex-col gap-4">

      {/* Pending — surface único con dividers, agrupado por agente */}
      <div className="flex flex-col rounded-2xl overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
        <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                Aprendizajes pendientes
              </h2>
              {pending.length > 0 && (
                <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                  {pending.length}
                </span>
              )}
            </div>
            <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
              {canApprove
                ? 'Revisa y aprueba lo que tu equipo aprendió esta semana.'
                : 'Notas que el equipo aprendió esta semana.'}
            </p>
          </div>
        </div>

        {loading && (
          <div className="px-5 py-6" style={{ borderTop: '1px solid #F0EDF9' }}>
            <p className="text-[13px]" style={{ color: '#6B6480' }}>Cargando...</p>
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div style={{ borderTop: '1px solid #F0EDF9' }}>
            <EmptyState
              icon={Brain}
              title={pending.length === 0 && approved.length === 0 ? 'Sin aprendizajes aún' : 'Nada pendiente por revisar'}
              description={pending.length === 0 && approved.length === 0
                ? 'Los aprendizajes aparecen aquí cuando el equipo termina llamadas. Puedes aprobarlos para que tu empleado los incorpore a su conocimiento.'
                : 'Todo revisado. Los nuevos aprendizajes aparecerán aquí conforme tu equipo trabaje.'}
              size="sm"
            />
          </div>
        )}

        {!loading && groups.length > 0 && (
          <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
            {groups.map((group, gIdx) => (
              <div key={group.agent_id}
                style={{ borderBottom: gIdx === groups.length - 1 ? 'none' : '1px solid #F0EDF9' }}>

                {/* Agent header */}
                <div className="flex items-center gap-2.5 px-5 py-3"
                  style={{ background: '#FAFAFB' }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ background: 'rgba(108,59,255,0.15)', color: '#6C3BFF' }}>
                    {group.label.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[12px] font-semibold" style={{ color: '#1A0A3B' }}>
                    {group.label}
                  </span>
                  {group.role && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}>
                      {group.role}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] font-medium tabular-nums" style={{ color: '#6B6480' }}>
                    {group.learnings.length} {group.learnings.length === 1 ? 'aprendizaje' : 'aprendizajes'}
                  </span>
                </div>

                {/* Learning rows */}
                {group.learnings.map((l) => {
                  const isExpanded = expandedId === l.id;
                  return (
                    <div key={l.id}
                      style={{ borderTop: '1px solid #F0EDF9' }}>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : l.id)}
                        className="w-full flex items-center gap-2.5 px-5 py-3 text-left transition-colors"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        <ChevronDown size={13}
                          style={{
                            color: '#6C3BFF',
                            flexShrink: 0,
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(-90deg)',
                            transition: 'transform 0.18s',
                          }}
                        />
                        <p className="flex-1 text-[12px] leading-relaxed truncate"
                          style={{ color: '#1A0A3B' }}>
                          {l.content}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {l.source && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: `${sourceColor(l.source)}20`, color: sourceColor(l.source) }}>
                              {SOURCE_LABELS[l.source] ?? l.source}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[10px]" style={{ color: '#9B8FB5' }}>
                            <Clock size={9} />
                            {timeAgo(l.created_at)}
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-5 pb-4 pt-2" style={{ background: '#FAFAFB', borderTop: '1px solid #F0EDF9' }}>
                          {canApprove ? (
                            <>
                              <textarea
                                rows={3}
                                value={edited[l.id] ?? l.content}
                                onChange={e => setEdited(p => ({ ...p, [l.id]: e.target.value }))}
                                className="w-full text-[13px] leading-relaxed mb-3 rounded-lg px-3 py-2 resize-y outline-none"
                                style={{
                                  background: '#ffffff',
                                  border:     '1px solid #E8E3F5',
                                  color:      '#1A0A3B',
                                  fontFamily: 'inherit',
                                }}
                              />

                              {/* Category selector */}
                              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                                <span className="text-[11px]" style={{ color: '#6B6480' }}>Destino:</span>
                                {(['role_kb', 'guardrails'] as const).map(cat => {
                                  const active = (categories[l.id] ?? 'role_kb') === cat;
                                  const cfg    = CATEGORY_LABELS[cat];
                                  const Icon   = cfg.icon;
                                  return (
                                    <button
                                      key={cat}
                                      onClick={() => setCategories(p => ({ ...p, [l.id]: cat }))}
                                      className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all"
                                      style={{
                                        background: active ? 'rgba(108,59,255,0.12)' : '#ffffff',
                                        color:      active ? '#6C3BFF' : '#6B6480',
                                        border:     active ? '1px solid rgba(108,59,255,0.3)' : '1px solid #E8E3F5',
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
                                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3 h-7 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                                  style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
                                >
                                  <Check size={13} /> Incorporar
                                </button>
                                <button
                                  onClick={() => act(l.id, 'reject')}
                                  disabled={acting[l.id]}
                                  className="flex items-center gap-1.5 text-[12px] font-medium px-3 h-7 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-50"
                                  style={{ background: '#ffffff', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                                >
                                  <X size={13} /> Descartar
                                </button>
                                {actError[l.id] && (
                                  <span className="text-[11px]" style={{ color: '#ef4444' }}>{actError[l.id]}</span>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="text-[13px] leading-relaxed py-1" style={{ color: '#1A0A3B' }}>
                              {l.content}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approved history — surface único */}
      {approved.length > 0 && (
        <div className="flex flex-col rounded-2xl overflow-hidden"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                  Ya incorporado
                </h2>
                <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                  {approved.length}
                </span>
              </div>
              <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
                Aprendizajes que tu equipo ya conoce.
              </p>
            </div>
          </div>

          <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
            {visibleApproved.map((l, idx) => (
              <div key={l.id}
                className="flex items-start gap-2.5 px-5 py-3"
                style={{ borderBottom: idx === visibleApproved.length - 1 && approved.length <= 12 ? 'none' : '1px solid #F0EDF9' }}>
                <Check size={13} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] leading-relaxed" style={{ color: '#1A0A3B' }}>
                    {l.content}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] font-medium" style={{ color: '#6B6480' }}>
                      {agentLabel(l)}
                    </span>
                    {l.source && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: `${sourceColor(l.source)}18`, color: sourceColor(l.source) }}>
                        {SOURCE_LABELS[l.source] ?? l.source}
                        {l.confidence && l.confidence >= 0.85 ? ' · auto' : ''}
                      </span>
                    )}
                    {l.category && CATEGORY_LABELS[l.category] && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                        {l.category === 'guardrails' ? <ShieldCheck size={9} /> : <BookOpen size={9} />}
                        {CATEGORY_LABELS[l.category].label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {approved.length > 12 && (
              <button
                onClick={() => setShowAllApproved(v => !v)}
                className="text-[12px] py-3 transition-opacity hover:opacity-70"
                style={{ color: '#6B6480', background: '#FAFAFB', border: 'none', borderTop: '1px solid #F0EDF9', cursor: 'pointer' }}
              >
                {showAllApproved ? 'Ver menos' : `Ver ${approved.length - 12} más`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Rejected — surface único compact */}
      {rejected.length > 0 && (
        <div className="flex flex-col rounded-2xl overflow-hidden"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                  Descartados
                </h2>
                <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                  {rejected.length}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
            {rejected.map((l, idx) => (
              <div key={l.id}
                className="flex items-start gap-2.5 px-5 py-2.5"
                style={{ borderBottom: idx === rejected.length - 1 ? 'none' : '1px solid #F0EDF9' }}>
                <X size={12} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                <p className="text-[12px] leading-relaxed line-through" style={{ color: '#9B8FB5' }}>
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
