'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';

type BizOption = { business_name: string; logo_url: string | null; first_token: string };

function BizAvatar({ name, logo_url, size = 8 }: { name: string; logo_url: string | null; size?: number }) {
  return (
    <div
      className={`w-${size} h-${size} rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0`}
      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
    >
      {logo_url
        ? <img src={logo_url} alt={name} className="w-full h-full object-contain p-0.5" />
        : <span className="text-xs font-bold" style={{ color: '#6B6480' }}>{name.slice(0, 2).toUpperCase()}</span>
      }
    </div>
  );
}

export default function BusinessSwitcher({
  current,
  options,
  currentBusinessName,
}: {
  current: BizOption;
  options: BizOption[];
  currentBusinessName: string;
}) {
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);
  const router            = useRouter();
  const isMulti           = options.length > 1;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', escape); };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => isMulti && setOpen(v => !v)}
        className="flex items-center gap-2 min-w-0 rounded-lg px-1 py-0.5 transition-colors"
        style={{ cursor: isMulti ? 'pointer' : 'default' }}
      >
        <BizAvatar name={current.business_name} logo_url={current.logo_url} size={8} />
        <span className="font-bold text-base truncate max-w-[160px]" style={{ color: '#1A0A3B' }}>
          {current.business_name}
        </span>
        {isMulti && (
          <ChevronDown
            size={14}
            className="flex-shrink-0 transition-transform"
            style={{ color: '#6B6480', transform: open ? 'rotate(180deg)' : undefined }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-2 w-60 rounded-xl shadow-xl z-50 overflow-hidden py-1"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
        >
          <p className="px-4 pt-2 pb-1 text-xs font-semibold tracking-widest uppercase"
            style={{ color: '#9B8FB5' }}>
            Mis organizaciones
          </p>
          {options.map(opt => {
            const isCurrent = opt.business_name === currentBusinessName;
            return (
              <button
                key={opt.business_name}
                onClick={() => { router.push(`/portal/${opt.first_token}?tab=inicio`); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#FAFAFB]"
              >
                <BizAvatar name={opt.business_name} logo_url={opt.logo_url} size={7} />
                <span className="text-sm truncate flex-1"
                  style={{ color: isCurrent ? '#6C3BFF' : '#1A0A3B', fontWeight: isCurrent ? 600 : 400 }}>
                  {opt.business_name}
                </span>
                {isCurrent && <Check size={13} style={{ color: '#6C3BFF', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
