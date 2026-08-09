'use client';

import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_COLORS, normalizeCategory } from './categories';
import type { CategorySlug } from './categories';

interface CategoryChipsItem {
  category: string | null;
}

interface CategoryChipsProps {
  items:          CategoryChipsItem[];
  activeCategory: CategorySlug | null;
  onSelect:       (cat: CategorySlug | null) => void;
}

/**
 * Chips de categoría para filtrar la bandeja. Cuando se selecciona uno,
 * se resalta en el color de la categoría (no lila) para que el usuario
 * asocie visualmente color = categoría en todas partes del inbox.
 */
export default function CategoryChips({ items, activeCategory, onSelect }: CategoryChipsProps) {
  if (items.length <= 3) return null;

  const counts = new Map<CategorySlug, number>();
  for (const it of items) {
    const c = normalizeCategory(it.category);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  const availableSlugs = CATEGORY_ORDER.filter(slug => (counts.get(slug) ?? 0) > 0);
  if (availableSlugs.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-bold uppercase tracking-widest mr-1" style={{ color: '#9B8FB5', letterSpacing: '0.08em' }}>
        Categorías
      </span>

      {/* "Todas" chip — siempre en lila (color de la app) */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full transition-all"
        style={{
          background: activeCategory === null ? '#6C3BFF' : '#FAFAFB',
          color:      activeCategory === null ? '#ffffff' : '#6B6480',
          border:     `1px solid ${activeCategory === null ? '#6C3BFF' : '#E8E3F5'}`,
          boxShadow:  activeCategory === null ? '0 1px 2px rgba(108,59,255,0.25)' : 'none',
          cursor:     'pointer',
        }}
      >
        Todas
        <span
          className="text-[10px] font-bold tabular-nums px-1.5 rounded-full min-w-[16px] text-center"
          style={{
            background: activeCategory === null ? 'rgba(255,255,255,0.20)' : '#ffffff',
            color:      activeCategory === null ? '#ffffff' : '#6B6480',
          }}
        >
          {items.length}
        </span>
      </button>

      {/* Chips por categoría — usa el color de la categoría */}
      {availableSlugs.map(slug => {
        const isActive = activeCategory === slug;
        const catColor = CATEGORY_COLORS[slug];
        return (
          <button
            key={slug}
            type="button"
            onClick={() => onSelect(isActive ? null : slug)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full transition-all"
            style={{
              background: isActive ? catColor.fg  : catColor.bg,
              color:      isActive ? '#ffffff'    : catColor.fg,
              border:     `1px solid ${isActive ? catColor.fg : catColor.border}`,
              boxShadow:  isActive ? `0 1px 2px ${catColor.fg}40` : 'none',
              cursor:     'pointer',
            }}
          >
            {CATEGORY_LABELS[slug]}
            <span
              className="text-[10px] font-bold tabular-nums px-1.5 rounded-full min-w-[16px] text-center"
              style={{
                background: isActive ? 'rgba(255,255,255,0.22)' : '#ffffff',
                color:      isActive ? '#ffffff' : catColor.fg,
              }}
            >
              {counts.get(slug) ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
