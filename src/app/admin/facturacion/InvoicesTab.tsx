'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Download, Search, X } from 'lucide-react';
import type { AnnualContract } from '@/types/annual-contract';

function formatMXN(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InvoicesTab() {
  const [contracts, setContracts] = useState<AnnualContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<'all' | number>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/annual-contracts', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? json.error ?? 'Error cargando facturas');
        setContracts(json.contracts ?? []);
      } catch (e: any) {
        setError(e.message);
        setContracts([]);
      }
    })();
  }, []);

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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--c-text-3)' }} />
          <input
            type="text"
            placeholder="Buscar por folio CFDI, contrato o cliente…"
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
          value={year === 'all' ? 'all' : String(year)}
          onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
        >
          <option value="all">Todos los años</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--c-surface-2)' }}>
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Folio CFDI</th>
                <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Cliente</th>
                <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Contrato</th>
                <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Fecha SPEI</th>
                <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Monto</th>
                <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Descargar</th>
              </tr>
            </thead>
            <tbody>
              {contracts === null && (
                <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--c-text-2)' }}>Cargando facturas…</td></tr>
              )}
              {contracts !== null && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <FileText size={26} className="mx-auto mb-2" style={{ color: 'var(--c-text-3)' }} />
                    <div className="text-sm" style={{ color: 'var(--c-text-2)' }}>
                      {error ? error : 'Sin facturas emitidas para los filtros seleccionados.'}
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--c-divider)' }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--c-text)' }}>{c.invoice_folio}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--c-text)' }}>{c.organization_email}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--c-text-2)' }}>{c.contract_folio}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--c-text-2)' }}>{formatDate(c.payment_received_at)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium" style={{ color: 'var(--c-text)' }}>{formatMXN(Number(c.amount_mxn))}</td>
                  <td className="px-4 py-3 text-right">
                    {c.invoice_pdf_url ? (
                      <a
                        href={c.invoice_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                        style={{ color: '#9B6DFF' }}
                      >
                        <Download size={12} />
                        PDF
                      </a>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Sin archivo</span>
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
