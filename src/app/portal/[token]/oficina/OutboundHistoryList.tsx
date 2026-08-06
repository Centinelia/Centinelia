'use client';

/**
 * OutboundHistoryList — historial de llamadas salientes ya realizadas.
 *
 * Analog de Entrantes pero para outbound. Cada row: contacto, agente,
 * outcome, duración, timestamp. Filtro por resultado (completadas,
 * sin respuesta, fallidas). Sin acciones — es solo historial.
 */

import { useState, useMemo } from 'react';
import { PhoneOutgoing, PhoneMissed, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export interface OutboundCallRow {
  id:            string;
  agent_id:      string;
  telefono:      string;
  nombre:        string | null;
  motivo:        string | null;
  status:        string; // calling | completed | no_answer | failed | pending
  called_at:     string;
  completed_at:  string | null;
  duration_sec:  number | null;
  ended_reason:  string | null;
  campaign_id:   string | null;
}

type Filter = 'todas' | 'completadas' | 'sin_respuesta' | 'fallidas';

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  completed:  { label: 'Completada',    color: '#22C55E', bg: 'rgba(34,197,94,0.10)',  icon: CheckCircle2 },
  calling:    { label: 'En curso',      color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', icon: Loader2 },
  no_answer:  { label: 'Sin respuesta', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', icon: PhoneMissed },
  failed:     { label: 'Falló',         color: '#EF4444', bg: 'rgba(239,68,68,0.10)',  icon: XCircle },
  pending:    { label: 'Pendiente',     color: '#6B6480', bg: '#F5F0FF',               icon: Clock },
};

function fmtWhen(iso: string): string {
  const d       = new Date(iso);
  const now     = new Date();
  const diffMs  = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `hace ${diffH}h`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  calls:         OutboundCallRow[];
  agentNameById: Record<string, string>;
}

export default function OutboundHistoryList({ calls, agentNameById }: Props) {
  const [filter, setFilter] = useState<Filter>('todas');

  const filtered = useMemo(() => {
    if (filter === 'todas') return calls;
    if (filter === 'completadas')   return calls.filter(c => c.status === 'completed');
    if (filter === 'sin_respuesta') return calls.filter(c => c.status === 'no_answer');
    if (filter === 'fallidas')      return calls.filter(c => c.status === 'failed');
    return calls;
  }, [calls, filter]);

  const counts = useMemo(() => ({
    todas:         calls.length,
    completadas:   calls.filter(c => c.status === 'completed').length,
    sin_respuesta: calls.filter(c => c.status === 'no_answer').length,
    fallidas:      calls.filter(c => c.status === 'failed').length,
  }), [calls]);

  const filterDefs: { key: Filter; label: string }[] = [
    { key: 'todas',         label: 'Todas' },
    { key: 'completadas',   label: 'Completadas' },
    { key: 'sin_respuesta', label: 'Sin respuesta' },
    { key: 'fallidas',      label: 'Fallidas' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {filterDefs.map(f => {
          const active = filter === f.key;
          const count  = counts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={{
                background: active ? '#1A0A3B' : '#ffffff',
                color:      active ? '#ffffff' : '#6B6480',
                border:     active ? '1px solid #1A0A3B' : '1px solid #E8E3F5',
              }}
            >
              {f.label}
              <span className="tabular-nums" style={{ opacity: 0.75 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
          <EmptyState
            icon={PhoneOutgoing}
            title={filter === 'todas' ? 'Sin llamadas salientes todavía' : 'Sin resultados con este filtro'}
            description={filter === 'todas'
              ? 'Cuando tu empleado empiece a marcar contactos, el historial aparecerá aquí.'
              : 'Cambia el filtro para ver otras llamadas.'}
            size="sm"
          />
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
          {filtered.map((c, i) => {
            const cfg = STATUS_CFG[c.status] ?? STATUS_CFG.pending;
            const Icon = cfg.icon;
            const agentName = agentNameById[c.agent_id] ?? 'Empleado';
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors"
                style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid #F0EBFA' : 'none',
                }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: cfg.bg }}
                >
                  <Icon
                    size={14}
                    style={{ color: cfg.color }}
                    className={c.status === 'calling' ? 'animate-spin' : ''}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>
                      {c.nombre || c.telefono}
                    </span>
                    {c.nombre && (
                      <span className="text-[12px] tabular-nums" style={{ color: '#9B8FB5' }}>
                        {c.telefono}
                      </span>
                    )}
                    {c.campaign_id && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(168,85,247,0.10)', color: '#A855F7' }}
                      >
                        Campaña
                      </span>
                    )}
                  </div>
                  {c.motivo && (
                    <p className="text-[12px] mt-0.5 truncate" style={{ color: '#6B6480' }}>
                      {c.motivo}
                    </p>
                  )}
                  <p className="text-[11px] mt-0.5" style={{ color: '#9B8FB5' }}>
                    {agentName} · {fmtWhen(c.called_at)}
                    {c.duration_sec !== null && c.status === 'completed' && (
                      <> · {fmtDuration(c.duration_sec)}</>
                    )}
                  </p>
                </div>

                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums shrink-0"
                  style={{ background: cfg.bg, color: cfg.color }}
                >
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
