'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, ChevronDown, ChevronUp, Trash2, Upload, Clock, Users, Search } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';

interface ActionItem {
  task:     string;
  assignee: string | null;
  due:      string | null;
}

interface MeetingData {
  title:        string;
  date:         string;
  participants: string[];
  summary:      string;
  decisions:    string[];
  action_items: ActionItem[];
  next_steps:   string;
}

interface Meeting {
  id:           string;
  agent_id:     string;
  title:        string;
  participants: string[];
  audio_url:    string;
  status:       'pending' | 'processing' | 'done' | 'error';
  transcript:   string | null;
  meeting_data: MeetingData | null;
  processed_at: string | null;
  created_at:   string;
}

const STATUS_CFG = {
  pending:    { label: 'Pendiente',   color: '#6b7280' },
  processing: { label: 'Procesando', color: '#f59e0b' },
  done:       { label: 'Listo',       color: '#22c55e' },
  error:      { label: 'Error',       color: '#ef4444' },
};

export default function OpsMeetingsSection({ token }: { token: string }) {
  const [meetings, setMeetings]   = useState<Meeting[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [showForm, setShowForm]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab]             = useState<'data' | 'transcript'>('data');
  const [search, setSearch]       = useState('');
  const fileRef                   = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title:        '',
    participants: '',
    instructions: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-meetings`);
      const data = await res.json();
      setMeetings(data.meetings ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Poll for processing meetings
  useEffect(() => {
    const processing = meetings.some(m => m.status === 'processing' || m.status === 'pending');
    if (!processing) return;
    const interval = setInterval(() => load(), 5000);
    return () => clearInterval(interval);
  }, [meetings, load]);

  const markRead = useCallback((id: string) => {
    fetch(`/api/portal/${token}/read-receipt`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ item_type: 'meeting', item_id: id }),
    }).catch(() => {});
  }, [token]);

  function toggle(id: string) {
    const isOpening = !expanded.has(id);
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (isOpening) markRead(id);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !form.title) return;

    setUploading(true);
    try {
      // Step 1: get a presigned URL (no file passes through our server)
      const ext = file.name.split('.').pop() ?? 'mp4';
      const urlRes = await fetch(`/api/portal/${token}/upload-audio`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ext }),
      });
      if (!urlRes.ok) throw new Error('Error obteniendo URL de subida');
      const { signedUrl, publicUrl } = await urlRes.json();

      // Step 2: upload directly to Supabase — no size limit through Next.js
      const putRes = await fetch(signedUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
        body:    file,
      });
      if (!putRes.ok) throw new Error('Error al subir el archivo');

      // Step 3: create the meeting record and kick off processing
      const participants = form.participants
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      await fetch(`/api/portal/${token}/ops-meetings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: form.title, participants, audio_url: publicUrl, instructions: form.instructions || undefined }),
      });

      setForm({ title: '', participants: '', instructions: '' });
      setShowForm(false);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      console.error(err);
      alert('Error al subir el audio. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta junta?')) return;
    await fetch(`/api/portal/${token}/ops-meetings`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
          <Mic size={13} /> Juntas e inteligencia
          <InfoTooltip text={"Sube el audio de una junta y tu empleado lo analiza con IA: extrae decisiones tomadas, tareas asignadas y próximos pasos, y genera el acta lista para compartir.\n\nSoporta audios de hasta 90 minutos."} />
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.18)', color: 'var(--c-text-4)' }}
          >
            1–6 tareas / junta
          </span>
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)', color: '#9B6DFF' }}>
          <Upload size={12} /> Subir audio
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <form onSubmit={handleUpload} className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
          <p className="text-xs font-semibold" style={{ color: '#9B6DFF' }}>Nueva junta</p>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Título *</label>
            <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Ej. Revisión semanal del equipo"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Participantes (separados por coma)</label>
            <input value={form.participants} onChange={e => setForm(p => ({ ...p, participants: e.target.value }))}
              placeholder="Ana García, Luis Mendoza, ..."
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Indicaciones para el análisis (opcional)</label>
            <textarea
              value={form.instructions}
              onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))}
              placeholder="Ej. Esta es una junta de ventas, prioriza los acuerdos de precio. El audio tiene ruido al inicio, ignóralo."
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Audio de la junta *</label>
            <input ref={fileRef} required type="file" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.webm"
              style={{ color: 'var(--c-text-2)', fontSize: 13 }} />
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>MP3, MP4, M4A, WAV, OGG — sin límite de tamaño</p>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={uploading}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#6C3BFF', color: '#fff' }}>
              {uploading ? 'Subiendo y procesando...' : 'Procesar junta'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-4)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título o participante..."
          className="w-full text-xs rounded-xl"
          style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
        />
      </div>

      {loading ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
      ) : meetings.length === 0 ? (
        <div className="rounded-xl p-6 flex flex-col gap-4" style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(108,59,255,0.1)' }}>
              <Mic size={16} style={{ color: '#9B6DFF' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Sin juntas registradas</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>Sube el audio de una reunión y tu empleado genera el acta automáticamente.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 pl-12">
            {[
              'Revisión semanal de equipo — decisiones y tareas asignadas',
              'Junta con cliente — acuerdos y compromisos de entrega',
              'Sesión de planeación — objetivos y responsables del trimestre',
            ].map(ex => (
              <div key={ex} className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--c-text-4)' }} />
                <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>{ex}</p>
              </div>
            ))}
          </div>
          <div className="pl-12">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: '#9B6DFF' }}
            >
              <Upload size={12} /> Subir primer audio
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {meetings.filter(m => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (
              m.title.toLowerCase().includes(q) ||
              m.participants.some(p => p.toLowerCase().includes(q))
            );
          }).map(m => {
            const isOpen = expanded.has(m.id);
            const stCfg  = STATUS_CFG[m.status] ?? STATUS_CFG.pending;
            const data   = m.meeting_data;

            return (
              <div key={m.id} className="rounded-xl overflow-hidden"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <button onClick={() => toggle(m.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${m.status === 'processing' ? 'animate-pulse' : ''}`}
                    style={{ background: stCfg.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{m.title}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: `${stCfg.color}18`, color: stCfg.color }}>
                        {stCfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
                        <Clock size={10} />
                        {new Date(m.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {m.participants?.length > 0 && (
                        <p className="text-xs flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
                          <Users size={10} /> {m.participants.length}
                        </p>
                      )}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 flex flex-col gap-3"
                    style={{ borderTop: '1px solid var(--c-divider)' }}>

                    {m.status === 'processing' && (
                      <div className="flex items-center gap-2 pt-3">
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#f59e0b' }} />
                        <p className="text-xs" style={{ color: '#f59e0b' }}>Procesando... esto puede tomar 1-2 minutos</p>
                      </div>
                    )}

                    {m.status === 'error' && (
                      <p className="text-xs pt-3" style={{ color: '#f87171' }}>
                        Error al procesar. Verifica que el archivo de audio sea válido.
                      </p>
                    )}

                    {m.status === 'done' && data && (
                      <>
                        {/* Tab selector */}
                        <div className="flex gap-1 p-1 rounded-lg w-fit mt-2" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                          {(['data', 'transcript'] as const).map(t => (
                            <button key={t} onClick={() => setTab(t)}
                              className="px-3 py-1 rounded text-xs font-medium transition-all"
                              style={{ background: tab === t ? '#6C3BFF' : 'transparent', color: tab === t ? '#fff' : 'var(--c-text-3)' }}>
                              {t === 'data' ? 'Resumen' : 'Transcripción'}
                            </button>
                          ))}
                        </div>

                        {tab === 'data' && (
                          <div className="flex flex-col gap-3">
                            {data.summary && (
                              <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
                                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--c-text-3)' }}>Resumen ejecutivo</p>
                                <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>{data.summary}</p>
                              </div>
                            )}

                            {data.decisions.length > 0 && (
                              <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
                                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text-3)' }}>Decisiones</p>
                                {data.decisions.map((d, i) => (
                                  <p key={i} className="text-sm mb-1.5 flex gap-2" style={{ color: 'var(--c-text)' }}>
                                    <span style={{ color: '#6C3BFF', flexShrink: 0 }}>•</span>{d}
                                  </p>
                                ))}
                              </div>
                            )}

                            {data.action_items.length > 0 && (
                              <div className="rounded-lg p-3" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
                                <p className="text-xs font-semibold mb-2" style={{ color: '#9B6DFF' }}>Tareas y compromisos</p>
                                {data.action_items.map((a, i) => (
                                  <div key={i} className="flex flex-col gap-0.5 mb-2 pb-2"
                                    style={{ borderBottom: i < data.action_items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{a.task}</p>
                                    <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                                      {[a.assignee, a.due].filter(Boolean).join(' · ') || 'Sin asignar'}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {data.next_steps && (
                              <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
                                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--c-text-3)' }}>Próximos pasos</p>
                                <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>{data.next_steps}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {tab === 'transcript' && m.transcript && (
                          <div className="rounded-lg p-3 max-h-64 overflow-y-auto"
                            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--c-border)' }}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-2)' }}>{m.transcript}</p>
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex justify-end">
                      <button onClick={() => handleDelete(m.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                        <Trash2 size={11} /> Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
