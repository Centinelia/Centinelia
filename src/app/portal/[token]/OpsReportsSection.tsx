'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, BarChart2, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Check, Loader2, Search, Send, SearchX } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';

interface OpsReport {
  id:                  string;
  agent_id:            string;
  name:                string;
  frequency:           'weekly' | 'monthly';
  schedule:            { day_of_week?: number; day_of_month?: number; hour?: number };
  data_sources:        string[];
  recipients:          Array<{ email: string; name?: string }>;
  report_instructions: string | null;
  last_run_at:         string | null;
  next_run_at:         string | null;
  active:              boolean;
}

interface ReportRun {
  id:         string;
  report_id:  string;
  status:     string;
  created_at: string;
}

const DAYS_OF_WEEK = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const HOURS        = Array.from({ length: 24 }, (_, i) => i);

function fmtH(h: number): string {
  const period = h < 12 ? 'am' : 'pm';
  const h12    = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

const DATA_SOURCE_OPTIONS: { id: string; label: string }[] = [
  { id: 'centinelia_calls',        label: 'Llamadas' },
  { id: 'centinelia_leads',        label: 'Leads' },
  { id: 'centinelia_orders',       label: 'Pedidos' },
  { id: 'centinelia_appointments', label: 'Citas' },
];

const empty = (): Partial<OpsReport & { recipientInput: string }> => ({
  name:                '',
  frequency:           'weekly',
  schedule:            { day_of_week: 1, hour: 8 },
  data_sources:        ['centinelia_calls', 'centinelia_leads'],
  recipients:          [],
  report_instructions: '',
  recipientInput:      '',
});

function DeleteConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="rounded-2xl p-6 flex flex-col gap-4 max-w-sm w-full shadow-xl"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Eliminar reporte</p>
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          Esta acción no se puede deshacer. El historial de envíos también se eliminará.
        </p>
        <div className="flex gap-2">
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
            Eliminar
          </button>
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-80"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function SendResultModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="rounded-2xl p-6 flex flex-col gap-4 max-w-sm w-full shadow-xl"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Resultado</p>
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>{message}</p>
        <button onClick={onClose}
          className="py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: '#6C3BFF', color: '#fff' }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function OpsReportsSection({ token, agents, meerkatRoleId, reportAgentId }: {
  token:          string;
  agents:         Array<{ id: string; business_name: string; role: string | null }>;
  meerkatRoleId?: string | null;
  reportAgentId?: string;
}) {
  const [reports, setReports]       = useState<OpsReport[]>([]);
  const [runs, setRuns]             = useState<ReportRun[]>([]);
  const [loading, setLoading]       = useState(true);
  const [creating, setCreating]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [expandedId, setExpanded]   = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [form, setForm]             = useState(empty());
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [sending, setSending]       = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const meerkat          = meerkatRoleId ? MEERKAT_MAP[meerkatRoleId as keyof typeof MEERKAT_MAP] : null;
  const acColor          = meerkat?.color ?? '#6C3BFF';
  const isCoordinator    = meerkatRoleId === 'nox' || meerkatRoleId === 'niva';
  const bannerMeerkats   = (isCoordinator
    ? [MEERKAT_MAP['nox' as keyof typeof MEERKAT_MAP], MEERKAT_MAP['niva' as keyof typeof MEERKAT_MAP]]
    : (meerkat ? [meerkat] : [])
  ).filter((m): m is NonNullable<typeof m> & { imagen: string } => !!m && !!m.imagen);
  const agentDisplayName = isCoordinator
    ? 'Nox y Niva, tus directores,'
    : (meerkat?.nombre ?? agents[0]?.business_name ?? 'Tu empleado');
  const effectiveAgentId = reportAgentId ?? agents.find(a => a.role)?.id ?? agents[0]?.id ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/ops-reports`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports ?? []);
        setRuns(data.runs ?? []);
      }
    } catch {
      // leave existing state visible
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/portal/${token}/ops-reports`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          agent_id:            effectiveAgentId,
          name:                form.name,
          frequency:           form.frequency,
          schedule:            form.schedule,
          data_sources:        form.data_sources,
          recipients:          form.recipients,
          report_instructions: form.report_instructions || null,
        }),
      });
      if (res.ok) {
        setCreating(false);
        setForm(empty());
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError((data as { error?: string }).error ?? 'Error al crear el reporte. Intenta de nuevo.');
      }
    } catch {
      setCreateError('Error de conexión. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: OpsReport) => {
    setReports(prev => prev.map(x => x.id === r.id ? { ...x, active: !x.active } : x));
    try {
      const res = await fetch(`/api/portal/${token}/ops-reports`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: r.id, active: !r.active }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setReports(prev => prev.map(x => x.id === r.id ? { ...x, active: r.active } : x));
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/portal/${token}/ops-reports`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: deleteId }),
    });
    setReports(prev => prev.filter(r => r.id !== deleteId));
    setDeleteId(null);
  };

  const sendNow = async (id: string) => {
    setSending(id);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-reports`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      setSendResult((data as { message?: string }).message ?? (res.ok ? 'Reporte enviado correctamente.' : 'Error al enviar el reporte.'));
    } catch {
      setSendResult('Error de conexión. Intenta de nuevo.');
    } finally {
      setSending(null);
    }
  };

  const addRecipient = () => {
    const email = (form.recipientInput ?? '').trim();
    if (!email || !(form.recipients ?? []).every(r => r.email !== email)) return;
    setForm(f => ({ ...f, recipients: [...(f.recipients ?? []), { email }], recipientInput: '' }));
  };

  const removeRecipient = (email: string) =>
    setForm(f => ({ ...f, recipients: (f.recipients ?? []).filter(r => r.email !== email) }));

  const toggleSource = (id: string) =>
    setForm(f => ({
      ...f,
      data_sources: (f.data_sources ?? []).includes(id)
        ? (f.data_sources ?? []).filter(s => s !== id)
        : [...(f.data_sources ?? []), id],
    }));

  const lastRunFor = (id: string) =>
    runs.filter(r => r.report_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const scheduleLabel = (r: OpsReport) => {
    const hLabel = fmtH(r.schedule.hour ?? 8);
    if (r.frequency === 'weekly') {
      return `Semanal: ${DAYS_OF_WEEK[r.schedule.day_of_week ?? 1]} a las ${hLabel}`;
    }
    return `Mensual: día ${r.schedule.day_of_month ?? 1} a las ${hLabel}`;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--c-text-4)' }} />
    </div>
  );

  return (
    <>
      {deleteId   && <DeleteConfirmModal onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />}
      {sendResult && <SendResultModal message={sendResult} onClose={() => setSendResult(null)} />}

      <div className="flex flex-col gap-4">
        {/* Hero banner */}
        <div className="rounded-xl p-4 flex items-end gap-4 overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${acColor}15 0%, ${acColor}08 100%)`, border: `1px solid ${acColor}25` }}>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: acColor }}>
              Reportes automáticos
            </p>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--c-text)' }}>
              {agentDisplayName} {isCoordinator ? 'redactan y envían' : 'redacta y envía'} reportes de forma autónoma.
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
              Elige qué datos incluir, con qué frecuencia y a quién enviarlos.
            </p>
          </div>
          {bannerMeerkats.length > 0 && (
            <div className="flex items-center" style={{ gap: bannerMeerkats.length > 1 ? -16 : 0 }}>
              {bannerMeerkats.map((m, i) => (
                <img key={m.id} src={m.imagen} alt={m.nombre}
                  style={{
                    width: 80, height: 80, objectFit: 'cover', objectPosition: '50% 10%',
                    borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${(m.color ?? acColor)}30`,
                    background: 'var(--c-surface)',
                    marginLeft: i > 0 ? -20 : 0,
                    zIndex: bannerMeerkats.length - i,
                  }} />
              ))}
            </div>
          )}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 size={16} style={{ color: acColor }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Reportes automáticos</span>
            <InfoTooltip text={"Configura resúmenes periódicos que tu empleado genera y envía por correo de forma automática.\n\nElige qué datos incluir (llamadas, leads, pedidos, citas), con qué frecuencia enviarlo y a quién. El empleado redacta el reporte y lo despacha sin que tengas que pedírselo."} />
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${acColor}10`, border: `1px solid ${acColor}25`, color: 'var(--c-text-4)' }}>
              1 tarea / reporte
            </span>
          </div>
          {!creating && (
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: `${acColor}15`, border: `1px solid ${acColor}35`, color: acColor }}>
              <Plus size={12} />Nuevo reporte
            </button>
          )}
        </div>

        {/* Create form */}
        {creating && (
          <div className="rounded-xl p-4 flex flex-col gap-4" style={{ background: `${acColor}08`, border: `1px solid ${acColor}25` }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: acColor }}>Nuevo reporte</p>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Nombre del reporte</label>
              <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Resumen semanal, Reporte mensual de ventas…"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Frecuencia</label>
                <div className="flex gap-1.5">
                  {(['weekly', 'monthly'] as const).map(f => (
                    <button key={f} onClick={() => setForm(p => ({
                      ...p, frequency: f,
                      schedule: f === 'weekly' ? { day_of_week: 1, hour: 8 } : { day_of_month: 1, hour: 8 },
                    }))}
                      className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                      style={{ background: form.frequency === f ? acColor : 'var(--c-surface)', color: form.frequency === f ? '#fff' : 'var(--c-text-3)', border: `1px solid ${form.frequency === f ? acColor : 'var(--c-border)'}` }}>
                      {f === 'weekly' ? 'Semanal' : 'Mensual'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                  {form.frequency === 'weekly' ? 'Día de la semana' : 'Día del mes'}
                </label>
                {form.frequency === 'weekly' ? (
                  <Select value={String(form.schedule?.day_of_week ?? 1)}
                    onValueChange={v => setForm(f => ({ ...f, schedule: { ...f.schedule, day_of_week: Number(v) } }))}>
                    <SelectTrigger className="rounded-xl py-2.5 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <input type="number" min={1} max={28} value={form.schedule?.day_of_month ?? 1}
                    onChange={e => setForm(f => ({ ...f, schedule: { ...f.schedule, day_of_month: Number(e.target.value) } }))}
                    className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                )}
              </div>
              <div style={{ width: 100 }}>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Hora</label>
                <Select value={String(form.schedule?.hour ?? 8)}
                  onValueChange={v => setForm(f => ({ ...f, schedule: { ...f.schedule, hour: Number(v) } }))}>
                  <SelectTrigger className="rounded-xl py-2.5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map(h => <SelectItem key={h} value={String(h)}>{fmtH(h)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Datos a incluir</label>
              <div className="flex flex-wrap gap-2">
                {DATA_SOURCE_OPTIONS.map(s => {
                  const active = (form.data_sources ?? []).includes(s.id);
                  return (
                    <button key={s.id} onClick={() => toggleSource(s.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: active ? `${acColor}15` : 'var(--c-surface)', border: `1px solid ${active ? acColor + '40' : 'var(--c-border)'}`, color: active ? acColor : 'var(--c-text-3)' }}>
                      {active && <Check size={10} />}{s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Destinatarios (además del email del cliente)</label>
              <div className="flex gap-2 mb-2">
                <input value={form.recipientInput ?? ''}
                  onChange={e => setForm(f => ({ ...f, recipientInput: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addRecipient()}
                  placeholder="email@empresa.com"
                  className="flex-1 rounded-xl px-3 py-2.5 text-xs outline-none"
                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                <button onClick={addRecipient}
                  className="px-3 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: `${acColor}12`, border: `1px solid ${acColor}30`, color: acColor }}>
                  Agregar
                </button>
              </div>
              {(form.recipients ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(form.recipients ?? []).map(r => (
                    <span key={r.email} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                      {r.email}
                      <button onClick={() => removeRecipient(r.email)} style={{ color: 'var(--c-text-4)', lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Instrucciones adicionales (opcional)</label>
              <textarea value={form.report_instructions ?? ''}
                onChange={e => setForm(f => ({ ...f, report_instructions: e.target.value }))}
                rows={3}
                placeholder="Ej: Destaca los leads de mayor presupuesto. Compara con el período anterior si es posible."
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none resize-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
            </div>

            {createError && (
              <p className="text-xs" style={{ color: '#f87171' }}>{createError}</p>
            )}
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={saving || !form.name?.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: acColor, color: '#fff' }}>
                {saving ? <><Loader2 size={13} className="animate-spin" />Guardando…</> : 'Crear reporte'}
              </button>
              <button onClick={() => { setCreating(false); setForm(empty()); setCreateError(null); }}
                className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        {!creating && (
          <div className="relative">
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-4)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar reporte..."
              className="w-full text-xs rounded-xl"
              style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
            />
          </div>
        )}

        {/* Empty state */}
        {reports.length === 0 && !creating && (
          <div className="rounded-xl p-6 flex flex-col gap-4"
            style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${acColor}12` }}>
                <BarChart2 size={16} style={{ color: acColor }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Sin reportes configurados</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>Tu empleado puede generar y enviar resúmenes periódicos de forma automática.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 pl-12">
              {[
                'Resumen semanal: llamadas y leads, cada lunes a las 8:00 am',
                'Reporte mensual de pedidos y citas, el día 1 de cada mes',
                'Actividad del viernes, para cerrar la semana con visibilidad total',
              ].map(ex => (
                <div key={ex} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--c-text-4)' }} />
                  <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>{ex}</p>
                </div>
              ))}
            </div>
            <div className="pl-12">
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: `${acColor}12`, border: `1px solid ${acColor}30`, color: acColor }}>
                <Plus size={12} />Crear primer reporte
              </button>
            </div>
          </div>
        )}

        {/* Reports list */}
        {reports.length > 0 && search.trim() && reports.filter(r => r.name.toLowerCase().includes(search.toLowerCase())).length === 0 && (
          <div className="rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <EmptyState
              icon={SearchX}
              title={`Sin resultados para "${search}"`}
              description="Prueba con otro nombre de reporte"
              size="sm"
            />
          </div>
        )}
        {reports.filter(r => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase())).map(r => {
          const isExpanded = expandedId === r.id;
          const lastRun    = lastRunFor(r.id);
          const isSending  = sending === r.id;

          return (
            <div key={r.id} className="rounded-xl overflow-hidden"
              style={{ border: `1px solid ${isExpanded ? acColor + '40' : 'var(--c-border)'}`, background: isExpanded ? `${acColor}06` : 'var(--c-surface-2)' }}>

              <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(isExpanded ? null : r.id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <BarChart2 size={14} style={{ color: r.active ? acColor : 'var(--c-text-4)', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: r.active ? 'var(--c-text)' : 'var(--c-text-3)' }}>{r.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>{scheduleLabel(r)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {lastRun && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{
                      background: lastRun.status === 'sent' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                      color:      lastRun.status === 'sent' ? '#22c55e' : '#ef4444',
                    }}>
                      {lastRun.status === 'sent' ? 'Enviado' : 'Error'}
                    </span>
                  )}
                  <button onClick={e => { e.stopPropagation(); toggleActive(r); }}
                    style={{ color: r.active ? acColor : 'var(--c-text-4)' }}>
                    {r.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                  {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} /> : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4" style={{ borderTop: `1px solid ${acColor}20` }}>
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      <span style={{ color: 'var(--c-text-4)' }}>Datos:</span>{' '}
                      {r.data_sources.map(s => DATA_SOURCE_OPTIONS.find(o => o.id === s)?.label ?? s).join(', ') || 'Ninguno'}
                    </p>
                    {r.recipients.length > 0 && (
                      <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                        <span style={{ color: 'var(--c-text-4)' }}>Destinatarios adicionales:</span>{' '}
                        {r.recipients.map(rc => rc.email).join(', ')}
                      </p>
                    )}
                    {r.next_run_at && (
                      <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                        Próximo envío: {new Date(r.next_run_at).toLocaleDateString('es-MX', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {r.last_run_at && (
                      <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                        Último envío: {new Date(r.last_run_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => sendNow(r.id)} disabled={isSending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                        style={{ background: `${acColor}10`, border: `1px solid ${acColor}30`, color: acColor }}>
                        {isSending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                        {isSending ? 'Enviando…' : 'Enviar ahora'}
                      </button>
                      <button onClick={() => setDeleteId(r.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                        <Trash2 size={11} />Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
