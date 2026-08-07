'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, ChevronUp, AlertTriangle, Clock, CheckCircle, Loader2, Siren, LifeBuoy, Phone, User, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';

const OVERDUE_MS: Record<string, number> = {
  critica: 4  * 60 * 60 * 1000,
  alta:    24 * 60 * 60 * 1000,
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
  created_by: string | null;
}

const CAT_COLOR: Record<string, string> = {
  red: '#3b82f6', servidores: '#8b5cf6', usuario: '#22c55e',
  software: '#f59e0b', hardware: '#ef4444', accesos: '#ec4899', otro: '#6b7280',
};
const CAT_LABELS: Record<string, string> = {
  red: 'Red', servidores: 'Servidores', usuario: 'Usuario',
  software: 'Software', hardware: 'Hardware', accesos: 'Accesos', otro: 'Otro',
};
const PRI_COLOR: Record<string, string> = {
  baja: '#6b7280', normal: '#3b82f6', alta: '#f59e0b', critica: '#ef4444',
};
const PRI_LABELS: Record<string, string> = {
  baja: 'Baja', normal: 'Normal', alta: 'Alta', critica: 'Crítica',
};
const STATUS_LABELS: Record<string, string> = {
  abierto:    'Abierto',
  en_proceso: 'En proceso',
  pendiente:  'En espera',
  resuelto:   'Resuelto',
  cerrado:    'Cerrado',
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

// Filtros del toolbar. Todos client-side: cargamos todo el pool y filtramos
// en cliente para evitar refetch al cambiar de tab. 'activos' es default y
// agrupa abierto+en_proceso+pendiente (lo que realmente necesita atención).
type FilterKey = 'activos' | 'abierto' | 'en_proceso' | 'pendiente' | 'resueltos';
const FILTERS: FilterKey[] = ['activos', 'abierto', 'en_proceso', 'pendiente', 'resueltos'];
const FILTER_LABELS: Record<FilterKey, string> = {
  activos:    'Activos',
  abierto:    'Abiertos',
  en_proceso: 'En proceso',
  pendiente:  'En espera',
  resueltos:  'Resueltos',
};
const ACTIVE_STATUS_SET   = new Set(['abierto', 'en_proceso', 'pendiente']);
const RESOLVED_STATUS_SET = new Set(['resuelto', 'cerrado']);

function ticketOrigin(t: Ticket): { icon: React.ReactNode; label: string } {
  if (t.caller_number) {
    return { icon: <Phone size={11} />, label: `Llamada de ${t.caller_number}` };
  }
  if (t.created_by === 'voice') {
    return { icon: <Phone size={11} />, label: 'Por llamada' };
  }
  if (t.created_by === 'owner') {
    return { icon: <User size={11} />, label: 'Registrado por el dueño' };
  }
  if (t.created_by && t.created_by !== 'sub_user') {
    return { icon: <User size={11} />, label: `Registrado por ${t.created_by}` };
  }
  if (t.created_by === 'sub_user') {
    return { icon: <User size={11} />, label: 'Registrado por un usuario' };
  }
  return { icon: <User size={11} />, label: 'Origen desconocido' };
}

const inputStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #E8E3F5',
  color: '#1A0A3B',
  outline: 'none',
};

export default function HelpdeskSection({ token, subUserName }: { token: string; subUserName?: string | null }) {
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<FilterKey>('activos');
  const [expandId, setExpandId] = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const [newTitulo, setNewTitulo] = useState('');
  const [newCat,    setNewCat]    = useState('otro');
  const [newPri,    setNewPri]    = useState('normal');
  const [newDesc,   setNewDesc]   = useState('');
  const [newAsig,   setNewAsig]   = useState('');

  // Cargamos todos los tickets una sola vez; los filtros se aplican en cliente
  // para que cambiar de tab no dispare refetch. Sub-user sí filtra en backend
  // por asignado_a (privacidad: no debe ver tickets de otros).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (subUserName) qs.set('asignado_a', subUserName);
      const url = `/api/portal/${token}/helpdesk${qs.toString() ? `?${qs}` : ''}`;
      const res = await fetch(url);
      const d   = await res.json();
      setTickets(d.tickets ?? []);
    } catch {
      // tickets stay empty; loading clears
    } finally {
      setLoading(false);
    }
  }, [token, subUserName]);

  useEffect(() => { load(); }, [load]);

  const updateTicket = async (id: string, patch: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/portal/${token}/helpdesk/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (res.ok) { const d = await res.json(); setTickets(t => t.map(x => x.id === id ? d.ticket : x)); }
    } catch {
      // silent, ticket stays unchanged
    }
  };

  const handleAdd = async () => {
    if (!newTitulo.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${token}/helpdesk`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: newTitulo, categoria: newCat, prioridad: newPri, descripcion: newDesc,
          asignado_a: newAsig || subUserName || undefined,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setTickets(t => [d.ticket, ...t]);
        setShowAdd(false); setNewTitulo(''); setNewDesc(''); setNewAsig('');
      }
    } finally {
      setSaving(false);
    }
  };

  const pendientes = tickets.filter(t => ACTIVE_STATUS_SET.has(t.status)).length;
  const enAtencion = tickets.filter(t => t.status === 'en_proceso').length;
  const criticos   = tickets.filter(t => t.prioridad === 'critica' && ACTIVE_STATUS_SET.has(t.status)).length;
  const resueltos  = tickets.filter(t => RESOLVED_STATUS_SET.has(t.status)).length;
  const overdue    = tickets.filter(isOverdue);

  // Client-side filter según el tab activo
  const filtered = tickets.filter(t => {
    if (filter === 'activos')   return ACTIVE_STATUS_SET.has(t.status);
    if (filter === 'resueltos') return RESOLVED_STATUS_SET.has(t.status);
    return t.status === filter;
  });
  const display = filtered.slice(0, 100);

  const subtitle = subUserName
    ? 'Tus solicitudes asignadas.'
    : 'Solicitudes de tu equipo, ordenadas por urgencia.';

  return (
    <div className="flex flex-col gap-4" id="of-helpdesk">

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <Siren size={14} className="shrink-0 animate-pulse" style={{ color: '#ef4444' }} />
          <p className="text-[13px] font-medium" style={{ color: '#b91c1c' }}>
            {overdue.length === 1
              ? `1 solicitud requiere atención inmediata (${overdue[0].folio})`
              : `${overdue.length} solicitudes requieren atención inmediata`}
          </p>
        </div>
      )}

      {/* Stats, owner only */}
      {!subUserName && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Pendientes',  value: pendientes, color: '#3b82f6' },
            { label: 'En atención', value: enAtencion, color: '#6C3BFF' },
            { label: 'Críticos',    value: criticos,   color: '#ef4444' },
            { label: 'Resueltos',   value: resueltos,  color: '#22c55e' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-3 text-center"
              style={{
                background: '#ffffff',
                border: '1px solid #E8E3F5',
                boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
              }}>
              <div className="text-xl font-bold tabular-nums" style={{ color: s.value > 0 ? s.color : '#9B8FB5' }}>{s.value}</div>
              <div className="text-[11px] mt-0.5" style={{ color: '#6B6480' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Surface único */}
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: '#ffffff',
          border:     '1px solid #E8E3F5',
          boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                Solicitudes
              </h2>
              {tickets.length > 0 && (
                <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                  {tickets.length}
                </span>
              )}
            </div>
            <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>{subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
              style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
              <Plus size={12} /> Registrar solicitud
            </button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="px-5 py-2.5 flex items-center gap-1.5 flex-wrap"
          style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
          {FILTERS.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
              style={{
                background: filter === s ? '#6C3BFF' : '#ffffff',
                color:      filter === s ? '#fff' : '#6B6480',
                border:     '1px solid ' + (filter === s ? '#6C3BFF' : '#E8E3F5'),
              }}>
              {FILTER_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="px-5 py-4 flex flex-col gap-3"
            style={{ borderTop: '1px solid #F0EDF9', background: 'rgba(108,59,255,0.04)' }}>
            <input value={newTitulo} onChange={e => setNewTitulo(e.target.value)}
              placeholder="Título de la solicitud *"
              className="w-full px-3 py-2 rounded-lg text-[13px]"
              style={inputStyle} />
            <div className="grid grid-cols-2 gap-2">
              <Select value={newCat} onValueChange={setNewCat}>
                <SelectTrigger className="text-[12px]" style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={newPri} onValueChange={setNewPri}>
                <SelectTrigger className="text-[12px]" style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
              placeholder="Descripción (opcional)"
              className="w-full px-3 py-2 rounded-lg text-[12px] resize-none"
              style={inputStyle} />
            <input value={newAsig} onChange={e => setNewAsig(e.target.value)}
              placeholder="Asignar a (opcional)"
              className="w-full px-3 py-2 rounded-lg text-[12px]"
              style={inputStyle} />
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving || !newTitulo.trim()}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                {saving ? 'Guardando...' : 'Crear'}
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg text-[12px] transition-opacity hover:opacity-70"
                style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Ticket list */}
        {loading ? (
          <div className="text-center py-8 text-[13px]" style={{ color: '#9B8FB5', borderTop: '1px solid #F0EDF9' }}>Cargando...</div>
        ) : display.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="Todo está bajo control"
            description={filter ? 'No hay solicitudes con este estado.' : 'No hay solicitudes pendientes en este momento.'}
          />
        ) : (
          <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
            {display.map((ticket, idx) => {
              const isOpen    = expandId === ticket.id;
              const catColor  = CAT_COLOR[ticket.categoria] ?? '#6b7280';
              const priColor  = PRI_COLOR[ticket.prioridad] ?? '#6b7280';
              const catLabel  = CAT_LABELS[ticket.categoria] ?? ticket.categoria;
              const priLabel  = PRI_LABELS[ticket.prioridad] ?? ticket.prioridad;
              const overdueTk = isOverdue(ticket);
              const isResolved = RESOLVED_STATUS_SET.has(ticket.status);
              const origin    = ticketOrigin(ticket);
              return (
                <div key={ticket.id}
                  style={{ borderBottom: idx === display.length - 1 ? 'none' : '1px solid #F0EDF9' }}>
                  <button
                    onClick={() => setExpandId(isOpen ? null : ticket.id)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FAFAFB]"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {overdueTk && (
                          <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#ef4444' }} />
                        )}
                        <span className="text-[10px] font-mono" style={{ color: '#9B8FB5' }}>{ticket.folio}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: `${catColor}15`, color: catColor, border: `1px solid ${catColor}30` }}>
                          {catLabel}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: `${priColor}15`, color: priColor, border: `1px solid ${priColor}30` }}>
                          {priLabel}
                        </span>
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                          style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                          {STA_ICON[ticket.status]} {STATUS_LABELS[ticket.status] ?? ticket.status.replace('_',' ')}
                        </span>
                      </div>
                      <p className="text-[13px] font-medium truncate" style={{ color: '#1A0A3B' }}>{ticket.titulo}</p>
                      <div className="flex items-center gap-3 flex-wrap mt-0.5">
                        <span className="text-[11px] flex items-center gap-1" style={{ color: '#6B6480' }}>
                          {origin.icon}{origin.label}
                        </span>
                        {ticket.asignado_a && (
                          <span className="text-[11px]" style={{ color: '#6B6480' }}>
                            · Asignado a <strong style={{ color: '#1A0A3B' }}>{ticket.asignado_a}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isResolved && (
                        <button
                          onClick={e => { e.stopPropagation(); updateTicket(ticket.id, { status: 'abierto', resolucion: null }); }}
                          title="Reabrir ticket"
                          className="flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-80"
                          style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                          <RotateCcw size={11} /> Reabrir
                        </button>
                      )}
                      <div style={{ color: '#9B8FB5' }}>
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 flex flex-col gap-4"
                      style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
                      {ticket.descripcion && (
                        <p className="text-[12px] pt-3" style={{ color: '#1A0A3B' }}>{ticket.descripcion}</p>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <div>
                          <label className="block text-[11px] mb-1 font-medium" style={{ color: '#6B6480' }}>Estatus</label>
                          <Select value={ticket.status} onValueChange={v => updateTicket(ticket.id, { status: v })}>
                            <SelectTrigger className="w-auto py-1 px-2 text-[12px]" style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s.replace('_',' ')}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="block text-[11px] mb-1 font-medium" style={{ color: '#6B6480' }}>Asignado a</label>
                          <input defaultValue={ticket.asignado_a ?? ''} placeholder="Nombre"
                            onBlur={e => updateTicket(ticket.id, { asignado_a: e.target.value || null })}
                            className="px-2 py-1 rounded-lg text-[12px] w-36"
                            style={inputStyle} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] mb-1 font-medium" style={{ color: '#6B6480' }}>Notas de resolución</label>
                        <textarea defaultValue={ticket.resolucion ?? ''} rows={2}
                          placeholder="¿Qué se hizo para resolverlo?"
                          onBlur={e => updateTicket(ticket.id, { resolucion: e.target.value || null })}
                          className="w-full px-2 py-1 rounded-lg text-[12px] resize-none"
                          style={inputStyle} />
                      </div>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
                          Creado {new Date(ticket.created_at).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                        </p>
                        {isResolved ? (
                          <button onClick={() => updateTicket(ticket.id, { status: 'abierto', resolucion: null })}
                            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80"
                            style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                            <RotateCcw size={12} /> Reabrir
                          </button>
                        ) : (
                          <button onClick={() => updateTicket(ticket.id, { status: 'resuelto' })}
                            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
                            style={{ background: '#22c55e', color: '#fff', boxShadow: '0 1px 2px rgba(34,197,94,0.24)' }}>
                            <CheckCircle size={12} /> Marcar como resuelto
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
