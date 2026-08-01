'use client';

import { useState, useMemo } from 'react';
import { CalendarDays, Filter, Pencil, X, Check, Loader2, Download } from 'lucide-react';
import ActivityDetailModal, { type ActivityItem } from './ActivityDetailModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ApptStatus = 'confirmada' | 'completada' | 'cancelada' | 'no_asistio';

const STATUS_CONFIG: Record<ApptStatus, { label: string; color: string; bg: string }> = {
  confirmada:  { label: 'Confirmada',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  completada:  { label: 'Completada',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  cancelada:   { label: 'Cancelada',   color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  no_asistio:  { label: 'No asistió',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
};

const QUICK_FILTERS = [
  { label: 'Todos',          value: 'all' },
  { label: 'Hoy',           value: 'today' },
  { label: 'Últimos 7 días', value: 'week' },
  { label: 'Este mes',       value: 'month' },
  { label: 'Rango',          value: 'custom' },
] as const;
type QuickFilter = typeof QUICK_FILTERS[number]['value'];

function filterByDate(items: Appointment[], qf: QuickFilter, from: string, to: string): Appointment[] {
  if (qf === 'all') return items;
  const now = new Date();
  let start: Date, end: Date = now;
  if (qf === 'custom') {
    if (!from && !to) return items;
    start = from ? new Date(from + 'T00:00:00') : new Date(0);
    end   = to   ? new Date(to   + 'T23:59:59') : now;
  } else {
    start = new Date(now);
    if (qf === 'today') { start.setHours(0, 0, 0, 0); }
    else if (qf === 'week')  { start.setDate(now.getDate() - 7); start.setHours(0,0,0,0); }
    else { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  }
  return items.filter(a => { const d = new Date(a.created_at); return d >= start && d <= end; });
}

interface Appointment {
  id: string;
  nombre?: string;
  telefono?: string;
  servicio?: string;
  fecha?: string;
  hora?: string;
  status?: string;
  created_at: string;
}

const EDIT_FIELDS: { key: keyof Appointment; label: string; type?: string; placeholder?: string }[] = [
  { key: 'nombre',   label: 'Nombre del cliente', placeholder: 'Ej: María López' },
  { key: 'telefono', label: 'Teléfono',            placeholder: 'Ej: +52 81 1234 5678' },
  { key: 'servicio', label: 'Servicio / motivo',   placeholder: 'Ej: Consulta general' },
  { key: 'fecha',    label: 'Fecha',               type: 'date' },
  { key: 'hora',     label: 'Hora',                type: 'time' },
];

export default function PortalAppointmentsSection({ initialAppointments, token, label = 'cita', isPro }: {
  initialAppointments: Appointment[];
  token: string;
  label?: string;
  isPro?: boolean;
}) {
  const [appts, setAppts]               = useState<Appointment[]>(initialAppointments);
  const [editing, setEditing]           = useState<Appointment | null>(null);
  const [detailAppt, setDetailAppt]     = useState<Appointment | null>(null);
  const [editForm, setEditForm]         = useState<Partial<Appointment>>({});
  const [saving, setSaving]             = useState(false);
  const [updatingStatus, setUpdating]   = useState<string | null>(null);
  const [quickFilter, setQuickFilter]   = useState<QuickFilter>('all');
  const [customFrom, setCustomFrom]     = useState('');
  const [customTo, setCustomTo]         = useState('');

  const filtered = useMemo(() => filterByDate(appts, quickFilter, customFrom, customTo), [appts, quickFilter, customFrom, customTo]);

  const updateStatus = async (id: string, status: ApptStatus) => {
    setUpdating(id);
    setAppts(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    try {
      await fetch(`/api/portal/${token}/appointments/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } finally {
      setUpdating(null);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${token}/appointments/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setAppts(prev => prev.map(a => a.id === editing.id ? updated : a));
        setEditing(null);
      }
    } finally {
      setSaving(false);
    }
  };

  if (appts.length === 0) {
    return (
      <div className="text-center py-10" style={{ color: 'var(--c-text-3)' }}>
        <CalendarDays size={28} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">Sin {label}s registradas</p>
      </div>
    );
  }

  const labelCap = label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={12} style={{ color: 'var(--c-text-3)' }} />
            {QUICK_FILTERS.map(({ label: l, value }) => (
              <button key={value} onClick={() => setQuickFilter(value)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{ background: quickFilter === value ? '#6C3BFF' : 'var(--c-input-bg)', color: quickFilter === value ? '#fff' : 'var(--c-text-2)' }}>
                {l}
              </button>
            ))}
          </div>
          {quickFilter === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>–</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {filtered.length} de {appts.length} {label}{appts.length !== 1 ? 's' : ''}{quickFilter !== 'all' ? ' (filtrado)' : ''}
          </p>
          {filtered.length > 0 && (
            <button
              onClick={() => {
                const rows = [
                  ['Nombre', 'Teléfono', 'Servicio', 'Fecha', 'Hora', 'Estado', 'Registrado'],
                  ...filtered.map(a => [
                    a.nombre ?? '', a.telefono ?? '', a.servicio ?? '',
                    a.fecha ?? '', a.hora ?? '', a.status ?? '',
                    new Date(a.created_at).toLocaleString('es-MX'),
                  ].map(v => `"${String(v).replace(/"/g, '""')}"` )),
                ];
                const csv  = rows.map(r => r.join(',')).join('\r\n');
                const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a'); a.href = url;
                a.download = `citas-${new Date().toISOString().slice(0,10)}.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(108,59,255,0.12)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}
            >
              <Download size={12} /> Exportar CSV
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--c-text-3)' }}>Sin {label}s en este período</div>
        ) : (
          filtered.map(appt => {
            const status = (appt.status ?? 'confirmada') as ApptStatus;
            const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.confirmada;
            return (
              <div key={appt.id} className="rounded-xl p-4 cursor-pointer transition-all hover:border-[var(--c-border-2)]"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
                onClick={() => setDetailAppt(appt)}>
                <div className="flex flex-col gap-2.5">
                  {/* Top: content + edit button */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                          {appt.nombre ?? 'Sin nombre'}
                        </span>
                        {appt.telefono && <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>· {appt.telefono}</span>}
                      </div>
                      {appt.servicio && <p className="text-xs mt-1 font-medium" style={{ color: '#6C3BFF' }}>{appt.servicio}</p>}
                      {(appt.fecha || appt.hora) && (
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
                          <CalendarDays size={11} />
                          {appt.fecha ?? ''}{appt.hora ? ` · ${appt.hora}` : ''}
                        </p>
                      )}
                    </div>
                    <button onClick={e => { e.stopPropagation(); setEditing(appt); setEditForm({ ...appt }); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors flex-shrink-0"
                      style={{ color: 'var(--c-text-3)' }}>
                      <Pencil size={13} />
                    </button>
                  </div>
                  {/* Bottom: date + status select */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      {new Date(appt.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div onClick={e => e.stopPropagation()}>
                      <Select
                        value={status}
                        disabled={updatingStatus === appt.id}
                        onValueChange={v => updateStatus(appt.id, v as ApptStatus)}
                      >
                        <SelectTrigger
                          className="w-auto text-xs font-semibold rounded-full px-2.5 py-1 border-0"
                          style={{ background: sc.bg, color: sc.color, opacity: updatingStatus === appt.id ? 0.5 : 1 }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(STATUS_CONFIG) as [ApptStatus, typeof sc][]).map(([val, cfg]) => (
                            <SelectItem key={val} value={val}>{cfg.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden" style={{ background: 'var(--c-modal)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>Editar {label}</h3>
              <button onClick={() => setEditing(null)} className="p-1 rounded-lg hover:bg-[var(--c-surface-2)]" style={{ color: 'var(--c-text-2)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {EDIT_FIELDS.map(({ key, label: fl, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>{fl}</label>
                  <input type={type ?? 'text'} value={(editForm[key] as string) ?? ''} placeholder={placeholder}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--c-border)' }}>
              <button onClick={() => setEditing(null)} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--c-input-bg)', color: 'var(--c-text-2)' }}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-80"
                style={{ background: '#6C3BFF', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailAppt && (
        <ActivityDetailModal
          type="appt"
          item={detailAppt as ActivityItem}
          isPro={!!isPro}
          token={token}
          onClose={() => setDetailAppt(null)}
        />
      )}
    </>
  );
}
