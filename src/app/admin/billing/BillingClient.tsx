'use client';

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Copy, Check, ExternalLink, CreditCard, Clock, AlertCircle, CheckCircle2, XCircle, ChevronDown, Search, X } from 'lucide-react';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG, MINUTES_TIER_CONFIG } from '@/lib/billing/plans';
import type { Plan } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';
type MinutesPlan = MinutesTier;

interface Agent {
  id: string;
  business_name: string;
  client_name: string;
  plan: Plan | null;
  minutes_plan: MinutesPlan | null;
  billing_status: string | null;
  stripe_subscription_id: string | null;
  minutes_used: number;
  minutes_included: number;
  minutes_reset_date: string | null;
  active: boolean;
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  activo:       { label: 'Activo',       color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  icon: CheckCircle2 },
  pago_fallido: { label: 'Pago fallido', color: '#f87171', bg: 'rgba(248,113,113,0.1)', icon: AlertCircle },
  cancelado:    { label: 'Cancelado',    color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: XCircle },
  sin_plan:     { label: 'Sin plan',     color: '#facc15', bg: 'rgba(250,204,21,0.1)',  icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
  const s    = STATUS_STYLES[status] ?? STATUS_STYLES.sin_plan;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: s.color, background: s.bg }}>
      <Icon size={10} />
      {s.label}
    </span>
  );
}

// ── Custom select, avoids native dropdown styling issues in dark mode ─────────

interface SelectOption<T extends string> {
  value: T;
  label: string;
  sub?: string;
}

function SelectMenu<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs outline-none text-left"
        style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown size={10} className="flex-shrink-0 transition-transform" style={{ color: 'var(--c-text-3)', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0 right-0 rounded-lg overflow-hidden shadow-xl"
          style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border-2)', minWidth: '160px' }}
        >
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full flex flex-col gap-0.5 px-3 py-2 text-left text-xs transition-colors"
              style={{
                color:      'var(--c-text)',
                background: o.value === value ? 'rgba(108,59,255,0.1)' : 'transparent',
              }}
              onMouseEnter={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span className="font-medium">{o.label}</span>
              {o.sub && <span style={{ color: 'var(--c-text-3)' }}>{o.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Generate link section ──────────────────────────────────────────────────────

function GenerateLinkButton({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [featurePlan, setFeaturePlan] = useState<Plan>('pro');
  const [minutesPlan, setMinutesPlan] = useState<MinutesPlan>('starter');
  const [loading, setLoading]         = useState(false);
  const [url, setUrl]                 = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  const featureCfg  = FEATURE_PLAN_CONFIG[featurePlan];
  const monthlyCfg  = MONTHLY_CONFIG[featurePlan]?.[minutesPlan];
  const totalFirst  = featureCfg.setupFee + (monthlyCfg?.mxn ?? 0);

  const featureOptions = (Object.entries(FEATURE_PLAN_CONFIG) as [Plan, typeof featureCfg][]).map(([key, cfg]) => ({
    value: key,
    label: `${cfg.label}, $${cfg.setupFee.toLocaleString('es-MX')} inst.`,
    sub:   `Instalación única`,
  }));

  const minutesOptions = (Object.entries(MINUTES_TIER_CONFIG) as [MinutesPlan, { label: string; minutes: number }][]).map(([key, cfg]) => {
    const mc = MONTHLY_CONFIG[featurePlan]?.[key];
    return {
      value: key,
      label: `${cfg.label} · ${cfg.minutes} min, $${(mc?.mxn ?? 0).toLocaleString('es-MX')}/mes`,
      sub:   `Mensualidad recurrente`,
    };
  });

  const handleGenerate = async () => {
    setLoading(true);
    setUrl(null);
    try {
      const res  = await fetch('/api/billing/create-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agentId, featurePlan, minutesPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error generando link');
      setUrl(data.url);
      toast.success(`Link generado para ${agentName}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Plan (funcionalidades)</div>
          <SelectMenu
            value={featurePlan}
            onChange={v => { setFeaturePlan(v); setUrl(null); }}
            options={featureOptions}
          />
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Minutos (mensualidad)</div>
          <SelectMenu
            value={minutesPlan}
            onChange={v => { setMinutesPlan(v); setUrl(null); }}
            options={minutesOptions}
          />
        </div>
      </div>

      {/* Price summary */}
      <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
        style={{ background: 'rgba(108,59,255,0.07)', border: '1px solid rgba(108,59,255,0.12)' }}>
        <span style={{ color: 'var(--c-text-2)' }}>
          Primer cobro: ${featureCfg.setupFee.toLocaleString('es-MX')} inst. + ${(monthlyCfg?.mxn ?? 0).toLocaleString('es-MX')} mes
        </span>
        <span className="font-semibold" style={{ color: '#9B6DFF' }}>
          ${totalFirst.toLocaleString('es-MX')} MXN
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: '#6C3BFF', color: '#FAFBFF' }}
        >
          <CreditCard size={12} />
          {loading ? 'Generando…' : 'Generar link'}
        </button>
      </div>

      {url && (
        <div className="flex items-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex-1 truncate text-xs underline" style={{ color: '#9B6DFF' }}>
            <ExternalLink size={10} className="inline mr-1" />
            {url}
          </a>
          <button onClick={handleCopy}
            className="shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ background: copied ? 'rgba(74,222,128,0.1)' : 'var(--c-input-bg)', color: copied ? '#4ade80' : 'var(--c-text-2)' }}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const STATUS_SORT: Record<string, number> = { pago_fallido: 0, sin_plan: 1, cancelado: 2, activo: 3 };

export default function BillingClient({ agents }: { agents: Agent[] }) {
  const [linkOpen, setLinkOpen] = useState<Set<string>>(new Set());
  const [search, setSearch]     = useState('');

  const toggleLink = (id: string) =>
    setLinkOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sorted = [...agents].sort((a, b) => {
    const sa = a.plan ? (a.billing_status ?? 'activo') : 'sin_plan';
    const sb = b.plan ? (b.billing_status ?? 'activo') : 'sin_plan';
    return (STATUS_SORT[sa] ?? 4) - (STATUS_SORT[sb] ?? 4);
  });

  const q        = search.toLowerCase();
  const filtered = q
    ? sorted.filter(a => a.business_name.toLowerCase().includes(q) || a.client_name.toLowerCase().includes(q))
    : sorted;

  const totalMRR    = agents.reduce((sum, a) => {
    if (!a.minutes_plan || a.billing_status !== 'activo') return sum;
    return sum + (MONTHLY_CONFIG[a.plan as Plan]?.[a.minutes_plan as MinutesTier]?.mxn ?? 0);
  }, 0);
  const activeCount = agents.filter(a => a.billing_status === 'activo').length;
  const failedCount = agents.filter(a => a.billing_status === 'pago_fallido').length;
  const noplanCount = agents.filter(a => !a.plan).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--c-text)' }}>Facturación</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-2)' }}>
          Genera links de pago y gestiona suscripciones de clientes
        </p>
      </div>

      {/* MRR Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'MRR estimado', value: `$${totalMRR.toLocaleString('es-MX')} MXN`, color: '#9B6DFF' },
          { label: 'Activos',      value: activeCount, color: '#4ade80' },
          { label: 'Pago fallido', value: failedCount, color: '#f87171' },
          { label: 'Sin plan',     value: noplanCount, color: '#facc15' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--c-text-3)' }} />
        <input
          type="text"
          placeholder="Buscar por negocio o cliente…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--c-text-3)' }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Agent list */}
      <div className="space-y-3">
        {filtered.map(agent => {
          const billingStatus = agent.plan ? (agent.billing_status ?? 'activo') : 'sin_plan';
          const pct      = agent.minutes_included > 0 ? Math.min((agent.minutes_used / agent.minutes_included) * 100, 100) : 0;
          const barColor = pct >= 90 ? '#f87171' : pct >= 70 ? '#facc15' : '#6C3BFF';
          const fCfg     = agent.plan         ? FEATURE_PLAN_CONFIG[agent.plan]         : null;
          const mCfg     = (agent.plan && agent.minutes_plan) ? MONTHLY_CONFIG[agent.plan as Plan]?.[agent.minutes_plan as MinutesTier] : null;

          return (
            <div key={agent.id} className="rounded-xl p-4 space-y-3"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              {/* Header */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-medium text-sm" style={{ color: 'var(--c-text)' }}>{agent.business_name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>{agent.client_name}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {fCfg && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.25)' }}>
                      {fCfg.label}
                    </span>
                  )}
                  {mCfg && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }}>
                      {mCfg.label} · ${mCfg.mxn.toLocaleString('es-MX')}/mes
                    </span>
                  )}
                  <StatusBadge status={billingStatus} />
                </div>
              </div>

              {/* Minutes bar */}
              {agent.minutes_included > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs" style={{ color: 'var(--c-text-2)' }}>
                    <span>{agent.minutes_used} / {agent.minutes_included} min</span>
                    {agent.minutes_reset_date && (
                      <span>Reinicia {new Date(agent.minutes_reset_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--c-border)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                </div>
              )}

              {/* Generate link — collapsible */}
              <div className="pt-1" style={{ borderTop: '1px solid var(--c-divider)' }}>
                <button
                  type="button"
                  onClick={() => toggleLink(agent.id)}
                  className="flex items-center gap-2 text-xs font-medium w-full text-left transition-opacity hover:opacity-80"
                  style={{ color: linkOpen.has(agent.id) ? '#9B6DFF' : 'var(--c-text-2)' }}
                >
                  <CreditCard size={12} />
                  Generar link de pago
                  <ChevronDown size={10} className="ml-auto transition-transform flex-shrink-0"
                    style={{ transform: linkOpen.has(agent.id) ? 'rotate(180deg)' : undefined, color: 'var(--c-text-4)' }} />
                </button>
                {linkOpen.has(agent.id) && (
                  <div className="mt-3">
                    <GenerateLinkButton agentId={agent.id} agentName={agent.business_name} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 rounded-xl" style={{ border: '1px dashed var(--c-border)' }}>
            <CreditCard size={32} className="mx-auto mb-3" style={{ color: 'var(--c-text-3)' }} />
            <div className="text-sm" style={{ color: 'var(--c-text-2)' }}>
              {search ? 'Sin resultados para esa búsqueda' : 'No hay agentes registrados'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
