'use client';

import { useState } from 'react';
import { Check, Loader2, Plus, Minus, RotateCcw } from 'lucide-react';

type Action = 'credit' | 'debit' | 'set_used';

export default function TasksAdjuster({
  agentId,
  opsUsed,
  opsLimit,
  isAccountPool = false,
}: {
  agentId: string;
  opsUsed: number;
  opsLimit: number;
  isAccountPool?: boolean;
}) {
  const [used, setUsed]         = useState(opsUsed);
  const [included, setIncluded] = useState(opsLimit);
  const [action, setAction]     = useState<Action>('credit');
  const [amount, setAmount]     = useState('');
  const [reason, setReason]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [saved, setSaved]         = useState(false);
  const [confirming, setConfirming] = useState(false);

  const available = included - used;
  const pct       = included > 0 ? Math.min((used / included) * 100, 100) : 0;
  const barColor  = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';

  const requestApply = () => {
    const n = parseInt(amount);
    if (isNaN(n) || n <= 0) return;
    setConfirming(true);
  };

  const apply = async () => {
    const n = parseInt(amount);
    if (isNaN(n) || n < 0) return;
    setConfirming(false);
    setLoading(true);
    setSaved(false);
    const res = await fetch(`/api/admin/agentes/${agentId}/ops`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, amount: n, reason: reason.trim() || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsed(data.ops_used);
      setIncluded(data.ops_limit);
      setAmount('');
      setReason('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setLoading(false);
  };

  const ACTIONS: { id: Action; label: string; icon: React.ReactNode; color: string; hint: string }[] = [
    { id: 'credit',   label: 'Acreditar',  icon: <Plus size={12} />,     color: '#10B981', hint: 'Suma tareas al saldo disponible' },
    { id: 'debit',    label: 'Descontar',  icon: <Minus size={12} />,    color: '#EF4444', hint: 'Resta tareas del saldo disponible' },
    { id: 'set_used', label: 'Fijar uso',  icon: <RotateCcw size={12} />,color: '#F59E0B', hint: 'Establece las tareas usadas a un valor exacto' },
  ];

  const activeAction = ACTIONS.find(a => a.id === action)!;
  const amountLabel  = action === 'set_used' ? 'Fijar tareas usadas a' : 'Cantidad de tareas';
  const btnLabel     = action === 'credit' ? `Acreditar ${amount || '0'} tareas` : action === 'debit' ? `Descontar ${amount || '0'} tareas` : `Fijar en ${amount || '0'}`;

  return (
    <div
      className="p-5 rounded-xl flex flex-col gap-5 bg-white"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: '#9CA3AF' }}>Tareas</span>
          {isAccountPool && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#F3F0FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
              Cuenta
            </span>
          )}
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: '#10B981' }}>
            <Check size={12} /> Aplicado
          </span>
        )}
      </div>

      {/* Usage bar */}
      <div>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-[24px] font-bold tabular-nums" style={{ color: barColor }}>{used}</span>
          <span className="text-[13px]" style={{ color: '#6B7280' }}>usadas / {included} incluidas</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
          <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        <div className="flex justify-between mt-1.5 text-[12px]" style={{ color: '#6B7280' }}>
          <span>{Math.round(pct)}% consumido</span>
          <span style={{ color: available > 0 ? '#10B981' : '#EF4444', fontWeight: 600 }}>
            {available} disponibles
          </span>
        </div>
      </div>

      {/* Action selector */}
      <div className="flex flex-col gap-2">
        <span className="text-[12px]" style={{ color: '#6B7280' }}>Tipo de ajuste</span>
        <div className="grid grid-cols-3 gap-1.5">
          {ACTIONS.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAction(a.id)}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-all"
              style={{
                background: action === a.id ? `${a.color}18` : '#FFFFFF',
                border:     `1px solid ${action === a.id ? a.color : '#E5E7EB'}`,
                color:      action === a.id ? a.color : '#6B7280',
              }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
        <p className="text-[12px]" style={{ color: '#9CA3AF' }}>{activeAction.hint}</p>
      </div>

      {/* Amount + reason */}
      <div className="flex flex-col gap-2">
        <label className="text-[12px]" style={{ color: '#6B7280' }}>{amountLabel}</label>
        <input
          type="number"
          min={0}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder={action === 'set_used' ? String(used) : '0'}
          className="rounded-lg px-3 py-2 text-[13px] outline-none w-full"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
        />
        <label className="text-[12px]" style={{ color: '#6B7280' }}>Razón (aparece en el historial del cliente)</label>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ej: Compensación por error del sistema"
          className="rounded-lg px-3 py-2 text-[13px] outline-none w-full"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
        />
      </div>

      {/* Submit / Confirm */}
      {confirming ? (
        <div className="rounded-lg p-3 flex flex-col gap-2.5" style={{ background: `${activeAction.color}12`, border: `1px solid ${activeAction.color}40` }}>
          <p className="text-[12px] font-medium text-center" style={{ color: '#111827' }}>
            ¿Confirmar {activeAction.label.toLowerCase()} <strong>{amount} tareas</strong>
            {action !== 'set_used' ? ' a este cliente?' : ' de uso?'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all"
              style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={apply}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-all"
              style={{ background: activeAction.color, color: '#FFFFFF' }}
            >
              {activeAction.icon} Confirmar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={requestApply}
          disabled={loading || !amount}
          className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold transition-all"
          style={{
            background: amount ? activeAction.color : '#F3F4F6',
            color:      amount ? '#FFFFFF' : '#9CA3AF',
            opacity:    loading ? 0.6 : 1,
            cursor:     amount ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : btnLabel}
        </button>
      )}
    </div>
  );
}
