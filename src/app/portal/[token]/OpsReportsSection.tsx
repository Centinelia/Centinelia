'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, BarChart2, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Loader2, Search, Send, SearchX } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/portal-ui';
import InfoTooltip from '@/components/InfoTooltip';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';
import CheckinsSection, { type CheckinsSectionAgent } from './reportes/CheckinsSection';
import OficinaModal from './oficina/OficinaModal';

interface OpsReport {
  id:                  string;
  agent_id:            string;
  name:                string;
  frequency:           'weekly' | 'monthly';
  schedule:            { day_of_week?: number; day_of_month?: number; hour?: number };
  focus_prompt:        string | null;
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

const empty = (): Partial<OpsReport & { recipientInput: string }> => ({
  name:                '',
  frequency:           'weekly',
  schedule:            { day_of_week: 1, hour: 8 },
  focus_prompt:        '',
  recipients:          [],
  report_instructions: '',
  recipientInput:      '',
});

function DeleteConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="rounded-2xl p-6 flex flex-col gap-4 max-w-sm w-full"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 8px 24px rgba(26,10,59,0.12)' }}>
        <p className="text-[15px] font-bold" style={{ color: '#1A0A3B' }}>Eliminar reporte</p>
        <p className="text-[12px]" style={{ color: '#6B6480' }}>
          Esta acción no se puede deshacer. El historial de envíos también se eliminará.
        </p>
        <div className="flex gap-2">
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
            Eliminar
          </button>
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-[13px] transition-opacity hover:opacity-80"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}>
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
      <div className="rounded-2xl p-6 flex flex-col gap-4 max-w-sm w-full"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 8px 24px rgba(26,10,59,0.12)' }}>
        <p className="text-[15px] font-bold" style={{ color: '#1A0A3B' }}>Resultado</p>
        <p className="text-[12px]" style={{ color: '#6B6480' }}>{message}</p>
        <button onClick={onClose}
          className="py-2.5 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function OpsReportsSection({ token, agents, meerkatRoleId, reportAgentId, hasCoordinator, checkinsAgents }: {
  token:           string;
  agents:          Array<{ id: string; business_name: string; role: string | null }>;
  meerkatRoleId?:  string | null;
  reportAgentId?:  string;
  hasCoordinator?: boolean;
  checkinsAgents?: CheckinsSectionAgent[];
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name?.trim() || !form.focus_prompt?.trim()) return;
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
          focus_prompt:        form.focus_prompt,
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
      <Loader2 size={18} className="animate-spin" style={{ color: '#9B8FB5' }} />
    </div>
  );

  const filteredReports = reports.filter(r => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {deleteId   && <DeleteConfirmModal onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />}
      {sendResult && <SendResultModal message={sendResult} onClose={() => setSendResult(null)} />}

      <div className="flex flex-col gap-4">
        {/* Hero banner — cuando hay 2 coordinadores, gradient blend de ambos colores.
            1 coord (o custom agent): fade del propio color a más transparente. */}
        <div className="rounded-2xl p-4 flex items-end gap-4 overflow-hidden"
          style={{
            background: bannerMeerkats.length >= 2
              ? `linear-gradient(135deg, ${(bannerMeerkats[0].color ?? acColor)}20 0%, ${(bannerMeerkats[1].color ?? acColor)}20 100%)`
              : `linear-gradient(135deg, ${acColor}15 0%, ${acColor}08 100%)`,
            border: `1px solid ${acColor}25`,
          }}>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: acColor }}>
              Reportes automáticos
            </p>
            <p className="text-[14px] font-semibold mb-1" style={{ color: '#1A0A3B' }}>
              {agentDisplayName} {isCoordinator ? 'redactan y envían' : 'redacta y envía'} reportes de forma autónoma.
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
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
                    background: '#ffffff',
                    marginLeft: i > 0 ? -20 : 0,
                    zIndex: bannerMeerkats.length - i,
                  }} />
              ))}
            </div>
          )}
        </div>

        {/* Check-ins de coordinadores */}
        {hasCoordinator && checkinsAgents && (
          <CheckinsSection token={token} agents={checkinsAgents} />
        )}

        {/* Surface único con dividers */}
        <div className="flex flex-col rounded-2xl overflow-hidden"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                  Reportes automáticos
                </h2>
                {reports.length > 0 && (
                  <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                    {reports.length}
                  </span>
                )}
                <InfoTooltip text={"Configura resúmenes periódicos que tu empleado genera y envía por correo de forma automática.\n\nElige qué datos incluir (llamadas, leads, pedidos, citas), con qué frecuencia enviarlo y a quién. El empleado redacta el reporte y lo despacha sin que tengas que pedírselo."} />
              </div>
              <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
                Tu empleado los redacta y los despacha por correo.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: `${acColor}10`, border: `1px solid ${acColor}25`, color: '#6B6480' }}>
                1 tarea por reporte
              </span>
              <button onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                <Plus size={12} />Nuevo reporte
              </button>
            </div>
          </div>

          {/* Create modal (OficinaModal — mismo patrón que CampaignForm) */}
          {creating && (
            <OficinaModal
              open
              onClose={() => { setCreating(false); setForm(empty()); setCreateError(null); }}
              eyebrow="Nuevo reporte"
              title="Programa un reporte automático"
              description="Tu empleado lo redacta y lo envía por correo en el horario que definas."
              size="lg"
              footer={
                <>
                  <OficinaModal.SecondaryAction
                    onClick={() => { setCreating(false); setForm(empty()); setCreateError(null); }}
                  >
                    Cancelar
                  </OficinaModal.SecondaryAction>
                  <OficinaModal.PrimaryAction
                    onClick={handleCreate}
                    loading={saving}
                    disabled={!form.name?.trim() || !form.focus_prompt?.trim()}
                  >
                    Crear reporte
                  </OficinaModal.PrimaryAction>
                </>
              }
            >
              <div className="flex flex-col gap-5">
                <OficinaModal.Field label="Nombre del reporte" hint="requerido">
                  <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Resumen semanal, Reporte mensual de ventas"
                    className="w-full rounded-lg px-3 py-2.5 text-[13px] outline-none"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }} />
                </OficinaModal.Field>

                <OficinaModal.Field label="Cuándo enviarlo">
                  <div className="flex gap-3 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[10px] mb-1" style={{ color: '#9B8FB5' }}>Frecuencia</label>
                      <div className="flex gap-1.5">
                        {(['weekly', 'monthly'] as const).map(f => (
                          <button key={f} type="button" onClick={() => setForm(p => ({
                            ...p, frequency: f,
                            schedule: f === 'weekly' ? { day_of_week: 1, hour: 8 } : { day_of_month: 1, hour: 8 },
                          }))}
                            className="flex-1 py-2 rounded-lg text-[12px] font-medium transition-all"
                            style={{
                              background: form.frequency === f ? '#1A0A3B' : '#ffffff',
                              color:      form.frequency === f ? '#fff' : '#6B6480',
                              border:     form.frequency === f ? 'none' : '1px solid #E8E3F5',
                            }}>
                            {f === 'weekly' ? 'Semanal' : 'Mensual'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-[10px] mb-1" style={{ color: '#9B8FB5' }}>
                        {form.frequency === 'weekly' ? 'Día de la semana' : 'Día del mes'}
                      </label>
                      {form.frequency === 'weekly' ? (
                        <Select value={String(form.schedule?.day_of_week ?? 1)}
                          onValueChange={v => setForm(f => ({ ...f, schedule: { ...f.schedule, day_of_week: Number(v) } }))}>
                          <SelectTrigger className="rounded-lg py-2.5 text-[12px]"
                            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAYS_OF_WEEK.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <input type="number" min={1} max={28} value={form.schedule?.day_of_month ?? 1}
                          onChange={e => setForm(f => ({ ...f, schedule: { ...f.schedule, day_of_month: Number(e.target.value) } }))}
                          className="w-full rounded-lg px-3 py-2.5 text-[12px] outline-none"
                          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }} />
                      )}
                    </div>
                    <div style={{ width: 110 }}>
                      <label className="block text-[10px] mb-1" style={{ color: '#9B8FB5' }}>Hora</label>
                      <Select value={String(form.schedule?.hour ?? 8)}
                        onValueChange={v => setForm(f => ({ ...f, schedule: { ...f.schedule, hour: Number(v) } }))}>
                        <SelectTrigger className="rounded-lg py-2.5 text-[12px]"
                          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOURS.map(h => <SelectItem key={h} value={String(h)}>{fmtH(h)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </OficinaModal.Field>

                <OficinaModal.Field label="¿Qué debe reportar?" hint="requerido">
                  <textarea value={form.focus_prompt ?? ''}
                    onChange={e => setForm(f => ({ ...f, focus_prompt: e.target.value }))}
                    rows={4}
                    placeholder="Ej: Revisa correos y solicitudes de la semana, resume qué clientes escribieron, qué pedidos entraron, qué facturas quedaron pendientes y qué juntas o documentos se generaron. Destaca lo urgente."
                    className="w-full rounded-lg px-3 py-2.5 text-[12px] outline-none resize-none leading-relaxed"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }} />
                  <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: '#9B8FB5' }}>
                    Tu empleado revisa correos, documentos, tareas, contratos, juntas, llamadas y pedidos del período. Este campo le dice en qué enfocarse.
                  </p>
                </OficinaModal.Field>

                <OficinaModal.Field label="Destinatarios" hint="además del email del cliente">
                  <div className="flex gap-2 mb-2">
                    <input value={form.recipientInput ?? ''}
                      onChange={e => setForm(f => ({ ...f, recipientInput: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addRecipient()}
                      placeholder="email@empresa.com"
                      className="flex-1 rounded-lg px-3 py-2.5 text-[12px] outline-none"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }} />
                    <button type="button" onClick={addRecipient}
                      className="px-3 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
                      style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                      Agregar
                    </button>
                  </div>
                  {(form.recipients ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(form.recipients ?? []).map(r => (
                        <span key={r.email} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12px]"
                          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#6B6480' }}>
                          {r.email}
                          <button type="button" onClick={() => removeRecipient(r.email)} style={{ color: '#9B8FB5', lineHeight: 1 }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </OficinaModal.Field>

                <OficinaModal.Field label="Instrucciones adicionales" hint="opcional">
                  <textarea value={form.report_instructions ?? ''}
                    onChange={e => setForm(f => ({ ...f, report_instructions: e.target.value }))}
                    rows={3}
                    placeholder="Ej: Destaca los leads de mayor presupuesto. Compara con el período anterior si es posible."
                    className="w-full rounded-lg px-3 py-2.5 text-[12px] outline-none resize-none"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }} />
                </OficinaModal.Field>

                {createError && (
                  <p className="text-[13px] px-3 py-2 rounded-lg"
                    style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
                    {createError}
                  </p>
                )}
              </div>
            </OficinaModal>
          )}

          {/* Search bar */}
          {!creating && reports.length > 0 && (
            <div className="px-5 py-3" style={{ borderTop: '1px solid #F0EDF9' }}>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#9B8FB5' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar reporte..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-[13px] outline-none"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
                />
              </div>
            </div>
          )}

          {/* Empty state (no reports) */}
          {reports.length === 0 && !creating && (
            <div className="px-5 py-6 flex flex-col gap-4" style={{ borderTop: '1px solid #F0EDF9' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(108,59,255,0.1)' }}>
                  <BarChart2 size={16} style={{ color: '#6C3BFF' }} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>Sin reportes configurados</p>
                  <p className="text-[12px] mt-0.5" style={{ color: '#6B6480' }}>
                    Tu empleado puede generar y enviar resúmenes periódicos de forma automática.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 pl-12">
                {[
                  'Resumen semanal: llamadas y leads, cada lunes a las 8:00 am',
                  'Reporte mensual de pedidos y citas, el día 1 de cada mes',
                  'Actividad del viernes, para cerrar la semana con visibilidad total',
                ].map(ex => (
                  <div key={ex} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: '#9B8FB5' }} />
                    <p className="text-[12px]" style={{ color: '#6B6480' }}>{ex}</p>
                  </div>
                ))}
              </div>
              <div className="pl-12">
                <button
                  onClick={() => setCreating(true)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
                  style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                  <Plus size={12} />Crear primer reporte
                </button>
              </div>
            </div>
          )}

          {/* Filtered empty (search no results) */}
          {reports.length > 0 && search.trim() && filteredReports.length === 0 && (
            <div style={{ borderTop: '1px solid #F0EDF9' }}>
              <EmptyState
                icon={SearchX}
                title={`Sin resultados para "${search}"`}
                description="Prueba con otro nombre de reporte"
                size="sm"
              />
            </div>
          )}

          {/* Reports rows */}
          {filteredReports.length > 0 && (
            <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
              {filteredReports.map((r, idx) => {
                const isExpanded = expandedId === r.id;
                const lastRun    = lastRunFor(r.id);
                const isSending  = sending === r.id;
                const isLast     = idx === filteredReports.length - 1;

                return (
                  <div key={r.id}
                    style={{ borderBottom: isLast ? 'none' : '1px solid #F0EDF9' }}>

                    <button className="w-full flex items-center gap-3 px-5 py-4 text-left"
                      onClick={() => setExpanded(isExpanded ? null : r.id)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      <BarChart2 size={14} style={{ color: r.active ? '#6C3BFF' : '#9B8FB5', flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate"
                          style={{ color: r.active ? '#1A0A3B' : '#6B6480' }}>{r.name}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: '#9B8FB5' }}>{scheduleLabel(r)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {lastRun && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{
                            background: lastRun.status === 'sent' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                            color:      lastRun.status === 'sent' ? '#22c55e' : '#ef4444',
                          }}>
                            {lastRun.status === 'sent' ? 'Enviado' : 'Error'}
                          </span>
                        )}
                        <button onClick={e => { e.stopPropagation(); toggleActive(r); }}
                          style={{ color: r.active ? '#6C3BFF' : '#9B8FB5', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {r.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        {isExpanded
                          ? <ChevronUp size={13} style={{ color: '#9B8FB5' }} />
                          : <ChevronDown size={13} style={{ color: '#9B8FB5' }} />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <div className="mt-3 flex flex-col gap-2">
                          {r.focus_prompt && (
                            <div className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#9B8FB5' }}>
                                Enfoque
                              </p>
                              <p style={{ whiteSpace: 'pre-wrap' }}>{r.focus_prompt}</p>
                            </div>
                          )}
                          {r.recipients.length > 0 && (
                            <p className="text-[12px]" style={{ color: '#6B6480' }}>
                              <span style={{ color: '#9B8FB5' }}>Destinatarios adicionales:</span>{' '}
                              {r.recipients.map(rc => rc.email).join(', ')}
                            </p>
                          )}
                          {r.next_run_at && (
                            <p className="text-[12px]" style={{ color: '#9B8FB5' }}>
                              Próximo envío: {new Date(r.next_run_at).toLocaleDateString('es-MX', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          {r.last_run_at && (
                            <p className="text-[12px]" style={{ color: '#9B8FB5' }}>
                              Último envío: {new Date(r.last_run_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <button onClick={() => sendNow(r.id)} disabled={isSending}
                              className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                              style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                              {isSending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                              {isSending ? 'Enviando…' : 'Enviar ahora'}
                            </button>
                            <button onClick={() => setDeleteId(r.id)}
                              className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-70"
                              style={{ background: '#ffffff', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
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
          )}
        </div>
      </div>
    </>
  );
}
