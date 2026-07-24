'use client';

import { useState, useMemo } from 'react';
import { User, MessageCircle, Mail, DollarSign, Calendar, Pencil, X, Check, Loader2, Filter, Phone } from 'lucide-react';
import ExportCSVButton from './ExportCSVButton';
import ActivityDetailModal, { type ActivityItem } from './ActivityDetailModal';

type LeadStatus = 'nuevo' | 'contactado' | 'cerrado' | 'perdido';

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  nuevo:      { label: 'Nuevo',      color: '#6C3BFF', bg: 'rgba(108,59,255,0.12)' },
  contactado: { label: 'Contactado', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  cerrado:    { label: 'Cerrado',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  perdido:    { label: 'Perdido',    color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

function startOf(unit: 'today' | 'week' | 'month' | 'lastmonth'): { from: Date; to: Date } {
  const now = new Date();
  if (unit === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (unit === 'week') {
    const from = new Date(now); from.setDate(now.getDate() - 7); from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (unit === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: now };
  }
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  return { from, to };
}

const QUICK_FILTERS = [
  { label: 'Todos',        value: 'all' },
  { label: 'Hoy',         value: 'today' },
  { label: 'Últimos 7 días', value: 'week' },
  { label: 'Este mes',    value: 'month' },
  { label: 'Mes pasado',  value: 'lastmonth' },
  { label: 'Rango',       value: 'custom' },
] as const;

type QuickFilter = typeof QUICK_FILTERS[number]['value'];

interface Lead {
  id: string;
  nombre?: string;
  negocio?: string;
  giro?: string;
  servicio?: string;
  presupuesto?: string;
  timeline?: string;
  whatsapp?: string;
  email?: string;
  status?: string;
  created_at: string;
}

const EDIT_FIELDS: { key: keyof Lead; label: string; placeholder?: string }[] = [
  { key: 'nombre',      label: 'Nombre completo',    placeholder: 'Ej: Juan García' },
  { key: 'negocio',     label: 'Organización',        placeholder: 'Ej: Restaurante El Pino' },
  { key: 'giro',        label: 'Giro',                placeholder: 'Ej: Restaurante' },
  { key: 'servicio',    label: 'Servicio de interés', placeholder: 'Ej: Agente de voz' },
  { key: 'presupuesto', label: 'Presupuesto',          placeholder: 'Ej: $5,000 MXN' },
  { key: 'timeline',    label: 'Tiempo estimado',      placeholder: 'Ej: Este mes' },
  { key: 'whatsapp',    label: 'Teléfono',             placeholder: 'Ej: +52 81 1234 5678' },
  { key: 'email',       label: 'Correo electrónico',   placeholder: 'Ej: contacto@empresa.com' },
];

export default function PortalLeadsSection({ initialLeads, token, filename, isPro }: {
  initialLeads: Lead[];
  token: string;
  filename: string;
  isPro?: boolean;
}) {
  const [leads, setLeads]               = useState<Lead[]>(initialLeads);
  const [editingLead, setEditingLead]   = useState<Lead | null>(null);
  const [detailLead, setDetailLead]     = useState<Lead | null>(null);
  const [editForm, setEditForm]         = useState<Partial<Lead>>({});
  const [saving, setSaving]             = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [customFrom, setCustomFrom]   = useState('');
  const [customTo, setCustomTo]       = useState('');

  const filteredLeads = useMemo(() => {
    if (quickFilter === 'all') return leads;

    let from: Date, to: Date;
    if (quickFilter === 'custom') {
      if (!customFrom && !customTo) return leads;
      from = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(0);
      to   = customTo   ? new Date(customTo   + 'T23:59:59') : new Date();
    } else {
      ({ from, to } = startOf(quickFilter));
    }

    return leads.filter(l => {
      const d = new Date(l.created_at);
      return d >= from && d <= to;
    });
  }, [leads, quickFilter, customFrom, customTo]);

  const openEdit = (lead: Lead) => { setEditingLead(lead); setEditForm({ ...lead }); };
  const closeEdit = () => { setEditingLead(null); setEditForm({}); };

  const saveEdit = async () => {
    if (!editingLead) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${token}/leads/${editingLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setLeads(prev => prev.map(l => l.id === editingLead.id ? updated : l));
        closeEdit();
      }
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: LeadStatus) => {
    setUpdatingStatus(id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    try {
      await fetch(`/api/portal/${token}/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3">

        {/* Date filter bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={12} style={{ color: 'var(--c-text-3)' }} />
            {QUICK_FILTERS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setQuickFilter(value)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: quickFilter === value ? '#6C3BFF' : 'var(--c-input-bg)',
                  color:      quickFilter === value ? '#fff'    : 'var(--c-text-2)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {quickFilter === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
              />
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>–</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
              />
            </div>
          )}
        </div>

        {/* Count + export */}
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {filteredLeads.length} de {leads.length} lead{leads.length !== 1 ? 's' : ''}
            {quickFilter !== 'all' && ' (filtrado)'}
          </p>
          <ExportCSVButton
            leads={filteredLeads}
            filename={filename.replace('.csv', `${quickFilter !== 'all' ? `-${quickFilter}` : ''}.csv`)}
          />
        </div>

        {filteredLeads.length === 0 ? (
          <div className="text-center py-10" style={{ color: 'var(--c-text-3)' }}>
            <User size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin leads en este rango de fechas</p>
          </div>
        ) : (
          filteredLeads.map(lead => {
            const status = (lead.status ?? 'nuevo') as LeadStatus;
            const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.nuevo;
            return (
              <div key={lead.id} className="rounded-xl p-4 cursor-pointer transition-all hover:border-[var(--c-border-2)]"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
                onClick={() => setDetailLead(lead)}>
                <div className="flex flex-col gap-2.5">
                  {/* Top: content + edit button */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                          {lead.nombre ?? 'Sin nombre'}
                        </span>
                        {lead.negocio && (
                          <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                            · {lead.negocio}{lead.giro ? ` (${lead.giro})` : ''}
                          </span>
                        )}
                      </div>
                      {lead.servicio && (
                        <p className="text-xs mt-1 font-medium" style={{ color: '#6C3BFF' }}>{lead.servicio}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {lead.presupuesto && <Chip icon={<DollarSign size={10} />}>{lead.presupuesto}</Chip>}
                        {lead.timeline    && <Chip icon={<Calendar size={10} />}>{lead.timeline}</Chip>}
                        {lead.whatsapp && (
                          <a href={`tel:${lead.whatsapp.replace(/\D/g, '')}`}>
                            <Chip icon={<Phone size={10} />} highlight>{lead.whatsapp}</Chip>
                          </a>
                        )}
                        {lead.email && (
                          <a href={`mailto:${lead.email}`}>
                            <Chip icon={<Mail size={10} />}>{lead.email}</Chip>
                          </a>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(lead); }}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--c-surface-2)] flex-shrink-0"
                      style={{ color: 'var(--c-text-3)' }}
                      title="Editar datos del lead"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                  {/* Bottom: date + status select */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      {new Date(lead.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <select
                      value={status}
                      disabled={updatingStatus === lead.id}
                      onChange={e => updateStatus(lead.id, e.target.value as LeadStatus)}
                      onClick={e => e.stopPropagation()}
                      className="text-xs font-semibold rounded-full px-2.5 py-1 outline-none cursor-pointer border-0 appearance-none"
                      style={{ background: sc.bg, color: sc.color, opacity: updatingStatus === lead.id ? 0.5 : 1 }}
                    >
                      {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof sc][]).map(([val, cfg]) => (
                        <option key={val} value={val}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit modal */}
      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden" style={{ background: 'var(--c-modal)' }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--c-border)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>Editar datos del lead</h3>
              <button onClick={closeEdit} className="p-1 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors"
                style={{ color: 'var(--c-text-2)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {EDIT_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>
                    {label}
                  </label>
                  <input
                    type={key === 'email' ? 'email' : 'text'}
                    value={(editForm[key] as string) ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--c-border)' }}>
              <button onClick={closeEdit} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--c-input-bg)', color: 'var(--c-text-2)' }}>
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-80"
                style={{ background: '#6C3BFF', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailLead && (
        <ActivityDetailModal
          type="lead"
          item={detailLead as ActivityItem}
          isPro={!!isPro}
          token={token}
          onClose={() => setDetailLead(null)}
        />
      )}
    </>
  );
}

function Chip({ children, icon, highlight }: { children: React.ReactNode; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
      style={{ background: highlight ? 'rgba(34,197,94,0.12)' : 'var(--c-input-bg)', color: highlight ? '#16a34a' : 'var(--c-text-3)' }}>
      {icon}{children}
    </span>
  );
}
