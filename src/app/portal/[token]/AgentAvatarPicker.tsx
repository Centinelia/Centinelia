'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { X, Check, Pencil } from 'lucide-react';

const MEERKATS = [
  '/agent-f1.png',
  '/agent-m1.png', '/agent-m2.png', '/agent-m3.png',
  '/agent-blazer.png', '/agent-bowtie.png',
  '/agent-headset.png',
];

interface Props {
  token:     string;
  avatarSrc: string | null;
  initial:   string;
  color:     string;
  size?:     number;
}

export default function AgentAvatarPicker({ token, avatarSrc, initial, color, size = 44 }: Props) {
  const router  = useRouter();
  const [open,    setOpen]    = useState(false);
  const [current, setCurrent] = useState(avatarSrc);
  const [saving,  setSaving]  = useState(false);

  async function pick(src: string) {
    const next = src;
    setSaving(true);
    await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ avatar: next }),
    });
    setCurrent(next || null);
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(true)}
        className="flex-shrink-0 overflow-hidden relative group"
        style={{
          width: size, height: size,
          borderRadius: size * 0.27,
          background: `${color}20`,
          border: `1px solid ${color}35`,
        }}
      >
        {current
          ? <Image src={current} alt="" fill sizes={`${size}px`} style={{ objectFit: 'contain', padding: size * 0.05 }} />
          : <span className="w-full h-full flex items-center justify-center font-bold"
              style={{ color, fontSize: size * 0.36 }}>{initial}</span>
        }
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.45)', borderRadius: size * 0.27 }}>
          <Pencil size={size * 0.28} color="#fff" />
        </span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="rounded-2xl p-5 flex flex-col gap-4 w-full max-w-xs"
            style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Elige un avatar</p>
              <button onClick={() => setOpen(false)} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--c-text-3)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {/* Inicial (sin avatar) */}
              <button
                onClick={() => pick('')}
                disabled={saving}
                className="aspect-square rounded-xl flex items-center justify-center text-base font-bold transition-all relative"
                style={{
                  background: `${color}20`,
                  border: `2px solid ${!current ? '#6C3BFF' : color + '35'}`,
                  color,
                }}
              >
                {initial}
                {!current && (
                  <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: '#6C3BFF' }}>
                    <Check size={9} color="#fff" strokeWidth={3} />
                  </span>
                )}
              </button>

              {MEERKATS.map(src => {
                const active = current === src;
                return (
                  <button
                    key={src}
                    onClick={() => pick(src)}
                    disabled={saving}
                    className="aspect-square rounded-xl overflow-hidden relative transition-all"
                    style={{
                      border:     `2px solid ${active ? '#6C3BFF' : 'var(--c-border)'}`,
                      background: active ? 'rgba(108,59,255,0.08)' : 'var(--c-surface-2)',
                    }}
                  >
                    <Image src={src} alt="" fill sizes="80px" style={{ objectFit: 'contain', padding: 4 }} />
                    {active && (
                      <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: '#6C3BFF' }}>
                        <Check size={9} color="#fff" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-center" style={{ color: 'var(--c-text-4)' }}>
              Toca un avatar para seleccionarlo y guardarlo
            </p>
          </div>
        </div>
      )}
    </>
  );
}
