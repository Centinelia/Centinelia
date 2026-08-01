'use client';

import { CATEGORY_ORDER, CATEGORY_LABELS, normalizeCategory } from './categories';
import type { CategorySlug } from './categories';

interface CategoryChipsItem {
  category: string | null;
}

interface CategoryChipsProps {
  items:          CategoryChipsItem[];
  activeCategory: CategorySlug | null;
  onSelect:       (cat: CategorySlug | null) => void;
}

export default function CategoryChips({ items, activeCategory, onSelect }: CategoryChipsProps) {
  if (items.length <= 3) return null;

  const counts = new Map<CategorySlug, number>();
  for (const it of items) {
    const c = normalizeCategory(it.category);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  const availableSlugs = CATEGORY_ORDER.filter(slug => (counts.get(slug) ?? 0) > 0);
  if (availableSlugs.length === 0) return null;

  const chipBase =
    'text-xs px-3 py-1 rounded-full font-medium transition-colors flex items-center gap-1.5';

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        className={chipBase}
        onClick={() => onSelect(null)}
        style={{
          background: activeCategory === null ? '#6C3BFF' : 'var(--c-surface)',
          color:      activeCategory === null ? '#fff'    : 'var(--c-text-3)',
          border:     `1px solid ${activeCategory === null ? '#6C3BFF' : 'var(--c-border)'}`,
        }}
      >
        Todas
        <span
          className="text-[10px] font-semibold px-1.5 py-0 rounded-full"
          style={{
            background: activeCategory === null ? 'rgba(255,255,255,0.20)' : 'var(--c-surface-2)',
            color:      activeCategory === null ? '#fff'                    : 'var(--c-text-3)',
          }}
        >
          {items.length}
        </span>
      </button>
      {availableSlugs.map(slug => {
        const isActive = activeCategory === slug;
        return (
          <button
            key={slug}
            type="button"
            className={chipBase}
            onClick={() => onSelect(isActive ? null : slug)}
            style={{
              background: isActive ? '#6C3BFF' : 'var(--c-surface)',
              color:      isActive ? '#fff'    : 'var(--c-text-3)',
              border:     `1px solid ${isActive ? '#6C3BFF' : 'var(--c-border)'}`,
            }}
          >
            {CATEGORY_LABELS[slug]}
            <span
              className="text-[10px] font-semibold px-1.5 py-0 rounded-full"
              style={{
                background: isActive ? 'rgba(255,255,255,0.20)' : 'var(--c-surface-2)',
                color:      isActive ? '#fff'                    : 'var(--c-text-3)',
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
