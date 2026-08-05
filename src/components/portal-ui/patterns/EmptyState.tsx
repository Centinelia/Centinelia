import type { LucideIcon } from 'lucide-react';
import Icon from '../primitives/Icon';

/**
 * EmptyState — pantalla vacía con icon + title + description + action.
 * Centered dentro de su container, no aplica fill-width.
 *
 * Uso:
 *   <EmptyState
 *     icon={Inbox}
 *     title="Sin mensajes"
 *     description="Cuando lleguen nuevos correos aparecerán aquí."
 *     action={<Button>Refrescar</Button>}
 *   />
 */

export type EmptyStateSize = 'sm' | 'md' | 'lg';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  size?: EmptyStateSize;
}

const SIZE_TOKENS: Record<
  EmptyStateSize,
  {
    container: string;
    iconWrap: string;
    iconSize: 18 | 20 | 24;
    title: string;
    description: string;
    gap: string;
  }
> = {
  sm: {
    container: 'py-6 px-4 max-w-xs',
    iconWrap: 'h-10 w-10',
    iconSize: 18,
    title: 'text-[var(--fs-sm)]',
    description: 'text-[var(--fs-xs)]',
    gap: 'gap-1.5',
  },
  md: {
    container: 'py-10 px-6 max-w-md',
    iconWrap: 'h-12 w-12',
    iconSize: 20,
    title: 'text-[var(--fs-lg)]',
    description: 'text-[var(--fs-sm)]',
    gap: 'gap-2',
  },
  lg: {
    container: 'py-16 px-8 max-w-lg',
    iconWrap: 'h-16 w-16',
    iconSize: 24,
    title: 'text-[var(--fs-xl)]',
    description: 'text-[var(--fs-sm)]',
    gap: 'gap-2.5',
  },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const tokens = SIZE_TOKENS[size];

  return (
    <div
      className={[
        'mx-auto flex flex-col items-center justify-center text-center',
        tokens.container,
        tokens.gap,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && (
        <div
          className={[
            'mb-2 flex items-center justify-center rounded-full',
            'bg-[var(--accent-subtle)] text-[var(--text-accent)]',
            tokens.iconWrap,
          ].join(' ')}
        >
          <Icon icon={icon} size={tokens.iconSize} aria-hidden />
        </div>
      )}
      <p className={`font-semibold text-[var(--text-primary)] ${tokens.title}`}>
        {title}
      </p>
      {description && (
        <p className={`leading-relaxed text-[var(--text-secondary)] ${tokens.description}`}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
