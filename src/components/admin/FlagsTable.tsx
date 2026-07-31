'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Ban } from 'lucide-react';
import type { FlagRow } from '@/lib/feature-flags/types';

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
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: prefix === p ? 'rgba(108,59,255,0.15)' : 'var(--c-surface-2)',
              color:      prefix === p ? '#9B6DFF' : 'var(--c-text-2)',
              border:     '1px solid var(--c-border)',
            }}
          >
            {p === 'all' ? 'Todos' : p}
          </button>
        ))}
        <button
          onClick={() => setOnlyKilled(v => !v)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5"
          style={{
            background: onlyKilled ? 'rgba(220,38,38,0.15)' : 'var(--c-surface-2)',
            color:      onlyKilled ? '#DC2626' : 'var(--c-text-2)',
            border:     '1px solid var(--c-border)',
          }}
        >
          <Ban size={14} />
          Solo killed
        </button>
        <div className="flex-1 relative min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text-2)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por flag_key"
            className="w-full pl-9 pr-3 py-1.5 rounded-lg text-sm"
            style={{
              background: 'var(--c-surface-2)',
              color:      'var(--c-text)',
              border:     '1px solid var(--c-border)',
            }}
          />
        </div>
        <Link
          href="/admin/flags/new"
          className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5"
          style={{ background: '#6C3BFF', color: '#FAFBFF' }}
        >
          <Plus size={14} />
          Nuevo flag
        </Link>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--c-surface-2)' }}>
            <tr>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>flag_key</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>%</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>allow</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>deny</th>
              <th className="text-center px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>estado</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center px-4 py-8" style={{ color: 'var(--c-text-2)' }}>
                  Sin flags que coincidan.
                </td>
              </tr>
            )}
            {filtered.map(f => (
              <tr key={f.flag_key} style={{ borderTop: '1px solid var(--c-border)' }}>
                <td className="px-4 py-2">
                  <Link href={`/admin/flags/${encodeURIComponent(f.flag_key)}`} style={{ color: '#9B6DFF' }}>
                    {f.flag_key}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--c-text)' }}>{f.rollout_pct}</td>
                <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--c-text-2)' }}>{f.allowlist.length}</td>
                <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--c-text-2)' }}>{f.denylist.length}</td>
                <td className="px-4 py-2 text-center">
                  {f.killed ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(220,38,38,0.15)', color: '#DC2626' }}>
                      <Ban size={12} /> KILLED
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>activo</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-xs" style={{ color: 'var(--c-text-2)' }}>
                  {timeAgo(f.updated_at)}
                </td>
              </tr>
            ))}
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
