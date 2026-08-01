'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { es } from 'date-fns/locale';
import { format, parseISO, isValid } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import 'react-day-picker/dist/style.css';

interface DatePickerProps {
  value?: string | null;
  onChange?: (isoDate: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  min?: string;
  max?: string;
}

function fromIso(v?: string | null): Date | undefined {
  if (!v) return undefined;
  const d = parseISO(v);
  return isValid(d) ? d : undefined;
}

function toIso(d: Date | undefined): string {
  if (!d) return '';
  return format(d, 'yyyy-MM-dd');
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Elige fecha',
  disabled = false,
  className,
  min,
  max,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = fromIso(value);
  const displayText = selected ? format(selected, 'dd/MM/yyyy', { locale: es }) : '';
  const fromDate = fromIso(min);
  const toDate = fromIso(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm outline-none transition',
          'bg-[color:var(--c-input-bg)] border border-[color:var(--c-input-border)] text-[color:var(--c-text)]',
          'focus:ring-2 focus:ring-[#6C3BFF] focus:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
      >
        <span className={cn('truncate text-left', !selected && 'text-[color:var(--c-text-3)]')}>
          {displayText || placeholder}
        </span>
        <CalendarIcon size={16} className="shrink-0 text-[color:var(--c-text-3)]" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <DayPicker
          mode="single"
          locale={es}
          selected={selected}
          onSelect={d => {
            onChange?.(toIso(d));
            setOpen(false);
          }}
          disabled={
            fromDate || toDate
              ? [
                  ...(fromDate ? [{ before: fromDate }] : []),
                  ...(toDate ? [{ after: toDate }] : []),
                ]
              : undefined
          }
          className="text-[color:var(--c-text)] [&_.rdp-day_selected]:bg-[#6C3BFF] [&_.rdp-day_selected]:text-white [&_.rdp-day:hover]:bg-[color:var(--c-hover)]"
        />
      </PopoverContent>
    </Popover>
  );
}

interface TimeInputProps {
  value?: string | null;
  onChange?: (time: string) => void;
  disabled?: boolean;
  className?: string;
  min?: string;
  max?: string;
}

export function TimeInput({ value, onChange, disabled, className, min, max }: TimeInputProps) {
  return (
    <input
      type="time"
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      disabled={disabled}
      min={min}
      max={max}
      className={cn(
        'w-full rounded-lg px-3 py-2 text-sm outline-none transition',
        'bg-[color:var(--c-input-bg)] border border-[color:var(--c-input-border)] text-[color:var(--c-text)]',
        'focus:ring-2 focus:ring-[#6C3BFF] focus:ring-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-60',
        '[&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer',
        className
      )}
    />
  );
}
