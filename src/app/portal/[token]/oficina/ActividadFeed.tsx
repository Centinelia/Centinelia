'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Phone, UserPlus, CalendarDays, ShoppingBag,
  Ticket, AlertTriangle, FileText, PieChart, RefreshCw,
  ArrowRightLeft, Mail, Activity,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
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

// ── Event row (con divider) ───────────────────────────────────────────────────

function EventRow({ event, isLast }: { event: ActivityEvent; isLast: boolean }) {
  const cfg  = TYPE_CFG[event.type];
  const Icon = cfg.icon;

  return (
    <div
      className="flex items-start gap-3 px-5 py-4 transition-colors"
      style={{
        borderBottom: isLast ? 'none' : '1px solid #F0EDF9',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#FAFAFB'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
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
            <span className="text-xs font-medium truncate max-w-[260px]" style={{ color: '#1A0A3B' }}>
              {event.title}
            </span>
          </div>
          <span className="text-[10px] shrink-0 tabular-nums" style={{ color: '#9B8FB5' }}>
            {fmtTime(event.created_at)}
          </span>
        </div>
        {event.subtitle && (
          <p className="text-xs mt-0.5 truncate" style={{ color: '#6B6480' }}>
            {event.subtitle}
          </p>
        )}
        <p className="text-[10px] mt-0.5" style={{ color: '#9B8FB5' }}>
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
  // Feed inicial capado en 15 para evitar scroll infinito en el dashboard.
  // El usuario puede pedir 'Ver más' (+15 cada click) para cargar más.
  const [limit,    setLimit]    = useState(15);

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(days, type, limit); }, [load, days, type, limit]);

  // 'all' total comes from the server; per-type counts are only reliable
  // when that type is the active filter (where total = that type's count).
  const counts: Partial<Record<EventType | 'all', number>> = { all: total };
  if (type !== 'all') counts[type as EventType] = total;

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border: '1px solid #E8E3F5',
        boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Registro de actividades
            </h2>
            {total > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {total}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            {total} evento{total !== 1 ? 's' : ''} en {days === 1 ? 'hoy' : `los últimos ${days} días`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Select
            value={String(days)}
            onValueChange={v => { setDays(Number(v)); setLimit(15); }}
          >
            <SelectTrigger
              className="w-auto rounded-lg h-8 text-[12px]"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}
            >
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
            style={{
              background: '#FAFAFB',
              border: '1px solid #E8E3F5',
              color: '#6B6480',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Type filter chips */}
      <div className="px-5 pb-4 flex gap-1.5 flex-wrap">
        {(['all', ...EVENT_TYPES] as (EventType | 'all')[]).map(t => {
          const cfg    = t === 'all' ? null : TYPE_CFG[t];
          const active = type === t;
          const count  = counts[t] ?? 0;
          return (
            <button
              key={t}
              onClick={() => { setType(t); setLimit(15); }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
              style={{
                background: active ? (cfg?.bg ?? 'rgba(108,59,255,0.12)') : '#FAFAFB',
                border:     `1px solid ${active ? (cfg?.color ?? '#6C3BFF') + '60' : '#E8E3F5'}`,
                color:      active ? (cfg?.color ?? '#6C3BFF') : '#6B6480',
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
      {loading && events.length === 0 ? (
        <div
          className="flex items-center justify-center py-12"
          style={{ borderTop: '1px solid #F0EDF9' }}
        >
          <p className="text-sm" style={{ color: '#9B8FB5' }}>Cargando actividad...</p>
        </div>
      ) : events.length === 0 ? (
        <div style={{ borderTop: '1px solid #F0EDF9' }}>
          <EmptyState
            icon={Activity}
            title="Sin actividad en este período"
            description="Prueba ampliar el rango de fechas"
          />
        </div>
      ) : (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {events.map((ev, idx) => {
            const hasMore = total > events.length;
            const isLast = idx === events.length - 1 && !hasMore;
            return <EventRow key={ev.id} event={ev} isLast={isLast} />;
          })}

          {total > events.length && (
            <div
              className="px-5 py-3 flex justify-center"
              style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
            >
              <button
                onClick={() => setLimit(l => l + 15)}
                disabled={loading}
                className="text-[12px] font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-70"
                style={{
                  background: '#ffffff',
                  border: '1px solid #E8E3F5',
                  color: '#6B6480',
                  cursor: 'pointer',
                }}
              >
                {loading ? 'Cargando...' : `Ver más (${total - events.length} restantes)`}
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
