'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, X, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { AnnualContract, ContractStatus } from '@/types/annual-contract';
import NewContractModal from './NewContractModal';

type StatusFilter = 'all' | ContractStatus;
type SortKey = 'expiry' | 'recent' | 'amount_desc';

const STATUS_STYLE: Record<ContractStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: 'Borrador',  color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
  active:    { label: 'Activo',    color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  expired:   { label: 'Expirado',  color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
  cancelled: { label: 'Cancelado', color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

function StatusBadge({ status }: { status: ContractStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div className="space-y-6 pt-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Contratos activos" value={kpis.activeCount.toString()} accent="#10B981" />
        <KpiCard label="Expiran en 60 días" value={kpis.soonCount.toString()} accent="#F59E0B" />
        <KpiCard label={`Monto activo ${new Date().getFullYear()}`} value={formatMXN(kpis.totalYear)} accent="#8B5CF6" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder="Buscar por cliente o folio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-1.5 rounded-lg text-[13px] outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }}>
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="px-2.5 py-1.5 rounded-lg text-[13px] outline-none"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
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
          className="px-2.5 py-1.5 rounded-lg text-[13px] outline-none"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
        >
          <option value="expiry">Próximos a expirar</option>
          <option value="recent">Recientes</option>
          <option value="amount_desc">Monto (mayor a menor)</option>
        </select>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#FFFFFF' }}
        >
          <Plus size={13} />
          Nuevo contrato
        </button>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden bg-white"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ background: '#F9FAFB' }}>
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
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[13px]" style={{ color: '#6B7280' }}>Cargando contratos...</td></tr>
              )}

              {contracts !== null && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <FileText size={22} className="mx-auto mb-2" style={{ color: '#D1D5DB' }} />
                    <div className="text-[13px]" style={{ color: '#6B7280' }}>
                      {loadError ? loadError : (search || statusFilter !== 'all' ? 'Sin resultados para los filtros aplicados.' : 'Aún no hay contratos anuales. Crea el primero.')}
                    </div>
                  </td>
                </tr>
              )}

              {filtered.map(c => {
                const days = daysUntil(c.end_date);
                const showWarning = c.status === 'active' && days <= 60 && days >= 0;
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid #F3F4F6' }} className="hover:bg-gray-50">
                    <Td>
                      <div className="font-mono text-[12px]" style={{ color: '#111827' }}>{c.contract_folio}</div>
                    </Td>
                    <Td>
                      <div className="text-[13px]" style={{ color: '#111827' }}>{c.organization_email}</div>
                    </Td>
                    <Td>
                      <div className="text-[12px]" style={{ color: '#6B7280' }}>
                        {formatDate(c.start_date)} → {formatDate(c.end_date)}
                      </div>
                      {showWarning && (
                        <div className="flex items-center gap-1 mt-0.5 text-[11px]" style={{ color: '#F59E0B' }}>
                          <AlertTriangle size={10} />
                          Expira en {days} día{days === 1 ? '' : 's'}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="text-[13px] font-medium tabular-nums" style={{ color: '#111827' }}>{formatMXN(Number(c.amount_mxn))}</div>
                    </Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td className="text-right">
                      <Link
                        href={`/admin/facturacion/${c.id}`}
                        className="text-[12px] font-medium hover:underline"
                        style={{ color: '#6C3BFF' }}
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

function KpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
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

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider ${className}`}
      style={{ color: '#6B7280' }}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
