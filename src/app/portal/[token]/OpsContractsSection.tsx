'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, ChevronDown, ChevronUp, Trash2, FileText, AlertTriangle,
  Clock, Search, Send, Check, Edit2, X, GripVertical, ToggleLeft,
  ToggleRight, RefreshCw, Mail,
} from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contract {
  id: string; agent_id: string; name: string; contract_type: string;
  counterparty: string | null; expiry_date: string; alert_days_before: number[];
  notes: string | null; status: string; renewal_draft: string | null;
  last_alerted_at: string | null; created_at: string;
}

interface Clause {
  id: string; title: string; body: string; required: boolean; enabled: boolean;
}

interface Draft {
  id: string; agent_id: string; client_name: string | null;
  client_email: string | null; client_rfc: string | null; client_phone: string | null;
  clauses: Clause[]; notes: string | null; status: string;
  source_type: string | null; sent_at: string | null; created_at: string;
}

type Tab = 'seguimiento' | 'plantilla' | 'borradores';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  contrato: 'Contrato', pago: 'Pago', permiso: 'Permiso',
  renovacion: 'Renovación', otro: 'Documento',
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  activo:    { label: 'Activo',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  vencido:   { label: 'Vencido',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  renovado:  { label: 'Renovado', color: '#9B6DFF', bg: 'rgba(155,109,255,0.1)' },
  cancelado: { label: 'Cancelado',color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

const DRAFT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  borrador: { label: 'Borrador',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  aprobado: { label: 'Aprobado',  color: '#6C3BFF', bg: 'rgba(108,59,255,0.1)'  },
  enviado:  { label: 'Enviado',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  cancelado:{ label: 'Cancelado', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

const VARIABLES_HINT = [
  '{nombre_cliente}', '{rfc_cliente}', '{descripcion_servicios}',
  '{vigencia}', '{monto}', '{forma_de_pago}', '{ciudad}', '{fecha}',
  '{nombre_prestador}',
];

function daysUntil(dateStr: string): number {
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr + 'T12:00:00');
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
}

function urgencyColor(days: number): string {
  if (days < 0)   return '#6b7280';
  if (days <= 1)  return '#ef4444';
  if (days <= 7)  return '#f59e0b';
  if (days <= 30) return '#6C3BFF';
  return '#22c55e';
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OpsContractsSection({ token }: { token: string }) {
  const [tab, setTab] = useState<Tab>('seguimiento');

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
        {([
          { key: 'seguimiento', label: 'Seguimiento' },
          { key: 'plantilla',   label: 'Plantilla'   },
          { key: 'borradores',  label: 'Borradores'  },
        ] as { key: Tab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: tab === t.key ? '#6C3BFF' : 'transparent', color: tab === t.key ? '#fff' : 'var(--c-text-3)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'seguimiento' && <SeguimientoTab token={token} />}
      {tab === 'plantilla'   && <PlantillaTab   token={token} />}
      {tab === 'borradores'  && <BorradoresTab  token={token} />}
    </div>
  );
}

// ── Tab: Seguimiento (existing tracker) ───────────────────────────────────────

function SeguimientoTab({ token }: { token: string }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [filter, setFilter]       = useState<'activo' | 'todos' | 'vencido'>('activo');
  const [search, setSearch]       = useState('');
  const [form, setForm] = useState({
    name: '', contract_type: 'contrato', counterparty: '',
    expiry_date: '', alert_days_before: '30,7,1', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-contracts`);
      const data = await res.json();
      setContracts(data.contracts ?? []);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback((id: string) => {
    fetch(`/api/portal/${token}/read-receipt`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_type: 'contract', item_id: id }),
    }).catch(() => {});
  }, [token]);

  function toggle(id: string) {
    const isOpening = !expanded.has(id);
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    if (isOpening) markRead(id);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const alertDays = form.alert_days_before.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      await fetch(`/api/portal/${token}/ops-contracts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, contract_type: form.contract_type, counterparty: form.counterparty || null, expiry_date: form.expiry_date, alert_days_before: alertDays, notes: form.notes || null }),
      });
      setForm({ name: '', contract_type: 'contrato', counterparty: '', expiry_date: '', alert_days_before: '30,7,1', notes: '' });
      setShowForm(false); await load();
    } finally { setSaving(false); }
  }

  async function handleStatus(id: string, status: string) {
    await fetch(`/api/portal/${token}/ops-contracts`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este contrato?')) return;
    await fetch(`/api/portal/${token}/ops-contracts`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    await load();
  }

  const filtered = contracts.filter(c => {
    const statusOk = filter === 'todos' ? true : c.status === filter;
    if (!statusOk) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.counterparty ?? '').toLowerCase().includes(q) || (c.notes ?? '').toLowerCase().includes(q);
  });

  const expiringSoon = contracts.filter(c => { if (c.status !== 'activo') return false; const d = daysUntil(c.expiry_date); return d >= 0 && d <= 30; });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
            <FileText size={13} /> Contratos y fechas críticas
            <InfoTooltip text="¿Cuántas tareas consume?\n1 tarea por análisis de contrato." />
          </h2>
          {expiringSoon.length > 0 && (
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#f59e0b' }}>
              <AlertTriangle size={11} /> {expiringSoon.length} {expiringSoon.length === 1 ? 'vence' : 'vencen'} en los próximos 30 días
            </p>
          )}
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)', color: '#9B6DFF' }}>
          <Plus size={12} /> Agregar
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
          <p className="text-xs font-semibold" style={{ color: '#9B6DFF' }}>Nuevo contrato / fecha crítica</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Nombre *</label>
              <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej. Arrendamiento local 5" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Tipo</label>
              <select value={form.contract_type} onChange={e => setForm(p => ({ ...p, contract_type: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Contraparte</label>
              <input value={form.counterparty} onChange={e => setForm(p => ({ ...p, counterparty: e.target.value }))} placeholder="Empresa o persona" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Fecha de vencimiento *</label>
              <input required type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Alertar (días antes)</label>
              <input value={form.alert_days_before} onChange={e => setForm(p => ({ ...p, alert_days_before: e.target.value }))} placeholder="30,7,1" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
            </div>
            <div className="col-span-2">
              <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Notas</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'inherit' }} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: '#6C3BFF', color: '#fff' }}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
        {(['activo', 'vencido', 'todos'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize" style={{ background: filter === f ? '#6C3BFF' : 'transparent', color: filter === f ? '#fff' : 'var(--c-text-3)' }}>
            {f === 'activo' ? 'Activos' : f === 'vencido' ? 'Vencidos' : 'Todos'}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-4)', pointerEvents: 'none' }} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, contraparte o notas..." className="w-full text-xs rounded-xl" style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
      </div>

      {loading ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <FileText size={28} style={{ color: 'var(--c-text-3)', opacity: 0.4 }} />
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin contratos registrados</p>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Agrega contratos, permisos o fechas de pago para recibir alertas automáticas.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(c => {
            const days      = daysUntil(c.expiry_date);
            const uColor    = urgencyColor(days);
            const isOpen    = expanded.has(c.id);
            const statusCf  = STATUS_CFG[c.status] ?? STATUS_CFG.activo;
            const typeLabel = TYPE_LABELS[c.contract_type] ?? 'Documento';
            return (
              <div key={c.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: `1px solid ${days >= 0 && days <= 7 && c.status === 'activo' ? 'rgba(239,68,68,0.3)' : days <= 30 && days >= 0 && c.status === 'activo' ? 'rgba(245,158,11,0.25)' : 'var(--c-border)'}` }}>
                <button onClick={() => toggle(c.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.status === 'activo' ? uColor : '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{c.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--c-text-3)' }}>{typeLabel}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: statusCf.bg, color: statusCf.color }}>{statusCf.label}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs flex items-center gap-1" style={{ color: uColor }}>
                        <Clock size={10} />
                        {c.status === 'activo' ? (days < 0 ? 'Vencido' : days === 0 ? '¡Vence hoy!' : `Vence en ${days} día${days !== 1 ? 's' : ''}`) : new Date(c.expiry_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {c.counterparty && <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>{c.counterparty}</p>}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--c-divider)' }}>
                    <div className="pt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--c-text-3)' }}>Fecha de vencimiento</p>
                        <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{new Date(c.expiry_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      </div>
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--c-text-3)' }}>Alertas (días antes)</p>
                        <p className="text-sm" style={{ color: 'var(--c-text)' }}>{c.alert_days_before.join(', ')}</p>
                      </div>
                    </div>
                    {c.notes && <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}><p className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Notas</p><p className="text-sm" style={{ color: 'var(--c-text)' }}>{c.notes}</p></div>}
                    {c.renewal_draft && <div className="rounded-lg p-3" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}><p className="text-xs mb-2 font-semibold" style={{ color: '#9B6DFF' }}>Borrador de renovación (generado por IA)</p><p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-2)' }}>{c.renewal_draft}</p></div>}
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.status === 'activo' && <button onClick={() => handleStatus(c.id, 'renovado')} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(155,109,255,0.1)', border: '1px solid rgba(155,109,255,0.25)', color: '#9B6DFF' }}>Marcar renovado</button>}
                      {(c.status === 'vencido' || c.status === 'renovado') && <button onClick={() => handleStatus(c.id, 'activo')} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>Marcar activo</button>}
                      <button onClick={() => handleDelete(c.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}><Trash2 size={11} /> Eliminar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Plantilla ────────────────────────────────────────────────────────────

function PlantillaTab({ token }: { token: string }) {
  const [clauses, setClauses]     = useState<Clause[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${token}/contract-template`)
      .then(r => r.json())
      .then(d => { setClauses(d.template?.clauses ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  async function save() {
    setSaving(true);
    await fetch(`/api/portal/${token}/contract-template`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clauses }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateClause(id: string, patch: Partial<Clause>) {
    setClauses(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function removeClause(id: string) {
    setClauses(prev => prev.filter(c => c.id !== id));
  }

  function addClause() {
    const id = `clause_${Date.now()}`;
    setClauses(prev => [...prev, { id, title: 'NUEVA CLÁUSULA', body: '', required: false, enabled: true }]);
    setEditingId(id);
  }

  const DEFAULT_CLAUSES: Clause[] = [
    { id: 'partes',          title: 'PARTES',                  required: true,  enabled: true, body: 'Por una parte, {nombre_prestador} (en adelante "el Prestador"), y por la otra, {nombre_cliente}{rfc_cliente ? ", con RFC " + rfc_cliente : ""} (en adelante "el Cliente").' },
    { id: 'objeto',          title: 'OBJETO',                  required: true,  enabled: true, body: 'El Prestador se compromete a proporcionar al Cliente los siguientes servicios: {descripcion_servicios}.' },
    { id: 'vigencia',        title: 'VIGENCIA',                required: true,  enabled: true, body: 'El presente contrato tendrá una vigencia de {vigencia}, a partir de la fecha de firma, con renovación automática salvo aviso contrario con 30 días de anticipación.' },
    { id: 'contraprestacion',title: 'CONTRAPRESTACIÓN',        required: true,  enabled: true, body: 'El Cliente pagará al Prestador la cantidad de {monto} por los servicios descritos en la cláusula de Objeto.' },
    { id: 'pago',            title: 'FORMA DE PAGO',           required: false, enabled: true, body: 'El pago se realizará de la siguiente manera: {forma_de_pago}. En caso de retraso, se aplicará un cargo por mora del 2% mensual sobre el saldo vencido.' },
    { id: 'confidencialidad',title: 'CONFIDENCIALIDAD',        required: false, enabled: true, body: 'Ambas partes se comprometen a mantener la confidencialidad de toda información intercambiada durante la vigencia del contrato y por un período de 2 años posterior a su terminación.' },
    { id: 'propiedad',       title: 'PROPIEDAD INTELECTUAL',   required: false, enabled: true, body: 'Los entregables producidos por el Prestador en el marco de este contrato serán propiedad del Cliente una vez liquidado el pago total correspondiente.' },
    { id: 'responsabilidad', title: 'LIMITACIÓN DE RESPONSABILIDAD', required: false, enabled: true, body: 'La responsabilidad máxima del Prestador por cualquier causa se limitará al monto total pagado por el Cliente en los tres meses previos al evento que origina la reclamación.' },
    { id: 'terminacion',     title: 'TERMINACIÓN',             required: false, enabled: true, body: 'Cualquiera de las partes podrá dar por terminado el presente contrato con un aviso previo de 30 días naturales por escrito. En caso de incumplimiento grave, la parte afectada podrá terminar el contrato de forma inmediata.' },
    { id: 'jurisdiccion',    title: 'JURISDICCIÓN',            required: true,  enabled: true, body: 'Para la interpretación y cumplimiento del presente contrato, las partes se someten a las leyes de los Estados Unidos Mexicanos y a los tribunales de {ciudad}, renunciando a cualquier otro fuero.' },
    { id: 'aceptacion',      title: 'ACEPTACIÓN',              required: true,  enabled: true, body: 'En señal de conformidad, las partes firman el presente contrato en la ciudad de {ciudad}, el día {fecha}.' },
  ];

  function loadDefaults() {
    setClauses(DEFAULT_CLAUSES);
  }

  if (loading) return <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando plantilla...</p>;

  // Empty state
  if (clauses.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center py-12 gap-4 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <FileText size={32} style={{ color: 'var(--c-text-3)', opacity: 0.35 }} />
          <div className="text-center max-w-xs px-4">
            <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--c-text-2)' }}>Plantilla vacía</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
              Esta es la plantilla base que tu empleado usa para generar contratos de prestación de servicios para tus clientes.
              Carga las cláusulas estándar y edita el texto según las necesidades de tu organización.
            </p>
          </div>
          <button
            onClick={loadDefaults}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            <Plus size={14} /> Cargar cláusulas estándar
          </button>
          <button
            onClick={addClause}
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--c-text-3)' }}
          >
            o agregar cláusula en blanco
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Plantilla base de contrato</p>
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
            Tu empleado usará esta plantilla para generar borradores. Edita las cláusulas con el ícono de lápiz. Las marcadas como <strong>Requerida</strong> siempre se incluyen.
          </p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all"
          style={{ background: saved ? 'rgba(34,197,94,0.15)' : '#6C3BFF', color: saved ? '#22c55e' : '#fff', border: saved ? '1px solid rgba(34,197,94,0.3)' : 'none' }}>
          {saved ? <><Check size={12} /> Guardada</> : saving ? 'Guardando...' : 'Guardar plantilla'}
        </button>
      </div>

      {/* Variables hint */}
      <div className="rounded-xl p-3" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: '#9B6DFF' }}>Variables disponibles</p>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES_HINT.map(v => (
            <code key={v} className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(108,59,255,0.12)', color: '#C4A8FF', fontFamily: 'monospace' }}>{v}</code>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--c-text-4)' }}>Tu empleado sustituirá estas variables con los datos del cliente al generar un borrador.</p>
      </div>

      {/* Clauses */}
      <div className="flex flex-col gap-3">
        {clauses.map((clause, idx) => {
          const isEditing = editingId === clause.id;
          return (
            <div key={clause.id} className="rounded-xl overflow-hidden"
              style={{ background: 'var(--c-surface)', border: `1px solid ${clause.enabled ? 'var(--c-border)' : 'rgba(255,255,255,0.04)'}`, opacity: clause.enabled ? 1 : 0.5 }}>
              {/* Clause header */}
              <div className="flex items-center gap-2 px-4 py-2.5">
                <GripVertical size={14} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
                <span className="text-xs text-center px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-4)', minWidth: 20 }}>{idx + 1}</span>
                {isEditing ? (
                  <input
                    value={clause.title}
                    onChange={e => updateClause(clause.id, { title: e.target.value.toUpperCase() })}
                    className="flex-1 px-2 py-0.5 rounded text-xs font-bold uppercase"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                  />
                ) : (
                  <span className="flex-1 text-xs font-bold uppercase" style={{ color: 'var(--c-text)' }}>{clause.title}</span>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  {clause.required ? (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>Requerida</span>
                  ) : (
                    <button onClick={() => updateClause(clause.id, { enabled: !clause.enabled })}
                      title={clause.enabled ? 'Desactivar cláusula' : 'Activar cláusula'}>
                      {clause.enabled
                        ? <ToggleRight size={18} style={{ color: '#22c55e' }} />
                        : <ToggleLeft  size={18} style={{ color: 'var(--c-text-4)' }} />}
                    </button>
                  )}
                  <button onClick={() => setEditingId(isEditing ? null : clause.id)}
                    className="p-1 rounded" style={{ color: isEditing ? '#6C3BFF' : 'var(--c-text-3)' }}>
                    <Edit2 size={13} />
                  </button>
                  {!clause.required && (
                    <button onClick={() => removeClause(clause.id)} className="p-1 rounded" style={{ color: '#f87171' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              {/* Clause body */}
              <div className="px-4 pb-3" style={{ borderTop: '1px solid var(--c-divider)' }}>
                {isEditing ? (
                  <textarea
                    value={clause.body}
                    onChange={e => updateClause(clause.id, { body: e.target.value })}
                    rows={5}
                    className="w-full mt-2.5 px-3 py-2 rounded-lg text-xs resize-none"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'inherit', lineHeight: 1.7, outline: 'none' }}
                  />
                ) : (
                  <p className="text-xs mt-2.5 leading-relaxed whitespace-pre-wrap" style={{ color: clause.enabled ? 'var(--c-text-2)' : 'var(--c-text-4)' }}>
                    {clause.body || <span style={{ color: 'var(--c-text-4)', fontStyle: 'italic' }}>Sin contenido. Haz clic en editar para escribir.</span>}
                  </p>
                )}
                {isEditing && (
                  <div className="flex items-center gap-2 mt-2">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--c-text-3)' }}>
                      <input type="checkbox" checked={clause.required} onChange={e => updateClause(clause.id, { required: e.target.checked })} className="rounded" />
                      Cláusula requerida (tu empleado no puede desactivarla)
                    </label>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={addClause}
        className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
        style={{ background: 'var(--c-surface)', border: '1px dashed var(--c-border)', color: 'var(--c-text-3)' }}>
        <Plus size={13} /> Agregar cláusula
      </button>
    </div>
  );
}

// ── Tab: Borradores ───────────────────────────────────────────────────────────

function BorradoresTab({ token }: { token: string }) {
  const [drafts, setDrafts]       = useState<Draft[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [showNew, setShowNew]     = useState(false);
  const [sending, setSending]     = useState<string | null>(null);
  const [sendDone, setSendDone]   = useState<string | null>(null);
  const [templateClauses, setTemplateClauses] = useState<Clause[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, tpl] = await Promise.all([
        fetch(`/api/portal/${token}/contract-drafts`).then(r => r.json()),
        fetch(`/api/portal/${token}/contract-template`).then(r => r.json()),
      ]);
      setDrafts(dr.drafts ?? []);
      setTemplateClauses(tpl.template?.clauses ?? []);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function sendDraft(id: string) {
    setSending(id);
    const res = await fetch(`/api/portal/${token}/contract-drafts/${id}/send`, { method: 'POST' });
    if (res.ok) { setSendDone(id); setTimeout(() => { setSendDone(null); load(); }, 2000); }
    setSending(null);
  }

  async function updateDraftField(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/portal/${token}/contract-drafts`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } as Draft : d));
  }

  async function cancelDraft(id: string) {
    if (!confirm('¿Cancelar este borrador?')) return;
    await fetch(`/api/portal/${token}/contract-drafts`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
          Borradores de contrato
        </p>
        <button onClick={() => setShowNew(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)', color: '#9B6DFF' }}>
          <Plus size={12} /> Nuevo borrador
        </button>
      </div>

      {showNew && <NewDraftForm token={token} templateClauses={templateClauses} onCreated={() => { setShowNew(false); load(); }} />}

      {loading ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
      ) : drafts.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <FileText size={28} style={{ color: 'var(--c-text-3)', opacity: 0.4 }} />
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin borradores aún</p>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Tu empleado generará borradores desde conversaciones, o puedes crear uno manualmente.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {drafts.map(draft => {
            const isOpen   = expanded.has(draft.id);
            const statusCf = DRAFT_STATUS[draft.status] ?? DRAFT_STATUS.borrador;
            const canSend  = draft.status !== 'enviado' && draft.status !== 'cancelado' && !!draft.client_email;
            const isSent   = sendDone === draft.id;
            const isSending = sending === draft.id;

            return (
              <div key={draft.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <button onClick={() => setExpanded(prev => { const next = new Set(prev); next.has(draft.id) ? next.delete(draft.id) : next.add(draft.id); return next; })}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{draft.client_name || 'Sin nombre'}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: statusCf.bg, color: statusCf.color }}>{statusCf.label}</span>
                      {draft.source_type && draft.source_type !== 'manual' && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--c-text-4)' }}>vía {draft.source_type}</span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                      {draft.client_email || 'Sin email'}{draft.client_rfc ? ` · RFC: ${draft.client_rfc}` : ''}
                      {' · '}{new Date(draft.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--c-divider)' }}>
                    {/* Client info */}
                    <div className="pt-3 grid grid-cols-2 gap-3">
                      {[
                        { label: 'Nombre', field: 'client_name', value: draft.client_name },
                        { label: 'Email',  field: 'client_email', value: draft.client_email },
                        { label: 'RFC',    field: 'client_rfc',   value: draft.client_rfc   },
                        { label: 'Tel.',   field: 'client_phone', value: draft.client_phone  },
                      ].map(({ label, field, value }) => (
                        <div key={field}>
                          <p className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>{label}</p>
                          <input
                            defaultValue={value ?? ''}
                            onBlur={e => updateDraftField(draft.id, { [field]: e.target.value || null })}
                            disabled={draft.status === 'enviado'}
                            className="w-full px-2 py-1.5 rounded-lg text-xs"
                            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Clauses */}
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Cláusulas</p>
                      {(draft.clauses as Clause[]).map((clause, ci) => (
                        <div key={clause.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${clause.enabled ? 'var(--c-border)' : 'rgba(255,255,255,0.04)'}`, opacity: clause.enabled ? 1 : 0.45 }}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="text-xs font-bold uppercase flex-1" style={{ color: 'var(--c-text-2)' }}>{ci + 1}. {clause.title}</span>
                            {!clause.required && draft.status !== 'enviado' && (
                              <button onClick={() => {
                                const updated = (draft.clauses as Clause[]).map(c => c.id === clause.id ? { ...c, enabled: !c.enabled } : c);
                                updateDraftField(draft.id, { clauses: updated });
                                setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, clauses: updated } : d));
                              }}>
                                {clause.enabled ? <ToggleRight size={16} style={{ color: '#22c55e' }} /> : <ToggleLeft size={16} style={{ color: 'var(--c-text-4)' }} />}
                              </button>
                            )}
                            {clause.required && <span className="text-xs" style={{ color: '#f87171' }}>Requerida</span>}
                          </div>
                          {clause.enabled && (
                            <div className="px-3 pb-2" style={{ borderTop: '1px solid var(--c-divider)' }}>
                              {draft.status !== 'enviado' ? (
                                <textarea
                                  defaultValue={clause.body}
                                  rows={3}
                                  onBlur={e => {
                                    const updated = (draft.clauses as Clause[]).map(c => c.id === clause.id ? { ...c, body: e.target.value } : c);
                                    updateDraftField(draft.id, { clauses: updated });
                                    setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, clauses: updated } : d));
                                  }}
                                  className="w-full mt-2 px-2 py-1.5 rounded text-xs resize-none"
                                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'inherit', lineHeight: 1.65, outline: 'none' }}
                                />
                              ) : (
                                <p className="text-xs mt-2 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-2)' }}>{clause.body}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {draft.notes && (
                      <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
                        <p className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Notas del empleado</p>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{draft.notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    {draft.status !== 'enviado' && draft.status !== 'cancelado' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => sendDraft(draft.id)}
                          disabled={!canSend || !!sending}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: isSent ? 'rgba(34,197,94,0.15)' : canSend ? '#6C3BFF' : 'var(--c-surface-2)',
                            color: isSent ? '#22c55e' : canSend ? '#fff' : 'var(--c-text-4)',
                            border: isSent ? '1px solid rgba(34,197,94,0.3)' : 'none',
                            cursor: canSend ? 'pointer' : 'not-allowed',
                          }}>
                          {isSent ? <><Check size={12} /> Enviado</> : isSending ? <><RefreshCw size={12} className="animate-spin" /> Enviando...</> : <><Mail size={12} /> Aprobar y enviar</>}
                        </button>
                        {!canSend && !draft.client_email && (
                          <span className="text-xs" style={{ color: '#f59e0b' }}>Agrega el email del cliente para enviar</span>
                        )}
                        <button onClick={() => cancelDraft(draft.id)}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                          <X size={11} /> Cancelar
                        </button>
                      </div>
                    )}

                    {draft.status === 'enviado' && draft.sent_at && (
                      <p className="text-xs flex items-center gap-1" style={{ color: '#22c55e' }}>
                        <Send size={11} /> Enviado el {new Date(draft.sent_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── New Draft Form ─────────────────────────────────────────────────────────────

function NewDraftForm({ token, templateClauses, onCreated }: { token: string; templateClauses: Clause[]; onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [clauses, setClauses] = useState<Clause[]>(templateClauses.map(c => ({ ...c })));
  const [form, setForm] = useState({ client_name: '', client_email: '', client_rfc: '', client_phone: '', notes: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch(`/api/portal/${token}/contract-drafts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, clauses, source_type: 'manual' }),
    });
    setSaving(false); onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-4 flex flex-col gap-4" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
      <p className="text-xs font-semibold" style={{ color: '#9B6DFF' }}>Nuevo borrador de contrato</p>

      {/* Client info */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Nombre del cliente *', field: 'client_name', required: true, placeholder: 'Nombre completo o razón social' },
          { label: 'Email del cliente *',  field: 'client_email', required: true, placeholder: 'correo@empresa.com' },
          { label: 'RFC',                  field: 'client_rfc',   required: false, placeholder: 'XAXX010101000' },
          { label: 'Teléfono',             field: 'client_phone', required: false, placeholder: '+52 81 1234 5678' },
        ].map(({ label, field, required, placeholder }) => (
          <div key={field}>
            <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>{label}</label>
            <input
              required={required}
              value={form[field as keyof typeof form]}
              onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg text-xs"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
            />
          </div>
        ))}
      </div>

      {/* Clauses toggle */}
      {clauses.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Cláusulas a incluir</p>
          {clauses.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <span className="text-xs flex-1 font-medium" style={{ color: c.enabled ? 'var(--c-text)' : 'var(--c-text-4)' }}>{i + 1}. {c.title}</span>
              {c.required
                ? <span className="text-xs" style={{ color: '#f87171' }}>Requerida</span>
                : <button type="button" onClick={() => setClauses(prev => prev.map(cl => cl.id === c.id ? { ...cl, enabled: !cl.enabled } : cl))}>
                    {c.enabled ? <ToggleRight size={16} style={{ color: '#22c55e' }} /> : <ToggleLeft size={16} style={{ color: 'var(--c-text-4)' }} />}
                  </button>
              }
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Notas (lo que se acordó en llamada o correo)</label>
        <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Ej: cliente solicitó cambio en cláusula de pago a 30 días, vigencia de 12 meses..."
          className="w-full px-3 py-2 rounded-lg text-xs resize-none"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'inherit', lineHeight: 1.65, outline: 'none' }} />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: '#6C3BFF', color: '#fff' }}>
          {saving ? 'Creando...' : 'Crear borrador'}
        </button>
        <button type="button" onClick={onCreated} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
