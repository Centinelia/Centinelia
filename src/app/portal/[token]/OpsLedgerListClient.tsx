'use client';

import { RefreshCw, RotateCcw, Zap, CreditCard, SlidersHorizontal, BatteryCharging, TrendingDown, X, Download, Undo2 } from 'lucide-react';

export type OpsLedgerKind =
  | 'renewal'
  | 'extra_ops_purchase'
  | 'auto_refill_ops'
  | 'setup_new_agent'
  | 'jornada_change'
  | 'admin_adjustment'
  | 'rollover_cap'
  | 'annual_grant'
  | 'unused_forfeited'
  | 'consumption'
  | 'refund';

export interface OpsLedgerEntry {
  id:          string;
  date:        string;
  amount:      number;
  description: string;
  kind:        OpsLedgerKind;
  balance:     number;
}

const KIND_META: Record<OpsLedgerKind, { iconKey: string; color: string; label: string }> = {
  renewal:            { iconKey: 'refresh',       color: '#10B981', label: 'Renovacion' },
  extra_ops_purchase: { iconKey: 'zap',           color: '#f59e0b', label: 'Compra extra' },
  auto_refill_ops:    { iconKey: 'battery',       color: '#3b82f6', label: 'Auto-recarga' },
  setup_new_agent:    { iconKey: 'card',          color: '#3b82f6', label: 'Nuevo empleado' },
  jornada_change:     { iconKey: 'sliders',       color: '#3b82f6', label: 'Cambio de jornada' },
  admin_adjustment:   { iconKey: 'sliders',       color: '#6B7280', label: 'Ajuste admin' },
  rollover_cap:       { iconKey: 'x',             color: '#B45309', label: 'Descartado (cap 2x)' },
  annual_grant:       { iconKey: 'refresh',       color: '#10B981', label: 'Grant mensual (contrato)' },
  unused_forfeited:   { iconKey: 'trending-down', color: '#B45309', label: 'No consumido' },
  consumption:        { iconKey: 'rotate',        color: '#6B7280', label: 'Consumo' },
  refund:             { iconKey: 'undo',          color: '#10B981', label: 'Reembolso por error' },
};

function renderIcon(iconKey: string) {
  switch (iconKey) {
    case 'refresh':      return <RefreshCw size={11} />;
    case 'rotate':       return <RotateCcw size={11} />;
    case 'zap':          return <Zap size={11} />;
    case 'card':         return <CreditCard size={11} />;
    case 'sliders':      return <SlidersHorizontal size={11} />;
    case 'battery':      return <BatteryCharging size={11} />;
    case 'trending-down': return <TrendingDown size={11} />;
    case 'x':            return <X size={11} />;
    case 'undo':         return <Undo2 size={11} />;
    default:             return null;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function OpsLedgerListClient({
  entries,
  csvUrl,
}: {
  entries: OpsLedgerEntry[];
  csvUrl:  string;
}) {
  return (
    <div className="rounded-xl bg-white p-5" style={{ border: '1px solid #E5E7EB' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>Historial de tareas</h3>
        <a
          href={csvUrl}
          download
          className="text-[12px] font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#F3F4F6', color: '#374151' }}
        >
          <Download size={12} />
          Exportar CSV
        </a>
      </div>
      {entries.length === 0 ? (
        <p className="text-[13px]" style={{ color: '#6B7280' }}>Sin movimientos todavía.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: '#F3F4F6' }}>
          {entries.map(e => {
            const meta = KIND_META[e.kind] ?? KIND_META.admin_adjustment;
            return (
              <li key={e.id} className="py-2.5 flex items-center gap-2.5">
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-full w-6 h-6"
                  style={{ background: `${meta.color}18`, color: meta.color }}
                >
                  {renderIcon(meta.iconKey)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium" style={{ color: meta.color }}>{meta.label}</p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: '#6B7280' }}>{e.description}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>{fmtDate(e.date)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className="text-[13px] font-semibold tabular-nums"
                    style={{ color: e.amount >= 0 ? '#10B981' : '#B45309' }}
                  >
                    {e.amount >= 0 ? '+' : ''}{e.amount}
                  </p>
                  <p className="text-[11px] tabular-nums" style={{ color: '#9CA3AF' }}>Saldo: {e.balance}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
