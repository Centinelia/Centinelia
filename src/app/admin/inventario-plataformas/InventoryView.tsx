'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Package, PlusCircle, RefreshCw, TrendingUp } from 'lucide-react';

type Platform = 'vapi' | 'twilio' | 'anthropic';

interface PlatformState {
  balance:              number;
  balance_updated_at:   string | null;
  notes:                string | null;
  topped_up_this_month: number;
  projected_monthly:    number;
  recommended_topup:    number;
}

interface Projection {
  total_minutes:       number;
  total_ops:           number;
  active_agents:       number;
  vapi_projected:      number;
  twilio_projected:    number;
  anthropic_projected: number;
}

interface Topup {
  id:           string;
  platform:     Platform;
  amount_usd:   number;
  topped_up_at: string;
  performed_by: string | null;
  notes:        string | null;
}

interface InventoryData {
  projection:        Projection;
  platforms:         Record<Platform, PlatformState>;
  topups_this_month: Topup[];
  topups_recent:     Topup[];
}

const PLATFORM_META: Record<Platform, { label: string; url: string; hint: string }> = {
  vapi:      { label: 'Vapi',              url: 'https://dashboard.vapi.ai/org/billing',                                 hint: 'STT + TTS + LLM + platform' },
  twilio:    { label: 'Twilio',            url: 'https://console.twilio.com/us1/billing/manage-billing/billing-overview', hint: 'Minutos de llamada MX + US' },
  anthropic: { label: 'Anthropic (Claude)', url: 'https://console.anthropic.com/settings/billing',                        hint: 'Inbox + delegar + Nash + chat' },
};

const PLATFORM_ORDER: Platform[] = ['vapi', 'twilio', 'anthropic'];
const MXN_PER_USD = 19;

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
function fmtMxn(n: number): string {
  return `MXN $${Math.round(n).toLocaleString('es-MX')}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function InventoryView() {
  const [data,    setData]    = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/platform-inventory', { cache: 'no-store' });
      const d = await r.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Cargando…</p>;
  }

  const totalRecommended = PLATFORM_ORDER.reduce((sum, p) => sum + data.platforms[p].recommended_topup, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Panel de proyección global */}
      <div className="rounded-xl p-5" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.25)' }}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} style={{ color: '#6C3BFF' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Proyección del próximo mes</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Empleados activos con plan" value={String(data.projection.active_agents)} />
          <Metric label="Minutos/mes proyectados" value={data.projection.total_minutes.toLocaleString('es-MX')} />
          <Metric label="Ops/mes proyectados" value={data.projection.total_ops.toLocaleString('es-MX')} />
          <Metric
            label="Falta cargar (total)"
            value={fmtUsd(totalRecommended)}
            sub={`≈ ${fmtMxn(totalRecommended * MXN_PER_USD)}`}
            accent={totalRecommended > 0 ? '#F59E0B' : '#22c55e'}
          />
        </div>
      </div>

      {/* Cards por plataforma */}
      <div className="flex flex-col gap-4">
        {PLATFORM_ORDER.map(p => (
          <PlatformCard
            key={p}
            platform={p}
            state={data.platforms[p]}
            topupsThisMonth={data.topups_this_month.filter(t => t.platform === p)}
            onChange={load}
          />
        ))}
      </div>

      {/* Historial reciente */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Historial reciente (últimas 30 recargas)</h2>
          <button onClick={load} className="text-xs flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
            <RefreshCw size={12} /> Refrescar
          </button>
        </div>
        {data.topups_recent.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: 'var(--c-text-3)' }}>Aún no hay recargas registradas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}>
                <th className="text-left px-4 py-2 text-xs font-semibold">Fecha</th>
                <th className="text-left px-4 py-2 text-xs font-semibold">Plataforma</th>
                <th className="text-right px-4 py-2 text-xs font-semibold">Monto</th>
                <th className="text-left px-4 py-2 text-xs font-semibold">Notas</th>
              </tr>
            </thead>
            <tbody>
              {data.topups_recent.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--c-border)' }}>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--c-text-2)' }}>{fmtDate(t.topped_up_at)}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--c-text)' }}>{PLATFORM_META[t.platform]?.label ?? t.platform}</td>
                  <td className="px-4 py-2 text-xs text-right font-semibold" style={{ color: 'var(--c-text)' }}>{fmtUsd(Number(t.amount_usd))}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--c-text-3)' }}>{t.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>{label}</p>
      <p className="text-xl font-bold" style={{ color: accent ?? 'var(--c-text)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>{sub}</p>}
    </div>
  );
}

function PlatformCard({ platform, state, topupsThisMonth, onChange }: {
  platform:        Platform;
  state:           PlatformState;
  topupsThisMonth: Topup[];
  onChange:        () => void;
}) {
  const meta = PLATFORM_META[platform];
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput,   setBalanceInput]   = useState(state.balance.toFixed(2));
  const [showTopup,      setShowTopup]      = useState(false);
  const [topupAmount,    setTopupAmount]    = useState('');
  const [topupNotes,     setTopupNotes]     = useState('');
  const [saving,         setSaving]         = useState(false);

  const enough = state.recommended_topup === 0;

  const saveBalance = async () => {
    const n = Number(balanceInput);
    if (!Number.isFinite(n) || n < 0) return;
    setSaving(true);
    try {
      await fetch('/api/admin/platform-inventory', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'update_balance', platform, amount: n }),
      });
      setEditingBalance(false);
      onChange();
    } finally {
      setSaving(false);
    }
  };

  const saveTopup = async () => {
    const n = Number(topupAmount);
    if (!Number.isFinite(n) || n <= 0) return;
    setSaving(true);
    try {
      await fetch('/api/admin/platform-inventory', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'record_topup', platform, amount: n, notes: topupNotes || null }),
      });
      setTopupAmount('');
      setTopupNotes('');
      setShowTopup(false);
      onChange();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div className="flex items-center gap-2">
          <Package size={16} style={{ color: '#6C3BFF' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{meta.label}</span>
          <a href={meta.url} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1" style={{ color: '#6C3BFF' }}>
            dashboard <ExternalLink size={10} />
          </a>
        </div>
        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{meta.hint}</span>
      </div>

      {/* Body */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Saldo actual */}
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>Saldo actual</p>
          {editingBalance ? (
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--c-text-3)' }}>$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={balanceInput}
                onChange={e => setBalanceInput(e.target.value)}
                className="w-20 px-2 py-1 rounded-md text-sm"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                autoFocus
              />
              <button onClick={saveBalance} disabled={saving} className="text-xs px-2 py-1 rounded-md font-semibold" style={{ background: '#22c55e', color: '#fff' }}>OK</button>
              <button onClick={() => { setEditingBalance(false); setBalanceInput(state.balance.toFixed(2)); }} className="text-xs px-2 py-1 rounded-md" style={{ color: 'var(--c-text-3)' }}>Cancelar</button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>{fmtUsd(state.balance)}</span>
              <button onClick={() => setEditingBalance(true)} className="text-xs" style={{ color: '#6C3BFF' }}>editar</button>
            </div>
          )}
          <p className="text-[11px] mt-1" style={{ color: 'var(--c-text-4)' }}>
            actualizado: {fmtDate(state.balance_updated_at)}
          </p>
        </div>

        {/* Consumo proyectado */}
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>Consumo proyectado / mes</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>{fmtUsd(state.projected_monthly)}</p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--c-text-4)' }}>basado en empleados activos</p>
        </div>

        {/* Falta cargar */}
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>
            Falta cargar (con +30% buffer)
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold" style={{ color: enough ? '#22c55e' : '#F59E0B' }}>
              {fmtUsd(state.recommended_topup)}
            </span>
            {enough ? (
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
                <CheckCircle2 size={12} /> suficiente
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#F59E0B' }}>
                <AlertTriangle size={12} /> comprar
              </span>
            )}
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--c-text-4)' }}>≈ {fmtMxn(state.recommended_topup * MXN_PER_USD)}</p>
        </div>
      </div>

      {/* Footer: log de este mes + botón registrar */}
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3" style={{ background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-border)' }}>
        <div className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          Cargado este mes: <b style={{ color: 'var(--c-text)' }}>{fmtUsd(state.topped_up_this_month)}</b>
          {topupsThisMonth.length > 0 && <> · {topupsThisMonth.length} recarga{topupsThisMonth.length === 1 ? '' : 's'}</>}
        </div>
        <button
          onClick={() => setShowTopup(v => !v)}
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: '#6C3BFF', color: '#fff' }}
        >
          <PlusCircle size={12} /> Registrar recarga
        </button>
      </div>

      {/* Panel expandible: registrar recarga */}
      {showTopup && (
        <div className="p-5 flex flex-wrap items-end gap-3" style={{ background: 'rgba(108,59,255,0.04)', borderTop: '1px solid var(--c-border)' }}>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--c-text-3)' }}>Monto USD</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={topupAmount}
              onChange={e => setTopupAmount(e.target.value)}
              placeholder="50.00"
              className="w-28 px-2 py-1.5 rounded-md text-sm"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--c-text-3)' }}>Notas (opcional)</span>
            <input
              value={topupNotes}
              onChange={e => setTopupNotes(e.target.value)}
              placeholder="Ej: recarga previa a AC Proyectos"
              className="px-2 py-1.5 rounded-md text-sm"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          </label>
          <button
            onClick={saveTopup}
            disabled={saving || !topupAmount}
            className="text-xs px-3 py-2 rounded-md font-semibold disabled:opacity-50"
            style={{ background: '#22c55e', color: '#fff' }}
          >
            {saving ? 'Guardando…' : 'Guardar recarga'}
          </button>
          <button
            onClick={() => { setShowTopup(false); setTopupAmount(''); setTopupNotes(''); }}
            className="text-xs px-3 py-2 rounded-md"
            style={{ color: 'var(--c-text-3)' }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
