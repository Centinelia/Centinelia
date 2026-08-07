'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Phone, Plus, Upload, Trash2, Loader2, Check, X, PhoneCall, RefreshCw,
  Pencil, PhoneOutgoing, Pause, Play, CalendarClock, Search, AlertTriangle,
  ChevronDown, ChevronUp, BarChart2,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker, TimeInput } from '@/components/ui/date-picker';
import { EmptyState } from '@/components/ui/empty-state';
import ContactTags from './oficina/ContactTags';
import OficinaModal from './oficina/OficinaModal';
import { OUTBOUND_CAPABILITIES } from '@/lib/portal/outbound-capabilities';
import { MEERKAT_MAP, INTERNAL_MEERKAT_IDS, type MeerkatRole, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';

/**
 * Devuelve las capabilities que un agente puede ejecutar.
 * Prioridad: features.outbound_capabilities (override explícito) > meerkat default.
 * 'custom' siempre es válido si tiene outbound_calls.
 */
function agentCapabilities(a: Agent): string[] {
  if (Array.isArray(a.features?.outbound_capabilities)) return a.features!.outbound_capabilities!;
  const mid = a.meerkat_role_id ?? a.features?.meerkat_role_id ?? null;
  if (mid) {
    const meerkat = (MEERKAT_MAP as Record<string, { features?: { outbound_capabilities?: string[] } }>)[mid];
    return meerkat?.features?.outbound_capabilities ?? [];
  }
  return [];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  id:         string;
  nombre:     string | null;
  telefono:   string;
  email?:     string | null;
  motivo:     string | null;
  source:     'llamada_entrante' | 'csv' | 'manual';
  status:     'pending' | 'calling' | 'completed' | 'failed' | 'cancelled';
  fail_count: number;
  created_at: string;
  tags?:      string[];
}

interface Agent {
  id:            string;
  agent_name:    string | null;
  business_name: string;
  features?: {
    outbound_capabilities?: string[];
    meerkat_role_id?: string;
    outbound_calls?: boolean;
  } | null;
  meerkat_role_id?: string | null;
}

type ScheduleType   = 'once' | 'daily' | 'weekly';
type SourceFilter   = 'all' | 'llamada_entrante' | 'csv' | 'manual';

interface Campaign {
  id:             string;
  agent_id:       string;
  capability?:    string | null;
  nombre:         string;
  instrucciones:  string | null;
  motivo:         string | null;
  schedule_type:  ScheduleType;
  run_at_time:    string;
  run_on_days:    number[];
  run_at_date:    string | null;
  contact_filter: string[] | null;
  tag_filter:     string[];
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

function parseCSV(text: string): Array<{ nombre?: string; telefono: string; email?: string; motivo?: string }> {
  const lines = text.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));
  const hasHeader = header.some(h => ['nombre', 'name', 'telefono', 'phone', 'tel'].includes(h));
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const iNombre   = hasHeader ? header.findIndex(h => ['nombre', 'name'].includes(h)) : 0;
  const iTelefono = hasHeader ? header.findIndex(h => ['telefono', 'phone', 'tel'].includes(h)) : (hasHeader ? 1 : 0);
  const iEmail    = hasHeader ? header.findIndex(h => ['email', 'correo', 'mail', 'e-mail'].includes(h)) : -1;
  const iMotivo   = hasHeader ? header.findIndex(h => ['motivo', 'reason', 'nota'].includes(h)) : -1;
  return dataLines
    .map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/['"]/g, ''));
      const telefono = cols[iTelefono]?.trim();
      if (!telefono) return null;
      return {
        nombre:  iNombre  >= 0 ? cols[iNombre]?.trim()  || undefined : undefined,
        telefono,
        email:   iEmail   >= 0 ? cols[iEmail]?.trim()   || undefined : undefined,
        motivo:  iMotivo  >= 0 ? cols[iMotivo]?.trim()  || undefined : undefined,
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * ContactRowInner — el contenido de un row de contacto (extraído para virtualización).
 * Height ~48px sin tags, ~72px con tags. El virtualizer usa measureElement para
 * ajuste dinámico.
 */
function ContactRowInner({
  c, isSelected, onToggle, onTagsChange, onEdit,
}: {
  c: Contact;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onTagsChange: (id: string, tags: string[]) => void | Promise<void>;
  onEdit: (c: Contact) => void;
}) {
  const hasTags = (c.tags ?? []).length > 0;
  return (
    <div
      className="group transition-colors"
      style={{
        background: isSelected ? 'rgba(108,59,255,0.06)' : 'transparent',
        cursor:     'pointer',
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(108,59,255,0.03)'; }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      onClick={() => onToggle(c.id)}
    >
      <div className="px-4 py-2.5 flex items-center gap-3 min-h-[48px]">
        <input type="checkbox" checked={isSelected}
          onChange={() => onToggle(c.id)} onClick={e => e.stopPropagation()}
          className="flex-shrink-0"
          style={{ accentColor: '#6C3BFF' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold truncate" style={{ color: '#1A0A3B' }}>
              {c.nombre ?? c.telefono}
            </span>
            {c.nombre && (
              <span className="text-[11px] tabular-nums" style={{ color: '#9B8FB5' }}>
                {c.telefono}
              </span>
            )}
            {c.email && (
              <span className="text-[11px] truncate max-w-[200px]" style={{ color: '#9B8FB5' }}>
                · {c.email}
              </span>
            )}
          </div>
          {hasTags && (
            <div className="mt-1" onClick={e => e.stopPropagation()}>
              <ContactTags tags={c.tags ?? []} onChange={tags => onTagsChange(c.id, tags)} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {!hasTags && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ContactTags tags={c.tags ?? []} onChange={tags => onTagsChange(c.id, tags)} />
            </div>
          )}
          <button
            type="button"
            onClick={() => onEdit(c)}
            aria-label={`Editar ${c.nombre ?? c.telefono}`}
            title="Editar contacto"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-white"
            style={{ color: '#9B8FB5' }}
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * VirtualContactList — virtualiza rows para escalar a 500+ contactos.
 * Altura visible fija (min 400px, max 60vh) con scroll interno. Solo renderiza
 * los rows que están en viewport + overscan. Cada row usa measureElement para
 * altura dinámica (por tags).
 */
function VirtualContactList({
  contacts, selected, onToggle, onTagsChange, onEdit,
}: {
  contacts:     Contact[];
  selected:     Set<string>;
  onToggle:     (id: string) => void;
  onTagsChange: (id: string, tags: string[]) => void | Promise<void>;
  onEdit:       (c: Contact) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count:          contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize:   () => 56,   // altura promedio row (48-72 según tags)
    overscan:       8,
    getItemKey:     i => contacts[i]?.id ?? i,
  });
  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto"
      style={{
        minHeight: 400,
        maxHeight: '60vh',
        contain: 'strict',
      }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {items.map(vi => {
          const c = contacts[vi.index];
          if (!c) return null;
          return (
            <div
              key={vi.key}
              ref={virtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: 'absolute',
                top:      0,
                left:     0,
                right:    0,
                transform: `translateY(${vi.start}px)`,
                borderBottom: vi.index === contacts.length - 1 ? 'none' : '1px solid #F0EDF9',
              }}
            >
              <ContactRowInner
                c={c}
                isSelected={selected.has(c.id)}
                onToggle={onToggle}
                onTagsChange={onTagsChange}
                onEdit={onEdit}
              />
            </div>
          );
        })}
      </div>
    </div>
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

function CampaignForm({
  token, initial, contacts, outboundAgents, onSaved, onCancel,
}: CampaignFormProps & { contacts?: Contact[]; outboundAgents: Agent[] }) {
  const [nombre,        setNombre]        = useState(initial?.nombre        ?? '');
  const [motivo,        setMotivo]        = useState(initial?.motivo        ?? '');
  const [instrucciones, setInstrucciones] = useState(initial?.instrucciones ?? '');
  const [scheduleType,  setScheduleType]  = useState<ScheduleType>(initial?.schedule_type ?? 'once');
  const [runAtTime,     setRunAtTime]     = useState(initial?.run_at_time   ?? '09:00');
  const [runAtDate,     setRunAtDate]     = useState(initial?.run_at_date   ?? '');
  const [runOnDays,     setRunOnDays]     = useState<number[]>(initial?.run_on_days ?? [1]);

  // Capability + empleado asignado (nuevo — antes no se seleccionaban)
  const [capability,      setCapability]      = useState<string>(initial?.capability ?? 'custom');
  const [assignedAgentId, setAssignedAgentId] = useState<string>(initial?.agent_id ?? outboundAgents[0]?.id ?? '');

  const legacyContactFilter = initial?.contact_filter?.[0] ?? null;
  const [tagFilter, setTagFilter] = useState<string[]>(initial?.tag_filter ?? []);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Empleados elegibles según la capability elegida.
  // 'custom' → cualquier empleado con outbound_calls activo.
  // catálogo → filtra por agentCapabilities().
  const eligibleAgents = useMemo(() => {
    if (capability === 'custom') return outboundAgents;
    return outboundAgents.filter(a => agentCapabilities(a).includes(capability));
  }, [capability, outboundAgents]);

  // Si el empleado asignado deja de ser elegible al cambiar capability, elige el primero.
  useEffect(() => {
    if (!eligibleAgents.find(a => a.id === assignedAgentId) && eligibleAgents.length > 0) {
      setAssignedAgentId(eligibleAgents[0].id);
    }
  }, [eligibleAgents, assignedAgentId]);

  // Tags disponibles (extraídos de contactos) + preview de cuántos matchean
  const allTags = useMemo(() => {
    const bag = new Set<string>();
    for (const c of contacts ?? []) for (const t of c.tags ?? []) bag.add(t);
    return Array.from(bag).sort();
  }, [contacts]);

  // Cuenta TODOS los contactos que matchean los filtros — no filtramos por
  // status='pending' porque las campañas llaman a lo que matchea sin importar
  // si un contacto ya fue llamado antes.
  const previewCount = useMemo(() => {
    if (!contacts?.length) return 0;
    return contacts.filter(c => {
      if (legacyContactFilter && c.source !== legacyContactFilter) return false;
      if (tagFilter.length && !tagFilter.every(t => (c.tags ?? []).includes(t))) return false;
      return true;
    }).length;
  }, [contacts, legacyContactFilter, tagFilter]);

  // Dropdown state for capability picker
  const [capOpen, setCapOpen] = useState(false);
  const capLabel = capability === 'custom'
    ? 'Otra personalizada'
    : (OUTBOUND_CAPABILITIES.find(c => c.id === capability)?.label ?? 'Otra personalizada');

  const toggleTag = (t: string) =>
    setTagFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const toggleDay = (d: number) =>
    setRunOnDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!assignedAgentId) { setError('Selecciona el empleado que ejecutará la campaña.'); return; }
    if (scheduleType === 'weekly' && runOnDays.length === 0) { setError('Selecciona al menos un día.'); return; }

    const payload = {
      agent_id:       assignedAgentId,
      capability:     capability,
      nombre:         nombre.trim(),
      motivo:         motivo.trim() || null,
      instrucciones:  instrucciones.trim() || null,
      schedule_type:  scheduleType,
      run_at_time:    runAtTime,
      run_at_date:    scheduleType === 'once'   ? (runAtDate || null) : null,
      run_on_days:    scheduleType === 'weekly' ? runOnDays           : [],
      contact_filter: legacyContactFilter ? [legacyContactFilter] : null,
      tag_filter:     tagFilter,
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

  const inputSty: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#ffffff', border: '1px solid #E8E3F5',
    borderRadius: 10, padding: '10px 14px', color: '#1A0A3B', fontSize: 14, outline: 'none',
  };

  return (
    <OficinaModal
      open
      onClose={onCancel}
      eyebrow={initial ? 'Editar' : 'Nueva campaña'}
      title={initial ? 'Ajusta tu campaña' : 'Programa una campaña de llamadas'}
      description="El empleado marcará automáticamente en el horario que definas."
      size="lg"
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onCancel}>Cancelar</OficinaModal.SecondaryAction>
          <OficinaModal.PrimaryAction
            onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
            loading={saving}
            disabled={!nombre.trim() || !assignedAgentId}
          >
            {initial ? 'Guardar cambios' : 'Crear campaña'}
          </OficinaModal.PrimaryAction>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* Tipo de campaña — botón que expande chip picker */}
        <OficinaModal.Field
          label="Tipo de campaña"
          hint="filtra los empleados que pueden ejecutarla"
        >
          <button
            type="button"
            onClick={() => setCapOpen(o => !o)}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-[#FAFAFB]"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          >
            <span className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full"
                style={{ background: capability === 'custom' ? '#1A0A3B' : '#6C3BFF' }} />
              {capLabel}
            </span>
            {capOpen ? <ChevronUp size={14} style={{ color: '#9B8FB5' }} /> : <ChevronDown size={14} style={{ color: '#9B8FB5' }} />}
          </button>

          {capOpen && (
            <div className="mt-2 p-3 rounded-lg flex flex-wrap gap-1.5"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
              {OUTBOUND_CAPABILITIES.map(cap => {
                const active = capability === cap.id;
                return (
                  <button
                    key={cap.id}
                    type="button"
                    onClick={() => { setCapability(cap.id); setCapOpen(false); }}
                    title={cap.description}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors"
                    style={{
                      background: active ? '#6C3BFF' : '#ffffff',
                      color:      active ? '#ffffff' : '#6B6480',
                      border:     active ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                    }}
                  >
                    {cap.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => { setCapability('custom'); setCapOpen(false); }}
                className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors"
                style={{
                  background: capability === 'custom' ? '#1A0A3B' : '#ffffff',
                  color:      capability === 'custom' ? '#ffffff' : '#6B6480',
                  border:     capability === 'custom' ? '1px solid #1A0A3B' : '1px solid #E8E3F5',
                }}
              >
                Otra personalizada
              </button>
            </div>
          )}
        </OficinaModal.Field>

        {/* Empleado asignado — filtrado por capability */}
        <OficinaModal.Field
          label="Empleado que la ejecuta"
          hint={
            eligibleAgents.length === 0
              ? undefined
              : `${eligibleAgents.length} empleado${eligibleAgents.length !== 1 ? 's' : ''} elegible${eligibleAgents.length !== 1 ? 's' : ''}`
          }
        >
          {eligibleAgents.length === 0 ? (
            (() => {
              // Sugerir qué meerkats sí pueden — pista de upsell.
              // Excluye meerkats internos (Nash) que no son contratables por clientes.
              const suggested = Object.entries(MEERKAT_MAP as Record<MeerkatRoleId, MeerkatRole>)
                .filter(([id, m]) =>
                  !INTERNAL_MEERKAT_IDS.has(id as MeerkatRoleId) &&
                  (m.features?.outbound_capabilities ?? []).includes(capability)
                )
                .map(([, m]) => `${m.nombre} (${m.rol})`);
              return (
                <div className="text-[12px] px-3 py-2.5 rounded-lg flex flex-col gap-1.5"
                  style={{ color: '#6B6480', background: '#FEF6E7', border: '1px solid #FCE4B0' }}>
                  <p style={{ color: '#B45309' }}>
                    <strong>Ninguno de tus empleados actuales</strong> puede ejecutar este tipo de campaña.
                  </p>
                  {suggested.length > 0 ? (
                    <p>
                      Este tipo lo puede hacer:{' '}
                      <strong style={{ color: '#1A0A3B' }}>{suggested.join(', ')}</strong>.
                      Contrata alguno o cambia el tipo de campaña.
                    </p>
                  ) : (
                    <p>Elige otro tipo de campaña o usa &quot;Otra personalizada&quot;.</p>
                  )}
                </div>
              );
            })()
          ) : (
            <Select value={assignedAgentId} onValueChange={setAssignedAgentId}>
              <SelectTrigger className="w-full rounded-lg text-[13px]"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                <SelectValue placeholder="Selecciona un empleado…" />
              </SelectTrigger>
              <SelectContent>
                {eligibleAgents.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.agent_name ?? a.business_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </OficinaModal.Field>

        {/* Nombre */}
        <OficinaModal.Field label="Nombre" hint="requerido">
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Recordatorios de pago julio"
            style={inputSty} />
        </OficinaModal.Field>

        {/* Motivo */}
        <OficinaModal.Field label="Motivo de la llamada">
          <input value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Ej: Recordatorio de vencimiento el 31 de julio"
            style={inputSty} />
        </OficinaModal.Field>

        {/* Instrucciones */}
        <OficinaModal.Field label="Instrucciones para el empleado" hint="opcional">
          <textarea value={instrucciones} onChange={e => setInstrucciones(e.target.value)}
            rows={3}
            placeholder="Ej: Si el cliente ya pagó, agradécele y termina. Si no, ofrece link de pago."
            style={{ ...inputSty, resize: 'none', lineHeight: 1.55 }} />
        </OficinaModal.Field>

        {/* ── Segmentación ────────────────────────────────────────────── */}
        <OficinaModal.Field
          label="A quién llamar"
          hint={tagFilter.length > 0 ? 'contactos que tengan TODOS los tags' : 'todos los contactos pendientes'}
        >
          {allTags.length === 0 ? (
            <p className="text-[12px] px-3 py-2 rounded-lg"
              style={{ color: '#6B6480', background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
              No hay tags aún en tus contactos. Sin filtro, la campaña llamará a todos los pendientes. Agrega tags para segmentar.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(t => {
                const active = tagFilter.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors"
                    style={{
                      background: active ? '#6C3BFF' : '#ffffff',
                      color:      active ? '#ffffff' : '#6B6480',
                      border:     active ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
          {contacts && contacts.length > 0 && (
            <p className="text-[12px] mt-1" style={{ color: previewCount === 0 ? '#EF4444' : '#6B6480' }}>
              <strong style={{ color: previewCount === 0 ? '#EF4444' : '#1A0A3B' }}>{previewCount}</strong> {previewCount === 1 ? 'contacto' : 'contactos'} con estos filtros
            </p>
          )}
        </OficinaModal.Field>

        {/* ── Cuándo ──────────────────────────────────────────────────── */}
        <OficinaModal.Field label="Cuándo">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {(['once', 'daily', 'weekly'] as ScheduleType[]).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setScheduleType(st)}
                  className="rounded-lg text-[13px] font-semibold transition-all"
                  style={{
                    padding:    '9px 0',
                    background: scheduleType === st ? '#1A0A3B' : '#ffffff',
                    color:      scheduleType === st ? '#ffffff' : '#6B6480',
                    border:     scheduleType === st ? 'none' : '1px solid #E8E3F5',
                  }}
                >
                  {st === 'once' ? 'Una vez' : st === 'daily' ? 'Diario' : 'Semanal'}
                </button>
              ))}
            </div>

            {scheduleType === 'once' && (
              <div>
                <label className="text-[10px] block mb-1" style={{ color: '#9B8FB5' }}>Fecha</label>
                <DatePicker value={runAtDate} onChange={setRunAtDate}
                  min={new Date().toISOString().slice(0, 10)} />
              </div>
            )}

            {scheduleType === 'weekly' && (
              <div>
                <label className="text-[10px] block mb-1" style={{ color: '#9B8FB5' }}>Días</label>
                <div className="flex gap-1.5 flex-wrap">
                  {WEEK_DAYS.map(({ label, value }) => {
                    const active = runOnDays.includes(value);
                    return (
                      <button key={value} type="button" onClick={() => toggleDay(value)}
                        className="w-9 h-9 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: active ? '#6C3BFF' : '#ffffff',
                          color:      active ? '#ffffff' : '#6B6480',
                          border:     active ? 'none' : '1px solid #E8E3F5',
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] block mb-1" style={{ color: '#9B8FB5' }}>Hora</label>
              <TimeInput value={runAtTime} onChange={setRunAtTime} className="max-w-[160px]" />
              <p className="text-[11px] mt-1" style={{ color: '#9B8FB5' }}>
                El cron corre cada 10 min; la hora exacta puede variar ±10 min.
              </p>
            </div>
          </div>
        </OficinaModal.Field>

        {error && (
          <p className="text-[13px] px-3 py-2 rounded-lg"
            style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
            {error}
          </p>
        )}

      </div>
    </OficinaModal>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function OutboundSection({
  token,
  initialContacts,
  initialCampaigns,
  agents,
  initialTab = 'contactos',
  show = 'both',
}: {
  token:             string;
  initialContacts:   Contact[];
  initialCampaigns:  Campaign[];
  agents:            Agent[];
  initialTab?:       'contactos' | 'campanas';
  /** Controla qué columnas se renderizan.
   *  'both' (default): contactos + campañas lado a lado (legacy)
   *  'contactos':      solo la columna de contactos (usado en /oficina/llamadas?filtro=salientes)
   *  'campanas':       solo la columna de campañas   (usado en /oficina/campanas) */
  show?:             'contactos' | 'campanas' | 'both';
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
  const [emailNew,  setEmailNew]  = useState('');
  const [motivo,    setMotivo]    = useState('');

  // ── Edit contact modal state ──────────────────────────────────────────────────
  const [editingContact,  setEditingContact]  = useState<Contact | null>(null);
  const [editNombre,      setEditNombre]      = useState('');
  const [editTelefono,    setEditTelefono]    = useState('');
  const [editEmail,       setEditEmail]       = useState('');
  const [editMotivo,      setEditMotivo]      = useState('');
  const [editPassword,    setEditPassword]    = useState('');
  const [editSaving,      setEditSaving]      = useState(false);
  const [editError,       setEditError]       = useState('');

  const openEditContact = (c: Contact) => {
    setEditingContact(c);
    setEditNombre(c.nombre ?? '');
    setEditTelefono(c.telefono);
    setEditEmail(c.email ?? '');
    setEditMotivo(c.motivo ?? '');
    setEditPassword('');
    setEditError('');
  };
  const closeEditContact = () => {
    setEditingContact(null);
    setEditPassword('');
    setEditError('');
  };
  const handleSaveEdit = async () => {
    if (!editingContact) return;
    if (!editTelefono.trim()) { setEditError('El teléfono es requerido.'); return; }
    if (!editPassword.trim()) { setEditError('Contraseña requerida.'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts/${editingContact.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          nombre:   editNombre,
          telefono: editTelefono,
          email:    editEmail,
          motivo:   editMotivo,
          password: editPassword,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEditError(d.error ?? 'Error al guardar.');
        return;
      }
      const updated = await res.json() as Contact;
      setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
      closeEditContact();
    } catch {
      setEditError('Error de red.');
    } finally {
      setEditSaving(false);
    }
  };

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

  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'alpha' | 'tags_desc' | 'has_email'>('recent');

  const allTagsFromContacts = useMemo(() => {
    const bag = new Set<string>();
    for (const c of contacts) for (const t of c.tags ?? []) bag.add(t);
    return Array.from(bag).sort();
  }, [contacts]);

  const visibleContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const filtered = contacts
      .filter(c => sourceFilter === 'all' || c.source === sourceFilter)
      .filter(c => !tagFilter || (c.tags ?? []).includes(tagFilter))
      .filter(c => !q || c.nombre?.toLowerCase().includes(q) || c.telefono.includes(q) || (c.email ?? '').toLowerCase().includes(q));

    // Sort a los ya filtrados
    const sorted = [...filtered];
    if (sortBy === 'alpha') {
      sorted.sort((a, b) => (a.nombre ?? a.telefono).localeCompare(b.nombre ?? b.telefono, 'es'));
    } else if (sortBy === 'tags_desc') {
      sorted.sort((a, b) => (b.tags?.length ?? 0) - (a.tags?.length ?? 0));
    } else if (sortBy === 'has_email') {
      sorted.sort((a, b) => (b.email ? 1 : 0) - (a.email ? 1 : 0));
    }
    // default 'recent': ya viene por created_at desc del server
    return sorted;
  }, [contacts, sourceFilter, contactSearch, tagFilter, sortBy]);

  const visiblePending = visibleContacts.filter(c => c.status === 'pending');

  const toggleAll = () => {
    // Selecciona TODOS los visibles (no solo pending) — bulk-tag y eliminar
    // aplican a cualquier estado; Llamar filtra internamente por pending.
    const allVisibleSelected = visibleContacts.length > 0 && visibleContacts.every(c => selected.has(c.id));
    if (allVisibleSelected) {
      setSelected(prev => { const next = new Set(prev); visibleContacts.forEach(c => next.delete(c.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); visibleContacts.forEach(c => next.add(c.id)); return next; });
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
        body: JSON.stringify({
          nombre:   nombre   || undefined,
          telefono,
          email:    emailNew || undefined,
          motivo:   motivo   || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setContactError(data.error ?? 'Error al guardar'); return; }
      setContacts(prev => [...(Array.isArray(data) ? data : [data]), ...prev]);
      setNombre(''); setTelefono(''); setEmailNew(''); setMotivo('');
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

  const handleTagsChange = async (contactId: string, tags: string[]) => {
    // Optimistic update
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, tags } : c));
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts/${contactId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tags }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      // Revert en caso de error
      setContactError('No se pudieron guardar los tags');
      const res = await fetch(`/api/portal/${token}/salientes/contacts`);
      if (res.ok) setContacts(await res.json());
    }
  };

  const handleBulkTag = async () => {
    if (!selected.size) return;
    const raw = window.prompt(
      `Aplicar tags a ${selected.size} contacto${selected.size !== 1 ? 's' : ''}.\n\nIngresa los tags separados por coma (ej: cotizó, seguimiento):`
    );
    if (raw === null) return;
    const newTags = Array.from(new Set(
      raw.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0 && t.length <= 40)
    )).slice(0, 20);
    if (!newTags.length) return;

    // Fuse con existentes por contacto (no reemplaza)
    const ids = [...selected];
    setContactError('');
    const updates = ids.map(id => {
      const current = contacts.find(c => c.id === id);
      const merged = Array.from(new Set([...(current?.tags ?? []), ...newTags])).slice(0, 20);
      return { id, tags: merged };
    });

    // Optimistic
    setContacts(prev => prev.map(c => {
      const u = updates.find(x => x.id === c.id);
      return u ? { ...c, tags: u.tags } : c;
    }));

    // Fire in parallel; revert on any failure by re-fetching
    const results = await Promise.allSettled(updates.map(u =>
      fetch(`/api/portal/${token}/salientes/contacts/${u.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tags: u.tags }),
      }).then(r => { if (!r.ok) throw new Error('save failed'); })
    ));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      setContactError(`No se pudieron aplicar tags a ${failed} contacto${failed !== 1 ? 's' : ''}`);
      const res = await fetch(`/api/portal/${token}/salientes/contacts`);
      if (res.ok) setContacts(await res.json());
    } else {
      setSelected(new Set());
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

  const showBoth = show === 'both';
  const gridCols = showBoth ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1';

  return (
    <div className="flex flex-col gap-5">
      <div className={`grid ${gridCols} gap-6 items-start`}>

        {/* ── CONTACTOS ── */}
        {show !== 'campanas' && (
        <div id="contactos" className="order-2">
        <div
          className="flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            border:     '1px solid #E8E3F5',
            boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
          }}
        >

          {/* Header — dentro del surface, con padding generoso */}
          <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                  Contactos
                </h2>
                {contacts.length > 0 && (
                  <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                    {contacts.length}
                  </span>
                )}
              </div>
              <p className="text-[12px] mt-1 whitespace-nowrap" style={{ color: '#6B6480' }}>
                Agrégales tags para que las campañas los llamen por segmento.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button type="button" onClick={refresh} disabled={refreshing}
                aria-label="Actualizar"
                className="flex items-center justify-center rounded-lg transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ width: 32, height: 32, background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={contactSaving}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                <Upload size={12} />
                CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSV} />
              <button type="button" onClick={() => { setShowContactForm(true); setContactError(''); }}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                <Plus size={12} />
                Nuevo
              </button>
            </div>
          </div>

          {/* Add contact modal */}
          {showContactForm && (
            <OficinaModal
              open
              onClose={() => { setShowContactForm(false); setNombre(''); setTelefono(''); setEmailNew(''); setMotivo(''); setContactError(''); }}
              eyebrow="Nuevo contacto"
              title="Agrega un contacto"
              description="Este contacto queda disponible para futuras campañas segmentadas por tags."
              size="md"
              footer={
                <>
                  <OficinaModal.SecondaryAction
                    onClick={() => { setShowContactForm(false); setNombre(''); setTelefono(''); setEmailNew(''); setMotivo(''); setContactError(''); }}
                  >
                    Cancelar
                  </OficinaModal.SecondaryAction>
                  <OficinaModal.PrimaryAction
                    onClick={() => handleAddContact({ preventDefault: () => {} } as React.FormEvent)}
                    loading={contactSaving}
                    disabled={!telefono.trim()}
                  >
                    Guardar
                  </OficinaModal.PrimaryAction>
                </>
              }
            >
              <div className="flex flex-col gap-4">
                <OficinaModal.Field label="Nombre" hint="opcional">
                  <input placeholder="Ej: Juan Pérez" value={nombre} onChange={e => setNombre(e.target.value)}
                    style={{ ...inputStyle, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', borderRadius: 10 }} />
                </OficinaModal.Field>
                <OficinaModal.Field label="Teléfono" hint="requerido">
                  <input placeholder="Ej: +52 811 234 5678" value={telefono} onChange={e => setTelefono(e.target.value)}
                    style={{ ...inputStyle, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', borderRadius: 10 }} />
                </OficinaModal.Field>
                <OficinaModal.Field label="Correo" hint="opcional — para campañas futuras de correo">
                  <input type="email" placeholder="Ej: juan@empresa.mx" value={emailNew} onChange={e => setEmailNew(e.target.value)}
                    style={{ ...inputStyle, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', borderRadius: 10 }} />
                </OficinaModal.Field>
                <OficinaModal.Field label="Motivo" hint="opcional">
                  <input placeholder="Ej: Interesado en paquete premium" value={motivo} onChange={e => setMotivo(e.target.value)}
                    style={{ ...inputStyle, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', borderRadius: 10 }} />
                </OficinaModal.Field>
                {contactError && (
                  <p className="text-[13px] px-3 py-2 rounded-lg"
                    style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
                    {contactError}
                  </p>
                )}
              </div>
            </OficinaModal>
          )}

          {/* Edit contact modal — password gate */}
          {editingContact && (
            <OficinaModal
              open
              onClose={closeEditContact}
              eyebrow="Editar contacto"
              title={editingContact.nombre ?? editingContact.telefono}
              description="Requiere contraseña de administrador (la misma que usas para eliminar contactos y empleados)."
              size="md"
              footer={
                <>
                  <OficinaModal.SecondaryAction onClick={closeEditContact}>
                    Cancelar
                  </OficinaModal.SecondaryAction>
                  <OficinaModal.PrimaryAction
                    onClick={handleSaveEdit}
                    loading={editSaving}
                    disabled={!editTelefono.trim() || !editPassword.trim()}
                  >
                    Guardar cambios
                  </OficinaModal.PrimaryAction>
                </>
              }
            >
              <div className="flex flex-col gap-4">
                <OficinaModal.Field label="Nombre" hint="opcional">
                  <input placeholder="Ej: Juan Pérez" value={editNombre} onChange={e => setEditNombre(e.target.value)}
                    style={{ ...inputStyle, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', borderRadius: 10 }} />
                </OficinaModal.Field>
                <OficinaModal.Field label="Teléfono" hint="requerido">
                  <input placeholder="Ej: +52 811 234 5678" value={editTelefono} onChange={e => setEditTelefono(e.target.value)}
                    style={{ ...inputStyle, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', borderRadius: 10 }} />
                </OficinaModal.Field>
                <OficinaModal.Field label="Correo" hint="opcional">
                  <input type="email" placeholder="Ej: juan@empresa.mx" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                    style={{ ...inputStyle, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', borderRadius: 10 }} />
                </OficinaModal.Field>
                <OficinaModal.Field label="Motivo" hint="opcional">
                  <input placeholder="Ej: Interesado en paquete premium" value={editMotivo} onChange={e => setEditMotivo(e.target.value)}
                    style={{ ...inputStyle, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', borderRadius: 10 }} />
                </OficinaModal.Field>
                <OficinaModal.Field label="Contraseña de administrador" hint="requerida">
                  <input type="password" placeholder="••••••••" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                    autoComplete="current-password"
                    style={{ ...inputStyle, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', borderRadius: 10 }} />
                </OficinaModal.Field>
                {editError && (
                  <p className="text-[13px] px-3 py-2 rounded-lg"
                    style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
                    {editError}
                  </p>
                )}
              </div>
            </OficinaModal>
          )}

          {/* Buscar + tag chips (mismo bloque, dentro del surface con divider) */}
          {contacts.length > 0 && (
            <div className="px-5 py-3 flex flex-col gap-3" style={{ borderTop: '1px solid #F0EDF9' }}>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#9B8FB5' }} />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  placeholder="Buscar por nombre, teléfono o correo…"
                  className="w-full pl-9 pr-9 py-2 rounded-lg text-[13px] outline-none transition-all focus:ring-2"
                  style={{
                    background: '#FAFAFB',
                    border:     '1px solid #E8E3F5',
                    color:      '#1A0A3B',
                    boxShadow:  contactSearch ? '0 0 0 2px rgba(108,59,255,0.1)' : 'none',
                  }}
                />
                {contactSearch && (
                  <button onClick={() => setContactSearch('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-opacity hover:opacity-70"
                    style={{ color: '#9B8FB5', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {allTagsFromContacts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setTagFilter(null)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
                    style={{
                      background: tagFilter === null ? '#1A0A3B' : '#FAFAFB',
                      color:      tagFilter === null ? '#ffffff' : '#6B6480',
                      border:     tagFilter === null ? '1px solid #1A0A3B' : '1px solid #E8E3F5',
                    }}
                  >
                    Todos
                  </button>
                  {allTagsFromContacts.map(t => (
                    <button
                      key={t}
                      onClick={() => setTagFilter(t)}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: tagFilter === t ? '#6C3BFF' : '#FAFAFB',
                        color:      tagFilter === t ? '#ffffff' : '#6B6480',
                        border:     tagFilter === t ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Toolbar — selection count + sort + bulk actions */}
          {contacts.length > 0 && (
            <div className="px-5 py-2.5 flex items-center gap-3 flex-wrap"
              style={{
                borderTop: '1px solid #F0EDF9',
                background: selected.size > 0 ? 'rgba(108,59,255,0.04)' : '#FAFAFB',
              }}>
              <label
                className="flex items-center gap-2 text-[12px] cursor-pointer flex-shrink-0 font-medium"
                style={{ color: '#6B6480' }}
                title="Selecciona todos los contactos visibles (respeta filtros de búsqueda y tags)"
              >
                <input type="checkbox"
                  checked={visibleContacts.length > 0 && visibleContacts.every(c => selected.has(c.id))}
                  onChange={toggleAll} disabled={visibleContacts.length === 0}
                  style={{ accentColor: '#6C3BFF' }} />
                {selected.size > 0
                  ? <span style={{ color: '#6C3BFF' }}>{selected.size} seleccionados</span>
                  : `Seleccionar todos${visibleContacts.length > 0 ? ` (${visibleContacts.length})` : ''}`}
              </label>

              {selectedPending.length > 0 && (
                <>
                  {agents.length > 1 ? (
                    <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                      <SelectTrigger className="w-auto rounded-lg h-7 text-[11px]"
                        style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#6B6480' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.agent_name ?? a.business_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : agents.length === 1 ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}>
                      {agents[0].agent_name ?? agents[0].business_name}
                    </span>
                  ) : null}

                  <button type="button"
                    onClick={() => !showCallConfirm && setShowCallConfirm(true)}
                    disabled={calling}
                    className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                    {calling ? <Loader2 size={11} className="animate-spin" /> : <Phone size={11} />}
                    {calling ? 'Llamando…' : `Llamar (${selectedPending.length})`}
                  </button>
                </>
              )}

              {/* Bulk actions — aplican a CUALQUIER selección (pending o no) */}
              {selected.size > 0 && !showCallConfirm && (
                <>
                  <button type="button" onClick={handleBulkTag}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-70"
                    style={{ background: '#ffffff', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.3)' }}>
                    <Plus size={11} />
                    Aplicar tag
                  </button>
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                    style={{ background: '#ffffff', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                    {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    Eliminar
                  </button>
                </>
              )}

              {/* Sort — sólo cuando no hay selección */}
              {selected.size === 0 && contacts.length > 5 && (
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
                    Orden
                  </span>
                  <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
                    <SelectTrigger className="w-auto rounded-lg h-7 text-[11px]"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#6B6480' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Recientes</SelectItem>
                      <SelectItem value="alpha">Alfabético</SelectItem>
                      <SelectItem value="tags_desc">Más tags</SelectItem>
                      <SelectItem value="has_email">Con correo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {callResult && (
                <span className="text-[11px] flex items-center gap-1.5 font-medium"
                  style={{ color: callResult.failed > 0 ? '#f59e0b' : '#22c55e' }}>
                  <Check size={11} />
                  {callResult.triggered} iniciada{callResult.triggered !== 1 ? 's' : ''}
                  {callResult.failed > 0 && `, ${callResult.failed} fallida${callResult.failed !== 1 ? 's' : ''}`}
                </span>
              )}
            </div>
          )}

          {showCallConfirm && (
            <div className="mx-5 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl flex-wrap"
              style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
              <AlertTriangle size={14} style={{ color: '#9B6DFF', flexShrink: 0 }} />
              <p className="text-[13px] flex-1" style={{ color: '#1A0A3B' }}>
                ¿Iniciar <strong>{selectedPending.length} llamada{selectedPending.length !== 1 ? 's' : ''}</strong> reales ahora?
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleCall}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
                  style={{ background: '#6C3BFF', color: '#fff' }}>
                  <Phone size={12} /> Confirmar
                </button>
                <button type="button" onClick={() => setShowCallConfirm(false)}
                  className="px-3 py-2 rounded-lg text-[12px] transition-opacity hover:opacity-70"
                  style={{ color: '#6B6480' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Listado */}
          {contacts.length === 0 ? (
            <EmptyState
              icon={PhoneCall}
              title="No hay contactos aún"
              description="Agrega uno o sube un CSV"
            />
          ) : visibleContacts.length === 0 ? (
            <p className="text-[12px] text-center py-8" style={{ color: '#9B8FB5', borderTop: '1px solid #F0EDF9' }}>
              {contactSearch.trim() ? 'Sin resultados con esta búsqueda' :
               tagFilter                 ? `Sin contactos con tag "${tagFilter}"` :
                                          'Sin resultados'}
            </p>
          ) : (
            <div style={{ borderTop: '1px solid #F0EDF9' }}>
              <VirtualContactList
                contacts={visibleContacts}
                selected={selected}
                onToggle={toggle}
                onTagsChange={handleTagsChange}
                onEdit={openEditContact}
              />
            </div>
          )}

          {contactError && (
            <div className="mx-5 my-3 flex items-center gap-2 px-4 py-3 rounded-xl text-[13px]"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <X size={14} />{contactError}
            </div>
          )}
        </div>
        </div>
        )}

        {/* ── CAMPAÑAS ── */}
        {show !== 'contactos' && (
        <div id="campanas" className="order-1">

          {/* Campaign form modals (fuera del surface — flotan) */}
          {showCampForm && !editCampaign && (
            <CampaignForm
              token={token}
              initial={null}
              contacts={contacts}
              outboundAgents={agents}
              onSaved={handleCampaignSaved}
              onCancel={() => setShowCampForm(false)}
            />
          )}
          {editCampaign && (
            <CampaignForm
              token={token}
              initial={editCampaign}
              contacts={contacts}
              outboundAgents={agents}
              onSaved={handleCampaignSaved}
              onCancel={() => setEditCampaign(null)}
            />
          )}

        <div
          className="flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            border:     '1px solid #E8E3F5',
            boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
          }}
        >
          {/* Header — mismo layout que Contactos */}
          <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                  Campañas
                </h2>
                {campaigns.length > 0 && (
                  <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                    {campaigns.length}
                  </span>
                )}
              </div>
              <p className="text-[12px] mt-1 whitespace-nowrap" style={{ color: '#6B6480' }}>
                Programa llamadas automáticas recurrentes o únicas a tus contactos.
              </p>
            </div>
            {!showCampForm && !editCampaign && (
              <button type="button" onClick={() => setShowCampForm(true)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 flex-shrink-0"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                <Plus size={12} />
                Nueva campaña
              </button>
            )}
          </div>

          {campError && (
            <div className="mx-5 mb-3 flex items-center gap-2 px-4 py-3 rounded-xl text-[13px]"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <X size={14} />{campError}
            </div>
          )}

          {/* Campaign list */}
          {campaigns.length === 0 && !showCampForm ? (
            <div
              className="flex flex-col items-center justify-center py-16 gap-4"
              style={{ borderTop: '1px solid #F0EDF9' }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
                <CalendarClock size={22} style={{ color: '#6C3BFF', opacity: 0.6 }} />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium" style={{ color: '#1A0A3B' }}>No hay campañas</p>
                <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>Crea la primera para empezar a automatizar llamadas.</p>
              </div>
              <button type="button" onClick={() => setShowCampForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                <Plus size={14} />
                Nueva campaña
              </button>
            </div>
          ) : (
            <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
              {campaigns.map((c, idx) => (
                <div key={c.id} className="px-5 py-4 flex flex-col gap-3"
                  style={{ borderBottom: idx === campaigns.length - 1 ? 'none' : '1px solid #F0EDF9' }}>

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

                  {/* Empleado asignado + capability + schedule */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {(() => {
                      const a = agents.find(x => x.id === c.agent_id);
                      const empName = a ? (a.agent_name ?? a.business_name) : null;
                      const capLabel = c.capability && c.capability !== 'custom'
                        ? OUTBOUND_CAPABILITIES.find(cap => cap.id === c.capability)?.label
                        : null;
                      return (
                        <>
                          {empName && (
                            <span className="flex items-center gap-1" style={{ color: '#6C3BFF' }}>
                              <span style={{ color: '#9B8FB5' }}>Ejecuta:</span>
                              <strong>{empName}</strong>
                            </span>
                          )}
                          {capLabel && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}>
                              {capLabel}
                            </span>
                          )}
                        </>
                      );
                    })()}
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
                  <div style={{ borderTop: '1px solid #F0EDF9', paddingTop: 10, marginTop: 2 }}>
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
        )}

      </div>
    </div>
  );
}
