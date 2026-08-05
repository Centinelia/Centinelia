'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Ban } from 'lucide-react';
import type { FlagRow } from '@/lib/feature-flags/types';
import { computeAt100Badge } from '@/lib/feature-flags/badges';

type Prefix = 'all' | 'meerkat' | 'portal' | 'tool' | 'silent';

export function FlagsTable({ initialFlags }: { initialFlags: FlagRow[] }) {
  const [prefix, setPrefix] = useState<Prefix>('all');
  const [onlyKilled, setOnlyKilled] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return initialFlags.filter(f => {
      if (onlyKilled && !f.killed) return false;
      if (prefix !== 'all' && !f.flag_key.startsWith(prefix + '.')) return false;
      if (query && !f.flag_key.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [initialFlags, prefix, onlyKilled, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'meerkat', 'portal', 'tool', 'silent'] as Prefix[]).map(p => (
          <button
            key={p}
            onClick={() => setPrefix(p)}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
            style={{
              background: prefix === p ? '#F3F0FF' : '#FFFFFF',
              color:      prefix === p ? '#6C3BFF' : '#374151',
              border:     `1px solid ${prefix === p ? '#DDD6FE' : '#E5E7EB'}`,
            }}
          >
            {p === 'all' ? 'Todos' : p}
          </button>
        ))}
        <button
          onClick={() => setOnlyKilled(v => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
          style={{
            background: onlyKilled ? '#FEF2F2' : '#FFFFFF',
            color:      onlyKilled ? '#B91C1C' : '#374151',
            border:     `1px solid ${onlyKilled ? '#FECACA' : '#E5E7EB'}`,
          }}
        >
          <Ban size={13} />
          Solo killed
        </button>
        <div className="flex-1 relative min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por flag_key"
            className="w-full pl-9 pr-3 py-1.5 rounded-lg text-[13px] outline-none focus:ring-2 focus:ring-[#6C3BFF]/20"
            style={{
              background: '#FFFFFF',
              color:      '#111827',
              border:     '1px solid #E5E7EB',
            }}
          />
        </div>
        <Link
          href="/admin/flags/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#FFFFFF' }}
        >
          <Plus size={13} />
          Nuevo flag
        </Link>
      </div>

      <div
        className="rounded-xl overflow-hidden bg-white"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
      >
        <table className="w-full text-[13px]">
          <thead style={{ background: '#F9FAFB' }}>
            <tr>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>flag_key</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>%</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>allow</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>deny</th>
              <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Estado</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center px-4 py-10 text-[13px]" style={{ color: '#6B7280' }}>
                  Sin flags que coincidan.
                </td>
              </tr>
            )}
            {filtered.map((f, i) => {
              const at100 = computeAt100Badge(f);
              return (
                <tr
                  key={f.flag_key}
                  className="transition-colors hover:bg-gray-50"
                  style={{ borderTop: i > 0 ? '1px solid #F3F4F6' : undefined }}
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/flags/${encodeURIComponent(f.flag_key)}`}
                      className="font-mono text-[13px] font-medium transition-colors hover:underline"
                      style={{ color: '#6C3BFF' }}
                    >
                      {f.flag_key}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums" style={{ color: '#111827' }}>{f.rollout_pct}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums" style={{ color: '#6B7280' }}>{f.allowlist.length}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums" style={{ color: '#6B7280' }}>{f.denylist.length}</td>
                  <td className="px-4 py-2.5 text-center">
                    {f.killed ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium"
                        style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}
                      >
                        <Ban size={11} /> KILLED
                      </span>
                    ) : at100 ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium"
                        style={
                          at100.tone === 'green'
                            ? { background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }
                            : { background: '#F3F0FF', color: '#6C3BFF', border: '1px solid #DDD6FE' }
                        }
                      >
                        {at100.label}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium"
                        style={{ background: '#F3F4F6', color: '#4B5563', border: '1px solid #E5E7EB' }}
                      >
                        activo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[12px]" style={{ color: '#6B7280' }}>
                    {timeAgo(f.updated_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `hace ${s}s`;
  if (s < 3600)  return `hace ${Math.floor(s / 60)}m`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
  return `hace ${Math.floor(s / 86400)}d`;
}
