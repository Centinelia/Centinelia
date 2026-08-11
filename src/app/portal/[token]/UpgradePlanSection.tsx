'use client';

import { useState } from 'react';
import { Check, ArrowUpCircle, ArrowDownCircle, ChevronDown } from 'lucide-react';
import type { Plan, JornadaType } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';
import { MONTHLY_CONFIG, resolveTierAllocation } from '@/lib/billing/plans';

const TIER_LABELS: Record<MinutesTier, string> = {
  starter:    'Esencial',
  growth:     'Profesional',
  scale:      'Avanzado',
  enterprise: 'Empresarial',
};

const TIER_ORDER: MinutesTier[] = ['starter', 'growth', 'scale'];

export default function UpgradePlanSection({
  token,
  currentPlan,
  currentTier,
  jornadaType,
  meerkatRoleId,
}: {
  token:          string;
  currentPlan:    Plan;
  currentTier?:   MinutesTier;
  jornadaType?:   JornadaType;
  meerkatRoleId?: string;
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
      {TIER_ORDER.map((tierKey) => {
        const isCurrent  = tierKey === resolvedTier;
        const isExpanded = expandedTier === tierKey;
        // Asignación REAL para este cliente según su jornada y si es coordinator.
        // Antes leía MONTHLY_CONFIG.aiOps (100/200/300) que quedó stale — un
        // cliente en jornada `tareas` veía "300 min · 100 tareas" cuando en
        // realidad recibiría 0 min y 500 tareas. Precio (mxn) sí es igual
        // en todas las jornadas, se sigue leyendo de MONTHLY_CONFIG.
        const alloc = resolveTierAllocation(jornadaType, meerkatRoleId, tierKey);
        const price = MONTHLY_CONFIG[currentPlan][tierKey].mxn;
        const label = TIER_LABELS[tierKey];
        const isUpgrade = TIER_ORDER.indexOf(tierKey) > currentTierIdx;
        const allocLine = alloc.minutes > 0 && alloc.aiOps > 0
          ? `${alloc.minutes} min · ${alloc.aiOps} tareas`
          : alloc.minutes > 0
            ? `${alloc.minutes} min`
            : `${alloc.aiOps} tareas`;

        return (
          <div key={tierKey} className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${isExpanded ? '#6C3BFF55' : '#E8E3F5'}`, background: isExpanded ? 'rgba(108,59,255,0.05)' : '#FAFAFB' }}>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
              onClick={() => setExpandedTier(isExpanded ? null : tierKey)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <span className="text-sm font-semibold flex-1" style={{ color: '#1A0A3B' }}>{label}</span>
              {isCurrent && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium mr-1"
                style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}>Actual</span>}
              <span className="text-xs tabular-nums" style={{ color: '#6B6480' }}>
                {allocLine} · ${price.toLocaleString('es-MX')} + IVA/mes
              </span>
              <ChevronDown size={14} style={{ color: '#6B6480', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginLeft: 4 }} />
            </button>
            {isExpanded && !isCurrent && (
              <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(108,59,255,0.15)' }}>
                <div className="flex flex-col gap-0.5 mt-3 text-xs" style={{ color: '#6B6480' }}>
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>${price.toLocaleString('es-MX')} MXN/mes</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA (16%)</span>
                    <span>${Math.round(price * 0.16).toLocaleString('es-MX')} MXN</span>
                  </div>
                  <div className="flex justify-between font-semibold pt-0.5" style={{ borderTop: '1px solid #E8E3F5', marginTop: 2, color: '#1A0A3B' }}>
                    <span>Total mensual</span>
                    <span>${Math.round(price * 1.16).toLocaleString('es-MX')} MXN</span>
                  </div>
                </div>
                <button onClick={() => handleChangeTier(tierKey)} disabled={!!loadingTier} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold mt-3"
                  style={{ background: isUpgrade ? 'rgba(108,59,255,0.1)' : '#ffffff', border: `1px solid ${isUpgrade ? 'rgba(108,59,255,0.35)' : '#E8E3F5'}`, color: isUpgrade ? '#6C3BFF' : '#1A0A3B' }}>
                  {loadingTier === tierKey ? 'Procesando…' : isUpgrade ? <><ArrowUpCircle size={12} /> Cambiar a {label}</> : <><ArrowDownCircle size={12} /> Cambiar a {label}</>}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs mt-1" style={{ color: '#9B8FB5' }}>
        El cambio de tier: el saldo del nuevo tier (minutos + tareas) se acredita al momento como delta;
        el precio de la suscripción ajusta a partir del próximo ciclo de facturación.
      </p>
    </div>
  );
}
