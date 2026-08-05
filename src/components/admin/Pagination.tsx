'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page:       number;
  totalPages: number;
  onNavigate: (page: number) => void;
  disabled?:  boolean;
}

// Compact page list: [1, ..., current-1, current, current+1, ..., last].
// First and last always visible; ellipsis on gaps.
export function pageNumbers(current: number, total: number): Array<number | '...'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3)            { set.add(2); set.add(3); set.add(4); }
  if (current >= total - 2)    { set.add(total - 1); set.add(total - 2); set.add(total - 3); }
  const sorted = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  const result: Array<number | '...'> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...');
    result.push(sorted[i]);
  }
  return result;
}

export function Pagination({ page, totalPages, onNavigate, disabled }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-5 pt-4 gap-2" style={{ borderTop: '1px solid #E5E7EB' }}>
      <button
        onClick={() => onNavigate(page - 1)}
        disabled={page <= 1 || disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50 disabled:opacity-30 flex-shrink-0"
        style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
      >
        <ChevronLeft size={13} /> <span className="hidden sm:inline">Anterior</span>
      </button>

      <div className="flex items-center gap-1 flex-wrap justify-center">
        {pageNumbers(page, totalPages).map((p, i) => (
          p === '...' ? (
            <span key={`e${i}`} className="px-2 py-1 text-[13px]" style={{ color: '#9CA3AF' }}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onNavigate(p as number)}
              disabled={disabled}
              className="min-w-[32px] px-2 py-1 rounded-lg text-[13px] font-medium tabular-nums transition-colors"
              style={
                p === page
                  ? { background: '#6C3BFF', color: '#FAFBFF', border: '1px solid #6C3BFF' }
                  : { background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }
              }
            >
              {p}
            </button>
          )
        ))}
      </div>

      <button
        onClick={() => onNavigate(page + 1)}
        disabled={page >= totalPages || disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50 disabled:opacity-30 flex-shrink-0"
        style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
      >
        <span className="hidden sm:inline">Siguiente</span> <ChevronRight size={13} />
      </button>
    </div>
  );
}
