'use client';

import { useMemo, useState } from 'react';
import { FileText, Download, Search, X } from 'lucide-react';
import type { AnnualContract } from '@/types/annual-contract';
import { useApi } from '@/lib/hooks/useApi';
import { formatMoney } from '@/lib/format/money';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InvoicesTab() {
  const { data: contracts, error: fetchError } =
    useApi<AnnualContract[]>('/api/admin/annual-contracts', { key: 'contracts' });
  const loadError = fetchError?.message ?? null;

  const [year, setYear]   = useState<'all' | number>('all');
  const [search, setSearch] = useState('');

  const invoiced = useMemo(() => (contracts ?? []).filter(c => c.invoice_folio), [contracts]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const c of invoiced) {
      const base = c.payment_received_at ?? c.created_at;
      if (base) set.add(new Date(base).getFullYear());
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [invoiced]);

  const filtered = useMemo(() => {
    let list = [...invoiced];
    if (year !== 'all') {
      list = list.filter(c => {
        const base = c.payment_received_at ?? c.created_at;
        return base ? new Date(base).getFullYear() === year : false;
      });
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(c =>
      (c.invoice_folio ?? '').toLowerCase().includes(q) ||
      c.organization_email.toLowerCase().includes(q) ||
      c.contract_folio.toLowerCase().includes(q)
    );
    list.sort((a, b) => {
      const ba = a.payment_received_at ?? a.created_at;
      const bb = b.payment_received_at ?? b.created_at;
      return (bb ?? '').localeCompare(ba ?? '');
    });
    return list;
  }, [invoiced, year, search]);

  const totalYear = useMemo(
    () => filtered.reduce((sum, c) => sum + Number(c.amount_mxn ?? 0), 0),
    [filtered],
  );

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9B8FB5' }} />
          <input
            type="text"
            placeholder="Buscar por folio CFDI, contrato o cliente…"
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
          value={year === 'all' ? 'all' : String(year)}
          onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="rounded-xl text-[13px] outline-none px-3.5"
          style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B', height: 38 }}
        >
          <option value="all">Todos los años</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {filtered.length > 0 && (
          <div className="ml-auto rounded-xl px-4 py-2" style={{ background: '#F5F0FF', border: '1px solid #E8E3F5' }}>
            <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: '#9B6DFF' }}>Total facturado</span>{' '}
            <span className="text-[14px] font-bold tabular-nums ml-1" style={{ color: '#1A0A3B' }}>
              {formatMoney(totalYear, { minDecimals: 0, maxDecimals: 0 })}
            </span>
          </div>
        )}
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ background: '#FAFAFB' }}>
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>Folio CFDI</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>Cliente</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>Contrato</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>Fecha SPEI</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>Monto</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>Descargar</th>
              </tr>
            </thead>
            <tbody>
              {contracts === undefined && !fetchError && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[13px]" style={{ color: '#6B6480' }}>Cargando facturas…</td></tr>
              )}
              {contracts !== undefined && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <FileText size={22} className="mx-auto mb-2" style={{ color: '#B9B0CF' }} />
                    <div className="text-[13px]" style={{ color: '#6B6480' }}>
                      {loadError ? loadError : 'Sin facturas emitidas para los filtros seleccionados.'}
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #F0EBFA' }} className="transition-colors hover:bg-[#FAFAFB]">
                  <td className="px-4 py-3 font-mono text-[12px] font-semibold" style={{ color: '#6C3BFF' }}>{c.invoice_folio}</td>
                  <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>{c.organization_email}</td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: '#6B6480' }}>{c.contract_folio}</td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: '#6B6480' }}>{formatDate(c.payment_received_at)}</td>
                  <td className="px-4 py-3 text-right text-[14px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>{formatMoney(Number(c.amount_mxn), { minDecimals: 0, maxDecimals: 0 })}</td>
                  <td className="px-4 py-3 text-right">
                    {c.invoice_pdf_url ? (
                      <a
                        href={c.invoice_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold hover:underline"
                        style={{ color: '#6C3BFF' }}
                      >
                        <Download size={12} />
                        PDF
                      </a>
                    ) : (
                      <span className="text-[12px]" style={{ color: '#9B8FB5' }}>Sin archivo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
