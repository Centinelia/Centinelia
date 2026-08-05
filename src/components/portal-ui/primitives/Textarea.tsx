'use client';

import { forwardRef, useId } from 'react';
import Label from './Label';

/**
 * Textarea — multi-line input con label/helper/error.
 *
 * Uso:
 *   <Textarea label="Descripción" rows={4} />
 *   <Textarea label="Notas" helper="Máximo 500 caracteres" maxLength={500} />
 */

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helper?: string;
  error?: string;
  required?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    helper,
    error,
    required,
    className,
    id,
    rows = 4,
    disabled,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const tid = id ?? autoId;
  const describedById = error ? `${tid}-error` : helper ? `${tid}-helper` : undefined;

  const borderClass = error
    ? 'border-[var(--danger)] focus-visible:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
    : 'border-[var(--border-default)] focus-visible:border-[var(--accent-default)] focus-visible:shadow-[var(--shadow-focus)]';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label htmlFor={tid} required={required}>
          {label}
        </Label>
      )}
      <textarea
        ref={ref}
        id={tid}
        rows={rows}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        aria-required={required}
        className={[
          'w-full rounded-md bg-[var(--surface-elevated)] border px-3 py-2 text-sm resize-y min-h-[80px]',
          'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
          'transition-shadow duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
          'focus-visible:outline-none',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          borderClass,
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {error ? (
        <p id={`${tid}-error`} role="alert" className="text-[var(--fs-xs)] text-[var(--danger)]">
          {error}
        </p>
      ) : helper ? (
        <p id={`${tid}-helper`} className="text-[var(--fs-xs)] text-[var(--text-tertiary)]">
          {helper}
        </p>
      ) : null}
    </div>
  );
});

export default Textarea;
