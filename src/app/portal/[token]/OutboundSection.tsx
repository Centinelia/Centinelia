'use client';

import { useState, useMemo, useRef } from 'react';
import {
  Phone, Plus, Upload, Trash2, Loader2, Check, X, PhoneCall, RefreshCw,
  Pencil, PhoneOutgoing, Pause, Play, CalendarClock,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  id:         string;
  nombre:     string | null;
  telefono:   string;
  motivo:     string | null;
  source:     'llamada_entrante' | 'csv' | 'manual';
  status:     'pending' | 'calling' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
}

interface Agent {
  id:            string;
  agent_name:    string | null;
  business_name: string;
}

type ScheduleType   = 'once' | 'daily' | 'weekly';
type SourceFilter   = 'all' | 'llamada_entrante' | 'csv' | 'manual';

interface Campaign {
  id:             string;
  nombre:         string;
  instrucciones:  string | null;
  motivo:         string | null;
  schedule_type:  ScheduleType;
  run_at_time:    string;
  run_on_days:    number[];
  run_at_date:    string | null;
  contact_filter: string[] | null;
  status:         'active' | 'paused' | 'completed';
  last_run_at:    string | null;
  next_run_at:    string | null;
  created_at:     string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<Contact['status'], string> = {
  pending:   'En lista',
  calling:   'Llamando…',
  completed: 'Completada',
  failed:    'Fallida',
  cancelled: 'Cancelada',
};
const STATUS_COLOR: Record<Contact['status'], string> = {
  pending:   'rgba(255,255,255,0.08)',
  calling:   'rgba(108,59,255,0.15)',
  completed: 'rgba(34,197,94,0.12)',
  failed:    'rgba(239,68,68,0.12)',
  cancelled: 'rgba(255,255,255,0.06)',
};
const STATUS_TEXT: Record<Contact['status'], string> = {
  pending:   'var(--c-text-2)',
  calling:   '#9B6DFF',
  completed: '#22c55e',
  failed:    '#ef4444',
  cancelled: 'var(--c-text-3)',
};

const SOURCE_CONFIG = {
  llamada_entrante: { label: 'Llamada entrante', color: '#6C3BFF', bg: 'rgba(108,59,255,0.10)' },
  csv:              { label: 'CSV',              color: '#0ea5e9', bg: 'rgba(14,165,233,0.10)'  },
  manual:           { label: 'Manual',           color: '#6b7280', bg: 'rgba(107,114,128,0.10)' },
} as const;

const CAMPAIGN_STATUS = {
  active:    { label: 'Activa',     color: '#22c55e', bg: 'rgba(34,197,94,0.10)'    },
  paused:    { label: 'Pausada',    color: '#f59e0b', bg: 'rgba(245,158,11,0.10)'   },
  completed: { label: 'Completada', color: '#6b7280', bg: 'rgba(107,114,128,0.10)'  },
} as const;

// L M X J V S D — visually Lunes-first, internally 0=Dom
const WEEK_DAYS = [
  { label: 'L', value: 1 },
  { label: 'M', value: 2 },
  { label: 'X', value: 3 },
  { label: 'J', value: 4 },
  { label: 'V', value: 5 },
  { label: 'S', value: 6 },
  { label: 'D', value: 0 },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function describeSchedule(c: Campaign): string {
  const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  if (c.schedule_type === 'once')  return `Una vez${c.run_at_date ? ` el ${c.run_at_date}` : ''} a las ${c.run_at_time}`;
  if (c.schedule_type === 'daily') return `Diario a las ${c.run_at_time}`;
  const days = (c.run_on_days ?? []).sort().map(d => DAY_NAMES[d]).join(', ');
  return `Semanal: ${days || 'Lunes'} a las ${c.run_at_time}`;
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function parseCSV(text: string): Array<{ nombre?: string; telefono: string; motivo?: string }> {
  const lines = text.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));
  const hasHeader = header.some(h => ['nombre', 'name', 'telefono', 'phone', 'tel'].includes(h));
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const iNombre   = hasHeader ? header.findIndex(h => ['nombre', 'name'].includes(h)) : 0;
  const iTelefono = hasHeader ? header.findIndex(h => ['telefono', 'phone', 'tel'].includes(h)) : (hasHeader ? 1 : 0);
  const iMotivo   = hasHeader ? header.findIndex(h => ['motivo', 'reason', 'nota'].includes(h)) : -1;
  return dataLines
    .map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/['"]/g, ''));
      const telefono = cols[iTelefono]?.trim();
      if (!telefono) return null;
      return {
        nombre:  iNombre  >= 0 ? cols[iNombre]?.trim()  || undefined : undefined,
        telefono,
        motivo:  iMotivo  >= 0 ? cols[iMotivo]?.trim()  || undefined : undefined,
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: Contact['source'] }) {
  const cfg = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.manual;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function StatusPill({ status }: { status: Contact['status'] }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: STATUS_COLOR[status], color: STATUS_TEXT[status] }}>
      {status === 'calling' && <span className="w-1.5 h-1.5 rounded-full bg-[#9B6DFF] animate-pulse" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function CampaignStatusBadge({ status }: { status: Campaign['status'] }) {
  const cfg = CAMPAIGN_STATUS[status] ?? CAMPAIGN_STATUS.paused;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ── Campaign form ─────────────────────────────────────────────────────────────

interface CampaignFormProps {
  token:       string;
  initial:     Campaign | null;
  onSaved:     (c: Campaign) => void;
  onCancel:    () => void;
}

function CampaignForm({ token, initial, onSaved, onCancel }: CampaignFormProps) {
  const [nombre,        setNombre]        = useState(initial?.nombre        ?? '');
  const [motivo,        setMotivo]        = useState(initial?.motivo        ?? '');
  const [instrucciones, setInstrucciones] = useState(initial?.instrucciones ?? '');
  const [scheduleType,  setScheduleType]  = useState<ScheduleType>(initial?.schedule_type ?? 'once');
  const [runAtTime,     setRunAtTime]     = useState(initial?.run_at_time   ?? '09:00');
  const [runAtDate,     setRunAtDate]     = useState(initial?.run_at_date   ?? '');
  const [runOnDays,     setRunOnDays]     = useState<number[]>(initial?.run_on_days ?? [1]);
  const [contactFilter, setContactFilter] = useState<'all' | 'llamada_entrante' | 'csv' | 'manual'>(
    !initial?.contact_filter ? 'all' : (initial.contact_filter[0] as 'llamada_entrante' | 'csv' | 'manual') ?? 'all'
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const toggleDay = (d: number) =>
    setRunOnDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (scheduleType === 'weekly' && runOnDays.length === 0) { setError('Selecciona al menos un día.'); return; }

    const payload = {
      nombre:         nombre.trim(),
      motivo:         motivo.trim() || null,
      instrucciones:  instrucciones.trim() || null,
      schedule_type:  scheduleType,
      run_at_time:    runAtTime,
      run_at_date:    scheduleType === 'once'   ? (runAtDate || null) : null,
      run_on_days:    scheduleType === 'weekly' ? runOnDays           : [],
      contact_filter: contactFilter === 'all'   ? null                : [contactFilter],
    };

    setSaving(true);
    setError('');
    try {
      const url = initial
        ? `/api/portal/${token}/salientes/campanas/${initial.id}`
        : `/api/portal/${token}/salientes/campanas`;
      const res = await fetch(url, {
        method:  initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return; }
      onSaved(data as Campaign);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#6C3BFF]';
  const inputSty = { background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' };

  return (
    <form onSubmit={handleSubmit}
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
        {initial ? 'Editar campaña' : 'Nueva campaña'}
      </p>

      {/* Nombre */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          Nombre <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="Ej: Recordatorios de pago julio"
          className={inputCls} style={inputSty} />
      </div>

      {/* Motivo */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          Motivo de la llamada
        </label>
        <input value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder="Ej: Recordatorio de vencimiento el 31 de julio"
          className={inputCls} style={inputSty} />
      </div>

      {/* Instrucciones */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          Instrucciones especiales para el agente
        </label>
        <textarea value={instrucciones} onChange={e => setInstrucciones(e.target.value)}
          rows={3}
          placeholder="Ej: Si el cliente ya pagó, agradécele y termina la llamada. Si no, ofrece un link de pago."
          className={`${inputCls} resize-none`} style={inputSty} />
      </div>

      <div className="w-full" style={{ height: 1, background: 'var(--c-border)' }} />

      {/* Schedule type */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          Tipo de programación
        </label>
        <select value={scheduleType} onChange={e => setScheduleType(e.target.value as ScheduleType)}
          className={inputCls} style={inputSty}>
          <option value="once">Una vez</option>
          <option value="daily">Diario</option>
          <option value="weekly">Semanal</option>
        </select>
      </div>

      {/* Conditional schedule fields */}
      {scheduleType === 'once' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Fecha</label>
          <input type="date" value={runAtDate} onChange={e => setRunAtDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className={inputCls} style={inputSty} />
        </div>
      )}

      {scheduleType === 'weekly' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Días</label>
          <div className="flex gap-1.5 flex-wrap">
            {WEEK_DAYS.map(({ label, value }) => {
              const active = runOnDays.includes(value);
              return (
                <button key={value} type="button" onClick={() => toggleDay(value)}
                  className="w-9 h-9 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: active ? '#6C3BFF'          : 'var(--c-surface-2)',
                    color:      active ? '#fff'             : 'var(--c-text-3)',
                    border:     active ? 'none'             : '1px solid var(--c-border)',
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Time */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          Hora de ejecución
        </label>
        <input type="time" value={runAtTime} onChange={e => setRunAtTime(e.target.value)}
          className={inputCls} style={{ ...inputSty, maxWidth: 160 }} />
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>
          El cron corre cada 10 min, la hora exacta puede variar hasta 10 min.
        </p>
      </div>

      <div className="w-full" style={{ height: 1, background: 'var(--c-border)' }} />

      {/* Contact filter */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          Contactos a llamar
        </label>
        <select value={contactFilter} onChange={e => setContactFilter(e.target.value as typeof contactFilter)}
          className={inputCls} style={inputSty}>
          <option value="all">Todos los pendientes</option>
          <option value="llamada_entrante">Solo llamadas entrantes</option>
          <option value="csv">Solo CSV</option>
          <option value="manual">Solo manuales</option>
        </select>
      </div>

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving || !nombre.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: '#6C3BFF', color: '#fff' }}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {initial ? 'Guardar cambios' : 'Crear campaña'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--c-text-3)' }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function OutboundSection({
  token,
  initialContacts,
  initialCampaigns,
  agents,
}: {
  token:             string;
  initialContacts:   Contact[];
  initialCampaigns:  Campaign[];
  agents:            Agent[];
}) {
  // ── Tab ──────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'contactos' | 'campanas'>('contactos');

  // ── Contacts state ────────────────────────────────────────────────────────────
  const [contacts,        setContacts]        = useState<Contact[]>(initialContacts);
  const [selected,        setSelected]        = useState<Set<string>>(new Set());
  const [sourceFilter,    setSourceFilter]    = useState<SourceFilter>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? '');
  const [calling,         setCalling]         = useState(false);
  const [callResult,      setCallResult]      = useState<{ triggered: number; failed: number } | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactSaving,   setContactSaving]   = useState(false);
  const [deleting,        setDeleting]        = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [contactError,    setContactError]    = useState('');

  const [nombre,    setNombre]    = useState('');
  const [telefono,  setTelefono]  = useState('');
  const [motivo,    setMotivo]    = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Campaign state ────────────────────────────────────────────────────────────
  const [campaigns,     setCampaigns]     = useState<Campaign[]>(initialCampaigns);
  const [showCampForm,  setShowCampForm]  = useState(false);
  const [editCampaign,  setEditCampaign]  = useState<Campaign | null>(null);
  const [running,       setRunning]       = useState<string | null>(null);
  const [campError,     setCampError]     = useState('');

  // ── Contacts derived ──────────────────────────────────────────────────────────
  const pendingContacts = contacts.filter(c => c.status === 'pending');
  const selectedPending = [...selected].filter(id => contacts.find(c => c.id === id && c.status === 'pending'));

  const visibleContacts = useMemo(() =>
    sourceFilter === 'all' ? contacts : contacts.filter(c => c.source === sourceFilter),
    [contacts, sourceFilter]
  );

  const visiblePending = visibleContacts.filter(c => c.status === 'pending');

  const toggleAll = () => {
    const allVisibleSelected = visiblePending.length > 0 && visiblePending.every(c => selected.has(c.id));
    if (allVisibleSelected) {
      setSelected(prev => { const next = new Set(prev); visiblePending.forEach(c => next.delete(c.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); visiblePending.forEach(c => next.add(c.id)); return next; });
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Contact handlers ──────────────────────────────────────────────────────────
  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts`);
      if (res.ok) setContacts(await res.json());
    } finally { setRefreshing(false); }
  };

  const handleCall = async () => {
    if (!selectedPending.length) return;
    setCalling(true);
    setCallResult(null);
    setContactError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/llamar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: selectedPending, agentId: selectedAgentId }),
      });
      const data = await res.json();
      if (!res.ok) { setContactError(data.error ?? 'Error al llamar'); return; }
      setCallResult({ triggered: data.triggered, failed: data.failed });
      setSelected(new Set());
      await refresh();
    } finally { setCalling(false); }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telefono.trim()) return;
    setContactSaving(true);
    setContactError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre || undefined, telefono, motivo: motivo || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setContactError(data.error ?? 'Error al guardar'); return; }
      setContacts(prev => [...(Array.isArray(data) ? data : [data]), ...prev]);
      setNombre(''); setTelefono(''); setMotivo('');
      setShowContactForm(false);
    } finally { setContactSaving(false); }
  };

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    if (!parsed.length) { setContactError('No se encontraron contactos válidos en el CSV'); return; }
    setContactSaving(true);
    setContactError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: parsed }),
      });
      const data = await res.json();
      if (!res.ok) { setContactError(data.error ?? 'Error al importar'); return; }
      setContacts(prev => [...(Array.isArray(data) ? data : [data]), ...prev]);
    } finally {
      setContactSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!selected.size) return;
    setDeleting(true);
    setContactError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) { const d = await res.json(); setContactError(d.error ?? 'Error al eliminar'); return; }
      setContacts(prev => prev.filter(c => !selected.has(c.id)));
      setSelected(new Set());
    } finally { setDeleting(false); }
  };

  // ── Campaign handlers ─────────────────────────────────────────────────────────
  const handleRunCampaign = async (id: string) => {
    setRunning(id);
    setCampError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/campanas/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setCampError(data.error ?? 'Error al ejecutar la campaña'); return; }
      setCampaigns(prev => prev.map(c =>
        c.id === id ? { ...c, last_run_at: new Date().toISOString() } : c
      ));
    } finally { setRunning(null); }
  };

  const handleToggleCampaign = async (c: Campaign) => {
    const nextStatus = c.status === 'active' ? 'paused' : 'active';
    const res = await fetch(`/api/portal/${token}/salientes/campanas/${c.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: nextStatus } : x));
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('¿Eliminar esta campaña? Esta acción no se puede deshacer.')) return;
    const res = await fetch(`/api/portal/${token}/salientes/campanas/${id}`, { method: 'DELETE' });
    if (res.ok) setCampaigns(prev => prev.filter(c => c.id !== id));
    else { const d = await res.json(); setCampError(d.error ?? 'Error al eliminar'); }
  };

  const handleCampaignSaved = (saved: Campaign) => {
    setCampaigns(prev => {
      const exists = prev.find(c => c.id === saved.id);
      return exists ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev];
    });
    setShowCampForm(false);
    setEditCampaign(null);
  };

  const inputStyle = {
    background: 'var(--c-input-bg)',
    border:     '1px solid var(--c-input-border)',
    color:      'var(--c-text)',
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Tab nav */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--c-surface-2)' }}>
        {(['contactos', 'campanas'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
            style={{
              background: activeTab === t ? 'var(--c-modal)' : 'transparent',
              color:      activeTab === t ? 'var(--c-text)'  : 'var(--c-text-3)',
              boxShadow:  activeTab === t ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
            }}>
            {t === 'contactos' ? 'Contactos' : 'Campañas'}
          </button>
        ))}
      </div>

      {/* ── CONTACTOS ─────────────────────────────────────────────────────────── */}
      {activeTab === 'contactos' && (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>Llamadas salientes</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                Agrega contactos, selecciónalos y el agente los llama automáticamente.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value as SourceFilter)}
                className="rounded-lg px-3 py-2 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text-2)' }}
              >
                <option value="all">Todas las fuentes</option>
                <option value="llamada_entrante">Llamada entrante</option>
                <option value="csv">Importación CSV</option>
                <option value="manual">Manual</option>
              </select>
              <button type="button" onClick={refresh} disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                Actualizar
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={contactSaving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
                <Upload size={12} />
                Subir CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSV} />
              <button type="button" onClick={() => { setShowContactForm(f => !f); setContactError(''); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: '#6C3BFF', color: '#fff' }}>
                <Plus size={12} />
                Agregar
              </button>
            </div>
          </div>

          {/* Add contact form */}
          {showContactForm && (
            <form onSubmit={handleAddContact}
              className="rounded-2xl p-5 flex flex-col gap-4"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Nuevo contacto</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input placeholder="Nombre (opcional)" value={nombre} onChange={e => setNombre(e.target.value)}
                  className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                <input placeholder="Teléfono *" value={telefono} onChange={e => setTelefono(e.target.value)} required
                  className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                <input placeholder="Motivo de la llamada (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)}
                  className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={contactSaving || !telefono.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ background: '#6C3BFF', color: '#fff' }}>
                  {contactSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Guardar
                </button>
                <button type="button"
                  onClick={() => { setShowContactForm(false); setNombre(''); setTelefono(''); setMotivo(''); }}
                  className="px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70"
                  style={{ color: 'var(--c-text-3)' }}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* CSV hint */}
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            Formato CSV: columnas <span className="font-mono">nombre, telefono, motivo</span>. La primera fila puede ser encabezado.
          </p>

          {/* Contacts table */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
            {contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ background: 'var(--c-surface)' }}>
                <PhoneCall size={32} style={{ color: 'var(--c-text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>No hay contactos aún</p>
                <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Agrega contactos manualmente o sube un CSV</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--c-surface-2)', borderBottom: '1px solid var(--c-border)' }}>
                    <th className="px-4 py-3 text-left w-10">
                      <input type="checkbox"
                        checked={visiblePending.length > 0 && visiblePending.every(c => selected.has(c.id))}
                        onChange={toggleAll} disabled={visiblePending.length === 0}
                        className="rounded" style={{ accentColor: '#6C3BFF' }} />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Nombre</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Teléfono</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Motivo</th>
                    <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Fuente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleContacts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-xs" style={{ color: 'var(--c-text-3)' }}>
                        {sourceFilter === 'all' ? 'No hay contactos aún' : 'Sin contactos con este origen'}
                      </td>
                    </tr>
                  ) : visibleContacts.map((c, i) => (
                    <tr key={c.id} onClick={() => c.status === 'pending' && toggle(c.id)}
                      style={{
                        background:   selected.has(c.id) ? 'rgba(108,59,255,0.06)' : (i % 2 === 0 ? 'var(--c-surface)' : 'var(--c-surface-2)'),
                        borderBottom: '1px solid var(--c-border)',
                        cursor:       c.status === 'pending' ? 'pointer' : 'default',
                      }}>
                      <td className="px-4 py-3">
                        {c.status === 'pending' && (
                          <input type="checkbox" checked={selected.has(c.id)}
                            onChange={() => toggle(c.id)} onClick={e => e.stopPropagation()}
                            style={{ accentColor: '#6C3BFF' }} />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--c-text)' }}>
                        {c.nombre ?? <span style={{ color: 'var(--c-text-3)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--c-text-2)' }}>{c.telefono}</td>
                      <td className="hidden sm:table-cell px-4 py-3 text-xs max-w-[200px] truncate" style={{ color: 'var(--c-text-3)' }}>
                        {c.motivo ?? '—'}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <SourceBadge source={c.source} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Action bar */}
          {contacts.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs flex-1" style={{ color: 'var(--c-text-3)' }}>
                {selectedPending.length} seleccionado{selectedPending.length !== 1 ? 's' : ''} de {pendingContacts.length}
              </span>

              {agents.length > 1 && (
                <select value={selectedAgentId} onChange={e => setSelectedAgentId(e.target.value)}
                  className="rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.agent_name ?? a.business_name}</option>
                  ))}
                </select>
              )}

              <button type="button" onClick={handleCall} disabled={calling || selectedPending.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                style={{ background: selectedPending.length > 0 ? '#6C3BFF' : 'var(--c-surface-2)', color: selectedPending.length > 0 ? '#fff' : 'var(--c-text-3)' }}>
                {calling ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
                {calling ? 'Llamando…' : `Llamar seleccionados${selectedPending.length > 0 ? ` (${selectedPending.length})` : ''}`}
              </button>

              {selected.size > 0 && (
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Eliminar {selected.size > 1 ? `(${selected.size})` : ''}
                </button>
              )}

              {callResult && (
                <span className="text-xs flex items-center gap-1.5" style={{ color: callResult.failed > 0 ? '#f59e0b' : '#22c55e' }}>
                  <Check size={12} />
                  {callResult.triggered} llamada{callResult.triggered !== 1 ? 's' : ''} iniciada{callResult.triggered !== 1 ? 's' : ''}
                  {callResult.failed > 0 && `, ${callResult.failed} fallida${callResult.failed !== 1 ? 's' : ''}`}
                </span>
              )}
            </div>
          )}

          {contactError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <X size={14} />{contactError}
            </div>
          )}
        </>
      )}

      {/* ── CAMPAÑAS ──────────────────────────────────────────────────────────── */}
      {activeTab === 'campanas' && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>Campañas</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                Programa llamadas automáticas recurrentes o únicas a tus contactos.
              </p>
            </div>
            {!showCampForm && !editCampaign && (
              <button type="button" onClick={() => setShowCampForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 flex-shrink-0"
                style={{ background: '#6C3BFF', color: '#fff' }}>
                <Plus size={12} />
                Nueva campaña
              </button>
            )}
          </div>

          {/* Campaign create form */}
          {showCampForm && !editCampaign && (
            <CampaignForm
              token={token}
              initial={null}
              onSaved={handleCampaignSaved}
              onCancel={() => setShowCampForm(false)}
            />
          )}

          {/* Campaign edit form */}
          {editCampaign && (
            <CampaignForm
              token={token}
              initial={editCampaign}
              onSaved={handleCampaignSaved}
              onCancel={() => setEditCampaign(null)}
            />
          )}

          {campError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <X size={14} />{campError}
            </div>
          )}

          {/* Campaign list */}
          {campaigns.length === 0 && !showCampForm ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 rounded-2xl"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
                <CalendarClock size={22} style={{ color: '#6C3BFF', opacity: 0.6 }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--c-text-2)' }}>No hay campañas</p>
                <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>Crea la primera para empezar a automatizar llamadas.</p>
              </div>
              <button type="button" onClick={() => setShowCampForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: '#6C3BFF', color: '#fff' }}>
                <Plus size={14} />
                Nueva campaña
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {campaigns.map(c => (
                <div key={c.id} className="rounded-2xl p-4 flex flex-col gap-3"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>

                  {/* Top row: name + status + actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>
                        {c.nombre}
                      </span>
                      <CampaignStatusBadge status={c.status} />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Run now */}
                      <button type="button"
                        onClick={() => handleRunCampaign(c.id)}
                        disabled={running === c.id}
                        title="Ejecutar ahora"
                        className="p-1.5 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
                        style={{ color: '#6C3BFF', background: 'rgba(108,59,255,0.08)' }}>
                        {running === c.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <PhoneOutgoing size={14} />}
                      </button>

                      {/* Edit */}
                      <button type="button"
                        onClick={() => { setEditCampaign(c); setShowCampForm(false); }}
                        title="Editar"
                        className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                        style={{ color: 'var(--c-text-2)', background: 'var(--c-surface-2)' }}>
                        <Pencil size={14} />
                      </button>

                      {/* Pause / Activate */}
                      {c.status !== 'completed' && (
                        <button type="button"
                          onClick={() => handleToggleCampaign(c)}
                          title={c.status === 'active' ? 'Pausar' : 'Activar'}
                          className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                          style={{ color: c.status === 'active' ? '#f59e0b' : '#22c55e', background: c.status === 'active' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)' }}>
                          {c.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                      )}

                      {/* Delete */}
                      <button type="button"
                        onClick={() => handleDeleteCampaign(c.id)}
                        title="Eliminar"
                        className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                        style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Schedule description */}
                  <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--c-text-2)' }}>
                    <CalendarClock size={11} style={{ flexShrink: 0 }} />
                    {describeSchedule(c)}
                  </p>

                  {/* Last / next run */}
                  {(c.last_run_at || c.next_run_at) && (
                    <div className="flex items-center gap-4">
                      {c.last_run_at && (
                        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                          Última ejecución: {fmtShort(c.last_run_at)}
                        </p>
                      )}
                      {c.next_run_at && c.status === 'active' && (
                        <p className="text-xs" style={{ color: '#6C3BFF' }}>
                          Próxima: {fmtShort(c.next_run_at)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Instructions preview */}
                  {c.instrucciones && (
                    <p className="text-xs line-clamp-1" style={{ color: 'var(--c-text-3)' }}>
                      {c.instrucciones}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
