'use client';

import { useState, useMemo } from 'react';
import {
  Search, Phone, PhoneOutgoing, User, Filter, X,
  Check, Loader2, PhoneCall, CheckSquare, Square, Bot,
} from 'lucide-react';
import type { OutboundAgent } from './PortalOutboundSection';
import { OUTBOUND_ROLES_MAP } from './OutboundRoleSelector';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContactVoiceLead {
  id: string;
  nombre?: string | null;
  whatsapp?: string | null;
  telefono?: string | null;
  email?: string | null;
  servicio?: string | null;
  presupuesto?: string | null;
  created_at: string;
}

export interface ContactWALead {
  id: string;
  nombre?: string | null;
  customer_number: string;
  whatsapp?: string | null;
  email?: string | null;
  negocio?: string | null;
  giro?: string | null;
  servicio?: string | null;
  presupuesto?: string | null;
  timeline?: string | null;
  notas?: string | null;
  created_at: string;
}

export interface ContactOutbound {
  id: string;
  nombre?: string | null;
  telefono: string;
  motivo?: string | null;
  status: string;
  created_at: string;
}

type Source = 'voice' | 'outbound';

interface UnifiedContact {
  id: string;
  nombre: string | null;
  telefono: string;
  email: string | null;
  source: Source;
  extra: string | null;
  created_at: string;
}

// ── Source config ─────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<Source, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  voice:    { label: 'Llamada',  color: '#6C3BFF', bg: 'rgba(108,59,255,0.1)', Icon: Phone         },
  outbound: { label: 'Saliente', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', Icon: PhoneOutgoing },
};

const SOURCE_FILTERS: { label: string; value: Source | 'all' }[] = [
  { label: 'Todos',     value: 'all'      },
  { label: 'Llamadas',  value: 'voice'    },
  { label: 'Salientes', value: 'outbound' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(p: string): string {
  return (p ?? '').replace(/\D/g, '');
}

function buildUnified(
  voiceLeads: ContactVoiceLead[],
  outbound: ContactOutbound[],
): UnifiedContact[] {
  const seen = new Map<string, UnifiedContact>();

  const add = (c: UnifiedContact) => {
    const key = normalizePhone(c.telefono);
    if (!key) return;
    if (!seen.has(key)) seen.set(key, c);
  };

  for (const l of voiceLeads) {
    const tel = l.whatsapp ?? l.telefono ?? '';
    add({ id: `voice-${l.id}`, nombre: l.nombre ?? null, telefono: tel, email: l.email ?? null, source: 'voice', extra: l.servicio ?? null, created_at: l.created_at });
  }
  for (const o of outbound) {
    add({ id: `ob-${o.id}`, nombre: o.nombre ?? null, telefono: o.telefono, email: null, source: 'outbound', extra: o.motivo ?? null, created_at: o.created_at });
  }

  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

// ── Contact card ──────────────────────────────────────────────────────────────

function ContactCard({
  contact, selected, onToggle,
}: {
  contact: UnifiedContact;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const sc = SOURCE_CONFIG[contact.source];
  const { Icon } = sc;
  const date = new Date(contact.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div
      className="rounded-xl flex cursor-pointer transition-all"
      style={{
        background: selected ? `${sc.color}08` : 'var(--c-surface-2)',
        border: `1px solid ${selected ? sc.color + '40' : 'var(--c-border)'}`,
      }}
      onClick={() => onToggle(contact.id)}
      role="checkbox"
      aria-checked={selected}
    >
      {/* Selection indicator */}
      <div className="flex items-center justify-center px-3 flex-shrink-0" style={{ color: selected ? sc.color : 'var(--c-text-3)' }}>
        {selected
          ? <CheckSquare size={16} />
          : <Square size={16} />}
      </div>

      <div style={{ width: 3, background: sc.color, flexShrink: 0, opacity: selected ? 1 : 0.45, borderRadius: '0' }} />

      <div className="flex-1 min-w-0 px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
              style={{ background: `${sc.color}18`, color: sc.color }}>
              {contact.nombre
                ? contact.nombre.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                : <User size={14} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                  {contact.nombre ?? 'Sin nombre'}
                </span>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                  style={{ background: sc.bg, color: sc.color }}>
                  <Icon size={10} aria-hidden="true" />{sc.label}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{contact.telefono}</span>
                {contact.email && <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{contact.email}</span>}
              </div>
            </div>
          </div>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--c-text-3)' }}>{date}</span>
        </div>
        {contact.extra && (
          <p className="text-xs mt-1.5 line-clamp-1" style={{ color: 'var(--c-text-2)' }}>{contact.extra}</p>
        )}
      </div>
    </div>
  );
}

// ── Schedule modal ────────────────────────────────────────────────────────────

function ScheduleModal({
  contacts, token, agents, onClose, onScheduled,
}: {
  contacts: UnifiedContact[];
  token: string;
  agents: OutboundAgent[];
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [motivo, setMotivo]           = useState('');
  const [fecha, setFecha]             = useState('');
  const [hora, setHora]               = useState('');
  const [agentToken, setAgentToken]   = useState(token);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [done, setDone]               = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  const submit = async () => {
    setError('');
    if (!motivo.trim())   { setError('Indica el tema de la llamada.'); return; }
    if (!fecha || !hora)  { setError('Elige fecha y hora.'); return; }

    const scheduled_at = new Date(`${fecha}T${hora}:00`).toISOString();
    setSaving(true);
    try {
      const results = await Promise.allSettled(
        contacts.map(c =>
          fetch(`/api/portal/${agentToken}/outbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              telefono: c.telefono,
              nombre:   c.nombre ?? undefined,
              motivo:   motivo.trim(),
              scheduled_at,
            }),
          })
        )
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        setError(`${failed} llamada${failed > 1 ? 's' : ''} no se pudieron programar.`);
      } else {
        setDone(true);
        setTimeout(() => { onScheduled(); onClose(); }, 1500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>Programar llamadas</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              {contacts.length} contacto{contacts.length !== 1 ? 's' : ''} seleccionado{contacts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors flex-shrink-0"
            style={{ color: 'var(--c-text-2)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Selected contacts preview */}
        <div className="px-5 pt-4 pb-0 max-h-28 overflow-y-auto flex flex-wrap gap-1.5">
          {contacts.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
              {c.nombre ?? c.telefono}
            </span>
          ))}
        </div>

        {/* Form */}
        <div className="px-5 py-4 flex flex-col gap-3">

          {/* Agent selector */}
          {agents.length > 1 && (
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--c-text-2)' }}>
                Empleado que llamará
              </label>
              <div className="flex flex-wrap gap-1.5">
                {agents.map(a => {
                  const roleInfo = a.role ? OUTBOUND_ROLES_MAP[a.role as keyof typeof OUTBOUND_ROLES_MAP] : null;
                  return (
                    <button key={a.token} onClick={() => setAgentToken(a.token)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: agentToken === a.token ? 'rgba(108,59,255,0.15)' : 'var(--c-surface-2)',
                        border:     `1px solid ${agentToken === a.token ? 'rgba(108,59,255,0.5)' : 'var(--c-border)'}`,
                        color:      agentToken === a.token ? '#9B6DFF' : 'var(--c-text-3)',
                      }}>
                      <Bot size={11} aria-hidden="true" />
                      {a.name}
                      {roleInfo && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none"
                          style={{ background: `${roleInfo.color}20`, color: roleInfo.color }}>
                          {roleInfo.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>
              ¿De qué hablará el empleado? <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
              placeholder="Ej: Recordatorio de cita del viernes 11 de julio a las 10am"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF] resize-none"
              style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
              Se aplica el mismo contexto a todos los contactos seleccionados.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>
                Fecha <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} min={todayStr}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>
                Hora <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="time" value={hora} onChange={e => setHora(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
            </div>
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </p>
          )}

          <button onClick={submit} disabled={saving || done}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: done ? '#22c55e' : '#6C3BFF', color: '#fff', opacity: saving ? 0.7 : 1 }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Programando…</>
              : done ? <><Check size={14} /> {contacts.length} llamada{contacts.length !== 1 ? 's' : ''} programada{contacts.length !== 1 ? 's' : ''}</>
              : <><PhoneCall size={14} /> Programar {contacts.length} llamada{contacts.length !== 1 ? 's' : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PortalContactsSection({
  voiceLeads,
  outbound,
  token,
  agents = [],
}: {
  voiceLeads: ContactVoiceLead[];
  outbound: ContactOutbound[];
  token: string;
  agents?: OutboundAgent[];
}) {
  const [search, setSearch]             = useState('');
  const [sourceFilter, setSourceFilter] = useState<Source | 'all'>('all');
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen]       = useState(false);

  const contacts = useMemo(
    () => buildUnified(voiceLeads, outbound),
    [voiceLeads, outbound],
  );

  const filtered = useMemo(() => {
    let result = contacts;
    if (sourceFilter !== 'all') result = result.filter(c => c.source === sourceFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(c =>
        (c.nombre ?? '').toLowerCase().includes(q) ||
        c.telefono.includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.extra ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [contacts, search, sourceFilter]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.delete(c.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.add(c.id));
        return next;
      });
    }
  };

  const selectedContacts = contacts.filter(c => selected.has(c.id));

  const voiceCount    = contacts.filter(c => c.source === 'voice').length;
  const outboundCount = contacts.filter(c => c.source === 'outbound').length;

  return (
    <div className="flex flex-col gap-5">

      {/* KPI strip */}
      {contacts.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Llamadas',  value: voiceCount,    color: '#6C3BFF', Icon: Phone         },
            { label: 'Salientes', value: outboundCount, color: '#f59e0b', Icon: PhoneOutgoing },
          ].map(({ label, value, color, Icon: Ic }) => (
            <div key={label} className="rounded-xl overflow-hidden"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}66)` }} />
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="p-1.5 rounded-lg flex-shrink-0"
                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                    <Ic size={14} style={{ color }} aria-hidden="true" />
                  </div>
                  <div className="text-xl font-bold tabular-nums leading-none" style={{ color }}>{value}</div>
                </div>
                <div className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List card */}
      <div className="rounded-xl p-5"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5"
            style={{ color: 'var(--c-text-3)' }}>
            <User size={13} aria-hidden="true" /> Lista de contactos
          </h2>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {filtered.length}{search || sourceFilter !== 'all' ? ` de ${contacts.length}` : ''}
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--c-text-3)' }} aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar por nombre, teléfono o email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
            aria-label="Buscar contactos"
          />
        </div>

        {/* Filter chips + select all */}
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={12} style={{ color: 'var(--c-text-3)' }} aria-hidden="true" />
            {SOURCE_FILTERS.map(({ label, value }) => (
              <button key={value} onClick={() => setSourceFilter(value)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: sourceFilter === value ? '#6C3BFF' : 'transparent',
                  color:      sourceFilter === value ? '#fff'    : 'var(--c-text-3)',
                  border:     sourceFilter === value ? 'none'    : '1px solid var(--c-border)',
                }}>
                {label}
              </button>
            ))}
            {(search || sourceFilter !== 'all') && (
              <button onClick={() => { setSearch(''); setSourceFilter('all'); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors hover:opacity-70"
                style={{ color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
                <X size={10} /> Limpiar
              </button>
            )}
          </div>

          {/* Select all toggle */}
          {filtered.length > 0 && (
            <button onClick={toggleAll}
              className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
              style={{ color: allVisibleSelected ? '#6C3BFF' : 'var(--c-text-3)' }}>
              {allVisibleSelected
                ? <><CheckSquare size={13} /> Deseleccionar todo</>
                : <><Square size={13} /> Seleccionar todo</>}
            </button>
          )}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
              <User size={20} style={{ color: '#6C3BFF', opacity: 0.5 }} aria-hidden="true" />
            </div>
            <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
              {contacts.length === 0 ? 'Sin contactos todavía' : 'Sin resultados para los filtros aplicados'}
            </p>
            {contacts.length === 0 && (
              <p className="text-xs text-center px-8" style={{ color: 'var(--c-text-3)' }}>
                Los leads de llamadas y contactos de salientes aparecerán aquí automáticamente.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(c => (
              <ContactCard key={c.id} contact={c} selected={selected.has(c.id)} onToggle={toggleSelect} />
            ))}
          </div>
        )}
      </div>

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto w-full max-w-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-2xl"
            style={{ background: '#6C3BFF', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                {selected.size}
              </div>
              <span className="text-sm font-medium text-white">
                {selected.size === 1 ? '1 contacto' : `${selected.size} contactos`} seleccionado{selected.size !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(new Set())}
                className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.15)]"
                style={{ color: 'rgba(255,255,255,0.7)' }} aria-label="Limpiar selección">
                <X size={15} />
              </button>
              <button onClick={() => setModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-90"
                style={{ background: '#fff', color: '#6C3BFF' }}>
                <PhoneCall size={13} /> Marcar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule modal */}
      {modalOpen && (
        <ScheduleModal
          contacts={selectedContacts}
          token={token}
          agents={agents}
          onClose={() => setModalOpen(false)}
          onScheduled={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
