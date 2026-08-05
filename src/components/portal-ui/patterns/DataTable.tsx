'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import Icon from '../primitives/Icon';
import EmptyState from './EmptyState';

/**
 * DataTable — tabla genérica sortable con empty state built-in.
 * Fill-width por default (respeta layout rule).
 *
 * Uso:
 *   <DataTable
 *     columns={[
 *       { key:'name', header:'Nombre', sortable:true },
 *       { key:'value', header:'Valor', align:'right', render: r => <b>{r.value}</b> },
 *     ]}
 *     rows={data}
 *     rowKey={r => r.id}
 *     sortBy={sort}
 *     onSort={setSort}
 *     emptyState={{ icon: Inbox, title: 'Sin datos' }}
 *   />
 */

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sortBy?: { key: string; direction: SortDirection };
  onSort?: (key: string, direction: SortDirection) => void;
  emptyState?: {
    icon: LucideIcon;
    title: string;
    description?: string;
  };
  className?: string;
}

const ALIGN: Record<NonNullable<DataTableColumn<unknown>['align']>, string> = {
  left:   'text-left',
  center: 'text-center',
  right:  'text-right',
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  sortBy,
  onSort,
  emptyState,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return (
      <div className={['py-8', className ?? ''].filter(Boolean).join(' ')}>
        <EmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
        />
      </div>
    );
  }

  const handleHeaderClick = (col: DataTableColumn<T>) => {
    if (!col.sortable || !onSort) return;
    if (sortBy?.key === col.key) {
      onSort(col.key, sortBy.direction === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(col.key, 'asc');
    }
  };

  return (
    <div className={['w-full overflow-x-auto', className ?? ''].filter(Boolean).join(' ')}>
      <table className="w-full border-collapse text-[var(--fs-sm)]">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            {columns.map(col => {
              const align = col.align ?? 'left';
              const isSorted = sortBy?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={isSorted ? (sortBy.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  style={{ width: col.width }}
                  className={[
                    'px-3 py-2 text-[var(--fs-xs)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)]',
                    ALIGN[align],
                  ].join(' ')}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleHeaderClick(col)}
                      className="inline-flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] hover:text-[var(--text-secondary)]"
                    >
                      <span>{col.header}</span>
                      {isSorted && (
                        <Icon
                          icon={sortBy.direction === 'asc' ? ChevronUp : ChevronDown}
                          size={14}
                          aria-hidden
                        />
                      )}
                    </button>
                  ) : (
                    <span>{col.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              className="border-b border-[var(--border-subtle)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none hover:bg-[var(--surface-sunken)]"
            >
              {columns.map(col => {
                const align = col.align ?? 'left';
                const value = col.render ? col.render(row) : ((row as unknown as Record<string, React.ReactNode>)[col.key] ?? null);
                return (
                  <td
                    key={col.key}
                    className={['px-3 py-3 text-[var(--text-secondary)]', ALIGN[align]].join(' ')}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
