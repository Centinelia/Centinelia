'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Phone, UserPlus, CalendarDays, ShoppingBag,
  Ticket, AlertTriangle, FileText, PieChart, RefreshCw,
  ArrowRightLeft, Mail,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ActivityEvent, EventType } from '@/app/api/portal/[token]/actividad/route';

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<EventType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  llamada:    { label: 'Llamada',    icon: Phone,           color: '#6C3BFF', bg: 'rgba(108,59,255,0.12)' },
  lead:       { label: 'Lead',       icon: UserPlus,        color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  cita:       { label: 'Cita',       icon: CalendarDays,    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  pedido:     { label: 'Pedido',     icon: ShoppingBag,     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  ticket:     { label: 'Ticket IT',  icon: Ticket,          color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
  incidente:  { label: 'Incidente',  icon: AlertTriangle,   color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  reporte:    { label: 'Reporte',    icon: FileText,        color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  encuesta:   { label: 'Encuesta',   icon: PieChart,        color: '#9B6DFF', bg: 'rgba(155,109,255,0.12)'},
  delegacion: { label: 'Delegación', icon: ArrowRightLeft,  color: '#14b8a6', bg: 'rgba(20,184,166,0.12)' },
  correo:     { label: 'Correo',     icon: Mail,            color: '#64748b', bg: 'rgba(100,116,139,0.12)'},
};

const DAYS_OPTIONS = [
  { value: 1,  label: 'Hoy'        },
  { value: 7,  label: '7 días'     },
  { value: 30, label: '30 días'    },
  { value: 90, label: '90 días'    },
];

const EVENT_TYPES: EventType[] = ['llamada', 'lead', 'cita', 'pedido', 'ticket', 'incidente', 'reporte', 'encuesta', 'delegacion', 'correo'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7)    return `hace ${diffD}d`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: ActivityEvent }) {
  const cfg  = TYPE_CFG[event.type];
  const Icon = cfg.icon;

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--c-surface-2)]"
      style={{ borderBottom: '1px solid var(--c-border)' }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: cfg.bg }}
      >
        <Icon size={14} style={{ color: cfg.color }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.label}
            </span>
            <span className="text-xs font-medium truncate max-w-[260px]" style={{ color: 'var(--c-text)' }}>
              {event.title}
            </span>
          </div>
          <span className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--c-text-4)' }}>
            {fmtTime(event.created_at)}
          </span>
        </div>
        {event.subtitle && (
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-3)' }}>
            {event.subtitle}
          </p>
        )}
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>
          {event.agent_name}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActividadFeed({ token }: { token: string }) {
  const [events,   setEvents]   = useState<ActivityEvent[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [days,     setDays]     = useState(7);
  const [type,     setType]     = useState<EventType | 'all'>('all');
  const [limit,    setLimit]    = useState(60);

  const load = useCallback(async (d: number, t: string, l: number) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/actividad?days=${d}&type=${t}&limit=${l}`);
      const data = await res.json() as { events: ActivityEvent[]; total: number };
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
    } catch {
      // leave existing events visible, just stop the spinner
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(days, type, limit); }, [load, days, type, limit]);

  // 'all' total comes from the server; per-type counts are only reliable
  // when that type is the active filter (where total = that type's count).
  const counts: Partial<Record<EventType | 'all', number>> = { all: total };
  if (type !== 'all') counts[type as EventType] = total;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--c-text)' }}>
            Registro de actividades
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {total} evento{total !== 1 ? 's' : ''} en los últimos {days === 1 ? 'hoy' : `${days} días`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Days selector */}
          <Select
            value={String(days)}
            onValueChange={v => { setDays(Number(v)); setLimit(60); }}
          >
            <SelectTrigger className="w-auto py-1.5 px-3 text-xs bg-[color:var(--c-surface-2)] border-[color:var(--c-border)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => load(days, type, limit)}
            disabled={loading}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)', cursor: 'pointer' }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Type filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', ...EVENT_TYPES] as (EventType | 'all')[]).map(t => {
          const cfg    = t === 'all' ? null : TYPE_CFG[t];
          const active = type === t;
          const count  = counts[t] ?? 0;
          return (
            <button
              key={t}
              onClick={() => { setType(t); setLimit(60); }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
              style={{
                background: active ? (cfg?.bg ?? 'rgba(108,59,255,0.12)') : 'var(--c-surface-2)',
                border:     `1px solid ${active ? (cfg?.color ?? '#6C3BFF') + '60' : 'var(--c-border)'}`,
                color:      active ? (cfg?.color ?? '#9B6DFF') : 'var(--c-text-3)',
                cursor:     'pointer',
              }}
            >
              {t === 'all' ? 'Todos' : cfg!.label}
              {count > 0 && (
                <span className="tabular-nums" style={{ opacity: 0.7 }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--c-border-2)', background: 'var(--c-surface)' }}
      >
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm" style={{ color: 'var(--c-text-4)' }}>Cargando actividad...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-sm font-medium" style={{ color: 'var(--c-text-3)' }}>Sin actividad en este período</p>
            <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Prueba ampliar el rango de fechas</p>
          </div>
        ) : (
          <>
            {events.map(ev => <EventCard key={ev.id} event={ev} />)}

            {total > events.length && (
              <div className="px-4 py-3 flex justify-center" style={{ borderTop: '1px solid var(--c-border)' }}>
                <button
                  onClick={() => setLimit(l => l + 60)}
                  disabled={loading}
                  className="text-xs font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-70"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', cursor: 'pointer' }}
                >
                  {loading ? 'Cargando...' : `Ver más (${total - events.length} restantes)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
