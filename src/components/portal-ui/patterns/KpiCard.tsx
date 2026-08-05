import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Icon from '../primitives/Icon';
import Card from './Card';

/**
 * KpiCard — Card con top-line color + ícono + número grande + label + sub.
 * Auto-stretch en grid (h-full).
 *
 * Uso:
 *   <KpiCard icon={Phone} label="Conversaciones" value={75} subLabel="prom. 2 min" />
 *   <KpiCard icon={Sparkles} label="Tareas" value={582} accentColor="var(--success)"
 *            trend={{direction:'up', value:'+12%'}} />
 */

export type KpiTrend = 'up' | 'down' | 'flat';

export interface KpiCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  icon: LucideIcon;
  accentColor?: string;
  trend?: { direction: KpiTrend; value: string };
  className?: string;
}

const TREND_ICON: Record<KpiTrend, LucideIcon> = {
  up:   TrendingUp,
  down: TrendingDown,
  flat: Minus,
};
const TREND_COLOR: Record<KpiTrend, string> = {
  up:   'var(--success)',
  down: 'var(--danger)',
  flat: 'var(--text-tertiary)',
};

export default function KpiCard({
  label,
  value,
  subLabel,
  icon,
  accentColor,
  trend,
  className,
}: KpiCardProps) {
  const color = accentColor ?? 'var(--accent-default)';

  return (
    <Card
      padding="none"
      className={['relative h-full overflow-hidden', className ?? ''].filter(Boolean).join(' ')}
    >
      {/* Top-line color */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: color }}
      />
      <div className="flex items-start gap-4 p-6 pt-7">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
        >
          <Icon icon={icon} size={20} strokeWidth={2} className="" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <span
              className="text-[var(--fs-3xl)] font-semibold tabular-nums leading-none text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {value}
            </span>
            {trend && (
              <span
                className="inline-flex items-center gap-0.5 text-[var(--fs-xs)] font-semibold tabular-nums"
                style={{ color: TREND_COLOR[trend.direction] }}
              >
                <Icon icon={TREND_ICON[trend.direction]} size={14} aria-hidden />
                {trend.value}
              </span>
            )}
          </div>
          <p className="text-[var(--fs-sm)] font-medium text-[var(--text-secondary)]">
            {label}
          </p>
          {subLabel && (
            <p className="text-[var(--fs-xs)] text-[var(--text-tertiary)]">{subLabel}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
