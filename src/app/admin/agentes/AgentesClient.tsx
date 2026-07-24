'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, ArrowRight, ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { PLAN_LABELS } from '@/types/agent';

// ── Types ─────────────────────────────────────────────────────────────────────

type Filters = { status: string; plan: string; search: string; sort: string };

interface AgentRow {
  id:             string;
  business_name:  string;
  client_name:    string;
  plan:           string;
  active:         boolean;
  billing_status: string | null;
  phone_number:   string | null;
}

interface Props {
  agents:         AgentRow[];
  totalCount:     number;
  page:           number;
  totalPages:     number;
  currentFilters: Filters;
}

// ── Config ────────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  comercial: '#3b82f6',
  pro:       '#a855f7',
};

const STATUS_OPTS = [
  { value: '',         label: 'Todos'   },
  { value: 'activos',  label: 'Activos' },
  { value: 'pausados', label: 'Pausados'},
];

const PLAN_OPTS = [
  { value: '',          label: 'Todos',     color: undefined    },
  { value: 'comercial', label: 'Agente Comercial',  color: '#3b82f6' },
  { value: 'pro',       label: 'Empleado Centinelia', color: '#a855f7' },
];

const SORT_OPTS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'name',   label: 'A–Z'           },
];

// ── URL helper ────────────────────────────────────────────────────────────────

function buildUrl(filters: Filters, page: number) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.plan)   params.set('plan',   filters.plan);
  if (filters.search) params.set('search', filters.search);
  if (filters.sort && filters.sort !== 'recent') params.set('sort', filters.sort);
  if (page > 1)       params.set('page',   String(page));
  const qs = params.toString();
  return '/admin/agentes' + (qs ? '?' + qs : '');
}

// ── Agent row ─────────────────────────────────────────────────────────────────

function AgentRowItem({ agent }: { agent: AgentRow }) {
  const planColor = PLAN_COLORS[agent.plan] ?? '#6b7280';

  return (
    <Link
      href={`/admin/agentes/${agent.id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:border-[rgba(108,59,255,0.35)]"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
    >
      {/* Active indicator */}
      <div className="flex-shrink-0">
        {agent.active
          ? <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
          : <XCircle      size={14} style={{ color: '#6b7280' }} />}
      </div>

      {/* Business + client */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>
            {agent.business_name}
          </span>
          {agent.billing_status === 'pago_fallido' && (
            <span title="Pago fallido" className="flex-shrink-0">
              <AlertTriangle size={11} style={{ color: '#ef4444' }} />
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-3)' }}>
          {agent.client_name}{agent.phone_number ? ` · ${agent.phone_number}` : ''}
        </div>
      </div>

      {/* Plan badge + arrow */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className="px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: `${planColor}18`, color: planColor, border: `1px solid ${planColor}30` }}
        >
          {PLAN_LABELS[agent.plan as keyof typeof PLAN_LABELS] ?? agent.plan}
        </span>
        <ArrowRight size={12} style={{ color: 'var(--c-text-4)' }} />
      </div>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentesClient({
  agents, totalCount, page, totalPages, currentFilters,
}: Props) {
  const router  = useRouter();
  const [pending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(currentFilters.search);
  const [openDropdown, setOpenDropdown] = useState<'status' | 'plan' | null>(null);
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

  useEffect(() => { setSearchInput(currentFilters.search); }, [currentFilters.search]);

  const navigate = (overrides: Partial<Filters & { page: number }>) => {
    startTransition(() => {
      const filters: Filters = { ...currentFilters, ...overrides };
      const p = 'page' in overrides ? (overrides.page ?? 1) : 1;
      router.push(buildUrl(filters, p));
    });
  };

  const commitSearch = () => {
    if (searchInput !== currentFilters.search) navigate({ search: searchInput });
  };

  const hasFilters = !!(currentFilters.status || currentFilters.plan || currentFilters.search);

  const clearAll = () => {
    setSearchInput('');
    startTransition(() => router.push('/admin/agentes'));
  };

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: 'opacity 0.15s' }}>

      {/* ── Filter bar ── */}
      <div className="flex flex-col gap-3 mb-5">

        {/* Row 1: search + sort */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--c-text-3)' }} />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && commitSearch()}
              onBlur={commitSearch}
              placeholder="Buscar por negocio, cliente o número… (Enter)"
              disabled={pending}
              className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          </div>

          <select
            value={currentFilters.sort}
            onChange={e => navigate({ sort: e.target.value })}
            disabled={pending}
            className="px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', colorScheme: 'dark' }}
          >
            {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Row 2: status + plan pills — desktop */}
        <div className="hidden sm:flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            {STATUS_OPTS.map(o => {
              const active = currentFilters.status === o.value;
              return (
                <button key={o.value} onClick={() => navigate({ status: o.value })} disabled={pending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: active ? '#6C3BFF' : 'transparent', color: active ? '#fff' : 'var(--c-text-3)' }}>
                  {o.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1 p-1 rounded-xl"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            {PLAN_OPTS.map(({ value, label, color }) => {
              const active = currentFilters.plan === value;
              const c = color ?? '#6C3BFF';
              return (
                <button key={value} onClick={() => navigate({ plan: value })} disabled={pending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: active ? c : 'transparent', color: active ? '#fff' : (color ?? 'var(--c-text-3)') }}>
                  {label}
                </button>
              );
            })}
          </div>
          {hasFilters && (
            <button onClick={clearAll}
              className="flex items-center gap-1 ml-auto text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
              style={{ color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
              <X size={11} /> Limpiar filtros
            </button>
          )}
        </div>

        {/* Row 2: dropdowns — mobile */}
        <div className="sm:hidden flex items-center gap-2" ref={dropdownRef}>
          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
              style={{
                background: 'var(--c-surface)',
                border: `1px solid ${currentFilters.status ? '#6C3BFF' : 'var(--c-border)'}`,
                color: currentFilters.status ? '#9B6DFF' : 'var(--c-text-2)',
              }}>
              Estatus: {STATUS_OPTS.find(o => o.value === currentFilters.status)?.label ?? 'Todos'}
              <ChevronDown size={11} />
            </button>
            {openDropdown === 'status' && (
              <div className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden z-50 min-w-[130px]"
                style={{ background: '#1e0d45', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                {STATUS_OPTS.map(o => (
                  <button key={o.value}
                    onClick={() => { navigate({ status: o.value }); setOpenDropdown(null); }}
                    className="w-full text-left px-4 py-2.5 text-xs transition-colors"
                    style={{
                      color: currentFilters.status === o.value ? '#9B6DFF' : 'rgba(255,255,255,0.7)',
                      background: currentFilters.status === o.value ? 'rgba(108,59,255,0.15)' : 'transparent',
                    }}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Plan dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'plan' ? null : 'plan')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
              style={{
                background: 'var(--c-surface)',
                border: `1px solid ${currentFilters.plan ? '#6C3BFF' : 'var(--c-border)'}`,
                color: currentFilters.plan ? '#9B6DFF' : 'var(--c-text-2)',
              }}>
              Tipo: {PLAN_OPTS.find(o => o.value === currentFilters.plan)?.label ?? 'Todos'}
              <ChevronDown size={11} />
            </button>
            {openDropdown === 'plan' && (
              <div className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden z-50 min-w-[130px]"
                style={{ background: '#1e0d45', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                {PLAN_OPTS.map(o => (
                  <button key={o.value}
                    onClick={() => { navigate({ plan: o.value }); setOpenDropdown(null); }}
                    className="w-full text-left px-4 py-2.5 text-xs transition-colors"
                    style={{
                      color: currentFilters.plan === o.value ? '#9B6DFF' : 'rgba(255,255,255,0.7)',
                      background: currentFilters.plan === o.value ? 'rgba(108,59,255,0.15)' : 'transparent',
                    }}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasFilters && (
            <button onClick={clearAll}
              className="flex items-center gap-1 ml-auto text-xs px-2.5 py-1 rounded-lg"
              style={{ color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
              <X size={11} /> Limpiar
            </button>
          )}
        </div>

        {/* Result count */}
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          {hasFilters
            ? `${totalCount.toLocaleString('es-MX')} resultado${totalCount !== 1 ? 's' : ''}`
            : `${totalCount.toLocaleString('es-MX')} agente${totalCount !== 1 ? 's' : ''} en total`}
          {totalPages > 1 && ` · página ${page} de ${totalPages}`}
        </p>
      </div>

      {/* ── Agent list ── */}
      {agents.length === 0 ? (
        <div className="p-12 rounded-xl text-center"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
            {hasFilters ? 'Sin resultados para los filtros aplicados' : 'Sin agentes configurados'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {agents.map(agent => <AgentRowItem key={agent.id} agent={agent} />)}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 pt-4"
          style={{ borderTop: '1px solid var(--c-border)' }}>
          <button
            onClick={() => navigate({ page: page - 1 })}
            disabled={page <= 1 || pending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
            style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
          >
            <ChevronLeft size={13} /> Anterior
          </button>

          <span className="text-xs tabular-nums" style={{ color: 'var(--c-text-3)' }}>
            {page} / {totalPages}
          </span>

          <button
            onClick={() => navigate({ page: page + 1 })}
            disabled={page >= totalPages || pending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
            style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
          >
            Siguiente <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
