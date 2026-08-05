/**
 * Badge — pill de status/categoría no interactivo.
 * Variantes semánticas: neutral, info, success, warning, danger.
 *
 * Uso:
 *   <Badge variant="success">Activo</Badge>
 *   <Badge variant="warning" dot>Pendiente</Badge>
 */

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-[var(--surface-sunken)] text-[var(--text-secondary)]',
  info:    'bg-[var(--info-subtle)]    text-[var(--info)]',
  success: 'bg-[var(--success-subtle)] text-[var(--success)]',
  warning: 'bg-[var(--warning-subtle)] text-[var(--warning)]',
  danger:  'bg-[var(--danger-subtle)]  text-[var(--danger)]',
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-[var(--text-tertiary)]',
  info:    'bg-[var(--info)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger:  'bg-[var(--danger)]',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'h-[18px] px-1.5 text-[11px] gap-1',
  md: 'h-[22px] px-2 text-[13px] gap-1.5',
};

export default function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center justify-center rounded-full font-medium leading-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {dot && (
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[variant]}`} />
      )}
      {children}
    </span>
  );
}
