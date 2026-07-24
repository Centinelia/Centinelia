'use client';

import { useState } from 'react';
import { Check, ArrowUpCircle, ArrowDownCircle, ChevronDown } from 'lucide-react';
import type { Plan } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';

const TIERS: { key: MinutesTier; label: string; minutes: number }[] = [
  { key: 'starter', label: 'Esencial',    minutes: 300 },
  { key: 'growth',  label: 'Profesional', minutes: 600 },
  { key: 'scale',   label: 'Avanzado',    minutes: 1200 },
];

const TIER_ORDER: MinutesTier[] = ['starter', 'growth', 'scale'];

export default function UpgradePlanSection({
  token,
  currentPlan,
  currentTier,
}: {
  token:        string;
  currentPlan:  Plan;
  currentTier?: MinutesTier;
}) {
  const [expandedTier, setExpandedTier] = useState<MinutesTier | null>(null);
  const [loadingTier, setLoadingTier]   = useState<MinutesTier | null>(null);
  const [done, setDone]                 = useState(false);

  const resolvedTier    = currentTier ?? 'starter';
  const currentTierIdx  = TIER_ORDER.indexOf(resolvedTier);

  const handleChangeTier = async (toTier: MinutesTier) => {
    setLoadingTier(toTier);
    try {
      const res  = await fetch(`/api/portal/${token}/change-plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_minutes_tier: toTier }),
      });
      const data = await res.json();
      if (data.success) { setDone(true); setTimeout(() => window.location.reload(), 800); }
      else setLoadingTier(null);
    } catch { setLoadingTier(null); }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 rounded-xl"
        style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
        <Check size={14} color="#22c55e" />
        <span className="text-sm" style={{ color: '#22c55e' }}>Plan actualizado correctamente.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {TIERS.map((t) => {
        const isCurrent  = t.key === resolvedTier;
        const isExpanded = expandedTier === t.key;
        const cfg        = MONTHLY_CONFIG[currentPlan][t.key];
        const isUpgrade  = TIER_ORDER.indexOf(t.key) > currentTierIdx;

        return (
          <div key={t.key} className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${isExpanded ? '#6C3BFF55' : 'var(--c-border)'}`, background: isExpanded ? 'rgba(108,59,255,0.05)' : 'var(--c-surface-2)' }}>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
              onClick={() => setExpandedTier(isExpanded ? null : t.key)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <span className="text-sm font-semibold flex-1" style={{ color: 'var(--c-text)' }}>{t.label}</span>
              {isCurrent && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium mr-1"
                style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}>Actual</span>}
              <span className="text-xs tabular-nums" style={{ color: 'var(--c-text-3)' }}>
                {t.minutes} min{cfg.aiOps > 0 ? ` · ${cfg.aiOps} ops` : ''} · ${cfg.mxn.toLocaleString('es-MX')}/mes
              </span>
              <ChevronDown size={14} style={{ color: 'var(--c-text-3)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginLeft: 4 }} />
            </button>
            {isExpanded && !isCurrent && (
              <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(108,59,255,0.15)' }}>
                <button onClick={() => handleChangeTier(t.key)} disabled={!!loadingTier} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold mt-3"
                  style={{ background: isUpgrade ? 'rgba(108,59,255,0.1)' : 'var(--c-surface)', border: `1px solid ${isUpgrade ? 'rgba(108,59,255,0.35)' : 'var(--c-border)'}`, color: isUpgrade ? '#6C3BFF' : 'var(--c-text-2)' }}>
                  {loadingTier === t.key ? 'Procesando…' : isUpgrade ? <><ArrowUpCircle size={12} /> Cambiar a {t.label}</> : <><ArrowDownCircle size={12} /> Cambiar a {t.label}</>}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs mt-1" style={{ color: 'var(--c-text-4)' }}>
        Cambios de tier aplican en el próximo ciclo de facturación. Minutos extra fuera del plan cuestan $12.99/min.
      </p>
    </div>
  );
}
