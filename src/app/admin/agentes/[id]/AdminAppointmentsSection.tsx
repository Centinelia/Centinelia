'use client';

import { useState } from 'react';
import { CalendarDays, Pencil, X, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type ApptStatus = 'confirmada' | 'completada' | 'cancelada' | 'no_asistio';

const STATUS_CONFIG: Record<ApptStatus, { label: string; color: string }> = {
  confirmada: { label: 'Confirmada',  color: '#3b82f6' },
  completada: { label: 'Completada',  color: '#22c55e' },
  cancelada:  { label: 'Cancelada',   color: '#6B6480' },
  no_asistio: { label: 'No asistió',  color: '#f87171' },
};

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

const EDIT_FIELDS: { key: keyof Appointment; label: string; type?: string }[] = [
  { key: 'nombre',   label: 'Nombre' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'servicio', label: 'Servicio' },
  { key: 'fecha',    label: 'Fecha',  type: 'date' },
  { key: 'hora',     label: 'Hora',   type: 'time' },
];

export default function AdminAppointmentsSection({ initialAppointments, token, label = 'cita' }: {
  initialAppointments: Appointment[];
  token: string;
  label?: string;
}) {
  const [appts, setAppts]           = useState<Appointment[]>(initialAppointments);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editing, setEditing]       = useState<Appointment | null>(null);
  const [editForm, setEditForm]     = useState<Partial<Appointment>>({});
  const [saving, setSaving]         = useState(false);

  const updateStatus = async (id: string, status: ApptStatus) => {
    setUpdatingId(id);
    setAppts(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    const res = await fetch(`/api/portal/${token}/appointments/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) toast.error('Error al actualizar estado');
    setUpdatingId(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const res = await fetch(`/api/portal/${token}/appointments/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      const updated = await res.json();
      setAppts(prev => prev.map(a => a.id === editing.id ? updated : a));
      setEditing(null);
      toast.success(`${label.charAt(0).toUpperCase() + label.slice(1)} actualizada`);
    } else {
      toast.error('Error al guardar');
    }
    setSaving(false);
  };

  if (appts.length === 0) {
    return (
      <p className="text-xs py-6 text-center" style={{ color: '#9B8FB5' }}>
        Sin {label}s registradas aún
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {appts.map(appt => {
          const status = (appt.status ?? 'confirmada') as ApptStatus;
          const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.confirmada;
          return (
            <div key={appt.id} className="px-3 py-2.5 rounded-lg group"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: '#1A0A3B' }}>{appt.nombre ?? 'Sin nombre'}</span>
                    {appt.telefono && (
                      <span className="text-xs" style={{ color: '#6B6480' }}>· {appt.telefono}</span>
                    )}
                    <select
                      value={status}
                      disabled={updatingId === appt.id}
                      onChange={e => updateStatus(appt.id, e.target.value as ApptStatus)}
                      className="text-xs font-semibold rounded-full px-2 py-0.5 outline-none cursor-pointer border-0 appearance-none"
                      style={{ background: `${sc.color}18`, color: sc.color, opacity: updatingId === appt.id ? 0.5 : 1 }}>
                      {(Object.entries(STATUS_CONFIG) as [ApptStatus, typeof sc][]).map(([val, cfg]) => (
                        <option key={val} value={val}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>
                  {appt.servicio && (
                    <p className="text-xs mt-1 font-medium" style={{ color: '#9B6DFF' }}>{appt.servicio}</p>
                  )}
                  {(appt.fecha || appt.hora) && (
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#4A3B6B' }}>
                      <CalendarDays size={11} />
                      {appt.fecha ?? ''}{appt.hora ? ` · ${appt.hora}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => { setEditing(appt); setEditForm({ ...appt }); }}
                    className="p-1.5 rounded-lg hover:bg-[#FAFAFB] transition-colors opacity-0 group-hover:opacity-100"
                    style={{ color: '#4A3B6B' }}>
                    <Pencil size={12} />
                  </button>
                  <span className="text-xs" style={{ color: '#9B8FB5' }}>
                    {new Date(appt.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid #E8E3F5' }}>
              <h3 className="font-semibold text-sm" style={{ color: '#1A0A3B' }}>
                Editar {label}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1 rounded-lg hover:bg-[#FAFAFB]"
                style={{ color: '#4A3B6B' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {EDIT_FIELDS.map(({ key, label: fl, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#4A3B6B' }}>{fl}</label>
                  <input
                    type={type ?? 'text'}
                    value={(editForm[key] as string) ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid #E8E3F5' }}>
              <button onClick={() => setEditing(null)} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#FFFFFF', color: '#4A3B6B' }}>
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: '#6C3BFF', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
