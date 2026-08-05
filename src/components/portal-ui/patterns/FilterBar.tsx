'use client';

import Chip from '../primitives/Chip';

/**
 * FilterBar — grupo horizontal de Chips (single o multi select).
 *
 * Uso:
 *   <FilterBar
 *     options={[{value:'todos', label:'Todos'}, {value:'hoy', label:'Hoy'}]}
 *     value={filter}
 *     onChange={setFilter}
 *   />
 */

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterBarProps {
  options: FilterOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multi?: boolean;
  className?: string;
}

export default function FilterBar({
  options,
  value,
  onChange,
  multi = false,
  className,
}: FilterBarProps) {
  const isSelected = (v: string): boolean => {
    if (multi) return Array.isArray(value) && value.includes(v);
    return !Array.isArray(value) && value === v;
  };

  const handleSelect = (v: string) => {
    if (!multi) {
      onChange(v);
      return;
    }
    const current = Array.isArray(value) ? value : [];
    if (current.includes(v)) {
      onChange(current.filter(x => x !== v));
    } else {
      onChange([...current, v]);
    }
  };

  return (
    <div
      role={multi ? 'group' : 'radiogroup'}
      className={[
        'inline-flex flex-wrap items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map(opt => (
        <Chip
          key={opt.value}
          label={opt.label}
          selected={isSelected(opt.value)}
          onSelect={() => handleSelect(opt.value)}
        />
      ))}
    </div>
  );
}
