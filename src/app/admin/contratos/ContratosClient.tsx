'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, CheckCircle, Clock, ExternalLink, Pencil, Search, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { PLAN_LABELS } from '@/types/agent';
import type { Plan } from '@/types/agent';

const PLAN_COLORS: Record<string, string> = {
  comercial: '#3b82f6', pro: '#a855f7',
};

type StatusFilter = 'todos' | 'firmados' | 'pendientes';
type TypeFilter   = 'todos' | 'automatico' | 'personalizado';
type PlanFilter   = 'todos' | 'comercial' | 'pro';

export interface ContratoRow {
  id: string;
  business_name: string;
  client_name: string;
  plan: string;
  portal_token: string | null;
  has_custom: boolean;
  contract_accepted_at: string | null;
  active: boolean;
}

interface Props {
  list: ContratoRow[];
  signedCount: number;
  pendingCount: number;
  customCount: number;
}

export default function ContratosClient({ list, signedCount, pendingCount, customCount }: Props) {
  const [search, setSearch]         = useState('');
  const [status, setStatus]         = useState<StatusFilter>('todos');
  const [type, setType]             = useState<TypeFilter>('todos');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('todos');
  const [openDropdown, setOpenDropdown] = useState<'status' | 'type' | 'plan' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return list.filter(a => {
      if (q && !a.business_name.toLowerCase().includes(q) && !a.client_name.toLowerCase().includes(q)) return false;
      if (status === 'firmados'   && !a.contract_accepted_at) return false;
      if (status === 'pendientes' && !!a.contract_accepted_at) return false;
      if (type === 'automatico'   && a.has_custom)  return false;
      if (type === 'personalizado' && !a.has_custom) return false;
      if (planFilter !== 'todos'  && a.plan !== planFilter) return false;
      return true;
    });
  }, [list, search, status, type, planFilter]);

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Contratos</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>Gestión de contratos y propuestas por agente</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Firmados',       value: signedCount,  color: '#22c55e' },
          { label: 'Pendientes',     value: pendingCount, color: '#f59e0b' },
          { label: 'Personalizados', value: customCount,  color: '#6C3BFF' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 mb-5">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--c-text-3)' }} />
          <input
            type="text"
            placeholder="Buscar por negocio o cliente…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>

        {/* Desktop: filter pills */}
        <div className="hidden sm:flex flex-wrap gap-2">
          <FilterGroup label="Estado">
            {(['todos', 'firmados', 'pendientes'] as StatusFilter[]).map(v => (
              <Pill key={v} active={status === v} onClick={() => setStatus(v)}
                label={v === 'todos' ? 'Todos' : v === 'firmados' ? 'Firmados' : 'Pendientes'}
                color={v === 'firmados' ? '#22c55e' : v === 'pendientes' ? '#f59e0b' : undefined}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Tipo">
            {(['todos', 'automatico', 'personalizado'] as TypeFilter[]).map(v => (
              <Pill key={v} active={type === v} onClick={() => setType(v)}
                label={v === 'todos' ? 'Todos' : v === 'automatico' ? 'Automático' : 'Personalizado'}
                color={v === 'personalizado' ? '#6C3BFF' : undefined}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Plan">
            {(['todos', 'comercial', 'pro'] as PlanFilter[]).map(v => (
              <Pill key={v} active={planFilter === v} onClick={() => setPlanFilter(v)}
                label={v === 'todos' ? 'Todos' : PLAN_LABELS[v as Plan]}
                color={v !== 'todos' ? PLAN_COLORS[v] : undefined}
              />
            ))}
          </FilterGroup>
        </div>

        {/* Mobile: dropdown filters */}
        <div className="sm:hidden flex gap-2" ref={dropdownRef}>
          {/* Estado */}
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
              className="w-full flex items-center justify-between gap-1 px-3 py-2 rounded-xl text-xs font-medium"
              style={{
                background: status !== 'todos' ? 'rgba(108,59,255,0.08)' : 'var(--c-surface)',
                border: `1px solid ${status !== 'todos' ? 'rgba(108,59,255,0.3)' : 'var(--c-border)'}`,
                color: status !== 'todos' ? '#9B6DFF' : 'var(--c-text-2)',
              }}
            >
              <span>{status === 'todos' ? 'Estado' : status === 'firmados' ? 'Firmados' : 'Pendientes'}</span>
              <ChevronDown size={12} style={{ transform: openDropdown === 'status' ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {openDropdown === 'status' && (
              <div className="absolute top-full left-0 mt-1 z-20 rounded-xl overflow-hidden min-w-[130px]"
                style={{ background: '#1e0d45', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                {([['todos', 'Todos'], ['firmados', 'Firmados'], ['pendientes', 'Pendientes']] as [StatusFilter, string][]).map(([v, label]) => (
                  <button key={v} type="button"
                    onClick={() => { setStatus(v); setOpenDropdown(null); }}
                    className="w-full text-left px-4 py-2.5 text-xs transition-colors"
                    style={{ color: status === v ? '#9B6DFF' : 'rgba(255,255,255,0.7)', background: status === v ? 'rgba(108,59,255,0.15)' : 'transparent' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tipo */}
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
              className="w-full flex items-center justify-between gap-1 px-3 py-2 rounded-xl text-xs font-medium"
              style={{
                background: type !== 'todos' ? 'rgba(108,59,255,0.08)' : 'var(--c-surface)',
                border: `1px solid ${type !== 'todos' ? 'rgba(108,59,255,0.3)' : 'var(--c-border)'}`,
                color: type !== 'todos' ? '#9B6DFF' : 'var(--c-text-2)',
              }}
            >
              <span>{type === 'todos' ? 'Tipo' : type === 'automatico' ? 'Automático' : 'Personalizado'}</span>
              <ChevronDown size={12} style={{ transform: openDropdown === 'type' ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {openDropdown === 'type' && (
              <div className="absolute top-full left-0 mt-1 z-20 rounded-xl overflow-hidden min-w-[140px]"
                style={{ background: '#1e0d45', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                {([['todos', 'Todos'], ['automatico', 'Automático'], ['personalizado', 'Personalizado']] as [TypeFilter, string][]).map(([v, label]) => (
                  <button key={v} type="button"
                    onClick={() => { setType(v); setOpenDropdown(null); }}
                    className="w-full text-left px-4 py-2.5 text-xs transition-colors"
                    style={{ color: type === v ? '#9B6DFF' : 'rgba(255,255,255,0.7)', background: type === v ? 'rgba(108,59,255,0.15)' : 'transparent' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Plan */}
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'plan' ? null : 'plan')}
              className="w-full flex items-center justify-between gap-1 px-3 py-2 rounded-xl text-xs font-medium"
              style={{
                background: planFilter !== 'todos' ? 'rgba(108,59,255,0.08)' : 'var(--c-surface)',
                border: `1px solid ${planFilter !== 'todos' ? 'rgba(108,59,255,0.3)' : 'var(--c-border)'}`,
                color: planFilter !== 'todos' ? '#9B6DFF' : 'var(--c-text-2)',
              }}
            >
              <span>{planFilter === 'todos' ? 'Plan' : PLAN_LABELS[planFilter as Plan]}</span>
              <ChevronDown size={12} style={{ transform: openDropdown === 'plan' ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {openDropdown === 'plan' && (
              <div className="absolute top-full left-0 mt-1 z-20 rounded-xl overflow-hidden min-w-[120px]"
                style={{ background: '#1e0d45', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                {([['todos', 'Todos'], ['comercial', 'Empleado Centinelia'], ['pro', 'Empleado Centinelia']] as [PlanFilter, string][]).map(([v, label]) => (
                  <button key={v} type="button"
                    onClick={() => { setPlanFilter(v); setOpenDropdown(null); }}
                    className="w-full text-left px-4 py-2.5 text-xs transition-colors"
                    style={{ color: planFilter === v ? '#9B6DFF' : 'rgba(255,255,255,0.7)', background: planFilter === v ? 'rgba(108,59,255,0.15)' : 'transparent' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {filtered.length !== list.length && (
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {filtered.length} de {list.length} contratos
          </p>
        )}
      </div>

      {/* Agent list */}
      <div className="flex flex-col gap-3">
        {filtered.map(agent => {
          const signed     = !!agent.contract_accepted_at;
          const hasCustom  = agent.has_custom;
          const planColor  = PLAN_COLORS[agent.plan] ?? '#6b7280';
          const signedDate = agent.contract_accepted_at
            ? new Date(agent.contract_accepted_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
            : null;

          return (
            <div key={agent.id} className="rounded-xl p-4 flex items-center gap-4"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>

              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: signed ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)' }}>
                {signed ? <CheckCircle size={16} color="#22c55e" /> : <Clock size={16} color="#f59e0b" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{agent.business_name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: `${planColor}18`, color: planColor, border: `1px solid ${planColor}40` }}>
                    {PLAN_LABELS[agent.plan as Plan] ?? agent.plan}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: hasCustom ? 'rgba(108,59,255,0.08)' : 'var(--c-surface-2)', color: hasCustom ? '#9B6DFF' : 'var(--c-text-3)' }}>
                    {hasCustom ? 'Personalizado' : 'Automático'}
                  </span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                  {agent.client_name}
                  {signedDate && <span style={{ color: '#22c55e' }}> · Firmado {signedDate}</span>}
                  {!signed && <span style={{ color: '#f59e0b' }}> · Pendiente de firma</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {agent.portal_token && (
                  <a href={`/portal/${agent.portal_token}/contrato`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
                    <ExternalLink size={12} /><span className="hidden sm:inline"> Ver contrato</span>
                  </a>
                )}
                <Link href={`/admin/contratos/${agent.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                  <Pencil size={12} /><span className="hidden sm:inline"> Editar</span>
                </Link>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16" style={{ color: 'var(--c-text-3)' }}>
            <FileText size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{list.length === 0 ? 'Sin agentes configurados' : 'Sin resultados para estos filtros'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{label}:</span>
      {children}
    </div>
  );
}

function Pill({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  const c = color ?? '#6C3BFF';
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
      style={{
        background: active ? `${c}18` : 'var(--c-surface)',
        color:      active ? c : 'var(--c-text-3)',
        border:     `1px solid ${active ? `${c}40` : 'var(--c-border)'}`,
      }}
    >
      {label}
    </button>
  );
}
