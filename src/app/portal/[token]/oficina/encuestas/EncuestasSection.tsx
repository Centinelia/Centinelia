'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, Trash2, BarChart2, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, X, MessageSquare, Loader2 } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type QuestionType = 'rating_5' | 'rating_10' | 'si_no' | 'multiple' | 'texto';

interface Question {
  id:        string;
  survey_id: string;
  orden:     number;
  texto:     string;
  tipo:      QuestionType;
  opciones:  string[] | null;
}

interface Survey {
  id:               string;
  nombre:           string;
  descripcion:      string | null;
  activa:           boolean;
  auto_apply:       boolean;
  created_at:       string;
  survey_questions?: Question[];
}

interface Aggregate {
  question_id:   string;
  tipo:          string;
  count:         number;
  avg?:          number | null;
  distribution?: Record<string, number>;
  si?:           number;
  no?:           number;
  pct_si?:       number | null;
  texts?:        string[];
}

interface Results {
  total:      number;
  aggregates: Aggregate[];
  questions:  Question[];
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  rating_5:  'Calificación 1–5',
  rating_10: 'Calificación 1–10',
  si_no:     'Sí / No',
  multiple:  'Opción múltiple',
  texto:     'Respuesta libre',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ResultBar({ label, count, total, color = '#6C3BFF' }: { label: string; count: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-6 text-right tabular-nums shrink-0" style={{ color: 'var(--c-text-3)' }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 10, background: 'var(--c-border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 9999, transition: 'width 0.4s' }} />
      </div>
      <span className="w-8 text-right tabular-nums shrink-0" style={{ color: 'var(--c-text-3)' }}>{count}</span>
    </div>
  );
}

function AggregateBlock({ agg, question }: { agg: Aggregate; question: Question }) {
  if (!agg.count) return (
    <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Sin respuestas aún.</p>
  );

  if (agg.tipo === 'rating_5' || agg.tipo === 'rating_10') {
    const max  = agg.tipo === 'rating_5' ? 5 : 10;
    const dist = agg.distribution ?? {};
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>
          Promedio: <span style={{ color: '#9B6DFF' }}>{agg.avg?.toFixed(1) ?? '—'}</span>
          <span className="font-normal ml-1" style={{ color: 'var(--c-text-4)' }}>/ {max} · {agg.count} respuestas</span>
        </p>
        <div className="flex flex-col gap-1 mt-1">
          {Array.from({ length: max }, (_, i) => i + 1).map(n => (
            <ResultBar key={n} label={String(n)} count={dist[String(n)] ?? 0} total={agg.count} />
          ))}
        </div>
      </div>
    );
  }

  if (agg.tipo === 'si_no') {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>
          {agg.count} respuestas · <span style={{ color: '#22c55e' }}>{agg.pct_si ?? 0}% sí</span>
        </p>
        <div className="flex flex-col gap-1 mt-1">
          <ResultBar label="Sí" count={agg.si ?? 0} total={agg.count} color="#22c55e" />
          <ResultBar label="No" count={agg.no ?? 0} total={agg.count} color="#ef4444" />
        </div>
      </div>
    );
  }

  if (agg.tipo === 'multiple') {
    const dist = agg.distribution ?? {};
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>{agg.count} respuestas</p>
        <div className="flex flex-col gap-1 mt-1">
          {Object.entries(dist).map(([opt, cnt]) => (
            <ResultBar key={opt} label={opt} count={cnt} total={agg.count} />
          ))}
        </div>
      </div>
    );
  }

  // texto
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>{agg.count} respuestas</p>
      <div className="flex flex-col gap-1 max-h-32 overflow-y-auto mt-1">
        {(agg.texts ?? []).map((t, i) => (
          <p key={i} className="text-xs px-2 py-1.5 rounded-lg"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }}>
            {t}
          </p>
        ))}
      </div>
    </div>
  );
}

function deriveHallazgo(agg: Aggregate): string | null {
  if (!agg.count) return null;
  if (agg.tipo === 'rating_5' && agg.avg != null) {
    if (agg.avg >= 4.5) return `Alta satisfacción: promedio de ${agg.avg.toFixed(1)} / 5.`;
    if (agg.avg < 3)    return `Área de mejora: promedio de ${agg.avg.toFixed(1)} / 5.`;
  }
  if (agg.tipo === 'rating_10' && agg.avg != null) {
    if (agg.avg >= 8) return `Alta satisfacción: promedio de ${agg.avg.toFixed(1)} / 10.`;
    if (agg.avg < 6)  return `Área de mejora: promedio de ${agg.avg.toFixed(1)} / 10.`;
  }
  if (agg.tipo === 'si_no') {
    const pct = agg.pct_si ?? 0;
    if (pct >= 75) return `${pct}% respondió que sí.`;
    if (pct <= 25) return `Solo ${pct}% respondió que sí.`;
  }
  if (agg.tipo === 'multiple' && agg.distribution) {
    const entries = Object.entries(agg.distribution).sort(([, a], [, b]) => b - a);
    if (entries.length) {
      const [top, cnt] = entries[0];
      return `La opción más elegida fue "${top}" (${Math.round((cnt / agg.count) * 100)}%).`;
    }
  }
  return null;
}

// ── Survey card ────────────────────────────────────────────────────────────────

function SurveyCard({
  survey,
  token,
  onToggle,
  onDelete,
}: {
  survey:   Survey;
  token:    string;
  onToggle: (id: string, field: 'activa' | 'auto_apply', val: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [open,       setOpen]       = useState(false);
  const [view,       setView]       = useState<'hallazgos' | 'preguntas'>('hallazgos');
  const [questions,  setQuestions]  = useState<Question[]>(survey.survey_questions ?? []);
  const [results,    setResults]    = useState<Results | null>(null);
  const [loadingRes, setLoadingRes] = useState(false);

  const resultsRef = useRef<Results | null>(null);
  const loadingRef = useRef(false);

  const [addOpen,   setAddOpen]   = useState(false);
  const [qTexto,    setQTexto]    = useState('');
  const [qTipo,     setQTipo]     = useState<QuestionType>('rating_5');
  const [qOpciones, setQOpciones] = useState('');
  const [saving,    setSaving]    = useState(false);

  const loadResults = useCallback(async () => {
    if (resultsRef.current || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingRes(true);
    try {
      const res = await fetch(`/api/portal/${token}/surveys/${survey.id}/results`);
      if (res.ok) {
        const d = await res.json() as Results;
        resultsRef.current = d;
        setResults(d);
      }
    } finally {
      loadingRef.current = false;
      setLoadingRes(false);
    }
  }, [token, survey.id]);

  // Auto-load results for active surveys on mount
  useEffect(() => { if (survey.activa) loadResults(); }, [survey.activa, loadResults]);
  // Also load when card is opened (covers inactive surveys that get expanded)
  useEffect(() => { if (open) loadResults(); }, [open, loadResults]);

  const hallazgos = useMemo(() => {
    if (!results?.questions.length) return [];
    return results.questions
      .map(q => {
        const agg    = results.aggregates.find(a => a.question_id === q.id);
        if (!agg) return null;
        const insight = deriveHallazgo(agg);
        return insight ? { question: q, insight } : null;
      })
      .filter((x): x is { question: Question; insight: string } => x !== null);
  }, [results]);

  const primaryAvg = useMemo(() => {
    if (!results?.aggregates.length) return null;
    const ra = results.aggregates.find(a => a.tipo === 'rating_5' || a.tipo === 'rating_10');
    if (!ra || ra.avg == null) return null;
    return { avg: ra.avg, max: ra.tipo === 'rating_5' ? 5 : 10 };
  }, [results]);

  const addQuestion = async () => {
    if (!qTexto.trim()) return;
    setSaving(true);
    const nextOrden = (questions[questions.length - 1]?.orden ?? 0) + 1;
    const body: Record<string, unknown> = { orden: nextOrden, texto: qTexto.trim(), tipo: qTipo };
    if (qTipo === 'multiple') {
      body.opciones = qOpciones.split(',').map(s => s.trim()).filter(Boolean);
    }
    const res = await fetch(`/api/portal/${token}/surveys/${survey.id}/questions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (res.ok) {
      const d = await res.json() as { question: Question };
      setQuestions(prev => [...prev, d.question]);
      setAddOpen(false); setQTexto(''); setQTipo('rating_5'); setQOpciones('');
    }
    setSaving(false);
  };

  const deleteQuestion = async (qid: string) => {
    const res = await fetch(`/api/portal/${token}/surveys/${survey.id}/questions?question_id=${qid}`, { method: 'DELETE' });
    if (res.ok) setQuestions(prev => prev.filter(q => q.id !== qid));
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>
            {survey.nombre}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
            style={{
              background: survey.activa ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
              color:      survey.activa ? '#22c55e'               : 'var(--c-text-4)',
            }}
          >
            {survey.activa ? 'Activa' : 'Inactiva'}
          </span>
          {results !== null && results.total > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF' }}
            >
              {results.total} resp.
            </span>
          )}
          {primaryAvg && (
            <span className="text-[10px] font-semibold shrink-0" style={{ color: '#F59E0B' }}>
              {primaryAvg.avg.toFixed(1)} / {primaryAvg.max}
            </span>
          )}
          {loadingRes && (
            <Loader2 size={11} className="animate-spin shrink-0" style={{ color: 'var(--c-text-4)' }} />
          )}
          <div className="ml-auto shrink-0 pl-2">
            {open
              ? <ChevronUp   size={13} style={{ color: 'var(--c-text-4)' }} />
              : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />
            }
          </div>
        </button>
        <button
          onClick={() => onDelete(survey.id)}
          className="p-1 rounded-lg shrink-0 transition-opacity hover:opacity-60"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-4)' }}
          title="Eliminar"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--c-border)' }}>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4 px-4 pt-3 pb-2">
            <button
              onClick={() => onToggle(survey.id, 'activa', !survey.activa)}
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: survey.activa ? '#22c55e' : 'var(--c-text-3)', padding: 0 }}
            >
              {survey.activa ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
              Activa
            </button>
            <button
              onClick={() => onToggle(survey.id, 'auto_apply', !survey.auto_apply)}
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: survey.auto_apply ? '#6C3BFF' : 'var(--c-text-3)', padding: 0 }}
            >
              {survey.auto_apply ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
              Aplicar al final de cada llamada
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-4 pb-2">
            {(['hallazgos', 'preguntas'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-1 rounded-lg text-xs font-medium"
                style={{
                  background: view === v ? 'rgba(108,59,255,0.12)' : 'transparent',
                  color:      view === v ? '#9B6DFF'               : 'var(--c-text-3)',
                  border:     'none',
                  cursor:     'pointer',
                }}
              >
                {v === 'hallazgos'
                  ? <span className="flex items-center gap-1"><BarChart2 size={11} /> Hallazgos</span>
                  : 'Preguntas'
                }
              </button>
            ))}
          </div>

          {/* Hallazgos tab */}
          {view === 'hallazgos' && (
            <div className="px-4 pb-4 flex flex-col gap-4">
              {loadingRes && (
                <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Cargando resultados...</p>
              )}
              {!loadingRes && !results && !survey.activa && (
                <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                  Activa la encuesta para que el empleado la aplique y ver resultados aquí.
                </p>
              )}
              {!loadingRes && results && (
                <>
                  {hallazgos.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-4)' }}>
                        Hallazgos
                      </p>
                      {hallazgos.map(({ question, insight }) => (
                        <div
                          key={question.id}
                          className="flex gap-2 px-3 py-2 rounded-lg"
                          style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.12)' }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: '#6C3BFF' }} />
                          <div>
                            <p className="text-[10px] leading-snug" style={{ color: 'var(--c-text-4)' }}>
                              {question.texto}
                            </p>
                            <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--c-text-2)' }}>
                              {insight}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      {results.total} respuesta{results.total !== 1 ? 's' : ''} recopilada{results.total !== 1 ? 's' : ''}
                    </p>
                    {results.questions.length === 0 && (
                      <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                        Sin preguntas configuradas. Ve a Preguntas para agregarlas.
                      </p>
                    )}
                    {results.questions.map(q => {
                      const agg = results.aggregates.find(a => a.question_id === q.id);
                      return (
                        <div key={q.id} className="flex flex-col gap-2">
                          <p className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                            {q.orden}. {q.texto}
                          </p>
                          {agg
                            ? <AggregateBlock agg={agg} question={q} />
                            : <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Sin respuestas.</p>
                          }
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Preguntas tab */}
          {view === 'preguntas' && (
            <div className="px-4 pb-4 flex flex-col gap-2">
              {questions.length === 0 && !addOpen && (
                <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Sin preguntas. Agrega la primera.</p>
              )}

              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
                >
                  <span
                    className="text-[10px] font-bold tabular-nums mt-0.5 shrink-0"
                    style={{ color: 'var(--c-text-4)', minWidth: 16 }}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>{q.texto}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                      {QUESTION_TYPE_LABELS[q.tipo]}
                      {q.tipo === 'multiple' && q.opciones?.length ? `: ${q.opciones.join(', ')}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteQuestion(q.id)}
                    className="p-1 transition-opacity hover:opacity-60 shrink-0"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-4)' }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {addOpen ? (
                <div
                  className="flex flex-col gap-2 p-3 rounded-lg mt-1"
                  style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.2)' }}
                >
                  <textarea
                    value={qTexto}
                    onChange={e => setQTexto(e.target.value)}
                    rows={2}
                    placeholder="Texto de la pregunta *"
                    className="w-full px-3 py-2 rounded-lg text-xs resize-none"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                  />
                  <select
                    value={qTipo}
                    onChange={e => setQTipo(e.target.value as QuestionType)}
                    className="w-full px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                  >
                    {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  {qTipo === 'multiple' && (
                    <input
                      value={qOpciones}
                      onChange={e => setQOpciones(e.target.value)}
                      placeholder="Opciones separadas por coma: excelente, bueno, regular, malo"
                      className="w-full px-3 py-2 rounded-lg text-xs"
                      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={addQuestion}
                      disabled={saving || !qTexto.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                    >
                      {saving ? 'Guardando...' : 'Agregar pregunta'}
                    </button>
                    <button
                      onClick={() => setAddOpen(false)}
                      className="px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: 'none', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 text-xs self-start mt-1 transition-opacity hover:opacity-70"
                  style={{ background: 'none', border: 'none', color: '#9B6DFF', cursor: 'pointer', padding: 0 }}
                >
                  <Plus size={12} /> Agregar pregunta
                </button>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function EncuestasSection({ token, agentName }: { token: string; agentName?: string }) {
  const [surveys,      setSurveys]      = useState<Survey[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showCreate,   setShowCreate]   = useState(false);
  const [nombre,       setNombre]       = useState('');
  const [desc,         setDesc]         = useState('');
  const [saving,       setSaving]       = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const employeeName    = agentName ?? 'Tu empleado';
  const activeSurveys   = surveys.filter(s => s.activa);
  const inactiveSurveys = surveys.filter(s => !s.activa);

  useEffect(() => {
    fetch(`/api/portal/${token}/surveys`)
      .then(r => r.json())
      .then((d: { surveys: Survey[] }) => setSurveys(d.surveys ?? []))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCreate = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/portal/${token}/surveys`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nombre: nombre.trim(), descripcion: desc.trim() || null }),
    });
    if (res.ok) {
      const d = await res.json() as { survey: Survey };
      setSurveys(prev => [{ ...d.survey, survey_questions: [] }, ...prev]);
      setShowCreate(false); setNombre(''); setDesc('');
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, field: 'activa' | 'auto_apply', val: boolean) => {
    setSurveys(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
    await fetch(`/api/portal/${token}/surveys/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ [field]: val }),
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta encuesta y todos sus datos?')) return;
    const res = await fetch(`/api/portal/${token}/surveys/${id}`, { method: 'DELETE' });
    if (res.ok) setSurveys(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>Calidad</h1>
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--c-text-3)', maxWidth: 560 }}>
          {employeeName} pregunta, escucha y trae los datos. Aquí ves qué piensa realmente tu mercado.
        </p>
      </div>

      {/* Activity block */}
      {activeSurveys.length > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)' }}
        >
          <MessageSquare size={15} style={{ color: '#9B6DFF' }} />
          <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>
            <span className="font-semibold">{employeeName}</span>{' '}
            {activeSurveys.length === 1
              ? <>aplica la encuesta <span className="font-semibold">"{activeSurveys[0].nombre}"</span> en sus llamadas.</>
              : <>aplica {activeSurveys.length} encuestas activas en sus llamadas.</>
            }
          </p>
        </div>
      )}

      {/* Surveys section */}
      <div className="flex flex-col gap-4">

        {/* Section header */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-4)' }}>
            {activeSurveys.length > 0 ? `Activas · ${activeSurveys.length}` : 'Encuestas'}
          </p>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)', color: '#9B6DFF', cursor: 'pointer' }}
          >
            <Plus size={12} /> Nueva encuesta
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div
            className="flex flex-col gap-2 p-4 rounded-xl"
            style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.2)' }}
          >
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Nombre de la encuesta *"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
            />
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Descripción breve (opcional)"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={saving || !nombre.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Creando...' : 'Crear encuesta'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-xs"
                style={{ background: 'none', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {loading && (
          <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Cargando...</p>
        )}

        {/* Empty state */}
        {!loading && surveys.length === 0 && !showCreate && (
          <div
            className="rounded-xl p-6 flex flex-col gap-4"
            style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(108,59,255,0.1)' }}
              >
                <BarChart2 size={16} style={{ color: '#9B6DFF' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Aún no hay encuestas</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                  Crea una y actívala para que {employeeName} la aplique en cada llamada.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 pl-12">
              {[
                'Satisfacción al cierre de soporte: calificación 1–10',
                'Calidad de atención: ¿te resolvieron tu duda? sí/no + comentario',
                'Post-venta: ¿recomendarías el servicio? con opciones múltiples',
              ].map(ex => (
                <div key={ex} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--c-text-4)' }} />
                  <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>{ex}</p>
                </div>
              ))}
            </div>
            <div className="pl-12">
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: '#9B6DFF', cursor: 'pointer' }}
              >
                <Plus size={12} /> Crear primera encuesta
              </button>
            </div>
          </div>
        )}

        {/* Active surveys */}
        {activeSurveys.map(s => (
          <SurveyCard
            key={s.id}
            survey={s}
            token={token}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        ))}

        {/* Inactive surveys — collapsible */}
        {inactiveSurveys.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowInactive(v => !v)}
              className="flex items-center gap-2 text-xs transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-4)', padding: 0 }}
            >
              {showInactive
                ? <ChevronUp   size={12} />
                : <ChevronDown size={12} />
              }
              Inactivas ({inactiveSurveys.length})
            </button>
            {showInactive && inactiveSurveys.map(s => (
              <SurveyCard
                key={s.id}
                survey={s}
                token={token}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
