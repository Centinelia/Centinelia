import type { LucideIcon } from 'lucide-react';
import Icon from '../primitives/Icon';

/**
 * StatChip — chip pequeño con icono + label + valor. Para KPIs secundarios
 * en toolbars/headers. Valor con tabular-nums para evitar jitter.
 *
 * Uso:
 *   <StatChip icon={Phone} label="Llamadas hoy" value={42} />
 *   <StatChip icon={Clock} label="Prom" value="2:15" tone="accent" />
 */

export type StatChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface StatChipProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: StatChipTone;
  className?: string;
}

const TONE_CLASSES: Record<StatChipTone, string> = {
  neutral: 'text-[var(--text-secondary)]',
  accent:  'text-[var(--text-accent)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger:  'text-[var(--danger)]',
};

export default function StatChip({
  icon,
  label,
  value,
  tone = 'neutral',
  className,
}: StatChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-2 h-8 rounded-md px-3',
        'bg-[var(--surface-sunken)] text-[var(--fs-sm)]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon icon={icon} size={14} aria-hidden className={TONE_CLASSES[tone]} />
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className={`font-semibold tabular-nums ${TONE_CLASSES[tone]}`}>{value}</span>
    </span>
  );
}
