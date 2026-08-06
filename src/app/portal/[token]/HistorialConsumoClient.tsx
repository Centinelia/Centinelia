'use client';

import { useMemo, useState } from 'react';
import {
  RefreshCw, RotateCcw, Zap, CreditCard, Phone, SlidersHorizontal, BatteryCharging,
  Bot, Mail, FileText, Calendar, Search, ClipboardList, X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LedgerSource = 'renovacion' | 'rollover' | 'extra_compra' | 'activacion' | 'ajuste' | 'llamada' | 'auto_recarga';

export interface MinutesEntry {
  id:          string;
  date:        string;
  amount:      number;
  description: string;
  source:      LedgerSource;
  balance:     number;
}

export interface TaskEntry {
  id:            string;
  date:          string;             // completed_at o created_at
  title:         string;
  description:   string | null;
  agentName:     string | null;      // Nombre del empleado que ejecutó la tarea
  triggerType:   string | null;      // 'voice_call' | 'email' | 'schedule' | 'manual' | etc.
  status:        string;             // 'pending' | 'in_progress' | 'completed' | 'failed'
  goalMet:       boolean | null;
  sourceContext: string | null;
  opsUsed:       number;             // # de tareas (ai_ops) consumidas — típicamente current_iteration
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MIN_SOURCE_META: Record<LedgerSource, { iconKey: string; color: string; label: string }> = {
  renovacion:   { iconKey: 'refresh',  color: '#6C3BFF', label: 'Renovación' },
  rollover:     { iconKey: 'rotate',   color: '#a855f7', label: 'Rollover' },
  extra_compra: { iconKey: 'zap',      color: '#f59e0b', label: 'Compra extra' },
  activacion:   { iconKey: 'card',     color: '#3b82f6', label: 'Activación' },
  ajuste:       { iconKey: 'sliders',  color: '#22c55e', label: 'Ajuste' },
  llamada:      { iconKey: 'phone',    color: '#6b7280', label: 'Llamada' },
  auto_recarga: { iconKey: 'battery',  color: '#6C3BFF', label: 'Auto-recarga' },
};

const TRIGGER_META: Record<string, { iconKey: string; color: string; label: string }> = {
  voice_call:      { iconKey: 'phone',       color: '#6C3BFF', label: 'Desde llamada' },
  email:           { iconKey: 'mail',        color: '#3b82f6', label: 'Desde correo' },
  inbox:           { iconKey: 'mail',        color: '#3b82f6', label: 'Desde bandeja' },
  schedule:        { iconKey: 'calendar',    color: '#a855f7', label: 'Programada' },
  scheduled:       { iconKey: 'calendar',    color: '#a855f7', label: 'Programada' },
  manual:          { iconKey: 'clipboard',   color: '#22c55e', label: 'Manual' },
  chat:            { iconKey: 'clipboard',   color: '#22c55e', label: 'Desde chat' },
  delegation:      { iconKey: 'bot',         color: '#0d9488', label: 'Delegación entre empleados' },
  research:        { iconKey: 'search',      color: '#f59e0b', label: 'Investigación' },
  document:        { iconKey: 'doc',         color: '#06b6d4', label: 'Documento' },
};

function renderIcon(iconKey: string) {
  switch (iconKey) {
    case 'refresh':   return <RefreshCw size={11} />;
    case 'rotate':    return <RotateCcw size={11} />;
    case 'zap':       return <Zap size={11} />;
    case 'card':      return <CreditCard size={11} />;
    case 'sliders':   return <SlidersHorizontal size={11} />;
    case 'phone':     return <Phone size={11} />;
    case 'battery':   return <BatteryCharging size={11} />;
    case 'bot':       return <Bot size={11} />;
    case 'mail':      return <Mail size={11} />;
    case 'calendar':  return <Calendar size={11} />;
    case 'search':    return <Search size={11} />;
    case 'doc':       return <FileText size={11} />;
    case 'clipboard': return <ClipboardList size={11} />;
    default:          return null;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
function fmtMonth(iso: string) {
  const s = new Date(iso).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HistorialConsumoClient({
  minutes,
  tasks,
  callerNames = {},
}: {
  minutes:      MinutesEntry[];
  tasks:        TaskEntry[];
  callerNames?: Record<string, string>;
}) {
  const [tab, setTab] = useState<'minutos' | 'tareas'>('minutos');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate,   setToDate]   = useState<string>('');

  const filteredMinutes = useMemo(() => filterByDate(minutes, fromDate, toDate), [minutes, fromDate, toDate]);
  const filteredTasks   = useMemo(() => filterByDate(tasks,   fromDate, toDate), [tasks,   fromDate, toDate]);
  const active = tab === 'minutos' ? filteredMinutes : filteredTasks;
  const total  = tab === 'minutos' ? minutes.length  : tasks.length;

  const clearFilters = () => { setFromDate(''); setToDate(''); };
  const hasFilters = !!(fromDate || toDate);

  return (
    <div className="flex flex-col">

      {/* Toggle Minutos / Tareas — centrado */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg"
          style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)' }}>
          {(['minutos', 'tareas'] as const).map(t => {
            const activeTab = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-5 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: activeTab ? '#6C3BFF' : 'transparent',
                  color:      activeTab ? '#fff'    : 'var(--c-text-3)',
                  boxShadow:  activeTab ? '0 2px 8px rgba(108,59,255,0.25)' : 'none',
                }}>
                {t === 'minutos' ? 'Minutos' : 'Tareas'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date filter — sticky */}
      <div className="mb-3 pb-3 sticky top-0 z-10"
        style={{ borderBottom: '1px solid var(--c-divider)', background: 'var(--c-surface)' }}>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-4)' }}>Desde</span>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-md w-full"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-4)' }}>Hasta</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-md w-full"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            />
          </div>
        </div>
        {hasFilters && (
          <div className="flex items-center justify-between">
            <span className="text-xs tabular-nums" style={{ color: 'var(--c-text-4)' }}>
              {active.length} de {total} {tab === 'minutos' ? 'movimientos' : 'tareas'}
            </span>
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-opacity hover:opacity-80"
              style={{ color: 'var(--c-text-3)' }}
            >
              <X size={11} /> Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {active.length === 0 ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--c-text-3)' }}>
          {hasFilters ? `Sin ${tab === 'minutos' ? 'movimientos' : 'tareas'} en este rango` : `Sin ${tab === 'minutos' ? 'movimientos' : 'tareas'} registrados`}
        </p>
      ) : tab === 'minutos' ? (
        <MinutesList entries={filteredMinutes} callerNames={callerNames} />
      ) : (
        <TasksList entries={filteredTasks} />
      )}
    </div>
  );
}

// ─── Sub-lists ────────────────────────────────────────────────────────────────

function MinutesList({ entries, callerNames }: { entries: MinutesEntry[]; callerNames: Record<string, string> }) {
  const groups = groupByMonth(entries);
  return (
    <>
      {Array.from(groups.entries()).map(([month, rows]) => (
        <div key={month} className="flex flex-col">
          <div className="text-xs font-semibold py-2" style={{ color: 'var(--c-text-4)' }}>{month}</div>
          {rows.map((e, i) => {
            const meta = MIN_SOURCE_META[e.source] ?? MIN_SOURCE_META.ajuste;
            const isCredit = e.amount > 0;
            return (
              <div key={e.id + i} className="flex items-center gap-2.5 py-2"
                style={{ borderTop: '1px solid var(--c-divider)' }}>
                <div className="flex-shrink-0 flex items-center justify-center rounded-full w-6 h-6"
                  style={{ background: `${meta.color}18`, color: meta.color }}>
                  {renderIcon(meta.iconKey)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug truncate" style={{ color: 'var(--c-text)' }}>
                    {e.description}
                  </p>
                  {e.source === 'llamada' && (() => {
                    const raw = e.description.split(' · ')[0];
                    const name = callerNames[raw.replace(/\D/g, '')];
                    return name ? <p className="text-xs leading-none mt-0.5" style={{ color: '#9B6DFF' }}>{name}</p> : null;
                  })()}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                    {fmtDate(e.date)} · {fmtTime(e.date)}
                  </p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-xs font-bold tabular-nums"
                    style={{ color: isCredit ? '#22c55e' : 'var(--c-text-2)' }}>
                    {isCredit ? '+' : ''}{e.amount} min
                  </span>
                  <span className="text-xs tabular-nums mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                    saldo {e.balance}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function TasksList({ entries }: { entries: TaskEntry[] }) {
  const groups = groupByMonth(entries);
  return (
    <>
      {Array.from(groups.entries()).map(([month, rows]) => (
        <div key={month} className="flex flex-col">
          <div className="text-xs font-semibold py-2" style={{ color: 'var(--c-text-4)' }}>{month}</div>
          {rows.map((e, i) => {
            const meta = TRIGGER_META[e.triggerType ?? 'manual'] ?? TRIGGER_META.manual;
            const failed  = e.status === 'failed' || e.goalMet === false;
            return (
              <div key={e.id + i} className="flex items-center gap-2.5 py-2"
                style={{ borderTop: '1px solid var(--c-divider)' }}>
                <div className="flex-shrink-0 flex items-center justify-center rounded-full w-6 h-6"
                  style={{ background: `${meta.color}18`, color: meta.color }}>
                  {renderIcon(meta.iconKey)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug truncate" style={{ color: 'var(--c-text)' }}>
                    {meta.label}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {e.agentName && (
                      <span className="text-[11px]" style={{ color: '#9B6DFF' }}>
                        {e.agentName}
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                      {fmtDate(e.date)} · {fmtTime(e.date)}
                    </span>
                    {failed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        Falló
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--c-text-2)' }}>
                    −{e.opsUsed}
                  </span>
                  <span className="text-[10px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                    {e.opsUsed === 1 ? 'tarea' : 'tareas'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterByDate<T extends { date: string }>(items: T[], from: string, to: string): T[] {
  if (!from && !to) return items;
  const fromTs = from ? new Date(from + 'T00:00:00').getTime() : -Infinity;
  const toTs   = to   ? new Date(to   + 'T23:59:59').getTime() :  Infinity;
  return items.filter(e => {
    const t = new Date(e.date).getTime();
    return t >= fromTs && t <= toTs;
  });
}

function groupByMonth<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const e of items) {
    const key = fmtMonth(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return groups;
}
