'use client';

import { useState, useMemo, useRef } from 'react';
import {
  Phone, Plus, Upload, Trash2, Loader2, Check, X, PhoneCall, RefreshCw,
  Pencil, PhoneOutgoing, Pause, Play, CalendarClock, Search, AlertTriangle,
  ChevronDown, ChevronUp, BarChart2,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker, TimeInput } from '@/components/ui/date-picker';
import { EmptyState } from '@/components/ui/empty-state';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  id:         string;
  nombre:     string | null;
  telefono:   string;
  motivo:     string | null;
  source:     'llamada_entrante' | 'csv' | 'manual';
  status:     'pending' | 'calling' | 'completed' | 'failed' | 'cancelled';
  fail_count: number;
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

function narrativeStatus(c: Contact): string {
  if (c.status === 'pending')   return 'Esperando llamada.';
  if (c.status === 'calling')   return 'Llamando ahora...';
  if (c.status === 'completed') return 'Llamada completada.';
  if (c.status === 'failed')    return c.fail_count > 1 ? `No contestó ${c.fail_count} veces. Se reintentará.` : 'No contestó. Se reintentará.';
  if (c.status === 'cancelled') return 'Cancelada.';
  return '';
}

// ── Campaign result types & sub-components ───────────────────────────────────

interface CampaignResult {
  id:               string;
  contact_id:       string | null;
  nombre:           string | null;
  telefono:         string;
  status:           string;
  called_at:        string | null;
  vapi_call_id:     string | null;
  summary:          string | null;
  duration_seconds: number | null;
  outcome:          string | null;
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2 text-center flex-1"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="text-base font-bold tabular-nums leading-none" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--c-text-3)' }}>{label}</div>
    </div>
  );
}

function resultDisplayStatus(r: CampaignResult): Contact['status'] {
  if (r.outcome === 'unanswered') return 'failed';
  if (r.status === 'failed') return 'failed';
  if (r.outcome != null || (r.duration_seconds != null && r.duration_seconds > 0)) return 'completed';
  return 'calling';
}

function CampaignResultsPanel({ results }: { results: CampaignResult[] }) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const total    = results.length;
  const answered = results.filter(r => resultDisplayStatus(r) === 'completed').length;
  const noAnswer = results.filter(r => r.outcome === 'unanswered').length;
  const failed   = results.filter(r => resultDisplayStatus(r) === 'failed' && r.outcome !== 'unanswered').length;

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Stats row */}
      <div className="flex gap-2">
        <StatPill label="Total"         value={total}    color="var(--c-text-2)" />
        <StatPill label="Contestaron"   value={answered} color="#22c55e"         />
        <StatPill label="No contestaron" value={noAnswer} color="#f59e0b"        />
        <StatPill label="Fallidas"      value={failed}   color="#ef4444"         />
      </div>

      {/* Per-call rows */}
      <div className="flex flex-col gap-1.5">
        {results.map(r => (
          <div key={r.id} className="rounded-xl overflow-hidden"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
            <div className="px-3 py-2.5 flex items-center gap-2.5 flex-wrap">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>
                  {r.nombre ?? r.telefono}
                </span>
                {r.nombre && (
                  <span className="text-xs ml-2 font-mono" style={{ color: 'var(--c-text-3)' }}>{r.telefono}</span>
                )}
              </div>
              <StatusPill status={resultDisplayStatus(r)} />
              {r.duration_seconds != null && r.duration_seconds > 0 && (
                <span className="text-xs tabular-nums" style={{ color: 'var(--c-text-3)' }}>
                  {Math.ceil(r.duration_seconds / 60)} min
                </span>
              )}
              {r.summary && (
                <button type="button"
                  onClick={() => setExpandedRowId(expandedRowId === r.id ? null : r.id)}
                  className="p-1 rounded-lg transition-opacity hover:opacity-70 flex-shrink-0"
                  style={{ color: '#9B6DFF', background: 'rgba(108,59,255,0.08)', border: 'none', cursor: 'pointer' }}>
                  {expandedRowId === r.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
              )}
            </div>
            {expandedRowId === r.id && r.summary && (
              <div className="px-3 pb-3"
                style={{ borderTop: '1px solid var(--c-border)' }}>
                <p className="text-xs leading-relaxed pt-2.5" style={{ color: 'var(--c-text-2)' }}>{r.summary}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
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
          Instrucciones especiales para el empleado
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
        <Select value={scheduleType} onValueChange={v => setScheduleType(v as ScheduleType)}>
          <SelectTrigger className="rounded-xl py-2.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="once">Una vez</SelectItem>
            <SelectItem value="daily">Diario</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conditional schedule fields */}
      {scheduleType === 'once' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Fecha</label>
          <DatePicker value={runAtDate} onChange={setRunAtDate}
            min={new Date().toISOString().slice(0, 10)} />
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
        <TimeInput value={runAtTime} onChange={setRunAtTime} className="max-w-[160px]" />
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
        <Select value={contactFilter} onValueChange={v => setContactFilter(v as typeof contactFilter)}>
          <SelectTrigger className="rounded-xl py-2.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los pendientes</SelectItem>
            <SelectItem value="llamada_entrante">Solo llamadas entrantes</SelectItem>
            <SelectItem value="csv">Solo CSV</SelectItem>
            <SelectItem value="manual">Solo manuales</SelectItem>
          </SelectContent>
        </Select>
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
  initialTab = 'contactos',
}: {
  token:             string;
  initialContacts:   Contact[];
  initialCampaigns:  Campaign[];
  agents:            Agent[];
  initialTab?:       'contactos' | 'campanas';
}) {
  // ── Contacts state ────────────────────────────────────────────────────────────
  const [contacts,        setContacts]        = useState<Contact[]>(initialContacts);
  const [selected,        setSelected]        = useState<Set<string>>(new Set());
  const [sourceFilter,    setSourceFilter]    = useState<SourceFilter>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? '');
  const [calling,         setCalling]         = useState(false);
  const [callResult,      setCallResult]      = useState<{ triggered: number; failed: number } | null>(null);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [contactSearch,   setContactSearch]   = useState('');
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactSaving,   setContactSaving]   = useState(false);
  const [deleting,        setDeleting]        = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [contactError,    setContactError]    = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [nombre,    setNombre]    = useState('');
  const [telefono,  setTelefono]  = useState('');
  const [motivo,    setMotivo]    = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Campaign state ────────────────────────────────────────────────────────────
  const [campaigns,     setCampaigns]     = useState<Campaign[]>(initialCampaigns);
  const [showCampForm,  setShowCampForm]  = useState(false);
  const [editCampaign,  setEditCampaign]  = useState<Campaign | null>(null);
  const [running,          setRunning]          = useState<string | null>(null);
  const [campError,        setCampError]        = useState('');
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [campaignResults,  setCampaignResults]  = useState<Record<string, CampaignResult[]>>({});
  const [loadingResultId,  setLoadingResultId]  = useState<string | null>(null);

  // ── Contacts derived ──────────────────────────────────────────────────────────
  const pendingContacts = contacts.filter(c => c.status === 'pending');
  const selectedPending = [...selected].filter(id => contacts.find(c => c.id === id && c.status === 'pending'));

  const visibleContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contacts
      .filter(c => sourceFilter === 'all' || c.source === sourceFilter)
      .filter(c => !q || c.nombre?.toLowerCase().includes(q) || c.telefono.includes(q));
  }, [contacts, sourceFilter, contactSearch]);

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
    setShowCallConfirm(false);
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
      const result = { triggered: data.triggered, failed: data.failed };
      setCallResult(result);
      setSelected(new Set());
      setTimeout(() => setCallResult(null), 5000);
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
    // Password gate — misma contraseña que usamos para eliminar empleados.
    // Solo Nazre y owners de confianza deberían tenerla.
    const password = window.prompt(
      `Eliminar ${selected.size} contacto${selected.size !== 1 ? 's' : ''}. Esta acción no se puede deshacer.\n\nIngresa la contraseña de administrador:`
    );
    if (password === null) return;  // cancelado
    if (!password.trim()) { setContactError('Contraseña requerida.'); return; }

    setDeleting(true);
    setContactError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], password: password.trim() }),
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
    setConfirmDeleteId(null);
    const res = await fetch(`/api/portal/${token}/salientes/campanas/${id}`, { method: 'DELETE' });
    if (res.ok) setCampaigns(prev => prev.filter(c => c.id !== id));
    else { const d = await res.json(); setCampError(d.error ?? 'Error al eliminar'); }
  };

  const fetchCampaignResults = async (campaignId: string) => {
    if (expandedResultId === campaignId) { setExpandedResultId(null); return; }
    setExpandedResultId(campaignId);
    if (campaignResults[campaignId]) return;
    setLoadingResultId(campaignId);
    try {
      const res = await fetch(`/api/portal/${token}/salientes/campanas/${campaignId}/resultados`);
      if (res.ok) {
        const data = await res.json();
        setCampaignResults(prev => ({ ...prev, [campaignId]: data }));
      }
    } finally { setLoadingResultId(null); }
  };

  const handleCampaignSaved = (saved: Campaign) => {
    setCampaigns(prev => {
      const exists = prev.find(c => c.id === saved.id);
      return exists ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev];
    });
    setShowCampForm(false);
    setEditCampaign(null);
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const agentLabel    = selectedAgent?.agent_name ?? selectedAgent?.business_name ?? 'El empleado';

  const inputStyle = {
    background: 'var(--c-input-bg)',
    border:     '1px solid var(--c-input-border)',
    color:      'var(--c-text)',
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* ── CONTACTOS ── */}
        <div id="contactos" className="flex flex-col gap-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>Contactos</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                Selecciona contactos y el empleado los llama.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
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
                CSV
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
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Nuevo contacto</p>
              <div className="flex flex-col gap-2">
                <input placeholder="Nombre (opcional)" value={nombre} onChange={e => setNombre(e.target.value)}
                  className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                <input placeholder="Teléfono *" value={telefono} onChange={e => setTelefono(e.target.value)} required
                  className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                <input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)}
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

          {/* Search + source filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[140px]">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--c-text-3)' }} />
              <input
                type="text"
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                placeholder="Buscar…"
                className="w-full pl-8 pr-8 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              />
              {contactSearch && (
                <button onClick={() => setContactSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--c-text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                  <X size={11} />
                </button>
              )}
            </div>
            <Select value={sourceFilter} onValueChange={v => setSourceFilter(v as SourceFilter)}>
              <SelectTrigger className="w-auto py-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="llamada_entrante">Entrante</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Work queue panel */}
          {pendingContacts.length > 0 && (
            <div className="rounded-xl p-3 flex flex-col gap-2"
              style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
              <span className="text-xs font-semibold" style={{ color: '#9B6DFF' }}>
                {agentLabel} — {pendingContacts.length} pendiente{pendingContacts.length !== 1 ? 's' : ''}
              </span>
              <div className="flex flex-col gap-1">
                {pendingContacts.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#6C3BFF' }} />
                    <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                      {c.nombre ? `Llamar a ${c.nombre}` : c.telefono}
                      {c.motivo && <span style={{ color: 'var(--c-text-3)' }}> · {c.motivo}</span>}
                    </span>
                  </div>
                ))}
                {pendingContacts.length > 5 && (
                  <span className="text-xs pl-3.5" style={{ color: 'var(--c-text-4)' }}>
                    +{pendingContacts.length - 5} más
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Selection + action bar */}
          {contacts.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-xs cursor-pointer flex-shrink-0"
                  style={{ color: 'var(--c-text-3)' }}>
                  <input type="checkbox"
                    checked={visiblePending.length > 0 && visiblePending.every(c => selected.has(c.id))}
                    onChange={toggleAll} disabled={visiblePending.length === 0}
                    style={{ accentColor: '#6C3BFF' }} />
                  {selectedPending.length > 0
                    ? `${selectedPending.length} de ${pendingContacts.length} seleccionados`
                    : `${pendingContacts.length} pendiente${pendingContacts.length !== 1 ? 's' : ''}`}
                </label>

                {selectedPending.length > 0 && (
                  <>
                    {agents.length > 1 ? (
                      <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                        <SelectTrigger className="w-auto rounded-xl py-1.5 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.agent_name ?? a.business_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : agents.length === 1 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                        {agents[0].agent_name ?? agents[0].business_name}
                      </span>
                    ) : null}

                    <button type="button"
                      onClick={() => !showCallConfirm && setShowCallConfirm(true)}
                      disabled={calling}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                      style={{ background: '#6C3BFF', color: '#fff' }}>
                      {calling ? <Loader2 size={12} className="animate-spin" /> : <Phone size={12} />}
                      {calling ? 'Llamando…' : `Llamar (${selectedPending.length})`}
                    </button>

                    {!showCallConfirm && (
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                        {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Eliminar
                      </button>
                    )}
                  </>
                )}

                {callResult && (
                  <span className="text-xs flex items-center gap-1.5"
                    style={{ color: callResult.failed > 0 ? '#f59e0b' : '#22c55e' }}>
                    <Check size={12} />
                    {callResult.triggered} llamada{callResult.triggered !== 1 ? 's' : ''} iniciada{callResult.triggered !== 1 ? 's' : ''}
                    {callResult.failed > 0 && `, ${callResult.failed} fallida${callResult.failed !== 1 ? 's' : ''}`}
                  </span>
                )}
              </div>

              {showCallConfirm && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl flex-wrap"
                  style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
                  <AlertTriangle size={14} style={{ color: '#9B6DFF', flexShrink: 0 }} />
                  <p className="text-sm flex-1" style={{ color: 'var(--c-text-2)' }}>
                    ¿Iniciar <strong style={{ color: 'var(--c-text)' }}>{selectedPending.length} llamada{selectedPending.length !== 1 ? 's' : ''}</strong> reales ahora?
                  </p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleCall}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{ background: '#6C3BFF', color: '#fff' }}>
                      <Phone size={12} /> Confirmar
                    </button>
                    <button type="button" onClick={() => setShowCallConfirm(false)}
                      className="px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70"
                      style={{ color: 'var(--c-text-3)' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contact cards */}
          {contacts.length === 0 ? (
            <div className="rounded-2xl"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <EmptyState
                icon={PhoneCall}
                title="No hay contactos aún"
                description="Agrega uno o sube un CSV"
              />
            </div>
          ) : visibleContacts.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--c-text-3)' }}>
              {sourceFilter === 'all' ? 'Sin resultados' : 'Sin contactos con este origen'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {visibleContacts.map(c => (
                <div key={c.id}
                  className="rounded-xl overflow-hidden transition-colors"
                  style={{
                    background: selected.has(c.id) ? 'rgba(108,59,255,0.06)' : 'var(--c-surface-2)',
                    border:     selected.has(c.id) ? '1px solid rgba(108,59,255,0.3)' : '1px solid var(--c-border)',
                    cursor:     c.status === 'pending' ? 'pointer' : 'default',
                  }}
                  onClick={() => c.status === 'pending' && toggle(c.id)}
                >
                  <div className="px-3 py-2.5 flex items-start gap-2.5">
                    {c.status === 'pending' && (
                      <input type="checkbox" checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)} onClick={e => e.stopPropagation()}
                        className="mt-0.5 flex-shrink-0"
                        style={{ accentColor: '#6C3BFF' }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                          {c.nombre ?? c.telefono}
                        </span>
                        {c.nombre && (
                          <span className="text-[10px] font-mono" style={{ color: 'var(--c-text-3)' }}>
                            {c.telefono}
                          </span>
                        )}
                        <StatusPill status={c.status} />
                        {c.fail_count > 0 && c.status !== 'completed' && c.status !== 'cancelled' && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                            ×{c.fail_count}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                        {[c.motivo, narrativeStatus(c)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {contactError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <X size={14} />{contactError}
            </div>
          )}
        </div>

        {/* ── CAMPAÑAS ── */}
        <div id="campanas" className="flex flex-col gap-5">
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

                    {/* Action buttons or inline delete confirm */}
                    {confirmDeleteId === c.id ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>¿Eliminar?</span>
                        <button type="button" onClick={() => handleDeleteCampaign(c.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                          Sí
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 rounded-lg text-xs transition-opacity hover:opacity-70"
                          style={{ color: 'var(--c-text-3)' }}>
                          No
                        </button>
                      </div>
                    ) : (
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
                          onClick={() => setConfirmDeleteId(c.id)}
                          title="Eliminar"
                          className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                          style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
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

                  {/* Results toggle */}
                  <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 10, marginTop: 2 }}>
                    <button type="button" onClick={() => fetchCampaignResults(c.id)}
                      className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
                      style={{ color: '#9B6DFF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {loadingResultId === c.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : expandedResultId === c.id
                          ? <ChevronUp size={11} />
                          : <BarChart2 size={11} />}
                      {loadingResultId === c.id
                        ? 'Cargando…'
                        : expandedResultId === c.id
                          ? 'Ocultar resultados'
                          : `Ver resultados${campaignResults[c.id]?.length ? ` (${campaignResults[c.id].length})` : ''}`}
                    </button>

                    {expandedResultId === c.id && !loadingResultId && (
                      campaignResults[c.id]?.length
                        ? <CampaignResultsPanel results={campaignResults[c.id]} />
                        : (
                          <p className="text-xs py-3 text-center" style={{ color: 'var(--c-text-3)' }}>
                            Sin llamadas registradas aún. Ejecuta la campaña para ver resultados.
                          </p>
                        )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
