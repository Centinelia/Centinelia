'use client';

import { X } from 'lucide-react';
import Icon from './Icon';

/**
 * Chip — tag/filter interactivo, opcionalmente removible o toggleable.
 *
 * Non-removable: outer <button>
 * Removable: outer <span role="group"> con inner <button> label + inner <button> X
 *
 * Uso:
 *   <Chip label="Todos" selected onSelect={() => setFilter('all')} />
 *   <Chip label="Ventas" removable onRemove={() => removeTag('ventas')} />
 */

export interface ChipProps {
  label: string;
  selected?: boolean;
  removable?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  className?: string;
  disabled?: boolean;
}

const CONTAINER =
  'inline-flex items-center gap-1.5 h-7 rounded-full text-[13px] font-medium leading-none px-3 ' +
  'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none ' +
  'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

const REMOVE_BTN =
  'inline-flex items-center justify-center rounded-full p-0.5 -mr-1 ' +
  'hover:bg-[var(--surface-elevated)] ' +
  'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none ' +
  'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

const IDLE = 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]';
const SELECTED = 'bg-[var(--accent-subtle)] text-[var(--text-accent)]';

export default function Chip({
  label,
  selected = false,
  removable = false,
  onSelect,
  onRemove,
  className,
  disabled = false,
}: ChipProps) {
  const stateClass = selected ? SELECTED : IDLE;
  const classes = [CONTAINER, stateClass, className ?? ''].filter(Boolean).join(' ');

  if (!removable) {
    // Simple mode: single <button>
    return (
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={onSelect ? selected : undefined}
        className={classes}
      >
        <span>{label}</span>
      </button>
    );
  }

  // Removable mode: <span role="group"> con inner buttons independientes
  return (
    <span role="group" aria-label={label} className={classes}>
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          disabled={disabled}
          aria-pressed={selected}
          className="bg-transparent hover:underline focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:opacity-60 disabled:cursor-not-allowed rounded-sm"
        >
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Quitar ${label}`}
        className={REMOVE_BTN}
      >
        <Icon icon={X} size={14} aria-hidden />
      </button>
    </span>
  );
}
