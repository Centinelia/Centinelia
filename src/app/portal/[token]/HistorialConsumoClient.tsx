'use client';

import { useMemo, useState } from 'react';
import {
  RefreshCw, RotateCcw, Zap, CreditCard, Phone, PhoneIncoming, PhoneOutgoing, SlidersHorizontal, BatteryCharging,
  Bot, Mail, FileText, Calendar, Search, ClipboardList, X, TrendingDown, Undo2,
} from 'lucide-react';
import type { OpsLedgerEntry, OpsLedgerKind } from './OpsLedgerListClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LedgerSource = 'renovacion' | 'rollover' | 'extra_compra' | 'activacion' | 'ajuste' | 'llamada' | 'llamada_saliente' | 'auto_recarga' | 'plan_downgrade' | 'plan_upgrade' | 'refund' | 'dispute_chargeback' | 'invoice_voided' | 'reconciliacion' | 'backfill' | 'auto_pausado';

export interface MinutesEntry {
  id:          string;
  date:        string;
  amount:      number;
  description: string;
  source:      LedgerSource;
  balance:     number;
  /** Cuando true, el caller_number pertenece al dueño/equipo interno
   *  (transfer_number, transfer_whatsapp, o algún team_numbers entry).
   *  Renderiza chip "Interno" para distinguir prueba interna vs tráfico real. */
  isInternal?: boolean;
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
  renovacion:         { iconKey: 'refresh',        color: '#6C3BFF', label: 'Renovación' },
  rollover:           { iconKey: 'rotate',         color: '#a855f7', label: 'Rollover' },
  extra_compra:       { iconKey: 'zap',            color: '#f59e0b', label: 'Compra extra' },
  activacion:         { iconKey: 'card',           color: '#3b82f6', label: 'Activación' },
  ajuste:             { iconKey: 'sliders',        color: '#22c55e', label: 'Ajuste' },
  llamada:            { iconKey: 'phone_in',       color: '#3b82f6', label: 'Llamada entrante' },
  llamada_saliente:   { iconKey: 'phone_out',      color: '#f59e0b', label: 'Llamada saliente' },
  auto_recarga:       { iconKey: 'battery',        color: '#6C3BFF', label: 'Auto-recarga' },
  plan_downgrade:     { iconKey: 'rotate',         color: '#f59e0b', label: 'Downgrade de plan' },
  plan_upgrade:       { iconKey: 'zap',            color: '#22c55e', label: 'Upgrade de plan' },
  refund:             { iconKey: 'sliders',        color: '#22c55e', label: 'Reembolso' },
  dispute_chargeback: { iconKey: 'sliders',        color: '#dc2626', label: 'Chargeback' },
  invoice_voided:     { iconKey: 'sliders',        color: '#B45309', label: 'Factura anulada' },
  reconciliacion:     { iconKey: 'sliders',        color: '#6B7280', label: 'Reconciliación' },
  backfill:           { iconKey: 'card',           color: '#3b82f6', label: 'Backfill histórico' },
  auto_pausado:       { iconKey: 'x',              color: '#B45309', label: 'Empleado pausado (auto)' },
};

const TRIGGER_META: Record<string, { iconKey: string; color: string; label: string }> = {
  voice_call:      { iconKey: 'phone',       color: '#6C3BFF', label: 'Desde llamada' },
  email:           { iconKey: 'mail',        color: '#3b82f6', label: 'Desde correo' },
  inbox:           { iconKey: 'mail',        color: '#3b82f6', label: 'Desde bandeja' },
  schedule:        { iconKey: 'calendar',    color: '#a855f7', label: 'Programada' },
  scheduled:       { iconKey: 'calendar',    color: '#a855f7', label: 'Programada' },
  manual:          { iconKey: 'clipboard',   color: '#22c55e', label: 'Bajo demanda' },
  chat:            { iconKey: 'clipboard',   color: '#22c55e', label: 'Desde chat' },
  delegation:      { iconKey: 'bot',         color: '#0d9488', label: 'Delegación entre empleados' },
  research:        { iconKey: 'search',      color: '#f59e0b', label: 'Investigación' },
  document:        { iconKey: 'doc',         color: '#06b6d4', label: 'Documento' },
};

function renderIcon(iconKey: string, size = 14) {
  switch (iconKey) {
    case 'refresh':   return <RefreshCw size={size} />;
    case 'rotate':    return <RotateCcw size={size} />;
    case 'zap':       return <Zap size={size} />;
    case 'card':      return <CreditCard size={size} />;
    case 'sliders':   return <SlidersHorizontal size={size} />;
    case 'phone':     return <Phone size={size} />;
    case 'phone_in':  return <PhoneIncoming size={size} />;
    case 'phone_out': return <PhoneOutgoing size={size} />;
    case 'battery':   return <BatteryCharging size={size} />;
    case 'bot':       return <Bot size={size} />;
    case 'mail':      return <Mail size={size} />;
    case 'calendar':  return <Calendar size={size} />;
    case 'search':    return <Search size={size} />;
    case 'doc':       return <FileText size={size} />;
    case 'clipboard':     return <ClipboardList size={size} />;
    case 'trending-down': return <TrendingDown size={size} />;
    case 'x':             return <X size={size} />;
    case 'undo':          return <Undo2 size={size} />;
    default:              return null;
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
  opsBalanceMovements = [],
  truncationBanner    = null,
  callerNames         = {},
  token,
}: {
  minutes:              MinutesEntry[];
  tasks:                TaskEntry[];
  opsBalanceMovements?: OpsLedgerEntry[];
  /** Cuando el ledger tiene más rows que las mostradas en UI, avisa al cliente
   *  para que descargue el CSV (que devuelve TODO, incluyendo archive 7 años). */
  truncationBanner?:    { limit: number; totalMinutes: number; totalTasks: number } | null;
  callerNames?:         Record<string, string>;
  token:                string;
}) {
  const [tab, setTab] = useState<'minutos' | 'tareas'>('minutos');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate,   setToDate]   = useState<string>('');

  const filteredMinutes = useMemo(() => filterByDate(minutes, fromDate, toDate), [minutes, fromDate, toDate]);
  const filteredTasks   = useMemo(() => filterByDate(tasks,   fromDate, toDate), [tasks,   fromDate, toDate]);
  const filteredOpsBalance = useMemo(
    () => filterByDate(opsBalanceMovements, fromDate, toDate),
    [opsBalanceMovements, fromDate, toDate],
  );
  const active = tab === 'minutos' ? filteredMinutes : filteredTasks;
  const total  = tab === 'minutos' ? minutes.length  : tasks.length;

  const clearFilters = () => { setFromDate(''); setToDate(''); };
  const hasFilters = !!(fromDate || toDate);

  const applyQuickRange = (range: 'hoy' | '7d' | 'mes' | 'todo') => {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (range === 'todo') { setFromDate(''); setToDate(''); return; }
    if (range === 'hoy') { const d = iso(now); setFromDate(d); setToDate(d); return; }
    if (range === '7d') {
      const from = new Date(now); from.setDate(from.getDate() - 6);
      setFromDate(iso(from)); setToDate(iso(now)); return;
    }
    if (range === 'mes') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(iso(from)); setToDate(iso(now)); return;
    }
  };

  return (
    <div className="flex flex-col">

      {/* Toolbar: tabs + rango + filter status */}
      <div className="sticky top-0 z-10 px-5 pt-3 pb-3 flex flex-col gap-3"
        style={{ background: '#ffffff', borderBottom: '1px solid #F0EDF9' }}>

        {/* Tabs Minutos/Tareas + Quick ranges */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1 p-1 rounded-lg"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
            {(['minutos', 'tareas'] as const).map(t => {
              const activeTab = tab === t;
              return (
                <button key={t} onClick={() => setTab(t)}
                  className="px-4 py-1.5 rounded-md text-[12px] font-semibold transition-all"
                  style={{
                    background: activeTab ? '#ffffff' : 'transparent',
                    color:      activeTab ? '#1A0A3B' : '#6B6480',
                    boxShadow:  activeTab ? '0 1px 2px rgba(26,10,59,0.06)' : 'none',
                  }}>
                  {t === 'minutos' ? 'Minutos' : 'Tareas'}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {[
              { key: 'hoy' as const, label: 'Hoy' },
              { key: '7d'  as const, label: '7 días' },
              { key: 'mes' as const, label: 'Este mes' },
              { key: 'todo' as const, label: 'Todo' },
            ].map(r => (
              <button key={r.key} onClick={() => applyQuickRange(r.key)}
                className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
                style={{
                  background: !hasFilters && r.key === 'todo' ? '#1A0A3B' : '#ffffff',
                  color:      !hasFilters && r.key === 'todo' ? '#ffffff' : '#6B6480',
                  border:     '1px solid ' + (!hasFilters && r.key === 'todo' ? '#1A0A3B' : '#E8E3F5'),
                }}>
                {r.label}
              </button>
            ))}
            {/* Export CSV — respeta el filtro de fechas activo del UI (fix N3
                audit). Sin filtros = historial completo. Minutes incluye
                duración exacta + minutos cobrados para auditar el redondeo. */}
            <a
              href={(() => {
                const base = tab === 'minutos'
                  ? `/api/portal/${token}/minutes-ledger.csv`
                  : `/api/portal/${token}/ops-ledger.csv`;
                const qs = new URLSearchParams();
                if (fromDate) qs.set('from', fromDate);
                if (toDate)   qs.set('to',   toDate);
                return qs.toString() ? `${base}?${qs.toString()}` : base;
              })()}
              download
              className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ml-1"
              style={{ background: '#ffffff', color: '#1A0A3B', border: '1px solid #E8E3F5' }}
              title={`Descargar CSV de ${tab === 'minutos' ? 'minutos' : 'tareas'}${hasFilters ? ' (rango filtrado)' : ' (completo)'}`}
            >
              Exportar CSV{hasFilters ? ' (rango)' : ''}
            </a>
          </div>
        </div>

        {/* Custom date range */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[130px]">
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#9B8FB5' }}>Desde</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="w-full text-[12px] px-3 py-2 rounded-lg outline-none transition-all focus:ring-2"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }} />
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#9B8FB5' }}>Hasta</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="w-full text-[12px] px-3 py-2 rounded-lg outline-none transition-all focus:ring-2"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }} />
          </div>
        </div>

        {truncationBanner && (
          <div className="rounded-lg px-3 py-2 text-[11px] flex items-start gap-2"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#B45309' }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>ⓘ</span>
            <span>
              Estás viendo los últimos {truncationBanner.limit.toLocaleString('es-MX')} movimientos.
              {' '}
              {tab === 'minutos' && truncationBanner.totalMinutes > truncationBanner.limit
                ? `Total real en minutos: ${truncationBanner.totalMinutes.toLocaleString('es-MX')}. `
                : ''}
              {tab === 'tareas' && truncationBanner.totalTasks > truncationBanner.limit
                ? `Total real en tareas: ${truncationBanner.totalTasks.toLocaleString('es-MX')}. `
                : ''}
              Descarga el CSV para el historial completo (incluye retención de 7 años).
            </span>
          </div>
        )}

        {hasFilters && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] tabular-nums" style={{ color: '#6B6480' }}>
              <strong style={{ color: '#1A0A3B' }}>{active.length}</strong> de {total} {tab === 'minutos' ? 'movimientos' : 'tareas'}
            </span>
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-opacity hover:opacity-80"
              style={{ color: '#6B6480' }}>
              <X size={11} /> Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {active.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: '#6B6480' }}>
          {hasFilters ? `Sin ${tab === 'minutos' ? 'movimientos' : 'tareas'} en este rango` : `Sin ${tab === 'minutos' ? 'movimientos' : 'tareas'} registrados`}
        </p>
      ) : tab === 'minutos' ? (
        <MinutesList entries={filteredMinutes} callerNames={callerNames} />
      ) : (
        <>
          <OpsBalanceMovements entries={filteredOpsBalance} />
          <OpsBreakdown entries={filteredTasks} />
          <TasksList entries={filteredTasks} />
        </>
      )}
    </div>
  );
}

// Movimientos de saldo del pool de tareas (grants, refunds, rollover_cap,
// unused_forfeited, cambios de plan). Se muestran arriba de la actividad
// por herramienta para que el cliente vea el panorama completo — antes
// vivían en OpsLedgerSection aislada y el cliente no podía reconciliar.
const OPS_BALANCE_META: Record<OpsLedgerKind, { iconKey: string; color: string; label: string }> = {
  renewal:            { iconKey: 'refresh',       color: '#10B981', label: 'Renovación' },
  extra_ops_purchase: { iconKey: 'zap',           color: '#f59e0b', label: 'Compra extra' },
  auto_refill_ops:    { iconKey: 'battery',       color: '#3b82f6', label: 'Auto-recarga' },
  setup_new_agent:    { iconKey: 'card',          color: '#3b82f6', label: 'Nuevo empleado' },
  jornada_change:     { iconKey: 'sliders',       color: '#3b82f6', label: 'Cambio de jornada' },
  admin_adjustment:   { iconKey: 'sliders',       color: '#6B7280', label: 'Ajuste' },
  rollover_cap:       { iconKey: 'x',             color: '#B45309', label: 'Descartado (cap 2×)' },
  annual_grant:       { iconKey: 'refresh',       color: '#10B981', label: 'Grant mensual (contrato)' },
  unused_forfeited:   { iconKey: 'trending-down', color: '#B45309', label: 'No consumido' },
  consumption:        { iconKey: 'rotate',        color: '#6B7280', label: 'Consumo agregado' },
  refund:             { iconKey: 'undo',          color: '#10B981', label: 'Reembolso' },
  plan_downgrade:     { iconKey: 'trending-down', color: '#f59e0b', label: 'Downgrade de plan' },
  plan_upgrade:       { iconKey: 'zap',           color: '#10B981', label: 'Upgrade de plan' },
  dispute_chargeback: { iconKey: 'x',             color: '#dc2626', label: 'Chargeback' },
  invoice_voided:     { iconKey: 'undo',          color: '#B45309', label: 'Factura anulada' },
  reconciliacion:     { iconKey: 'sliders',       color: '#6B7280', label: 'Reconciliación' },
};

function OpsBalanceMovements({ entries }: { entries: OpsLedgerEntry[] }) {
  // Filtra `consumption` (ya se muestra granular en TasksList) para no duplicar
  // el ruido. Solo eventos de balance (grants, refunds, losses, cambios de plan).
  const balanceOnly = entries.filter(e => e.kind !== 'consumption');
  if (balanceOnly.length === 0) return null;
  return (
    <div className="px-5 py-3" style={{ borderBottom: '1px solid #F0EDF9' }}>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
        Movimientos de saldo · {balanceOnly.length} evento{balanceOnly.length === 1 ? '' : 's'}
      </div>
      <ul className="divide-y" style={{ borderColor: '#F5F2FB' }}>
        {balanceOnly.map(e => {
          const meta = OPS_BALANCE_META[e.kind] ?? OPS_BALANCE_META.admin_adjustment;
          return (
            <li key={e.id} className="py-2 flex items-center gap-2.5">
              <div className="flex-shrink-0 flex items-center justify-center rounded-full w-6 h-6"
                style={{ background: `${meta.color}18`, color: meta.color }}>
                {renderIcon(meta.iconKey, 11)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold" style={{ color: meta.color }}>{meta.label}</p>
                {e.description && (
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: '#6B7280' }}>{e.description}</p>
                )}
                <p className="text-[10px] mt-0.5" style={{ color: '#9CA3AF' }}>{fmtDate(e.date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[13px] font-bold tabular-nums"
                  style={{ color: e.amount >= 0 ? '#10B981' : '#B45309' }}>
                  {e.amount >= 0 ? '+' : ''}{e.amount}
                </p>
                <p className="text-[10px] tabular-nums" style={{ color: '#9CA3AF' }}>saldo {e.balance}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Resumen de tareas por herramienta (fix C13 audit). Responde "¿por qué N
// tareas?" al auditor Municipio: agrupa por título (que ya es el label
// legible del source) y muestra el total consumido en el rango filtrado.
function OpsBreakdown({ entries }: { entries: TaskEntry[] }) {
  const summary = useMemo(() => {
    const byTitle = new Map<string, number>();
    let total = 0;
    for (const e of entries) {
      byTitle.set(e.title, (byTitle.get(e.title) ?? 0) + e.opsUsed);
      total += e.opsUsed;
    }
    const allSorted = Array.from(byTitle.entries()).sort((a, b) => b[1] - a[1]);
    const TOP_N = 8;
    const sorted = allSorted.slice(0, TOP_N);
    const rest = allSorted.slice(TOP_N);
    // Fix M-b audit 2026-08-10: agrupar herramientas después del top 8 en "Otros"
    // para que auditor Municipio no pierda visibilidad de tools menores.
    const othersSum = rest.reduce((s, [, v]) => s + v, 0);
    return { total, sorted, othersCount: rest.length, othersSum };
  }, [entries]);

  if (summary.total === 0) return null;

  return (
    <div className="px-5 py-3" style={{ borderBottom: '1px solid #F0EDF9', background: '#FAFAFB' }}>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
        Consumo por herramienta · {summary.total} tareas en este rango
      </div>
      <div className="flex flex-col gap-1">
        {summary.sorted.map(([title, count]) => {
          const pct = summary.total > 0 ? (count / summary.total) * 100 : 0;
          return (
            <div key={title} className="flex items-center gap-2">
              <div className="flex-1 min-w-0 text-[11px] truncate" style={{ color: '#1A0A3B' }}>{title}</div>
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: '#E8E3F5' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#10B981' }} />
              </div>
              <div className="text-[11px] tabular-nums font-semibold w-12 text-right" style={{ color: '#1A0A3B' }}>
                {count}
              </div>
            </div>
          );
        })}
        {summary.othersCount > 0 && (
          <div className="flex items-center gap-2 opacity-70">
            <div className="flex-1 min-w-0 text-[11px] truncate italic" style={{ color: '#6B6480' }}>
              Otros ({summary.othersCount} {summary.othersCount === 1 ? 'herramienta' : 'herramientas'})
            </div>
            <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: '#E8E3F5' }}>
              <div style={{ width: `${summary.total > 0 ? (summary.othersSum / summary.total) * 100 : 0}%`, height: '100%', background: '#9CA3AF' }} />
            </div>
            <div className="text-[11px] tabular-nums font-semibold w-12 text-right" style={{ color: '#6B6480' }}>
              {summary.othersSum}
            </div>
          </div>
        )}
      </div>
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
          <div className="sticky top-0 z-[1] text-[10px] font-bold uppercase tracking-widest px-5 py-2"
            style={{ background: '#FAFAFB', color: '#9B8FB5', borderTop: '1px solid #F0EDF9', borderBottom: '1px solid #F0EDF9' }}>
            {month}
          </div>
          {rows.map((e, i) => {
            const meta = MIN_SOURCE_META[e.source] ?? MIN_SOURCE_META.ajuste;
            const isCredit = e.amount > 0;
            const raw = e.source === 'llamada' ? e.description.split(' · ')[0] : null;
            const callerName = raw ? callerNames[raw.replace(/\D/g, '')] : null;
            return (
              <div key={e.id + i}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[#FAFAFB]"
                style={{ borderBottom: i === rows.length - 1 ? 'none' : '1px solid #F5F2FB' }}>
                <div className="flex-shrink-0 flex items-center justify-center rounded-xl w-10 h-10"
                  style={{ background: `${meta.color}12`, color: meta.color }}>
                  {renderIcon(meta.iconKey)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium leading-snug truncate" style={{ color: '#1A0A3B' }}>
                    {callerName ?? e.description}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: `${meta.color}12`, color: meta.color }}>
                      {meta.label}
                    </span>
                    {e.isInternal && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                        style={{ background: 'rgba(107,114,128,0.12)', color: '#4B5563' }}
                        title="Llamada del dueño o equipo interno (número reconocido) — no cliente externo"
                      >
                        Interno
                      </span>
                    )}
                    {callerName && (
                      <span className="text-[11px] tabular-nums" style={{ color: '#9B8FB5' }}>
                        {e.description}
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: '#9B8FB5' }}>
                      {fmtDate(e.date)} · {fmtTime(e.date)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                  <span
                    className="text-[15px] font-bold tabular-nums leading-none px-2 py-1 rounded-md"
                    style={{
                      color:      isCredit ? '#16a34a' : '#1A0A3B',
                      background: isCredit ? 'rgba(34,197,94,0.10)' : 'transparent',
                    }}>
                    {isCredit ? '+' : ''}{e.amount} min
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ color: '#9B8FB5' }}>
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
          <div className="sticky top-0 z-[1] text-[10px] font-bold uppercase tracking-widest px-5 py-2"
            style={{ background: '#FAFAFB', color: '#9B8FB5', borderTop: '1px solid #F0EDF9', borderBottom: '1px solid #F0EDF9' }}>
            {month}
          </div>
          {rows.map((e, i) => {
            const meta = TRIGGER_META[e.triggerType ?? 'manual'] ?? TRIGGER_META.manual;
            const failed = e.status === 'failed' || e.goalMet === false;
            return (
              <div key={e.id + i}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[#FAFAFB]"
                style={{ borderBottom: i === rows.length - 1 ? 'none' : '1px solid #F5F2FB' }}>
                <div className="flex-shrink-0 flex items-center justify-center rounded-xl w-10 h-10"
                  style={{ background: `${meta.color}12`, color: meta.color }}>
                  {renderIcon(meta.iconKey)}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium leading-snug truncate"
                    style={{ color: '#1A0A3B', cursor: e.description ? 'help' : 'default' }}
                    title={e.description ?? e.title ?? ''}
                  >
                    {e.title || meta.label}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: `${meta.color}12`, color: meta.color }}>
                      {meta.label}
                    </span>
                    {e.agentName && (
                      <span className="text-[11px] font-medium" style={{ color: '#6C3BFF' }}>
                        {e.agentName}
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: '#9B8FB5' }}>
                      {fmtDate(e.date)} · {fmtTime(e.date)}
                    </span>
                    {failed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        Falló
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                  <span className="text-[15px] font-bold tabular-nums leading-none" style={{ color: '#1A0A3B' }}>
                    −{e.opsUsed}
                  </span>
                  <span className="text-[10px]" style={{ color: '#9B8FB5' }}>
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
  // Fix N7 audit 2026-08-10: interpretar fechas en tz México (UTC-6, sin DST).
  // Antes usaba `new Date('YYYY-MM-DDT00:00:00')` que asume tz local del browser
  // → auditor en tz diferente veía datos desalineados vs lo que muestra el UI.
  // Con offset explícito -06:00 el rango cuadra con lo que Municipio ve en su reloj.
  const fromTs = from ? new Date(from + 'T00:00:00-06:00').getTime() : -Infinity;
  const toTs   = to   ? new Date(to   + 'T23:59:59-06:00').getTime() :  Infinity;
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
