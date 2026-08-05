'use client';

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import Icon from './Icon';

/**
 * Button — botón con 4 variants (primary/secondary/ghost/danger),
 * 3 sizes (sm/md/lg), iconLeft/Right, loading state.
 *
 * Uso:
 *   <Button variant="primary" onClick={...}>Guardar</Button>
 *   <Button variant="ghost" size="sm" iconLeft={Download}>Descargar</Button>
 *   <Button variant="primary" loading disabled>Enviando...</Button>
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent-default)] text-[var(--text-inverse)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-emphasized)]',
  secondary:
    'bg-[var(--accent-subtle)] text-[var(--text-accent)] hover:bg-[color-mix(in_srgb,var(--accent-default)_16%,var(--surface-elevated))]',
  ghost:
    'bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]',
  danger:
    'bg-[var(--danger)] text-[var(--text-inverse)] hover:bg-[color-mix(in_srgb,var(--danger)_88%,black)]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-4 text-sm gap-2',
};

const ICON_SIZE: Record<ButtonSize, 14 | 16 | 18> = {
  sm: 14,
  md: 16,
  lg: 18,
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    loading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const iconSize = ICON_SIZE[size];

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center rounded-md font-medium leading-none',
        'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <Icon icon={Loader2} size={iconSize} className="animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        iconLeft && <Icon icon={iconLeft} size={iconSize} aria-hidden />
      )}
      {children}
      {!loading && iconRight && <Icon icon={iconRight} size={iconSize} aria-hidden />}
    </button>
  );
});

export default Button;
