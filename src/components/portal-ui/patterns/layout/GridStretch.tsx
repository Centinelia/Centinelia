/**
 * GridStretch — grid responsive con alturas iguales (auto-rows-fr).
 * Configuración de columnas por breakpoint y gap desde escala tokens.
 *
 * Uso:
 *   <GridStretch cols={{ base: 1, md: 2, xl: 4 }} gap={4}>
 *     <KpiCard ... />
 *     <KpiCard ... />
 *   </GridStretch>
 */

import type { ReactNode } from 'react';

type ColCount = 1 | 2 | 3 | 4;
type GapSize = 2 | 3 | 4 | 6 | 8;

export interface GridStretchProps {
  children: ReactNode;
  cols?: { base?: ColCount; md?: ColCount; xl?: ColCount };
  gap?: GapSize;
  className?: string;
}

const BASE_COLS: Record<ColCount, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const MD_COLS: Record<ColCount, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

const XL_COLS: Record<ColCount, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
};

const GAP: Record<GapSize, string> = {
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8',
};

export default function GridStretch({
  children,
  cols = { base: 1, md: 2, xl: 3 },
  gap = 4,
  className = '',
}: GridStretchProps) {
  const baseClass = BASE_COLS[cols.base ?? 1];
  const mdClass = cols.md ? MD_COLS[cols.md] : '';
  const xlClass = cols.xl ? XL_COLS[cols.xl] : '';
  const gapClass = GAP[gap];

  return (
    <div className={`grid auto-rows-fr ${baseClass} ${mdClass} ${xlClass} ${gapClass} ${className}`}>
      {children}
    </div>
  );
}
