'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, ChevronDown, ChevronUp, Trash2, Upload, Clock, Users, Search, Pencil, Check, X, Plus, Zap, SearchX } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader, Card } from '@/components/portal-ui';

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
  degraded?:    boolean;
  parse_failed?: boolean;
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

  const [form, setForm] = useState({ title: '', participants: '', instructions: '' });

  // Edit state
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editData, setEditData] = useState<MeetingData | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [uploadError, setUploadError] = useState<string | null>(null);

  // Task creation tracking: "meetingId:index"
  const [taskDone,    setTaskDone]    = useState<Set<string>>(new Set());
  const [taskSaving,  setTaskSaving]  = useState<string | null>(null);
  const [taskError,   setTaskError]   = useState<Record<string, string>>({});

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
    if (isOpening) { markRead(id); setTab('data'); }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !form.title) return;

    setUploading(true);
    try {
      const ext    = file.name.split('.').pop() ?? 'mp4';
      const urlRes = await fetch(`/api/portal/${token}/upload-audio`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ext }),
      });
      if (!urlRes.ok) throw new Error('Error obteniendo URL de subida');
      const { signedUrl, publicUrl } = await urlRes.json();

      const putRes = await fetch(signedUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
        body:    file,
      });
      if (!putRes.ok) throw new Error('Error al subir el archivo');

      const participants = form.participants.split(',').map(s => s.trim()).filter(Boolean);
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
      if (fileRef.current) fileRef.current.value = '';
      setUploadError('Error al subir el audio. Intenta de nuevo.');
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

  function startEdit(m: Meeting) {
    setEditId(m.id);
    setEditData(m.meeting_data ? { ...m.meeting_data, decisions: [...(m.meeting_data.decisions ?? [])], action_items: (m.meeting_data.action_items ?? []).map(a => ({ ...a })) } : null);
  }

  async function saveEdit(id: string) {
    if (!editData) return;
    setEditSaving(true);
    try {
      await fetch(`/api/portal/${token}/ops-meetings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, meeting_data: editData }),
      });
      setMeetings(prev => prev.map(m => m.id === id ? { ...m, meeting_data: editData } : m));
      setEditId(null);
      setEditData(null);
    } finally { setEditSaving(false); }
  }

  async function createTask(meetingId: string, actionItem: ActionItem, key: string) {
    setTaskSaving(key);
    setTaskError(p => { const n = { ...p }; delete n[key]; return n; });
    try {
      const res = await fetch(`/api/portal/${token}/ops-meetings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: meetingId, action: 'create_task', task: actionItem }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTaskError(p => ({ ...p, [key]: data.error ?? 'Error al crear la tarea.' }));
      } else {
        setTaskDone(prev => new Set(prev).add(key));
      }
    } catch {
      setTaskError(p => ({ ...p, [key]: 'Error de conexion.' }));
    } finally {
      setTaskSaving(null);
    }
  }

  // G3 — search also covers summary, decisions, transcript
  const filtered = meetings.filter(m => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const d = m.meeting_data;
    return (
      m.title.toLowerCase().includes(q) ||
      m.participants.some(p => p.toLowerCase().includes(q)) ||
      (d?.summary ?? '').toLowerCase().includes(q) ||
      (d?.decisions ?? []).some(dec => dec.toLowerCase().includes(q)) ||
      (m.transcript ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <SectionHeader
        as="h2"
        title="Juntas e inteligencia"
        right={
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)', color: '#9B6DFF' }}>
            <Upload size={12} /> Subir audio
          </button>
        }
      />

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
            <textarea value={form.instructions} onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))}
              placeholder="Ej. Esta es una junta de ventas, prioriza los acuerdos de precio."
              rows={3} className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Audio de la junta *</label>
            <input ref={fileRef} required type="file" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.webm"
              style={{ color: 'var(--c-text-2)', fontSize: 13 }} />
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>MP3, MP4, M4A, WAV, OGG — sin límite de tamaño</p>
          </div>
          {uploadError && (
            <p className="text-xs" style={{ color: '#f87171' }}>{uploadError}</p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={uploading}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#6C3BFF', color: '#fff' }}>
              {uploading ? 'Subiendo y procesando...' : 'Procesar junta'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setUploadError(null); }}
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
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título, participante, resumen o decisiones..."
          className="w-full text-xs rounded-xl"
          style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
      </div>

      {loading ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
      ) : meetings.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={Mic}
            title="Sin juntas registradas"
            description="Sube el audio de una reunión y tu empleado genera el acta automáticamente."
            action={
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: '#9B6DFF' }}>
                <Upload size={12} /> Subir primer audio
              </button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card padding="sm">
          <EmptyState
            icon={SearchX}
            title={`Sin resultados para "${search}"`}
            description="Prueba con otro título, participante o decisión"
            size="sm"
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(m => {
            const isOpen   = expanded.has(m.id);
            const stCfg    = STATUS_CFG[m.status] ?? STATUS_CFG.pending;
            const data     = m.meeting_data;
            const isEditing = editId === m.id;

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
                      {data?.degraded && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                          Sin análisis
                        </span>
                      )}
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
                  <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--c-divider)' }}>

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
                        {/* Degraded banner */}
                        {data.degraded && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mt-2"
                            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                            <p className="text-xs" style={{ color: '#f59e0b' }}>
                              No había ops disponibles al momento del procesamiento. La transcripción está disponible pero no se generó el análisis.
                            </p>
                          </div>
                        )}

                        {/* Tab selector */}
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                            {(['data', 'transcript'] as const).map(t => (
                              <button key={t} onClick={() => setTab(t)}
                                className="px-3 py-1 rounded text-xs font-medium transition-all"
                                style={{ background: tab === t ? '#6C3BFF' : 'transparent', color: tab === t ? '#fff' : 'var(--c-text-3)' }}>
                                {t === 'data' ? 'Resumen' : 'Transcripción'}
                              </button>
                            ))}
                          </div>
                          {tab === 'data' && !data.degraded && (
                            isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => { setEditId(null); setEditData(null); }}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs"
                                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)', cursor: 'pointer' }}>
                                  <X size={10} /> Cancelar
                                </button>
                                <button onClick={() => saveEdit(m.id)} disabled={editSaving}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                                  style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: 'pointer', opacity: editSaving ? 0.6 : 1 }}>
                                  <Check size={10} /> {editSaving ? 'Guardando...' : 'Guardar'}
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => startEdit(m)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-opacity hover:opacity-70"
                                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)', cursor: 'pointer' }}>
                                <Pencil size={10} /> Editar
                              </button>
                            )
                          )}
                        </div>

                        {/* Resumen tab — view or edit mode */}
                        {tab === 'data' && (
                          isEditing && editData ? (
                            <div className="flex flex-col gap-3">
                              {/* Edit summary */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Resumen ejecutivo</label>
                                <textarea rows={3} value={editData.summary}
                                  onChange={e => setEditData(d => d ? { ...d, summary: e.target.value } : d)}
                                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                                  style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                              </div>

                              {/* Edit decisions */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Decisiones</label>
                                {editData.decisions.map((d, i) => (
                                  <div key={i} className="flex gap-2">
                                    <input value={d} onChange={e => setEditData(ed => {
                                      if (!ed) return ed;
                                      const decisions = [...ed.decisions];
                                      decisions[i] = e.target.value;
                                      return { ...ed, decisions };
                                    })} className="flex-1 px-3 py-1.5 rounded-lg text-sm"
                                      style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                                    <button onClick={() => setEditData(ed => ed ? { ...ed, decisions: ed.decisions.filter((_, j) => j !== i) } : ed)}
                                      className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                                      style={{ background: 'rgba(239,68,68,0.08)', border: 'none', color: '#f87171', cursor: 'pointer' }}>
                                      <X size={11} />
                                    </button>
                                  </div>
                                ))}
                                <button onClick={() => setEditData(ed => ed ? { ...ed, decisions: [...ed.decisions, ''] } : ed)}
                                  className="flex items-center gap-1 text-xs self-start transition-opacity hover:opacity-70"
                                  style={{ background: 'none', border: 'none', color: '#9B6DFF', cursor: 'pointer', padding: 0 }}>
                                  <Plus size={11} /> Agregar decisión
                                </button>
                              </div>

                              {/* Edit action items */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Tareas y compromisos</label>
                                {editData.action_items.map((a, i) => (
                                  <div key={i} className="flex flex-col gap-1.5 p-2 rounded-lg"
                                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                                    <div className="flex gap-2">
                                      <input value={a.task} placeholder="Tarea"
                                        onChange={e => setEditData(ed => {
                                          if (!ed) return ed;
                                          const items = ed.action_items.map((x, j) => j === i ? { ...x, task: e.target.value } : x);
                                          return { ...ed, action_items: items };
                                        })} className="flex-1 px-3 py-1.5 rounded-lg text-xs"
                                        style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                                      <button onClick={() => setEditData(ed => ed ? { ...ed, action_items: ed.action_items.filter((_, j) => j !== i) } : ed)}
                                        className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                                        style={{ background: 'rgba(239,68,68,0.08)', border: 'none', color: '#f87171', cursor: 'pointer' }}>
                                        <X size={11} />
                                      </button>
                                    </div>
                                    <div className="flex gap-2">
                                      <input value={a.assignee ?? ''} placeholder="Responsable"
                                        onChange={e => setEditData(ed => {
                                          if (!ed) return ed;
                                          const items = ed.action_items.map((x, j) => j === i ? { ...x, assignee: e.target.value || null } : x);
                                          return { ...ed, action_items: items };
                                        })} className="flex-1 px-2 py-1 rounded-lg text-xs"
                                        style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                                      <input value={a.due ?? ''} placeholder="Fecha límite"
                                        onChange={e => setEditData(ed => {
                                          if (!ed) return ed;
                                          const items = ed.action_items.map((x, j) => j === i ? { ...x, due: e.target.value || null } : x);
                                          return { ...ed, action_items: items };
                                        })} className="flex-1 px-2 py-1 rounded-lg text-xs"
                                        style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                                    </div>
                                  </div>
                                ))}
                                <button onClick={() => setEditData(ed => ed ? { ...ed, action_items: [...ed.action_items, { task: '', assignee: null, due: null }] } : ed)}
                                  className="flex items-center gap-1 text-xs self-start transition-opacity hover:opacity-70"
                                  style={{ background: 'none', border: 'none', color: '#9B6DFF', cursor: 'pointer', padding: 0 }}>
                                  <Plus size={11} /> Agregar tarea
                                </button>
                              </div>

                              {/* Edit next steps */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Próximos pasos</label>
                                <textarea rows={2} value={editData.next_steps}
                                  onChange={e => setEditData(d => d ? { ...d, next_steps: e.target.value } : d)}
                                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                                  style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                              </div>
                            </div>
                          ) : (
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
                                  {data.action_items.map((a, i) => {
                                    const key     = `${m.id}:${i}`;
                                    const isDone  = taskDone.has(key);
                                    const isSaving = taskSaving === key;
                                    return (
                                      <div key={i} className="flex items-start gap-2 mb-2 pb-2"
                                        style={{ borderBottom: i < data.action_items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{a.task}</p>
                                          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                                            {[a.assignee, a.due].filter(Boolean).join(' · ') || 'Sin asignar'}
                                          </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                          <button
                                            onClick={() => !isDone && !isSaving && createTask(m.id, a, key)}
                                            disabled={isDone || isSaving}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-opacity hover:opacity-80"
                                            style={{
                                              background: isDone ? 'rgba(34,197,94,0.1)' : 'rgba(108,59,255,0.1)',
                                              border:     isDone ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(108,59,255,0.25)',
                                              color:      isDone ? '#22c55e' : '#9B6DFF',
                                              cursor:     isDone ? 'default' : 'pointer',
                                            }}>
                                            {isDone ? <><Check size={9} /> Creada</> : isSaving ? '...' : <><Zap size={9} /> Crear tarea</>}
                                          </button>
                                          {taskError[key] && (
                                            <span className="text-[10px]" style={{ color: '#f87171' }}>{taskError[key]}</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {data.next_steps && (
                                <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
                                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--c-text-3)' }}>Próximos pasos</p>
                                  <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>{data.next_steps}</p>
                                </div>
                              )}
                            </div>
                          )
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
