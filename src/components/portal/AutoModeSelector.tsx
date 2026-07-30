'use client';

import { useState, useTransition } from 'react';
import { Hand, ShieldCheck, Zap } from 'lucide-react';
import { toast } from 'sonner';

export type AutoMode = 'off' | 'auto' | 'always';

interface AutoModeSelectorProps {
  token:       string;
  provider:    string;
  current:     AutoMode;
  onChange?:   (next: AutoMode) => void;
}

interface Option {
  value:       AutoMode;
  label:       string;
  description: string;
  Icon:        typeof Hand;
  recommended?: boolean;
}

const OPTIONS: Option[] = [
  {
    value:       'off',
    label:       'Manual',
    description: 'Reviso todo antes de enviar',
    Icon:        Hand,
  },
  {
    value:       'auto',
    label:       'Auto',
    description: 'El empleado envía los seguros, tú lees los importantes',
    Icon:        ShieldCheck,
    recommended: true,
  },
  {
    value:       'always',
    label:       'Automático',
    description: 'Envía todo sin preguntar. Solo si ya validaste',
    Icon:        Zap,
  },
];

export function AutoModeSelector({ token, provider, current, onChange }: AutoModeSelectorProps) {
  const [value, setValue] = useState<AutoMode>(current);
  const [pending, startTransition] = useTransition();

  const handleSelect = (next: AutoMode) => {
    if (next === value || pending) return;
    const prev = value;
    setValue(next);  // optimistic

    startTransition(async () => {
      try {
        const res = await fetch(`/api/portal/${token}/email-oauth`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ provider, auto_mode: next }),
        });
        if (!res.ok) throw new Error('PATCH failed');
        onChange?.(next);
        toast.success('Modo actualizado');
      } catch {
        setValue(prev);  // rollback
        toast.error('No se pudo actualizar. Intenta de nuevo.');
      }
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {OPTIONS.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleSelect(opt.value)}
            disabled={pending}
            className={`text-left rounded-xl border p-4 transition ${
              active
                ? 'border-[#6C3BFF] bg-[#F4F0FF]'
                : 'border-[rgba(26,10,59,0.12)] bg-white hover:border-[rgba(108,59,255,0.4)]'
            } ${pending ? 'opacity-60 cursor-wait' : ''}`}
            aria-pressed={active}
          >
            <div className="flex items-start justify-between mb-2">
              <opt.Icon size={20} className={active ? 'text-[#6C3BFF]' : 'text-[rgba(26,10,59,0.6)]'} />
              {opt.recommended && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6C3BFF] bg-white border border-[#6C3BFF] rounded-full px-2 py-0.5">
                  Recomendado
                </span>
              )}
            </div>
            <div className={`font-semibold text-sm mb-1 ${active ? 'text-[#1A0A3B]' : 'text-[#1A0A3B]'}`}>
              {opt.label}
            </div>
            <div className="text-xs text-[rgba(26,10,59,0.6)] leading-relaxed">
              {opt.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
