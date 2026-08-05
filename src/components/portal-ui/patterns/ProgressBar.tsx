import { uColor } from '@/lib/portal/utils';

/**
 * ProgressBar — barra de progreso con color automático por porcentaje
 * (verde → amarillo → rojo via uColor helper) o color manual.
 *
 * Uso:
 *   <ProgressBar value={87} label="Minutos consumidos" />
 *   <ProgressBar value={40} size="xs" color="var(--accent-default)" />
 */

export type ProgressBarSize = 'xs' | 'sm' | 'md';

export interface ProgressBarProps {
  value: number;
  size?: ProgressBarSize;
  color?: string;
  label?: string;
  className?: string;
}

const HEIGHT: Record<ProgressBarSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
};

export default function ProgressBar({
  value,
  size = 'xs',
  color,
  label,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const fillColor = color ?? uColor(clamped);

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={[
        'overflow-hidden rounded-full bg-[var(--surface-sunken)]',
        HEIGHT[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="h-full rounded-full motion-reduce:transition-none"
        style={{
          width: `${clamped}%`,
          background: fillColor,
          transition: 'width var(--motion-slow) var(--ease-default)',
        }}
      />
    </div>
  );
}
