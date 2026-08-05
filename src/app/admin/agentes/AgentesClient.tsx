'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X,
  CheckCircle2, XCircle, AlertTriangle, ArrowRight, ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { Pagination } from '@/components/admin/Pagination';
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

const STATUS_OPTS = [
  { value: '',         label: 'Todos'   },
  { value: 'activos',  label: 'Activos' },
  { value: 'pausados', label: 'Pausados'},
];

const SORT_OPTS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'name',   label: 'A-Z'           },
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
  return (
    <Link
      href={`/admin/agentes/${agent.id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white transition-colors hover:bg-gray-50"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      {/* Active indicator */}
      <div className="flex-shrink-0">
        {agent.active
          ? <CheckCircle2 size={14} style={{ color: '#10B981' }} />
          : <XCircle      size={14} style={{ color: '#6B7280' }} />}
      </div>

      {/* Business + client */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold truncate" style={{ color: '#111827' }}>
            {agent.business_name}
          </span>
          {agent.billing_status === 'pago_fallido' && (
            <span title="Pago fallido" className="flex-shrink-0">
              <AlertTriangle size={11} style={{ color: '#EF4444' }} />
            </span>
          )}
        </div>
        <div className="text-[12px] mt-0.5 truncate" style={{ color: '#6B7280' }}>
          {agent.client_name}{agent.phone_number ? ` · ${agent.phone_number}` : ''}
        </div>
      </div>

      <ArrowRight size={12} className="flex-shrink-0" style={{ color: '#9CA3AF' }} />
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
  const [openDropdown, setOpenDropdown] = useState<'status' | null>(null);
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
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: '#9CA3AF' }}
            />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && commitSearch()}
              onBlur={commitSearch}
              placeholder="Buscar por negocio, cliente o número... (Enter)"
              disabled={pending}
              className="w-full pl-8 pr-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
            />
          </div>

          <select
            value={currentFilters.sort}
            onChange={e => navigate({ sort: e.target.value })}
            disabled={pending}
            className="px-2.5 py-1.5 rounded-lg text-[13px] outline-none cursor-pointer"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
          >
            {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Row 2: status pills — desktop */}
        <div className="hidden sm:flex items-center gap-2 flex-wrap">
          <div
            className="inline-flex gap-1 p-1 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
          >
            {STATUS_OPTS.map(o => {
              const active = currentFilters.status === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => navigate({ status: o.value })}
                  disabled={pending}
                  className="px-3 py-1 rounded-md text-[12px] font-medium transition-colors"
                  style={{
                    background: active ? '#6C3BFF' : 'transparent',
                    color: active ? '#FFFFFF' : '#374151',
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 ml-auto text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors hover:bg-gray-50"
              style={{ color: '#374151', border: '1px solid #E5E7EB', background: '#FFFFFF' }}
            >
              <X size={11} /> Limpiar filtros
            </button>
          )}
        </div>

        {/* Row 2: status dropdown — mobile */}
        <div className="sm:hidden flex items-center gap-2" ref={dropdownRef}>
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{
                background: '#FFFFFF',
                border: `1px solid ${currentFilters.status ? '#6C3BFF' : '#E5E7EB'}`,
                color: currentFilters.status ? '#6C3BFF' : '#374151',
              }}
            >
              Estatus: {STATUS_OPTS.find(o => o.value === currentFilters.status)?.label ?? 'Todos'}
              <ChevronDown size={11} />
            </button>
            {openDropdown === 'status' && (
              <div
                className="absolute top-full left-0 mt-1 rounded-lg overflow-hidden z-50 min-w-[140px] bg-white"
                style={{ border: '1px solid #E5E7EB', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)' }}
              >
                {STATUS_OPTS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => { navigate({ status: o.value }); setOpenDropdown(null); }}
                    className="w-full text-left px-4 py-2 text-[13px] transition-colors hover:bg-gray-50"
                    style={{
                      color: currentFilters.status === o.value ? '#6C3BFF' : '#374151',
                      background: currentFilters.status === o.value ? '#F5F0FF' : 'transparent',
                      fontWeight: currentFilters.status === o.value ? 500 : 400,
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 ml-auto text-[12px] font-medium px-2.5 py-1 rounded-lg"
              style={{ color: '#374151', border: '1px solid #E5E7EB', background: '#FFFFFF' }}
            >
              <X size={11} /> Limpiar
            </button>
          )}
        </div>

        {/* Result count */}
        <p className="text-[12px]" style={{ color: '#6B7280' }}>
          {hasFilters
            ? `${totalCount.toLocaleString('es-MX')} resultado${totalCount !== 1 ? 's' : ''}`
            : `${totalCount.toLocaleString('es-MX')} empleado${totalCount !== 1 ? 's' : ''} en total`}
          {totalPages > 1 && ` · página ${page} de ${totalPages}`}
        </p>
      </div>

      {/* ── Agent list ── */}
      {agents.length === 0 ? (
        <div
          className="p-12 rounded-xl text-center bg-white"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <p className="text-[13px]" style={{ color: '#6B7280' }}>
            {hasFilters ? 'Sin resultados para los filtros aplicados' : 'Sin empleados configurados'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {agents.map(agent => <AgentRowItem key={agent.id} agent={agent} />)}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        disabled={pending}
        onNavigate={p => navigate({ page: p })}
      />
    </div>
  );
}
