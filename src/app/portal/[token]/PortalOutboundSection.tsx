'use client';

import { useState, useMemo, type ReactNode } from 'react';
import {
  Phone, MessageCircle, X, RefreshCw, RotateCcw,
  CheckCircle2, PhoneMissed, Loader, Filter, Plus,
  ChevronDown, Check, Loader2, Upload, List, Users, Bot,
} from 'lucide-react';
import PortalContactsSection from './PortalContactsSection';
import type { ContactVoiceLead, ContactWALead, ContactOutbound } from './PortalContactsSection';
import { OUTBOUND_ROLES_MAP } from './OutboundRoleSelector';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OutboundAgent {
  token: string;
  name:  string;
  role?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Programada',  color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  calling:   { label: 'Llamando',    color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  answered:  { label: 'Contestó',    color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  no_answer: { label: 'No contestó', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  completed: { label: 'Completada',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  failed:    { label: 'Fallida',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
};

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  confirmed:   { label: 'Confirmada',   color: '#22c55e' },
  cancelled:   { label: 'Cancelada',    color: '#ef4444' },
  rescheduled: { label: 'Reagendada',   color: '#3b82f6' },
  no_answer:   { label: 'No contestó',  color: '#f59e0b' },
  voicemail:   { label: 'Buzón de voz', color: '#9ca3af' },
  other:       { label: 'Otro',         color: '#9ca3af' },
};

const QUICK_FILTERS = [
  { label: 'Todos',          value: 'all'       },
  { label: 'Pendientes',     value: 'pending'   },
  { label: 'No contestaron', value: 'no_answer' },
  { label: 'Completadas',    value: 'completed' },
  { label: 'Fallidas',       value: 'failed'    },
] as const;

type QuickFilter = typeof QUICK_FILTERS[number]['value'];
type FormTab    = 'una' | 'lista';
type OutboundTab = 'llamadas' | 'contactos';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OutboundCall {
  id: string;
  telefono: string;
  nombre?: string | null;
  motivo?: string | null;
  status: string;
  outcome?: string | null;
  attempt: number;
  wa_fallback_sent: boolean;
  next_retry_at?: string | null;
  scheduled_at: string;
  called_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  if (status === 'calling')   return <Loader size={12} className="animate-spin" />;
  if (status === 'completed') return <CheckCircle2 size={12} />;
  if (status === 'no_answer') return <PhoneMissed size={12} />;
  if (status === 'failed')    return <PhoneMissed size={12} />;
  return <Phone size={12} />;
}

function StatKpi({ label, value, color, icon }: { label: string; value: number; color: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}66)` }} />
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="p-1.5 rounded-lg flex-shrink-0"
            style={{ background: `${color}15`, border: `1px solid ${color}30` }}>{icon}</div>
          <div className="text-xl font-bold tabular-nums leading-none" style={{ color }}>{value}</div>
        </div>
        <div className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>{label}</div>
      </div>
    </div>
  );
}

// ── Schedule form ─────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role?: string }) {
  if (!role) return null;
  const r = OUTBOUND_ROLES_MAP[role as keyof typeof OUTBOUND_ROLES_MAP];
  if (!r) return null;
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none flex-shrink-0"
      style={{ background: `${r.color}20`, color: r.color }}>
      {r.label}
    </span>
  );
}

function ScheduleForm({ token, agents, onCreated }: {
  token: string;
  agents: OutboundAgent[];
  onCreated: (call: OutboundCall) => void;
}) {
  const [open, setOpen]         = useState(false);
  const [formTab, setFormTab]   = useState<FormTab>('una');

  // Agent selection — default to the current portal's token
  const [agentToken, setAgentToken] = useState(token);

  // Role filter for the agent selector
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const availableRoles = useMemo(() => {
    const seen = new Set<string>();
    agents.forEach(a => { if (a.role) seen.add(a.role); });
    return Array.from(seen);
  }, [agents]);

  const visibleAgents = useMemo(() =>
    roleFilter === 'all' ? agents : agents.filter(a => a.role === roleFilter),
  [agents, roleFilter]);

  // Single call state
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre]     = useState('');
  const [motivo, setMotivo]     = useState('');
  const [fecha, setFecha]       = useState('');
  const [hora, setHora]         = useState('');

  // Bulk state
  const [file, setFile]               = useState<File | null>(null);
  const [motivoBulk, setMotivoBulk]   = useState('');
  const [fechaBulk, setFechaBulk]     = useState('');
  const [horaBulk, setHoraBulk]       = useState('');
  const [bulkCount, setBulkCount]     = useState<number | null>(null);

  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState<string>('');

  const resetAll = () => {
    setTelefono(''); setNombre(''); setMotivo(''); setFecha(''); setHora('');
    setFile(null); setMotivoBulk(''); setFechaBulk(''); setHoraBulk(''); setBulkCount(null);
    setError(''); setSuccess('');
  };

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setBulkCount(null);
    if (!f) return;
    f.text().then(text => {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      setBulkCount(Math.max(0, lines.length - 1));
    });
  };

  const submitSingle = async () => {
    setError('');
    if (!telefono.trim()) { setError('El teléfono es obligatorio.'); return; }
    if (!motivo.trim())   { setError('Indica el tema de la llamada.'); return; }
    if (!fecha || !hora)  { setError('Elige fecha y hora.'); return; }

    const scheduled_at = new Date(`${fecha}T${hora}:00`).toISOString();
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${agentToken}/outbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono: telefono.trim(), nombre: nombre.trim() || undefined, motivo: motivo.trim(), scheduled_at }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Error al programar la llamada.'); return; }

      onCreated({
        id: json.contact?.id ?? crypto.randomUUID(),
        telefono: telefono.trim(), nombre: nombre.trim() || null, motivo: motivo.trim(),
        status: 'pending', outcome: null, attempt: 1, wa_fallback_sent: false,
        next_retry_at: null, scheduled_at, called_at: null, completed_at: null,
        created_at: new Date().toISOString(),
      });
      setSuccess('¡Llamada programada!');
      resetAll();
      setTimeout(() => { setSuccess(''); setOpen(false); }, 1500);
    } finally { setSaving(false); }
  };

  const submitBulk = async () => {
    setError('');
    if (!file)               { setError('Selecciona un archivo CSV.'); return; }
    if (!motivoBulk.trim())  { setError('Indica el tema de las llamadas.'); return; }
    if (!fechaBulk || !horaBulk) { setError('Elige fecha y hora.'); return; }

    const scheduled_at = new Date(`${fechaBulk}T${horaBulk}:00`).toISOString();
    const form = new FormData();
    form.append('file', file);
    form.append('motivo', motivoBulk.trim());
    form.append('scheduled_at', scheduled_at);

    setSaving(true);
    try {
      const res  = await fetch(`/api/portal/${agentToken}/outbound/bulk`, { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Error al subir la lista.'); return; }
      setSuccess(`${json.imported} contactos programados`);
      resetAll();
      setTimeout(() => { setSuccess(''); setOpen(false); }, 2000);
    } finally { setSaving(false); }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(108,59,255,0.25)', background: 'rgba(108,59,255,0.04)' }}>

      {/* Toggle header */}
      <button
        onClick={() => { setOpen(o => !o); setError(''); }}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-[rgba(108,59,255,0.06)]"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(108,59,255,0.15)', border: '1px solid rgba(108,59,255,0.3)' }}>
            <Plus size={13} style={{ color: '#9B6DFF' }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: '#9B6DFF' }}>Programar llamadas</span>
        </div>
        <ChevronDown size={15} style={{ color: '#6C3BFF', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(108,59,255,0.15)' }}>
          {/* Sub-tabs: Una llamada / Lista CSV */}
          <div className="flex gap-1 p-1 rounded-lg mt-3 mb-4 self-start"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', display: 'inline-flex' }}>
            {([
              { id: 'una' as FormTab,   icon: <Phone size={12} />,   label: 'Una llamada' },
              { id: 'lista' as FormTab, icon: <Upload size={12} />,  label: 'Lista (CSV)' },
            ]).map(({ id, icon, label }) => (
              <button key={id} onClick={() => { setFormTab(id); setError(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: formTab === id ? '#6C3BFF' : 'transparent',
                  color:      formTab === id ? '#fff'    : 'var(--c-text-3)',
                }}>
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Agent selector — only when there are multiple agents */}
          {agents.length > 1 && (
            <div className="mb-4">
              {/* Role filter chips */}
              {availableRoles.length > 1 && (
                <div className="flex flex-wrap items-center gap-1 mb-2">
                  <button
                    onClick={() => setRoleFilter('all')}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: roleFilter === 'all' ? 'rgba(108,59,255,0.15)' : 'transparent',
                      border: `1px solid ${roleFilter === 'all' ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
                      color: roleFilter === 'all' ? '#9B6DFF' : 'var(--c-text-3)',
                    }}>
                    Todos
                  </button>
                  {availableRoles.map(rid => {
                    const r = OUTBOUND_ROLES_MAP[rid as keyof typeof OUTBOUND_ROLES_MAP];
                    if (!r) return null;
                    const active = roleFilter === rid;
                    return (
                      <button key={rid} onClick={() => setRoleFilter(rid)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                        style={{
                          background: active ? `${r.color}18` : 'transparent',
                          border: `1px solid ${active ? `${r.color}40` : 'var(--c-border)'}`,
                          color: active ? r.color : 'var(--c-text-3)',
                        }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="text-xs font-medium mb-2" style={{ color: 'var(--c-text-2)' }}>
                Agente que llamará
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visibleAgents.map(a => (
                  <button key={a.token} onClick={() => setAgentToken(a.token)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: agentToken === a.token ? 'rgba(108,59,255,0.15)' : 'var(--c-surface-2)',
                      border:     `1px solid ${agentToken === a.token ? 'rgba(108,59,255,0.5)' : 'var(--c-border)'}`,
                      color:      agentToken === a.token ? '#9B6DFF' : 'var(--c-text-3)',
                    }}>
                    <Bot size={11} aria-hidden="true" />
                    {a.name}
                    <RoleBadge role={a.role} />
                  </button>
                ))}
                {visibleAgents.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                    Sin agentes con ese rol.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Single call form */}
          {formTab === 'una' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Teléfono" required>
                  <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)}
                    placeholder="+52 81 1234 5678" inputMode="tel"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                </Field>
                <Field label="Nombre del contacto">
                  <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                    placeholder="Ej: Juan García"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                </Field>
              </div>
              <Field label="¿De qué hablará el agente?" required hint="El agente usa este contexto para guiar la conversación.">
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                  placeholder="Ej: Recordatorio de cita del viernes 11 de julio a las 10am para revisión de A/C"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF] resize-none"
                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha" required>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} min={todayStr}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                </Field>
                <Field label="Hora" required>
                  <input type="time" value={hora} onChange={e => setHora(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                </Field>
              </div>
              {error   && <ErrorBanner>{error}</ErrorBanner>}
              <SubmitBtn saving={saving} success={!!success} successLabel={success} onClick={submitSingle}>
                <Phone size={14} /> Programar llamada
              </SubmitBtn>
            </div>
          )}

          {/* Bulk CSV form */}
          {formTab === 'lista' && (
            <div className="flex flex-col gap-3">
              <Field label="Archivo CSV" required hint='Columnas requeridas: "telefono". Opcionales: "nombre".'>
                <label className="flex flex-col items-center justify-center gap-2 w-full rounded-lg py-6 cursor-pointer transition-colors hover:bg-[rgba(108,59,255,0.04)]"
                  style={{ border: '2px dashed rgba(108,59,255,0.3)', background: file ? 'rgba(108,59,255,0.06)' : 'var(--c-input-bg)' }}>
                  <Upload size={20} style={{ color: file ? '#9B6DFF' : 'var(--c-text-3)' }} />
                  <span className="text-xs" style={{ color: file ? '#9B6DFF' : 'var(--c-text-3)' }}>
                    {file
                      ? `${file.name}${bulkCount !== null ? ` · ${bulkCount} contactos` : ''}`
                      : 'Haz clic para seleccionar CSV'}
                  </span>
                  <input type="file" accept=".csv,text/csv" className="sr-only"
                    onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
                </label>
              </Field>
              <Field label="¿De qué hablará el agente?" required hint="Se aplica el mismo contexto a todos los contactos de la lista.">
                <textarea value={motivoBulk} onChange={e => setMotivoBulk(e.target.value)} rows={3}
                  placeholder="Ej: Recordatorio de renovación de contrato — vence el 31 de julio"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF] resize-none"
                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha de inicio" required>
                  <input type="date" value={fechaBulk} onChange={e => setFechaBulk(e.target.value)} min={todayStr}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                </Field>
                <Field label="Hora" required>
                  <input type="time" value={horaBulk} onChange={e => setHoraBulk(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                </Field>
              </div>
              {bulkCount !== null && bulkCount > 0 && (
                <p className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                  Se programarán {bulkCount} llamadas salientes.
                </p>
              )}
              {error && <ErrorBanner>{error}</ErrorBanner>}
              <SubmitBtn saving={saving} success={!!success} successLabel={success} onClick={submitBulk}>
                <List size={14} /> Programar {bulkCount ?? ''} llamadas
              </SubmitBtn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>{hint}</p>}
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs px-3 py-2 rounded-lg"
      style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
      {children}
    </p>
  );
}

function SubmitBtn({ saving, success, successLabel, onClick, children }: {
  saving: boolean; success: boolean; successLabel: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={saving || success}
      className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
      style={{ background: success ? '#22c55e' : '#6C3BFF', color: '#fff', opacity: saving ? 0.7 : 1 }}>
      {saving  ? <><Loader2 size={14} className="animate-spin" /> Procesando…</> : null}
      {success ? <><Check size={14} /> {successLabel}</> : null}
      {!saving && !success ? children : null}
    </button>
  );
}

// ── Call card ─────────────────────────────────────────────────────────────────

function OutboundCard({ call }: { call: OutboundCall }) {
  const [open, setOpen] = useState(false);
  const sc = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.pending;
  const oc = call.outcome ? OUTCOME_CONFIG[call.outcome] : null;

  const scheduledDate = new Date(call.scheduled_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const scheduledFull = new Date(call.scheduled_at).toLocaleString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const retryDate = call.next_retry_at
    ? new Date(call.next_retry_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <>
      <div className="rounded-xl flex cursor-pointer transition-opacity hover:opacity-80"
        style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        onClick={() => setOpen(true)} role="button" aria-label={`Ver detalle: ${call.nombre ?? call.telefono}`}>
        <div style={{ width: 3, background: sc.color, flexShrink: 0, opacity: 0.65, borderRadius: '10px 0 0 10px' }} />
        <div className="flex-1 min-w-0 px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <div className="min-w-0">
                <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{call.nombre ?? call.telefono}</span>
                {call.nombre && <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--c-text-3)' }}>{call.telefono}</p>}
              </div>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{ background: sc.bg, color: sc.color }}>
                <StatusIcon status={call.status} />{sc.label}
              </span>
              {oc && <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: `${oc.color}18`, color: oc.color }}>{oc.label}</span>}
              {call.attempt > 1 && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(107,114,128,0.1)', color: '#6b7280' }}>
                  <RotateCcw size={10} />Intento {call.attempt}
                </span>
              )}
              {call.wa_fallback_sent && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                  <MessageCircle size={10} />WA enviado
                </span>
              )}
            </div>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--c-text-3)' }}>{scheduledDate}</span>
          </div>
          {call.motivo && (
            <p className="text-xs mt-1.5 leading-relaxed line-clamp-1" style={{ color: 'var(--c-text-2)' }}>{call.motivo}</p>
          )}
          {retryDate && call.status === 'no_answer' && (
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#f59e0b' }}>
              <RefreshCw size={10} />Reintento: {retryDate}
            </p>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{call.nombre ?? call.telefono}</span>
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: sc.bg, color: sc.color }}><StatusIcon status={call.status} />{sc.label}</span>
                  {oc && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${oc.color}18`, color: oc.color }}>{oc.label}</span>}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                  {call.nombre ? `${call.telefono} · ` : ''}{scheduledFull}
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Cerrar"
                className="p-1.5 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors flex-shrink-0 ml-3"
                style={{ color: 'var(--c-text-2)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {call.motivo && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>Tema de la llamada</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>{call.motivo}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>Intentos</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--c-text)' }}>{call.attempt}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>Fallback WA</p>
                  <p className="text-sm font-bold" style={{ color: call.wa_fallback_sent ? '#16a34a' : 'var(--c-text-3)' }}>
                    {call.wa_fallback_sent ? 'Enviado' : 'No enviado'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-3)' }}>Timeline</p>
                <div className="flex flex-col gap-2">
                  <TRow label="Programada" value={scheduledFull} />
                  {call.called_at && <TRow label="Marcó" value={new Date(call.called_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />}
                  {call.completed_at && <TRow label="Completada" value={new Date(call.completed_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} color="#22c55e" />}
                  {retryDate && call.status === 'no_answer' && <TRow label="Próximo intento" value={retryDate} color="#f59e0b" />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color ?? 'var(--c-text-3)' }} />
      <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
        <span className="font-medium" style={{ color: color ?? 'var(--c-text-2)' }}>{label}:</span> {value}
      </p>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PortalOutboundSection({
  calls: initialCalls,
  token,
  voiceLeads,
  waLeads,
  outboundContacts,
  agents = [],
}: {
  calls: OutboundCall[];
  token: string;
  voiceLeads: ContactVoiceLead[];
  waLeads: ContactWALead[];
  outboundContacts: ContactOutbound[];
  agents?: OutboundAgent[];
}) {
  const [outboundTab, setOutboundTab] = useState<OutboundTab>('llamadas');
  const [calls, setCalls]   = useState<OutboundCall[]>(initialCalls);
  const [filter, setFilter] = useState<QuickFilter>('all');

  const stats = useMemo(() => ({
    pending:   calls.filter(c => c.status === 'pending' || c.status === 'calling').length,
    no_answer: calls.filter(c => c.status === 'no_answer').length,
    completed: calls.filter(c => c.status === 'completed').length,
    failed:    calls.filter(c => c.status === 'failed').length,
  }), [calls]);

  const filtered = useMemo(() => {
    if (filter === 'all')       return calls;
    if (filter === 'pending')   return calls.filter(c => c.status === 'pending' || c.status === 'calling');
    if (filter === 'no_answer') return calls.filter(c => c.status === 'no_answer');
    if (filter === 'completed') return calls.filter(c => c.status === 'completed');
    if (filter === 'failed')    return calls.filter(c => c.status === 'failed');
    return calls;
  }, [calls, filter]);

  const OUTBOUND_TABS: { id: OutboundTab; label: string; icon: ReactNode }[] = [
    { id: 'llamadas',  label: 'Llamadas',  icon: <Phone   size={12} /> },
    { id: 'contactos', label: 'Contactos', icon: <Users   size={12} /> },
  ];

  return (
    <div className="flex flex-col gap-5">

      {/* Sub-tab pills */}
      <div className="flex gap-1 p-1 rounded-xl self-start"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        {OUTBOUND_TABS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setOutboundTab(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: outboundTab === id ? '#6C3BFF' : 'transparent', color: outboundTab === id ? '#fff' : 'var(--c-text-3)' }}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Contactos sub-tab ── */}
      {outboundTab === 'contactos' && (
        <PortalContactsSection
          voiceLeads={voiceLeads}
          waLeads={waLeads}
          outbound={outboundContacts}
          token={token}
          agents={agents}
        />
      )}

      {/* ── Llamadas sub-tab ── */}
      {outboundTab === 'llamadas' && <>

      {/* Stats bar */}
      {calls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatKpi label="Pendientes"     value={stats.pending}   color="#6b7280" icon={<Phone       size={14} style={{ color: '#6b7280' }} />} />
          <StatKpi label="No contestaron" value={stats.no_answer} color="#f59e0b" icon={<PhoneMissed size={14} style={{ color: '#f59e0b' }} />} />
          <StatKpi label="Completadas"    value={stats.completed} color="#22c55e" icon={<CheckCircle2 size={14} style={{ color: '#22c55e' }} />} />
          <StatKpi label="Fallidas"       value={stats.failed}    color="#ef4444" icon={<PhoneMissed size={14} style={{ color: '#ef4444' }} />} />
        </div>
      )}

      {/* Schedule form */}
      <ScheduleForm token={token} agents={agents} onCreated={c => setCalls(prev => [c, ...prev])} />

      {/* Calls list card */}
      <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
            <Phone size={13} aria-hidden="true" /> Registro de llamadas
          </h2>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {filtered.length} de {calls.length}
          </p>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <Filter size={12} style={{ color: 'var(--c-text-3)' }} aria-hidden="true" />
          {QUICK_FILTERS.map(({ label, value }) => (
            <button key={value} onClick={() => setFilter(value)}
              className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={{ background: filter === value ? '#6C3BFF' : 'transparent', color: filter === value ? '#fff' : 'var(--c-text-3)', border: filter === value ? 'none' : '1px solid var(--c-border)' }}>
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
              <Phone size={20} style={{ color: '#6C3BFF', opacity: 0.5 }} aria-hidden="true" />
            </div>
            <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
              {filter === 'all' ? 'Sin llamadas salientes todavía' : 'Sin llamadas en este filtro'}
            </p>
            {filter === 'all' && (
              <p className="text-xs text-center px-8" style={{ color: 'var(--c-text-3)' }}>
                Usa el formulario de arriba para programar llamadas.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(call => <OutboundCard key={call.id} call={call} />)}
          </div>
        )}
      </div>

      </>}
    </div>
  );
}
