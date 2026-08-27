'use client';

import { useMemo, useState } from 'react';
import { Phone, PhoneCall, X, CalendarClock, Check, AlertCircle, Loader2, ChevronDown, ChevronRight, Clock, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import type { SeguimientoRow } from './loadSeguimientosData';

type ActionState = null | { id: string; kind: 'llamar' | 'cancelar' | 'reprogramar' };

const SOURCE_LABEL: Record<string, string> = {
  auto_pedido_followup: 'Seguimiento de pedido',
  missed_call:          'Devolver llamada perdida',
  manual:               'Manual',
  csv:                  'CSV',
  llamada_entrante:     'Detectado en llamada',
  agent_escalation:     'Escalación del empleado',
};

function formatWhen(iso: string | null): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } {
  if (!iso) return { label: 'Sin fecha', tone: 'later' };
  const now  = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = then - now;

  if (diffMs < 0) {
    const overdueHours = Math.floor(-diffMs / 3600_000);
    if (overdueHours < 24) return { label: `Vencido hace ${overdueHours}h`, tone: 'overdue' };
    return { label: `Vencido hace ${Math.floor(overdueHours / 24)}d`, tone: 'overdue' };
  }

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return { label: `En ${diffMin} min`, tone: 'today' };

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return { label: `En ${diffHours}h`, tone: 'today' };

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return { label: 'Mañana', tone: 'soon' };
  if (diffDays <= 3)  return { label: `En ${diffDays} días`, tone: 'soon' };
  return { label: `En ${diffDays} días`, tone: 'later' };
}

function formatAbs(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const TONE_STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  overdue: { bg: 'rgba(239,68,68,0.1)',   fg: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  today:   { bg: 'rgba(6,182,212,0.1)',   fg: '#0e7490', border: 'rgba(6,182,212,0.3)' },
  soon:    { bg: 'rgba(245,158,11,0.1)',  fg: '#b45309', border: 'rgba(245,158,11,0.3)' },
  later:   { bg: '#F4F1FA',               fg: '#6B6480', border: '#E8E3F5'             },
};

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completada',
  calling:   'En llamada',
  failed:    'Fallida',
  canceled:  'Cancelada',
};
const STATUS_TONE: Record<string, string> = {
  completed: '#16a34a',
  calling:   '#6C3BFF',
  failed:    '#dc2626',
  canceled:  '#9B8FB5',
};

export default function SeguimientosClient({
  token,
  initialPending,
  initialHistorial,
  agents,
}: {
  token:            string;
  initialPending:   SeguimientoRow[];
  initialHistorial: SeguimientoRow[];
  agents:           Array<{ id: string; agent_name: string | null; business_name: string }>;
}) {
  const [pending,     setPending]     = useState(initialPending);
  const [historial,   setHistorial]   = useState(initialHistorial);
  const [busy,        setBusy]        = useState<ActionState>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [notice,      setNotice]      = useState<string | null>(null);
  const [reprogramId, setReprogramId] = useState<string | null>(null);
  const [reprogramTo, setReprogramTo] = useState<string>('');
  const [historyOpen, setHistoryOpen] = useState(false);

  // Agrupamos visualmente: Vencidos → Hoy → Próximos 3d → Después.
  const grouped = useMemo(() => {
    const buckets: Record<string, SeguimientoRow[]> = { overdue: [], today: [], soon: [], later: [] };
    for (const row of pending) {
      const t = formatWhen(row.scheduled_at).tone;
      buckets[t].push(row);
    }
    return buckets;
  }, [pending]);

  const employeeLabel = (agentId: string) => {
    const a = agents.find(x => x.id === agentId);
    if (!a) return 'Empleado';
    return a.agent_name || a.business_name || 'Empleado';
  };

  async function callNow(row: SeguimientoRow) {
    setBusy({ id: row.id, kind: 'llamar' });
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/portal/${token}/salientes/llamar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contactIds: [row.id], agentId: row.agent_id }),
      });
      const data = await res.json() as { ok?: boolean; triggered?: number; failed?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'No se pudo iniciar la llamada');
      // Optimistic: sacamos de pending, agregamos a historial como 'calling'.
      setPending(prev => prev.filter(r => r.id !== row.id));
      setHistorial(prev => [{ ...row, status: 'calling', scheduled_at: new Date().toISOString() }, ...prev]);
      setNotice(`Llamando a ${row.nombre ?? row.telefono}…`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancel(row: SeguimientoRow) {
    setBusy({ id: row.id, kind: 'cancelar' });
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts/${row.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'canceled' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'No se pudo cancelar');
      }
      setPending(prev => prev.filter(r => r.id !== row.id));
      setHistorial(prev => [{ ...row, status: 'canceled' }, ...prev]);
      setNotice('Seguimiento cancelado');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reprogram(row: SeguimientoRow) {
    if (!reprogramTo) { setError('Elige una fecha'); return; }
    setBusy({ id: row.id, kind: 'reprogramar' });
    setError(null);
    setNotice(null);
    try {
      const iso = new Date(reprogramTo).toISOString();
      const res = await fetch(`/api/portal/${token}/salientes/contacts/${row.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scheduled_at: iso }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'No se pudo reprogramar');
      }
      setPending(prev => {
        const updated = prev.map(r => r.id === row.id ? { ...r, scheduled_at: iso } : r);
        // re-sort ascending por scheduled_at
        return [...updated].sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''));
      });
      setReprogramId(null);
      setReprogramTo('');
      setNotice('Fecha actualizada');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function startReprogram(row: SeguimientoRow) {
    setReprogramId(row.id);
    // Default: +3 días desde ahora, formato datetime-local.
    const d = new Date(Date.now() + 3 * 86400_000);
    d.setSeconds(0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    setReprogramTo(local);
  }

  const totalPending = pending.length;

  return (
    <div className="flex flex-col gap-4">
      {(error || notice) && (
        <div
          className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{
            background: error ? 'rgba(239,68,68,0.08)' : 'rgba(22,163,74,0.08)',
            color:      error ? '#dc2626' : '#15803d',
            border:     `1px solid ${error ? 'rgba(239,68,68,0.25)' : 'rgba(22,163,74,0.25)'}`,
          }}
        >
          {error ? <AlertCircle size={12} /> : <Check size={12} />}
          <span>{error ?? notice}</span>
        </div>
      )}

      {totalPending === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: '#FAFAFB', border: '1px dashed #E8E3F5' }}
        >
          <CalendarClock size={20} style={{ color: '#9B8FB5', margin: '0 auto 8px' }} />
          <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Nada agendado por ahora</p>
          <p className="text-xs mt-1" style={{ color: '#6B6480' }}>
            Aquí aparecen las llamadas de vuelta que tus empleados agenden después de un pedido, una cotización, una consulta u otra conversación con seguimiento pendiente.
          </p>
        </div>
      ) : (
        <>
          <BucketSection title="Vencidos"         rows={grouped.overdue} />
          <BucketSection title="Hoy"              rows={grouped.today}   />
          <BucketSection title="Próximos 3 días"  rows={grouped.soon}    />
          <BucketSection title="Más adelante"     rows={grouped.later}   />
        </>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid #E8E3F5', background: '#ffffff' }}>
          <button
            type="button"
            onClick={() => setHistoryOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold transition-colors hover:bg-[#FAFAFB]"
            style={{ color: '#1A0A3B', cursor: 'pointer', background: 'transparent', border: 'none' }}
          >
            <span className="flex items-center gap-2">
              {historyOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Historial de los últimos 30 días ({historial.length})
            </span>
          </button>
          {historyOpen && (
            <div className="flex flex-col gap-2 p-3" style={{ borderTop: '1px solid #F1EDF9' }}>
              {historial.map(row => (
                <div
                  key={row.id}
                  className="rounded-lg px-3 py-2 flex items-center justify-between gap-3"
                  style={{ background: '#FAFAFB', border: '1px solid #F1EDF9' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold truncate" style={{ color: '#1A0A3B' }}>
                        {row.nombre ?? 'Sin nombre'}
                      </span>
                      <span className="text-[10px]" style={{ color: '#9B8FB5' }}>
                        {row.telefono}
                      </span>
                    </div>
                    {row.motivo && (
                      <p className="text-[10px] truncate" style={{ color: '#6B6480' }}>
                        {row.motivo}
                      </p>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: `${STATUS_TONE[row.status] ?? '#9B8FB5'}15`,
                      color:      STATUS_TONE[row.status] ?? '#9B8FB5',
                    }}
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  <span className="text-[10px] whitespace-nowrap" style={{ color: '#9B8FB5' }}>
                    {formatAbs(row.scheduled_at ?? row.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  function BucketSection({ title, rows }: { title: string; rows: SeguimientoRow[] }) {
    if (rows.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B8FB5' }}>
          {title} · {rows.length}
        </p>
        {rows.map(row => {
          const w    = formatWhen(row.scheduled_at);
          const tone = TONE_STYLES[w.tone];
          const isBusy = busy?.id === row.id;
          const isReprogramming = reprogramId === row.id;

          return (
            <div
              key={row.id}
              className="rounded-xl p-3 flex flex-col gap-2"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-bold" style={{ color: '#1A0A3B' }}>
                      {row.nombre ?? 'Sin nombre'}
                    </span>
                    <span className="text-xs flex items-center gap-1" style={{ color: '#6B6480' }}>
                      <Phone size={10} /> {row.telefono}
                    </span>
                    {row.source && SOURCE_LABEL[row.source] && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}
                      >
                        {SOURCE_LABEL[row.source]}
                      </span>
                    )}
                    {row.escalated_to_name && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1"
                        style={{ background: 'rgba(220,38,38,0.08)', color: '#b91c1c' }}
                        title={`Escalación disparada al encargado: ${row.escalated_to_name}`}
                      >
                        <ArrowUpRight size={9} /> Escaló a {row.escalated_to_name}
                      </span>
                    )}
                    {row.escalated_from_name && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1"
                        style={{ background: 'rgba(34,197,94,0.08)', color: '#15803d' }}
                        title={`Escalación originada por el cliente: ${row.escalated_from_name}`}
                      >
                        <ArrowDownLeft size={9} /> Por reporte de {row.escalated_from_name}
                      </span>
                    )}
                  </div>
                  {row.motivo && (
                    <p className="text-xs leading-snug" style={{ color: '#6B6480' }}>
                      {row.motivo}
                    </p>
                  )}
                  <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#9B8FB5' }}>
                    <Clock size={9} /> Llamará {employeeLabel(row.agent_id)}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className="text-[11px] font-bold px-2 py-1 rounded-full"
                    style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
                  >
                    {w.label}
                  </span>
                  <span className="text-[10px]" style={{ color: '#9B8FB5' }}>
                    {formatAbs(row.scheduled_at)}
                  </span>
                </div>
              </div>

              {isReprogramming ? (
                <div
                  className="flex items-center gap-2 p-2 rounded-lg"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
                >
                  <input
                    type="datetime-local"
                    value={reprogramTo}
                    onChange={e => setReprogramTo(e.target.value)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none', flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => reprogram(row)}
                    disabled={isBusy}
                    className="text-xs px-3 py-1 rounded font-semibold transition-opacity hover:opacity-90"
                    style={{ background: '#6C3BFF', color: '#ffffff', border: 'none', cursor: isBusy ? 'wait' : 'pointer' }}
                  >
                    {isBusy && busy?.kind === 'reprogramar' ? <Loader2 size={11} className="animate-spin" /> : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setReprogramId(null); setReprogramTo(''); }}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: 'transparent', color: '#6B6480', border: 'none', cursor: 'pointer' }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ActionButton
                    icon={PhoneCall}
                    label="Llamar ahora"
                    onClick={() => callNow(row)}
                    loading={isBusy && busy?.kind === 'llamar'}
                    primary
                  />
                  <ActionButton
                    icon={CalendarClock}
                    label="Reprogramar"
                    onClick={() => startReprogram(row)}
                    loading={false}
                  />
                  <ActionButton
                    icon={X}
                    label="Cancelar"
                    onClick={() => cancel(row)}
                    loading={isBusy && busy?.kind === 'cancelar'}
                    danger
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  loading,
  primary,
  danger,
}: {
  icon:     React.ElementType;
  label:    string;
  onClick:  () => void;
  loading:  boolean;
  primary?: boolean;
  danger?:  boolean;
}) {
  const styles = primary
    ? { background: '#6C3BFF',            color: '#ffffff', border: 'none' }
    : danger
      ? { background: 'transparent',      color: '#dc2626', border: '1px solid rgba(239,68,68,0.25)' }
      : { background: '#FAFAFB',          color: '#1A0A3B', border: '1px solid #E8E3F5' };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ ...styles, cursor: loading ? 'wait' : 'pointer' }}
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
      {label}
    </button>
  );
}
