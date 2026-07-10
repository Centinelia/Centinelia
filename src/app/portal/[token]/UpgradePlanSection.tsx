'use client';

import { useState } from 'react';
import { Check, ArrowUpCircle, ArrowDownCircle, ChevronDown } from 'lucide-react';
import type { Plan } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';
import { MONTHLY_CONFIG, FEATURE_PLAN_CONFIG } from '@/lib/billing/plans';

const AGENT_TYPES: {
  key:      Plan;
  label:    string;
  setupFee: number;
  features: string[];
  color:    string;
}[] = [
  {
    key:      'comercial',
    label:    'Agente Comercial',
    setupFee: 8990,
    features: ['Atención 24/7', 'Captura de leads', 'Agendamiento de citas', 'Transferencia inteligente', 'Escalación a WhatsApp'],
    color:    '#3b82f6',
  },
  {
    key:      'pro',
    label:    'Ejecutivo Senior',
    setupFee: 14990,
    features: ['Todo lo de Agente Comercial', 'Toma de pedidos', 'Memoria de cliente', 'Voz personalizable', 'Multiidioma (ES + EN)'],
    color:    '#a855f7',
  },
];

const TIERS: { key: MinutesTier; label: string; minutes: number }[] = [
  { key: 'starter', label: 'Starter', minutes: 300 },
  { key: 'growth',  label: 'Growth',  minutes: 600 },
  { key: 'scale',   label: 'Scale',   minutes: 1200 },
];

const PLAN_ORDER: Plan[] = ['comercial', 'pro'];
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
  const [expandedType, setExpandedType]           = useState<Plan | null>(null);
  const [expandedTier, setExpandedTier]           = useState<MinutesTier | null>(null);
  const [loadingType, setLoadingType]             = useState<Plan | null>(null);
  const [loadingTier, setLoadingTier]             = useState<MinutesTier | null>(null);
  const [downgradeConfirm, setDowngradeConfirm]   = useState<Plan | null>(null);
  const [done, setDone]                           = useState(false);

  const resolvedTier = currentTier ?? 'starter';
  const currentIdx   = PLAN_ORDER.indexOf(currentPlan);
  const currentTierIdx = TIER_ORDER.indexOf(resolvedTier);

  const handleChangeType = async (toPlan: Plan) => {
    const isDowngrade = PLAN_ORDER.indexOf(toPlan) < currentIdx;
    if (isDowngrade && downgradeConfirm !== toPlan) { setDowngradeConfirm(toPlan); return; }
    setLoadingType(toPlan);
    setDowngradeConfirm(null);
    try {
      const res  = await fetch(`/api/portal/${token}/change-plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_plan: toPlan }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else if (data.success) { setDone(true); setTimeout(() => window.location.reload(), 800); }
      else setLoadingType(null);
    } catch { setLoadingType(null); }
  };

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
    <div className="flex flex-col gap-5">
      {/* Agent type */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-3)' }}>Tipo de empleado</p>
        <div className="flex flex-col gap-2">
          {AGENT_TYPES.map((t) => {
            const isCurrent  = t.key === currentPlan;
            const isExpanded = expandedType === t.key;
            const isUpgrade  = PLAN_ORDER.indexOf(t.key) > currentIdx;
            const isDowngrade = PLAN_ORDER.indexOf(t.key) < currentIdx;
            const from_cfg   = FEATURE_PLAN_CONFIG[currentPlan];
            const setupDiff  = t.setupFee - from_cfg.setupFee;

            return (
              <div key={t.key} className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${isExpanded ? t.color + '55' : 'var(--c-border)'}`, background: isExpanded ? `${t.color}0d` : 'var(--c-surface-2)' }}>
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setExpandedType(isExpanded ? null : t.key)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                  <span className="text-sm font-semibold flex-1" style={{ color: t.color }}>{t.label}</span>
                  {isCurrent && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium mr-1"
                    style={{ background: `${t.color}18`, color: t.color }}>Actual</span>}
                  <span className="text-xs tabular-nums" style={{ color: 'var(--c-text-3)' }}>
                    ${t.setupFee.toLocaleString('es-MX')} instalación
                  </span>
                  <ChevronDown size={14} style={{ color: 'var(--c-text-3)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginLeft: 4 }} />
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4" style={{ borderTop: `1px solid ${t.color}22` }}>
                    <div className="flex flex-col gap-1 mt-3 mb-3">
                      {t.features.map(f => (
                        <span key={f} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
                          <Check size={10} color={t.color} />{f}
                        </span>
                      ))}
                    </div>
                    {!isCurrent && (
                      <>
                        {isUpgrade && setupDiff > 0 && (
                          <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>+${setupDiff.toLocaleString('es-MX')} de instalación adicional</p>
                        )}
                        {downgradeConfirm === t.key ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs" style={{ color: '#f59e0b' }}>Sin reembolso por días restantes. ¿Confirmar?</span>
                            <div className="flex gap-2">
                              <button onClick={() => setDowngradeConfirm(null)} className="flex-1 py-1.5 rounded-lg text-xs"
                                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>Cancelar</button>
                              <button onClick={() => handleChangeType(t.key)} disabled={!!loadingType} className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}>
                                {loadingType === t.key ? 'Procesando…' : 'Confirmar'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => handleChangeType(t.key)} disabled={!!loadingType} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: isUpgrade ? `${t.color}18` : 'var(--c-surface)', border: `1px solid ${isUpgrade ? t.color + '40' : 'var(--c-border)'}`, color: isUpgrade ? t.color : 'var(--c-text-2)' }}>
                            {loadingType === t.key ? 'Procesando…' : isUpgrade ? <><ArrowUpCircle size={12} /> Subir a {t.label}</> : <><ArrowDownCircle size={12} /> Bajar a {t.label}</>}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Minutes tier */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-3)' }}>Plan de minutos</p>
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
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--c-text-4)' }}>
          Cambios de tier aplican en el próximo ciclo de facturación. Minutos extra fuera del plan cuestan $12.99/min.
        </p>
      </div>
    </div>
  );
}
