'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, X, FileText, AlertTriangle, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import type { AnnualContract, ContractStatus } from '@/types/annual-contract';
import NewContractModal from './NewContractModal';
import { useApi } from '@/lib/hooks/useApi';
import { formatMoney } from '@/lib/format/money';

type StatusFilter = 'all' | ContractStatus;
type SortKey = 'expiry' | 'recent' | 'amount_desc';

const STATUS_STYLE: Record<ContractStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: 'Borrador',  color: '#B45309', bg: 'rgba(180,83,9,0.08)', border: 'rgba(180,83,9,0.28)' },
  active:    { label: 'Activo',    color: '#15803D', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.28)' },
  expired:   { label: 'Expirado',  color: '#B91C1C', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.28)' },
  cancelled: { label: 'Cancelado', color: '#6B6480', bg: '#F5F0FF',             border: '#E8E3F5' },
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

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AnnualContractsTab() {
  const { data: contracts, error: fetchError, mutate } =
    useApi<AnnualContract[]>('/api/admin/annual-contracts', { key: 'contracts' });
  const loadError = fetchError?.message ?? null;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('expiry');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Contratos activos" value={kpis.activeCount.toString()} accent="#22C55E" icon={<CheckCircle2 size={16} />} />
        <KpiCard label="Expiran en 60 días" value={kpis.soonCount.toString()} accent="#F59E0B" icon={<Clock size={16} />} hint="requieren renovación" />
        <KpiCard label={`Monto activo ${new Date().getFullYear()}`} value={formatMoney(kpis.totalYear, { minDecimals: 0, maxDecimals: 0 })} accent="#6C3BFF" icon={<DollarSign size={16} />} hint="MXN · con IVA" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9B8FB5' }} />
          <input
            type="text"
            placeholder="Buscar por cliente o folio…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 rounded-xl text-[13px] outline-none transition-shadow"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B', height: 38 }}
            onFocus={e => { e.currentTarget.style.borderColor = '#6C3BFF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(108,59,255,0.08)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#E8E3F5'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: '#9B8FB5' }}>
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-xl text-[13px] outline-none px-3.5"
          style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B', height: 38 }}
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
          className="rounded-xl text-[13px] outline-none px-3.5"
          style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B', height: 38 }}
        >
          <option value="expiry">Próximos a expirar</option>
          <option value="recent">Recientes</option>
          <option value="amount_desc">Monto (mayor a menor)</option>
        </select>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="ml-auto inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all"
          style={{
            padding:    '10px 18px',
            background: '#6C3BFF',
            color:      '#ffffff',
            boxShadow:  '0 2px 8px rgba(108,59,255,0.32)',
          }}
        >
          <Plus size={14} />
          Nuevo contrato
        </button>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ background: '#FAFAFB' }}>
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
              {contracts === undefined && !fetchError && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[13px]" style={{ color: '#6B6480' }}>Cargando contratos…</td></tr>
              )}

              {contracts !== undefined && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <FileText size={22} className="mx-auto mb-2" style={{ color: '#B9B0CF' }} />
                    <div className="text-[13px]" style={{ color: '#6B6480' }}>
                      {loadError ? loadError : (search || statusFilter !== 'all' ? 'Sin resultados para los filtros aplicados.' : 'Aún no hay contratos anuales. Crea el primero.')}
                    </div>
                  </td>
                </tr>
              )}

              {filtered.map(c => {
                const days = daysUntil(c.end_date);
                const showWarning = c.status === 'active' && days <= 60 && days >= 0;
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid #F0EBFA' }} className="transition-colors hover:bg-[#FAFAFB]">
                    <Td>
                      <div className="font-mono text-[12px] font-semibold" style={{ color: '#6C3BFF' }}>{c.contract_folio}</div>
                    </Td>
                    <Td>
                      <div className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>{c.organization_email}</div>
                    </Td>
                    <Td>
                      <div className="text-[12px]" style={{ color: '#6B6480' }}>
                        {formatDate(c.start_date)} → {formatDate(c.end_date)}
                      </div>
                      {showWarning && (
                        <div className="flex items-center gap-1 mt-0.5 text-[11px] font-semibold" style={{ color: '#B45309' }}>
                          <AlertTriangle size={10} />
                          Expira en {days} día{days === 1 ? '' : 's'}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="text-[14px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>{formatMoney(Number(c.amount_mxn), { minDecimals: 0, maxDecimals: 0 })}</div>
                    </Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td className="text-right">
                      <Link
                        href={`/admin/facturacion/${c.id}`}
                        className="text-[12px] font-semibold hover:underline"
                        style={{ color: '#6C3BFF' }}
                      >
                        Ver detalle →
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
            mutate();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, accent, icon, hint }: { label: string; value: string; accent: string; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl transition-all" style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center rounded-lg" style={{ background: `${accent}1A`, color: accent, width: 28, height: 28 }}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>{label}</p>
      </div>
      <p className="text-[24px] font-bold tracking-tight leading-none tabular-nums" style={{ color: '#1A0A3B' }}>{value}</p>
      {hint && <p className="text-[11px] mt-1" style={{ color: '#9B8FB5' }}>{hint}</p>}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] ${className}`}
      style={{ color: '#6B6480' }}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
