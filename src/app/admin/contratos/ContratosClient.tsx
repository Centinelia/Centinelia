'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, CheckCircle2, Clock, ExternalLink, Pencil, Search, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { PLAN_LABELS } from '@/types/agent';
import type { Plan } from '@/types/agent';

const PLAN_COLORS: Record<string, string> = {
  pro: '#8B5CF6',
};

type StatusFilter = 'todos' | 'firmados' | 'pendientes';
type TypeFilter   = 'todos' | 'automatico' | 'personalizado';
type PlanFilter   = 'todos' | 'pro';

export interface ContratoRow {
  /** ID del agente ancla (primer agente creado del cliente, o el que tiene contract_text custom). */
  id: string;
  business_name: string;
  client_name: string;
  plan: string;
  portal_token: string | null;
  /** Token canónico per-org (organizations.portal_token). Preferido sobre portal_token
   *  legacy per-agent para URLs emitidas. Null solo si el cliente no tiene org row. */
  org_token: string | null;
  /** Email de portal = clave del cliente. Null solo para demos/standalone legacy. */
  portal_email: string | null;
  has_custom: boolean;
  contract_accepted_at: string | null;
  active: boolean;
  /** Cantidad de empleados en la cuenta (voice_agents con este portal_email). */
  employee_count: number;
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
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Contratos</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>Gestión de contratos y propuestas por agente.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Firmados" value={signedCount} accent="#10B981" />
        <KpiCard label="Pendientes" value={pendingCount} accent="#F59E0B" />
        <KpiCard label="Personalizados" value={customCount} accent="#8B5CF6" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder="Buscar por negocio o cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg text-[13px] outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
          />
        </div>

        {/* Desktop: filter pills */}
        <div className="hidden sm:flex flex-wrap gap-3">
          <FilterGroup label="Estado">
            {(['todos', 'firmados', 'pendientes'] as StatusFilter[]).map(v => (
              <Pill key={v} active={status === v} onClick={() => setStatus(v)}
                label={v === 'todos' ? 'Todos' : v === 'firmados' ? 'Firmados' : 'Pendientes'}
                color={v === 'firmados' ? '#10B981' : v === 'pendientes' ? '#F59E0B' : undefined}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Tipo">
            {(['todos', 'automatico', 'personalizado'] as TypeFilter[]).map(v => (
              <Pill key={v} active={type === v} onClick={() => setType(v)}
                label={v === 'todos' ? 'Todos' : v === 'automatico' ? 'Automático' : 'Personalizado'}
                color={v === 'personalizado' ? '#8B5CF6' : undefined}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Plan">
            {(['todos', 'pro'] as PlanFilter[]).map(v => (
              <Pill key={v} active={planFilter === v} onClick={() => setPlanFilter(v)}
                label={v === 'todos' ? 'Todos' : PLAN_LABELS[v as Plan]}
                color={v !== 'todos' ? PLAN_COLORS[v] : undefined}
              />
            ))}
          </FilterGroup>
        </div>

        {/* Mobile: dropdown filters */}
        <div className="sm:hidden flex gap-2" ref={dropdownRef}>
          <MobileDropdown
            open={openDropdown === 'status'}
            onToggle={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
            currentLabel={status === 'todos' ? 'Estado' : status === 'firmados' ? 'Firmados' : 'Pendientes'}
            active={status !== 'todos'}
            options={[['todos', 'Todos'], ['firmados', 'Firmados'], ['pendientes', 'Pendientes']]}
            value={status}
            onSelect={(v) => { setStatus(v as StatusFilter); setOpenDropdown(null); }}
          />
          <MobileDropdown
            open={openDropdown === 'type'}
            onToggle={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
            currentLabel={type === 'todos' ? 'Tipo' : type === 'automatico' ? 'Automático' : 'Personalizado'}
            active={type !== 'todos'}
            options={[['todos', 'Todos'], ['automatico', 'Automático'], ['personalizado', 'Personalizado']]}
            value={type}
            onSelect={(v) => { setType(v as TypeFilter); setOpenDropdown(null); }}
          />
          <MobileDropdown
            open={openDropdown === 'plan'}
            onToggle={() => setOpenDropdown(openDropdown === 'plan' ? null : 'plan')}
            currentLabel={planFilter === 'todos' ? 'Plan' : PLAN_LABELS[planFilter as Plan]}
            active={planFilter !== 'todos'}
            options={[['todos', 'Todos'], ['pro', 'Empleado Centinelia']]}
            value={planFilter}
            onSelect={(v) => { setPlanFilter(v as PlanFilter); setOpenDropdown(null); }}
          />
        </div>

        {filtered.length !== list.length && (
          <p className="text-[12px]" style={{ color: '#6B7280' }}>
            {filtered.length} de {list.length} contratos
          </p>
        )}
      </div>

      {/* Agent list */}
      <div className="flex flex-col gap-3">
        {filtered.map(agent => {
          const signed     = !!agent.contract_accepted_at;
          const hasCustom  = agent.has_custom;
          const planColor  = PLAN_COLORS[agent.plan] ?? '#6B7280';
          const signedDate = agent.contract_accepted_at
            ? new Date(agent.contract_accepted_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
            : null;

          return (
            <div
              key={agent.id}
              className="rounded-xl bg-white px-5 py-4 flex items-center gap-4"
              style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: signed ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${signed ? '#A7F3D0' : '#FDE68A'}` }}>
                {signed ? <CheckCircle2 size={16} style={{ color: '#10B981' }} /> : <Clock size={16} style={{ color: '#F59E0B' }} />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold" style={{ color: '#111827' }}>{agent.business_name}</span>
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
                    style={{ background: `${planColor}14`, color: planColor, border: `1px solid ${planColor}30` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: planColor }} />
                    {PLAN_LABELS[agent.plan as Plan] ?? agent.plan}
                  </span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-medium"
                    style={{
                      background: hasCustom ? '#F5F3FF' : '#F9FAFB',
                      color: hasCustom ? '#8B5CF6' : '#6B7280',
                      border: `1px solid ${hasCustom ? '#DDD6FE' : '#E5E7EB'}`,
                    }}
                  >
                    {hasCustom ? 'Personalizado' : 'Automático'}
                  </span>
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>
                  {agent.client_name}
                  {agent.employee_count > 1 && (
                    <span> · {agent.employee_count} empleados</span>
                  )}
                  {signedDate && <span style={{ color: '#10B981' }}> · Firmado {signedDate}</span>}
                  {!signed && <span style={{ color: '#F59E0B' }}> · Pendiente de firma</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {(agent.org_token || agent.portal_token) && (
                  <a
                    href={`/portal/${agent.org_token ?? agent.portal_token}/contrato`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
                    style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
                  >
                    <ExternalLink size={12} />
                    <span className="hidden sm:inline">Ver contrato</span>
                  </a>
                )}
                <Link
                  href={`/admin/contratos/${agent.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-90"
                  style={{ background: '#6C3BFF', color: '#FFFFFF' }}
                >
                  <Pencil size={12} />
                  <span className="hidden sm:inline">Editar</span>
                </Link>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div
            className="text-center py-16 rounded-xl bg-white"
            style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
          >
            <FileText size={32} className="mx-auto mb-3" style={{ color: '#D1D5DB' }} />
            <p className="text-[13px]" style={{ color: '#6B7280' }}>
              {list.length === 0 ? 'Sin agentes configurados' : 'Sin resultados para estos filtros'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="rounded-xl bg-white px-5 py-4"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
      <p className="text-[28px] font-semibold leading-none tabular-nums mt-2" style={{ color: accent }}>{value}</p>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px]" style={{ color: '#9CA3AF' }}>{label}:</span>
      {children}
    </div>
  );
}

function Pill({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  const c = color ?? '#6C3BFF';
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
      style={{
        background: active ? `${c}14` : '#FFFFFF',
        color:      active ? c : '#6B7280',
        border:     `1px solid ${active ? `${c}30` : '#E5E7EB'}`,
      }}
    >
      {label}
    </button>
  );
}

function MobileDropdown({
  open, onToggle, currentLabel, active, options, value, onSelect,
}: {
  open: boolean;
  onToggle: () => void;
  currentLabel: string;
  active: boolean;
  options: [string, string][];
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-1 px-3 py-2 rounded-lg text-[12px] font-medium"
        style={{
          background: active ? '#F5F3FF' : '#FFFFFF',
          border: `1px solid ${active ? '#DDD6FE' : '#E5E7EB'}`,
          color: active ? '#6C3BFF' : '#374151',
        }}
      >
        <span>{currentLabel}</span>
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-20 rounded-lg overflow-hidden min-w-[140px] bg-white"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
        >
          {options.map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => onSelect(v)}
              className="w-full text-left px-3 py-2 text-[12px] transition-colors hover:bg-gray-50"
              style={{
                color: value === v ? '#6C3BFF' : '#374151',
                background: value === v ? '#F5F3FF' : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
