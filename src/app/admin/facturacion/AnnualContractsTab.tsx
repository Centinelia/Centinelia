'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, X, FileText, AlertTriangle, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import type { AnnualContract, ContractStatus } from '@/types/annual-contract';
import NewContractModal from './NewContractModal';

type StatusFilter = 'all' | ContractStatus;
type SortKey = 'expiry' | 'recent' | 'amount_desc';

const STATUS_STYLE: Record<ContractStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: 'Borrador',  color: '#facc15', bg: 'rgba(250,204,21,0.10)',  border: 'rgba(250,204,21,0.25)' },
  active:    { label: 'Activo',    color: '#4ade80', bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.25)' },
  expired:   { label: 'Expirado',  color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
  cancelled: { label: 'Cancelado', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
};

function StatusBadge({ status }: { status: ContractStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  );
}

function daysUntil(iso: string): number {
  const end = new Date(iso + 'T23:59:59Z').getTime();
  const now = Date.now();
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function formatMXN(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AnnualContractsTab() {
  const [contracts, setContracts] = useState<AnnualContract[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('expiry');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/annual-contracts', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Error cargando contratos');
      setContracts(json.contracts ?? []);
    } catch (e: any) {
      setLoadError(e.message);
      setContracts([]);
    }
  }

  useEffect(() => { load(); }, []);

  const kpis = useMemo(() => {
    const list = contracts ?? [];
    const active = list.filter(c => c.status === 'active');
    const soon = active.filter(c => daysUntil(c.end_date) <= 60 && daysUntil(c.end_date) >= 0);
    const currentYear = new Date().getFullYear();
    const totalYear = active
      .filter(c => new Date(c.start_date + 'T00:00:00').getFullYear() === currentYear)
      .reduce((sum, c) => sum + Number(c.amount_mxn ?? 0), 0);
    return { activeCount: active.length, soonCount: soon.length, totalYear };
  }, [contracts]);

  const filtered = useMemo(() => {
    let list = [...(contracts ?? [])];
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);

    const q = search.trim().toLowerCase();
    if (q) list = list.filter(c =>
      c.contract_folio.toLowerCase().includes(q) ||
      c.organization_email.toLowerCase().includes(q)
    );

    list.sort((a, b) => {
      if (sort === 'expiry')     return a.end_date.localeCompare(b.end_date);
      if (sort === 'recent')     return b.created_at.localeCompare(a.created_at);
      if (sort === 'amount_desc') return Number(b.amount_mxn) - Number(a.amount_mxn);
      return 0;
    });
    return list;
  }, [contracts, statusFilter, sort, search]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Contratos activos',          value: kpis.activeCount.toString(),        color: '#4ade80' },
          { label: 'Expiran en 60 días',         value: kpis.soonCount.toString(),          color: '#facc15' },
          { label: `Monto activo ${new Date().getFullYear()}`, value: formatMXN(kpis.totalYear), color: '#9B6DFF' },
        ].map(k => (
          <div
            key={k.label}
            className="rounded-xl p-4"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
          >
            <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--c-text-3)' }} />
          <input
            type="text"
            placeholder="Buscar por cliente o folio…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text-3)' }}>
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
        >
          <option value="all">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="active">Activo</option>
          <option value="expired">Expirado</option>
          <option value="cancelled">Cancelado</option>
        </select>

        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
        >
          <option value="expiry">Próximos a expirar</option>
          <option value="recent">Recientes</option>
          <option value="amount_desc">Monto (mayor a menor)</option>
        </select>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#FAFBFF' }}
        >
          <Plus size={14} />
          Nuevo contrato
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--c-surface-2)' }}>
              <tr>
                <Th>Folio</Th>
                <Th>Cliente</Th>
                <Th>Vigencia</Th>
                <Th className="text-right">Monto</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acción</Th>
              </tr>
            </thead>
            <tbody>
              {contracts === null && (
                <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--c-text-2)' }}>Cargando contratos…</td></tr>
              )}

              {contracts !== null && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <FileText size={26} className="mx-auto mb-2" style={{ color: 'var(--c-text-3)' }} />
                    <div className="text-sm" style={{ color: 'var(--c-text-2)' }}>
                      {loadError ? loadError : (search || statusFilter !== 'all' ? 'Sin resultados para los filtros aplicados.' : 'Aún no hay contratos anuales. Crea el primero.')}
                    </div>
                  </td>
                </tr>
              )}

              {filtered.map(c => {
                const days = daysUntil(c.end_date);
                const showWarning = c.status === 'active' && days <= 60 && days >= 0;
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--c-divider)' }}>
                    <Td>
                      <div className="font-mono text-xs" style={{ color: 'var(--c-text)' }}>{c.contract_folio}</div>
                    </Td>
                    <Td>
                      <div className="text-sm" style={{ color: 'var(--c-text)' }}>{c.organization_email}</div>
                    </Td>
                    <Td>
                      <div className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                        {formatDate(c.start_date)} → {formatDate(c.end_date)}
                      </div>
                      {showWarning && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs" style={{ color: '#facc15' }}>
                          <AlertTriangle size={11} />
                          Expira en {days} día{days === 1 ? '' : 's'}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{formatMXN(Number(c.amount_mxn))}</div>
                    </Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td className="text-right">
                      <Link
                        href={`/admin/facturacion/${c.id}`}
                        className="text-xs font-medium hover:underline"
                        style={{ color: '#9B6DFF' }}
                      >
                        Ver detalle
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <NewContractModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            toast.success('Contrato creado');
            load();
          }}
        />
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left px-4 py-2 text-xs font-medium ${className}`} style={{ color: 'var(--c-text-2)' }}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
