'use client';

import { forwardRef, useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import Icon from './Icon';
import Label from './Label';

/**
 * Input — text input con label + helper + error states + iconos opcionales.
 * Sizes: md (36px) o lg (44px, touch-friendly).
 *
 * Uso:
 *   <Input label="Correo" type="email" required />
 *   <Input label="Buscar" iconLeft={Search} placeholder="..." />
 *   <Input label="Password" type="password" error="Muy corto" />
 */

export type InputSize = 'md' | 'lg';

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helper?: string;
  error?: string;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  inputSize?: InputSize;
  required?: boolean;
}

const SIZE_CLASS: Record<InputSize, string> = {
  md: 'h-9 text-sm',
  lg: 'h-11 text-sm',
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helper,
    error,
    iconLeft,
    iconRight,
    inputSize = 'md',
    required,
    className,
    id,
    disabled,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedById = error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined;

  const borderClass = error
    ? 'border-[var(--danger)] focus-visible:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
    : 'border-[var(--border-default)] focus-visible:border-[var(--accent-default)] focus-visible:shadow-[var(--shadow-focus)]';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      )}
      <div className="relative">
        {iconLeft && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--text-tertiary)]">
            <Icon icon={iconLeft} size={16} aria-hidden />
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          aria-required={required}
          className={[
            'w-full rounded-md bg-[var(--surface-elevated)] border px-3',
            'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
            'transition-shadow duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
            'focus-visible:outline-none',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            SIZE_CLASS[inputSize],
            borderClass,
            iconLeft ? 'pl-9' : '',
            iconRight ? 'pr-9' : '',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />
        {iconRight && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--text-tertiary)]">
            <Icon icon={iconRight} size={16} aria-hidden />
          </span>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-[var(--fs-xs)] text-[var(--danger)]">
          {error}
        </p>
      ) : helper ? (
        <p id={`${inputId}-helper`} className="text-[var(--fs-xs)] text-[var(--text-tertiary)]">
          {helper}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
