'use client';

import { useState, useMemo } from 'react';
import { User, MessageCircle, Mail, DollarSign, Calendar, Pencil, X, Check, Loader2, Filter, Phone } from 'lucide-react';
import ExportCSVButton from './ExportCSVButton';
import ActivityDetailModal, { type ActivityItem } from './ActivityDetailModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';

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
            <Filter size={12} style={{ color: '#6B6480' }} />
            {QUICK_FILTERS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setQuickFilter(value)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: quickFilter === value ? '#6C3BFF' : '#FAFAFB',
                  color:      quickFilter === value ? '#fff'    : '#1A0A3B',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {quickFilter === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <DatePicker value={customFrom} onChange={setCustomFrom} className="w-auto min-w-[160px]" />
              <span className="text-xs" style={{ color: '#6B6480' }}>–</span>
              <DatePicker value={customTo} onChange={setCustomTo} className="w-auto min-w-[160px]" />
            </div>
          )}
        </div>

        {/* Count + export */}
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: '#6B6480' }}>
            {filteredLeads.length} de {leads.length} lead{leads.length !== 1 ? 's' : ''}
            {quickFilter !== 'all' && ' (filtrado)'}
          </p>
          <ExportCSVButton
            leads={filteredLeads}
            filename={filename.replace('.csv', `${quickFilter !== 'all' ? `-${quickFilter}` : ''}.csv`)}
          />
        </div>

        {filteredLeads.length === 0 ? (
          <div className="text-center py-10" style={{ color: '#6B6480' }}>
            <User size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin leads en este rango de fechas</p>
          </div>
        ) : (
          filteredLeads.map(lead => {
            const status = (lead.status ?? 'nuevo') as LeadStatus;
            const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.nuevo;
            return (
              <div key={lead.id} className="rounded-xl p-4 cursor-pointer transition-all hover:border-[#F0EDF9]"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
                onClick={() => setDetailLead(lead)}>
                <div className="flex flex-col gap-2.5">
                  {/* Top: content + edit button */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: '#1A0A3B' }}>
                          {lead.nombre ?? 'Sin nombre'}
                        </span>
                        {lead.negocio && (
                          <span className="text-xs" style={{ color: '#6B6480' }}>
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
                      className="p-1.5 rounded-lg transition-colors hover:bg-[#FAFAFB] flex-shrink-0"
                      style={{ color: '#6B6480' }}
                      title="Editar datos del lead"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                  {/* Bottom: date + status select */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: '#6B6480' }}>
                      {new Date(lead.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div onClick={e => e.stopPropagation()}>
                      <Select
                        value={status}
                        disabled={updatingStatus === lead.id}
                        onValueChange={v => updateStatus(lead.id, v as LeadStatus)}
                      >
                        <SelectTrigger
                          className="w-auto text-xs font-semibold rounded-full px-2.5 py-1 border-0"
                          style={{ background: sc.bg, color: sc.color, opacity: updatingStatus === lead.id ? 0.5 : 1 }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof sc][]).map(([val, cfg]) => (
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

      {/* Edit modal */}
      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden" style={{ background: '#ffffff' }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid #E8E3F5' }}>
              <h3 className="font-semibold text-sm" style={{ color: '#1A0A3B' }}>Editar datos del lead</h3>
              <button onClick={closeEdit} className="p-1 rounded-lg hover:bg-[#FAFAFB] transition-colors"
                style={{ color: '#1A0A3B' }}>
                <X size={16} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {EDIT_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#1A0A3B' }}>
                    {label}
                  </label>
                  <input
                    type={key === 'email' ? 'email' : 'text'}
                    value={(editForm[key] as string) ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid #E8E3F5' }}>
              <button onClick={closeEdit} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#FAFAFB', color: '#1A0A3B' }}>
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
      style={{ background: highlight ? 'rgba(34,197,94,0.12)' : '#FAFAFB', color: highlight ? '#16a34a' : '#6B6480' }}>
      {icon}{children}
    </span>
  );
}
