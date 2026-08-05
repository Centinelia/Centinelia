import Avatar from '../primitives/Avatar';

/**
 * RankRow — row para listas rankeadas: [rank] [indicator dot] [avatar] [title/subtitle] [metrics] [action].
 *
 * Uso:
 *   <RankRow
 *     rank={1}
 *     indicator={{color:'var(--success)', label:'activo'}}
 *     avatar={{src:'/nox.png', initial:'N'}}
 *     title="Nox" subtitle="Director"
 *     metrics={[{label:'llamadas', value:12}]}
 *     action={<Button size="sm" variant="ghost">Ver</Button>}
 *   />
 */

export interface RankRowMetric {
  label: string;
  value: string | number;
}

export interface RankRowIndicator {
  color: string;
  label?: string;
}

export interface RankRowProps {
  rank?: number;
  indicator?: RankRowIndicator;
  avatar: {
    src?: string | null;
    initial: string;
    alt?: string;
  };
  title: string;
  subtitle?: string;
  metrics?: RankRowMetric[];
  action?: React.ReactNode;
  className?: string;
}

export default function RankRow({
  rank,
  indicator,
  avatar,
  title,
  subtitle,
  metrics,
  action,
  className,
}: RankRowProps) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-lg px-3 py-2',
        'hover:bg-[var(--surface-sunken)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {typeof rank === 'number' && (
        <span className="w-5 shrink-0 text-center text-[var(--fs-xs)] font-semibold tabular-nums text-[var(--text-tertiary)]">
          #{rank}
        </span>
      )}
      {indicator && (
        <span
          aria-label={indicator.label}
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: indicator.color }}
        />
      )}
      <Avatar
        src={avatar.src ?? null}
        initial={avatar.initial}
        alt={avatar.alt}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[var(--fs-sm)] font-semibold text-[var(--text-primary)]">
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-[var(--fs-xs)] text-[var(--text-tertiary)]">
            {subtitle}
          </p>
        )}
      </div>
      {metrics && metrics.length > 0 && (
        <div className="hidden md:flex shrink-0 items-center gap-4">
          {metrics.map(m => (
            <span key={m.label} className="text-right leading-tight">
              <span className="block text-[var(--fs-sm)] font-semibold tabular-nums text-[var(--text-primary)]">
                {m.value}
              </span>
              <span className="block text-[var(--fs-xs)] text-[var(--text-tertiary)]">
                {m.label}
              </span>
            </span>
          ))}
        </div>
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
