'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, BarChart2, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Check, Loader2, Search } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';

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

export default function OpsReportsSection({ token, agents }: {
  token:  string;
  agents: Array<{ id: string; business_name: string; role: string | null }>;
}) {
  const [reports, setReports]   = useState<OpsReport[]>([]);
  const [runs, setRuns]         = useState<ReportRun[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [expandedId, setExpanded] = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [form, setForm]         = useState(empty());

  const defaultAgentId = agents.find(a => a.role)?.id ?? agents[0]?.id ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/portal/${token}/ops-reports`);
    if (res.ok) {
      const data = await res.json();
      setReports(data.reports ?? []);
      setRuns(data.runs ?? []);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/portal/${token}/ops-reports`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        agent_id:            defaultAgentId,
        name:                form.name,
        frequency:           form.frequency,
        schedule:            form.schedule,
        data_sources:        form.data_sources,
        recipients:          form.recipients,
        report_instructions: form.report_instructions || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setCreating(false);
      setForm(empty());
      load();
    }
  };

  const toggleActive = async (r: OpsReport) => {
    await fetch(`/api/portal/${token}/ops-reports`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: r.id, active: !r.active }),
    });
    setReports(prev => prev.map(x => x.id === r.id ? { ...x, active: !x.active } : x));
  };

  const deleteReport = async (id: string) => {
    if (!confirm('¿Eliminar este reporte?')) return;
    await fetch(`/api/portal/${token}/ops-reports`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    setReports(prev => prev.filter(r => r.id !== id));
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

  const lastRunFor = (id: string) => runs.filter(r => r.report_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const scheduleLabel = (r: OpsReport) => {
    const h = r.schedule.hour ?? 8;
    const hLabel = `${String(h).padStart(2, '0')}:00`;
    if (r.frequency === 'weekly') {
      return `Cada ${DAYS_OF_WEEK[r.schedule.day_of_week ?? 1]} a las ${hLabel}`;
    }
    return `Día ${r.schedule.day_of_month ?? 1} de cada mes a las ${hLabel}`;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--c-text-4)' }} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} style={{ color: '#6C3BFF' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Reportes automáticos</span>
          <InfoTooltip text="¿Cuántas tareas consume?\n1 tarea por reporte generado." />
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: '#9B6DFF' }}>
            <Plus size={12} />Nuevo reporte
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl p-4 flex flex-col gap-4" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B6DFF' }}>Nuevo reporte</p>

          {/* Name */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Nombre del reporte</label>
            <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Resumen semanal, Reporte mensual de ventas…"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
          </div>

          {/* Frequency + schedule */}
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
                    style={{ background: form.frequency === f ? '#6C3BFF' : 'var(--c-surface)', color: form.frequency === f ? '#fff' : 'var(--c-text-3)', border: `1px solid ${form.frequency === f ? '#6C3BFF' : 'var(--c-border)'}` }}>
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
                <select value={form.schedule?.day_of_week ?? 1}
                  onChange={e => setForm(f => ({ ...f, schedule: { ...f.schedule, day_of_week: Number(e.target.value) } }))}
                  className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}>
                  {DAYS_OF_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              ) : (
                <input type="number" min={1} max={28} value={form.schedule?.day_of_month ?? 1}
                  onChange={e => setForm(f => ({ ...f, schedule: { ...f.schedule, day_of_month: Number(e.target.value) } }))}
                  className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
              )}
            </div>
            <div style={{ width: 80 }}>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Hora</label>
              <select value={form.schedule?.hour ?? 8}
                onChange={e => setForm(f => ({ ...f, schedule: { ...f.schedule, hour: Number(e.target.value) } }))}
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}>
                {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </div>
          </div>

          {/* Data sources */}
          <div>
            <label className="block text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Datos a incluir</label>
            <div className="flex flex-wrap gap-2">
              {DATA_SOURCE_OPTIONS.map(s => {
                const active = (form.data_sources ?? []).includes(s.id);
                return (
                  <button key={s.id} onClick={() => toggleSource(s.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: active ? 'rgba(108,59,255,0.12)' : 'var(--c-surface)', border: `1px solid ${active ? 'rgba(108,59,255,0.35)' : 'var(--c-border)'}`, color: active ? '#9B6DFF' : 'var(--c-text-3)' }}>
                    {active && <Check size={10} />}{s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recipients */}
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
                style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)', color: '#9B6DFF' }}>
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

          {/* Custom instructions */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Instrucciones adicionales (opcional)</label>
            <textarea value={form.report_instructions ?? ''}
              onChange={e => setForm(f => ({ ...f, report_instructions: e.target.value }))}
              rows={3}
              placeholder="Ej: Destaca los leads de mayor presupuesto. Compara con el período anterior si es posible."
              className="w-full rounded-xl px-3 py-2.5 text-xs outline-none resize-none"
              style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !form.name?.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: '#6C3BFF', color: '#fff' }}>
              {saving ? <><Loader2 size={13} className="animate-spin" />Guardando…</> : 'Crear reporte'}
            </button>
            <button onClick={() => { setCreating(false); setForm(empty()); }}
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

      {/* Reports list */}
      {reports.length === 0 && !creating && (
        <div className="text-center py-10" style={{ color: 'var(--c-text-4)' }}>
          <BarChart2 size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin reportes configurados.</p>
          <p className="text-xs mt-1">Crea uno para que tu empleado los envíe automáticamente.</p>
        </div>
      )}

      {reports.filter(r => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase())).map(r => {
        const isExpanded = expandedId === r.id;
        const lastRun    = lastRunFor(r.id);

        return (
          <div key={r.id} className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${isExpanded ? 'rgba(108,59,255,0.35)' : 'var(--c-border)'}`, background: isExpanded ? 'rgba(108,59,255,0.05)' : 'var(--c-surface-2)' }}>

            <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
              onClick={() => setExpanded(isExpanded ? null : r.id)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <BarChart2 size={14} style={{ color: r.active ? '#9B6DFF' : 'var(--c-text-4)', flexShrink: 0 }} />
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
                  style={{ color: r.active ? '#6C3BFF' : 'var(--c-text-4)' }}>
                  {r.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </button>
                {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} /> : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(108,59,255,0.15)' }}>
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
                  <div className="mt-2">
                    <button onClick={() => deleteReport(r.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                      <Trash2 size={11} />Eliminar reporte
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
