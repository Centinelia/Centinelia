'use client';

import { useState, useEffect, useCallback } from 'react';
import { Brain, Check, X, Clock, ChevronDown, BookOpen, ShieldCheck, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/portal-ui';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';

interface AgentRef {
  agent_name:    string | null;
  business_name: string;
  role:          string | null;
  features?:     Record<string, unknown> | null;
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
  agent_id:       string;
  label:          string;
  role:           string | null;
  meerkatColor:   string | null;
  meerkatImg:     string | null;
  meerkatPos:     string;
  meerkatScale:   number;
  learnings:      Learning[];
}

const CATEGORY_LABELS: Record<'role_kb' | 'guardrails', { label: string; icon: typeof BookOpen; hint: string }> = {
  role_kb:    { label: 'Instrucciones del puesto', icon: BookOpen,    hint: 'Info que amplía cómo responder o qué ofrecer.' },
  guardrails: { label: 'Límites de autoridad',     icon: ShieldCheck, hint: 'Regla dura de qué NO hacer o cuándo escalar.' },
};

const SOURCE_LABELS: Record<string, string> = {
  call:     'Llamada',
  email:    'Correo',
  chat:     'Chat',
  document: 'Documento',
  task:     'Tarea',
};

function meerkatFor(va: AgentRef | null): { color: string | null; img: string | null; pos: string; scale: number } {
  const id = (va?.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;
  if (!id) return { color: null, img: null, pos: 'center 3%', scale: 1 };
  const m = MEERKAT_MAP[id as keyof typeof MEERKAT_MAP];
  return {
    color: m?.color ?? null,
    img:   m?.imagen ?? null,
    pos:   m?.avatarPosition ?? 'center 3%',
    scale: m?.avatarScale ?? 1,
  };
}

// Paleta oficial: acciones que consumen minutos = cyan (color jornada 'Solo
// minutos' #0E7490). Acciones que consumen tareas = verde (color jornada
// 'Solo tareas' #10B981). Estandarizamos en todas las secciones.
function sourceColor(source: string | null | undefined): string {
  if (source === 'call') return '#0E7490'; // minutos
  return '#10B981';                         // email / chat / document / task → tareas
}

function agentLabel(l: Learning): string {
  const va = l.voice_agents;
  if (!va) return 'Empleado';
  // Preferimos el nombre del empleado (Nia, Noah, Sofía), no el del negocio.
  // Antes: fallback a business_name mostraba 'Pneuma Studio · recepcionista'
  // que es raro (Pneuma no es empleado, es la org). Ahora fallback a 'Empleado'.
  const name = (va.agent_name ?? '').trim();
  return name || 'Empleado';
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
      const mk = meerkatFor(l.voice_agents);
      map.set(l.agent_id, {
        agent_id:     l.agent_id,
        label:        agentLabel(l),
        role:         l.voice_agents?.role ?? null,
        meerkatColor: mk.color,
        meerkatImg:   mk.img,
        meerkatPos:   mk.pos,
        meerkatScale: mk.scale,
        learnings:    [],
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
  const [removing,        setRemoving]        = useState<Record<string, boolean>>({});
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  async function removeApproved(id: string) {
    setRemoving(p => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/portal/${token}/learnings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setLearnings(prev => prev.filter(l => l.id !== id));
        setConfirmRemoveId(null);
      }
    } finally {
      setRemoving(p => { const n = { ...p }; delete n[id]; return n; });
    }
  }

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
                ? 'Aprendizajes con baja certeza que el equipo escaló para tu confirmación. Lo aprendido con certeza ya se aplicó solo.'
                : 'Aprendizajes con baja certeza que el equipo escaló para revisión.'}
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
              title={pending.length === 0 && approved.length === 0 ? 'Sin aprendizajes por revisar' : 'Nada pendiente por revisar'}
              description={pending.length === 0 && approved.length === 0
                ? 'Cuando tu equipo aprenda algo que no pueda confirmar solo, aparecerá aquí para tu revisión. Lo aprendido con certeza se aplica sin pedir permiso.'
                : 'Todo revisado. Los nuevos aparecen aquí solo cuando el equipo dude.'}
              size="sm"
            />
          </div>
        )}

        {!loading && groups.length > 0 && (
          <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
            {groups.map((group, gIdx) => (
              <div key={group.agent_id}
                style={{ borderBottom: gIdx === groups.length - 1 ? 'none' : '1px solid #F0EDF9' }}>

                {/* Agent header — con avatar del meerkat y su color de rol */}
                <div className="flex items-center gap-2.5 px-5 py-3"
                  style={{ background: '#FAFAFB' }}>
                  {group.meerkatImg ? (
                    <div
                      style={{
                        width: 26, height: 26, borderRadius: '50%',
                        overflow: 'hidden',
                        border: `1.5px solid ${group.meerkatColor ?? '#6C3BFF'}45`,
                        background: '#ffffff',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={group.meerkatImg}
                        alt={group.label}
                        style={{
                          width: '100%', height: '100%',
                          objectFit: 'cover',
                          objectPosition: group.meerkatPos,
                          transform: group.meerkatScale !== 1 ? `scale(${group.meerkatScale})` : 'none',
                          transformOrigin: group.meerkatPos,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{
                        background: `${group.meerkatColor ?? '#6C3BFF'}20`,
                        color:      group.meerkatColor ?? '#6C3BFF',
                      }}>
                      {group.label.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-[12px] font-semibold" style={{ color: group.meerkatColor ?? '#1A0A3B' }}>
                    {group.label}
                  </span>
                  {group.role && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: `${group.meerkatColor ?? '#6C3BFF'}12`,
                        color:      group.meerkatColor ?? '#6C3BFF',
                      }}>
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
                        <div className="px-5 py-4 flex flex-col gap-4" style={{ background: '#FAFAFB', borderTop: '1px solid #F0EDF9' }}>
                          {canApprove ? (
                            <>
                              {/* Contexto: fuente + confidence */}
                              <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: '#9B8FB5' }}>
                                <span>Origen:</span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
                                  style={{ background: `${sourceColor(l.source)}18`, color: sourceColor(l.source) }}>
                                  {SOURCE_LABELS[l.source ?? 'call'] ?? 'evento'}
                                </span>
                                {typeof l.confidence === 'number' && (
                                  <>
                                    <span>·</span>
                                    <span>Certeza {Math.round((l.confidence ?? 0) * 100)}%</span>
                                  </>
                                )}
                                {l.vapi_call_id && (
                                  <>
                                    <span>·</span>
                                    <a
                                      href={`/portal/${token}/oficina/llamadas?open=${encodeURIComponent(l.vapi_call_id)}`}
                                      className="underline hover:opacity-70"
                                      style={{ color: '#6C3BFF' }}
                                    >
                                      Ver llamada
                                    </a>
                                  </>
                                )}
                              </div>

                              {/* Editar contenido */}
                              <div>
                                <label className="block text-[11px] font-semibold mb-1.5" style={{ color: '#6B6480' }}>
                                  Confirma o edita antes de incorporar
                                </label>
                                <textarea
                                  rows={3}
                                  value={edited[l.id] ?? l.content}
                                  onChange={e => setEdited(p => ({ ...p, [l.id]: e.target.value }))}
                                  className="w-full text-[13px] leading-relaxed rounded-lg px-3 py-2 resize-y outline-none"
                                  style={{
                                    background: '#ffffff',
                                    border:     '1px solid #E8E3F5',
                                    color:      '#1A0A3B',
                                    fontFamily: 'inherit',
                                  }}
                                />
                              </div>

                              {/* Category selector con hint */}
                              <div>
                                <label className="block text-[11px] font-semibold mb-1.5" style={{ color: '#6B6480' }}>
                                  Dónde guardarlo
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(['role_kb', 'guardrails'] as const).map(cat => {
                                    const active = (categories[l.id] ?? 'role_kb') === cat;
                                    const cfg    = CATEGORY_LABELS[cat];
                                    const Icon   = cfg.icon;
                                    return (
                                      <button
                                        key={cat}
                                        onClick={() => setCategories(p => ({ ...p, [l.id]: cat }))}
                                        className="flex items-start gap-2 text-left rounded-lg p-3 transition-all"
                                        style={{
                                          background: active ? 'rgba(108,59,255,0.08)' : '#ffffff',
                                          border:     active ? '1px solid rgba(108,59,255,0.4)' : '1px solid #E8E3F5',
                                        }}
                                      >
                                        <Icon size={13} className="mt-0.5 flex-shrink-0" style={{ color: active ? '#6C3BFF' : '#9B8FB5' }} />
                                        <div>
                                          <p className="text-[12px] font-semibold" style={{ color: active ? '#6C3BFF' : '#1A0A3B' }}>
                                            {cfg.label}
                                          </p>
                                          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: active ? 'rgba(108,59,255,0.85)' : '#9B8FB5' }}>
                                            {cfg.hint}
                                          </p>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => act(l.id, 'approve')}
                                  disabled={acting[l.id]}
                                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3 h-8 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                                  style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
                                >
                                  <Check size={13} /> Incorporar al conocimiento
                                </button>
                                <button
                                  onClick={() => act(l.id, 'reject')}
                                  disabled={acting[l.id]}
                                  className="flex items-center gap-1.5 text-[12px] font-medium px-3 h-8 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-50"
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
                            <p className="text-[13px] leading-relaxed" style={{ color: '#1A0A3B' }}>
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
            {visibleApproved.map((l, idx) => {
              const mk = meerkatFor(l.voice_agents);
              const agentColor = mk.color ?? '#6B6480';
              return (
              <div key={l.id}
                className="group flex items-start gap-2.5 px-5 py-3"
                style={{ borderBottom: idx === visibleApproved.length - 1 && approved.length <= 12 ? 'none' : '1px solid #F0EDF9' }}>
                <Check size={13} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] leading-relaxed" style={{ color: '#1A0A3B' }}>
                    {l.content}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] font-semibold" style={{ color: agentColor }}>
                      {agentLabel(l)}
                    </span>
                    {l.source && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: `${sourceColor(l.source)}18`, color: sourceColor(l.source) }}>
                        {SOURCE_LABELS[l.source] ?? l.source}
                      </span>
                    )}
                    {typeof l.confidence === 'number' && l.confidence >= 0.85 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        title="Aprendizaje incorporado sin necesidad de tu aprobación (alta certeza)"
                        style={{ background: 'rgba(34,197,94,0.10)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}
                      >
                        Sin revisión humana
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

                {/* Eliminar — sin necesidad de ir a la config del empleado */}
                {confirmRemoveId === l.id ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => removeApproved(l.id)}
                      disabled={removing[l.id]}
                      className="text-[11px] font-semibold px-2.5 h-7 rounded-md transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >
                      {removing[l.id] ? 'Quitando…' : 'Confirmar'}
                    </button>
                    <button
                      onClick={() => setConfirmRemoveId(null)}
                      disabled={removing[l.id]}
                      className="text-[11px] font-medium px-2.5 h-7 rounded-md transition-opacity hover:opacity-70 disabled:opacity-50"
                      style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5', cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRemoveId(l.id)}
                    title="Quitar del conocimiento del empleado"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded"
                    style={{ background: 'transparent', border: 'none', color: '#9B8FB5', cursor: 'pointer' }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              );
            })}
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
