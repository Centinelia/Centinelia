'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, ChevronDown, ChevronUp, Trash2, FileText, AlertTriangle,
  Clock, Search,
} from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Contract {
  id: string; agent_id: string; name: string; contract_type: string;
  counterparty: string | null; expiry_date: string; alert_days_before: number[];
  notes: string | null; status: string; renewal_draft: string | null;
  last_alerted_at: string | null; created_at: string;
}

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

export default function ContractTrackerSection({ token }: { token: string }) {
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
            <InfoTooltip text={"Registra contratos, permisos, licencias o cualquier fecha crítica y tu empleado te avisará antes de que venzan.\n\nPuede analizar el documento, redactar borradores de renovación y enviar alertas automáticas a los días que configures."} />
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.18)', color: 'var(--c-text-4)' }}
            >
              1 tarea / análisis
            </span>
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
              <Select value={form.contract_type} onValueChange={v => setForm(p => ({ ...p, contract_type: v }))}>
                <SelectTrigger className="bg-[color:var(--c-bg)] border-[color:var(--c-border)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
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
        <div className="rounded-xl p-6 flex flex-col gap-4" style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(108,59,255,0.1)' }}>
              <FileText size={16} style={{ color: '#9B6DFF' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Sin contratos registrados</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>Tu empleado te avisa antes de que venzan — sin que tengas que llevarlo en la cabeza.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 pl-12">
            {[
              'Arrendamiento del local — vence en 6 meses, alerta 30 días antes',
              'Licencia de software — renovación anual, alerta 15 días antes',
              'Contrato con proveedor — revisión trimestral de condiciones',
            ].map(ex => (
              <div key={ex} className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--c-text-4)' }} />
                <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>{ex}</p>
              </div>
            ))}
          </div>
          <div className="pl-12">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: '#9B6DFF' }}
            >
              <Plus size={12} /> Agregar primer contrato
            </button>
          </div>
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
                    {c.renewal_draft && <div className="rounded-lg p-3" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}><p className="text-xs mb-2 font-semibold" style={{ color: '#9B6DFF' }}>Borrador de renovación (generado automáticamente)</p><p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-2)' }}>{c.renewal_draft}</p></div>}
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
