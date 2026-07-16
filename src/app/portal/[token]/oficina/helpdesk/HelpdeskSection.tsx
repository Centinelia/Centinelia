'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, ChevronUp, AlertTriangle, Clock, CheckCircle, Loader2, Siren } from 'lucide-react';

const OVERDUE_MS: Record<string, number> = {
  critica: 4  * 60 * 60 * 1000,  // 4 h
  alta:    24 * 60 * 60 * 1000,  // 24 h
};
const ACTIVE_STATUSES = new Set(['abierto', 'en_proceso', 'pendiente']);

function isOverdue(ticket: Ticket): boolean {
  if (!OVERDUE_MS[ticket.prioridad]) return false;
  if (!ACTIVE_STATUSES.has(ticket.status)) return false;
  return Date.now() - new Date(ticket.created_at).getTime() > OVERDUE_MS[ticket.prioridad];
}

export interface Ticket {
  id: string; folio: string; titulo: string; categoria: string;
  prioridad: string; status: string; asignado_a: string | null;
  descripcion: string | null; resolucion: string | null;
  caller_number: string | null; created_at: string;
}

const CAT_COLOR: Record<string, string> = {
  red: '#3b82f6', servidores: '#8b5cf6', usuario: '#22c55e',
  software: '#f59e0b', hardware: '#ef4444', accesos: '#ec4899', otro: '#6b7280',
};
const PRI_COLOR: Record<string, string> = {
  baja: '#6b7280', normal: '#3b82f6', alta: '#f59e0b', critica: '#ef4444',
};
const STA_ICON: Record<string, React.ReactNode> = {
  abierto:    <Clock size={11} />,
  en_proceso: <Loader2 size={11} className="animate-spin" />,
  pendiente:  <AlertTriangle size={11} />,
  resuelto:   <CheckCircle size={11} />,
  cerrado:    <CheckCircle size={11} />,
};

const CATEGORIAS = ['red','servidores','usuario','software','hardware','accesos','otro'];
const PRIORIDADES = ['baja','normal','alta','critica'];
const STATUSES    = ['abierto','en_proceso','pendiente','resuelto','cerrado'];

export default function HelpdeskSection({ token }: { token: string }) {
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');
  const [expandId, setExpandId] = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);

  // New ticket form
  const [newTitulo, setNewTitulo]     = useState('');
  const [newCat,    setNewCat]        = useState('otro');
  const [newPri,    setNewPri]        = useState('normal');
  const [newDesc,   setNewDesc]       = useState('');
  const [newAsig,   setNewAsig]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const url = `/api/portal/${token}/helpdesk${filter ? `?status=${filter}` : ''}`;
    const res = await fetch(url);
    const d   = await res.json();
    setTickets(d.tickets ?? []);
    setLoading(false);
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  const updateTicket = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/portal/${token}/helpdesk/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (res.ok) { const d = await res.json(); setTickets(t => t.map(x => x.id === id ? d.ticket : x)); }
  };

  const handleAdd = async () => {
    if (!newTitulo.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/portal/${token}/helpdesk`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: newTitulo, categoria: newCat, prioridad: newPri, descripcion: newDesc, asignado_a: newAsig || undefined }),
    });
    if (res.ok) {
      const d = await res.json();
      setTickets(t => [d.ticket, ...t]);
      setShowAdd(false); setNewTitulo(''); setNewDesc(''); setNewAsig('');
    }
    setSaving(false);
  };

  const open     = tickets.filter(t => t.status === 'abierto').length;
  const urgent   = tickets.filter(t => t.prioridad === 'critica' && t.status !== 'cerrado' && t.status !== 'resuelto').length;
  const overdue  = tickets.filter(isOverdue);

  const display = filter ? tickets : tickets.slice(0, 50);

  return (
    <div className="flex flex-col gap-4" id="of-helpdesk">
      {/* Overdue alert banner */}
      {overdue.length > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <Siren size={14} className="shrink-0 animate-pulse" style={{ color: '#ef4444' }} />
          <p className="text-xs font-medium" style={{ color: '#fca5a5' }}>
            {overdue.length === 1
              ? `1 ticket requiere atención inmediata (${overdue[0].folio})`
              : `${overdue.length} tickets requieren atención inmediata`}
          </p>
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Abiertos',  value: open,   color: '#3b82f6' },
          { label: 'Críticos',  value: urgent,  color: '#ef4444' },
          { label: 'Total',     value: tickets.length, color: 'var(--c-text-2)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)' }}>
            <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Header + filter */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {['', 'abierto', 'en_proceso', 'pendiente', 'resuelto'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={{
                background: filter === s ? '#6C3BFF' : 'var(--c-surface-2)',
                color:      filter === s ? '#fff' : 'var(--c-text-3)',
                border:     '1px solid ' + (filter === s ? '#6C3BFF' : 'var(--c-border)'),
              }}>
              {s === '' ? 'Todos' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Plus size={12} /> Nuevo ticket
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.2)' }}>
          <input value={newTitulo} onChange={e => setNewTitulo(e.target.value)}
            placeholder="Título del ticket *"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
          <div className="grid grid-cols-2 gap-2">
            <select value={newCat} onChange={e => setNewCat(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={newPri} onChange={e => setNewPri(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}>
              {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
            placeholder="Descripción (opcional)"
            className="w-full px-3 py-2 rounded-lg text-xs resize-none"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
          <input value={newAsig} onChange={e => setNewAsig(e.target.value)}
            placeholder="Asignar a (opcional)"
            className="w-full px-3 py-2 rounded-lg text-xs"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !newTitulo.trim()}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : 'Crear'}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-lg text-xs"
              style={{ background: 'none', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Ticket list */}
      {loading ? (
        <div className="text-center py-8" style={{ color: 'var(--c-text-4)' }}>Cargando...</div>
      ) : display.length === 0 ? (
        <div className="text-center py-10" style={{ color: 'var(--c-text-4)' }}>
          <p className="text-sm">No hay tickets{filter ? ` con estatus "${filter}"` : ''}.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {display.map(ticket => {
            const isOpen    = expandId === ticket.id;
            const catColor  = CAT_COLOR[ticket.categoria] ?? '#6b7280';
            const priColor  = PRI_COLOR[ticket.prioridad] ?? '#6b7280';
            const overdueTk = isOverdue(ticket);
            return (
              <div key={ticket.id} className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${overdueTk ? 'rgba(239,68,68,0.5)' : ticket.prioridad === 'critica' ? 'rgba(239,68,68,0.3)' : 'var(--c-border-2)'}`, background: 'var(--c-surface)' }}>
                <button
                  onClick={() => setExpandId(isOpen ? null : ticket.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {overdueTk && (
                        <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#ef4444' }} />
                      )}
                      <span className="text-[10px] font-mono" style={{ color: 'var(--c-text-4)' }}>{ticket.folio}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: `${catColor}15`, color: catColor, border: `1px solid ${catColor}30` }}>
                        {ticket.categoria}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: `${priColor}15`, color: priColor, border: `1px solid ${priColor}30` }}>
                        {ticket.prioridad}
                      </span>
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                        style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}>
                        {STA_ICON[ticket.status]} {ticket.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>{ticket.titulo}</p>
                    {ticket.asignado_a && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>→ {ticket.asignado_a}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0" style={{ color: 'var(--c-text-4)' }}>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 flex flex-col gap-3"
                    style={{ borderTop: '1px solid var(--c-border)' }}>
                    {ticket.descripcion && (
                      <p className="text-xs pt-3" style={{ color: 'var(--c-text-2)' }}>{ticket.descripcion}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--c-text-4)' }}>Estatus</label>
                        <select value={ticket.status}
                          onChange={e => updateTicket(ticket.id, { status: e.target.value })}
                          className="px-2 py-1 rounded-lg text-xs"
                          style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}>
                          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--c-text-4)' }}>Asignado a</label>
                        <input defaultValue={ticket.asignado_a ?? ''} placeholder="—"
                          onBlur={e => updateTicket(ticket.id, { asignado_a: e.target.value || null })}
                          className="px-2 py-1 rounded-lg text-xs w-36"
                          style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] mb-1" style={{ color: 'var(--c-text-4)' }}>Resolución / notas</label>
                      <textarea defaultValue={ticket.resolucion ?? ''} rows={2}
                        onBlur={e => updateTicket(ticket.id, { resolucion: e.target.value || null })}
                        className="w-full px-2 py-1 rounded-lg text-xs resize-none"
                        style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                      {new Date(ticket.created_at).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </p>
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
