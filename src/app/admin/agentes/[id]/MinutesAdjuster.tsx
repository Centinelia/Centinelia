'use client';

import { useState } from 'react';
import { Check, Loader2, Plus, Minus, RotateCcw } from 'lucide-react';

type Action = 'credit' | 'debit' | 'set_used';

export default function MinutesAdjuster({
  agentId,
  minutesUsed,
  minutesIncluded,
}: {
  agentId: string;
  minutesUsed: number;
  minutesIncluded: number;
}) {
  const [used, setUsed]         = useState(minutesUsed);
  const [included, setIncluded] = useState(minutesIncluded);
  const [action, setAction]     = useState<Action>('credit');
  const [amount, setAmount]     = useState('');
  const [reason, setReason]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [saved, setSaved]         = useState(false);
  const [confirming, setConfirming] = useState(false);

  const available = included - used;
  const pct       = included > 0 ? Math.min((used / included) * 100, 100) : 0;
  const barColor  = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';

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
    const res = await fetch(`/api/admin/agentes/${agentId}/minutes`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, amount: n, reason: reason.trim() || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsed(data.minutes_used);
      setIncluded(data.minutes_included);
      setAmount('');
      setReason('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setLoading(false);
  };

  const ACTIONS: { id: Action; label: string; icon: React.ReactNode; color: string; hint: string }[] = [
    { id: 'credit',   label: 'Acreditar',  icon: <Plus size={12} />,     color: '#22c55e', hint: 'Suma minutos al saldo disponible' },
    { id: 'debit',    label: 'Descontar',  icon: <Minus size={12} />,    color: '#ef4444', hint: 'Resta minutos del saldo disponible' },
    { id: 'set_used', label: 'Fijar uso',  icon: <RotateCcw size={12} />,color: '#f59e0b', hint: 'Establece los minutos usados a un valor exacto' },
  ];

  const activeAction = ACTIONS.find(a => a.id === action)!;
  const amountLabel  = action === 'set_used' ? 'Fijar minutos usados a' : 'Cantidad de minutos';
  const btnLabel     = action === 'credit' ? `Acreditar ${amount || '0'} min` : action === 'debit' ? `Descontar ${amount || '0'} min` : `Fijar en ${amount || '0'}`;

  return (
    <div className="p-5 rounded-xl flex flex-col gap-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Minutos</span>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#22c55e' }}>
            <Check size={12} /> Aplicado
          </span>
        )}
      </div>

      {/* Usage bar */}
      <div>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-2xl font-bold tabular-nums" style={{ color: barColor }}>{used}</span>
          <span className="text-sm" style={{ color: 'var(--c-text-3)' }}>usados / {included} incluidos</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
          <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        <div className="flex justify-between mt-1.5 text-xs" style={{ color: 'var(--c-text-3)' }}>
          <span>{Math.round(pct)}% consumido</span>
          <span style={{ color: available > 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
            {available} disponibles
          </span>
        </div>
      </div>

      {/* Action selector */}
      <div className="flex flex-col gap-2">
        <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Tipo de ajuste</span>
        <div className="grid grid-cols-3 gap-1.5">
          {ACTIONS.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAction(a.id)}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: action === a.id ? `${a.color}18` : 'var(--c-surface-2)',
                border:     `1px solid ${action === a.id ? a.color : 'var(--c-border)'}`,
                color:      action === a.id ? a.color : 'var(--c-text-3)',
              }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
        <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>{activeAction.hint}</p>
      </div>

      {/* Amount + reason */}
      <div className="flex flex-col gap-2">
        <label className="text-xs" style={{ color: 'var(--c-text-3)' }}>{amountLabel}</label>
        <input
          type="number"
          min={0}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder={action === 'set_used' ? String(used) : '0'}
          className="rounded-lg px-3 py-2 text-sm outline-none w-full"
          style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
        />
        <label className="text-xs" style={{ color: 'var(--c-text-3)' }}>Razón (aparece en el historial del cliente)</label>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ej: Compensación por error del sistema"
          className="rounded-lg px-3 py-2 text-sm outline-none w-full"
          style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
        />
      </div>

      {/* Submit / Confirm */}
      {confirming ? (
        <div className="rounded-lg p-3 flex flex-col gap-2.5" style={{ background: `${activeAction.color}12`, border: `1px solid ${activeAction.color}40` }}>
          <p className="text-xs font-medium text-center" style={{ color: 'var(--c-text)' }}>
            ¿Confirmar {activeAction.label.toLowerCase()} <strong>{amount} min</strong>
            {action !== 'set_used' ? ' a este agente?' : ' de uso?'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={apply}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: activeAction.color, color: '#fff' }}
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
          className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: amount ? activeAction.color : 'var(--c-surface-2)',
            color:      amount ? '#fff' : 'var(--c-text-3)',
            opacity:    loading ? 0.6 : 1,
            cursor:     amount ? 'pointer' : 'not-allowed',
          }}
        >
          {loading
            ? <Loader2 size={14} className="animate-spin" />
            : <>{activeAction.icon} {btnLabel}</>
          }
        </button>
      )}
    </div>
  );
}
