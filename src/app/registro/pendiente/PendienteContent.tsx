'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Phone, Monitor, FileText, Mic, Zap, Clock, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { MEERKAT_MAP, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';

const CHECKLIST = [
  { icon: Phone,    label: 'Número telefónico' },
  { icon: Monitor,  label: 'Portal de administración' },
  { icon: FileText, label: 'Memoria de conversaciones' },
  { icon: Mic,      label: 'Voz y personalidad' },
  { icon: Zap,      label: 'Conexiones activas' },
];

export default function PendienteContent() {
  const params    = useSearchParams();
  const token     = params.get('token');
  const name      = params.get('name') || 'Tu empleado';
  const role      = params.get('role') || '';
  const meerkatId = params.get('meerkat') ?? 'custom';
  const meerkat   = MEERKAT_MAP[meerkatId as MeerkatRoleId] ?? null;
  const roleColor = meerkat?.color ?? '#6C3BFF';

  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const timers = CHECKLIST.map((_, i) =>
      setTimeout(() => setRevealed(i + 1), 400 + i * 650)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden film-grain flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(140deg, #2A0E6B 0%, #150835 100%)' }}>
      <div className="orb" style={{ width: 500, height: 500, top: -150, left: '50%', transform: 'translateX(-50%)', background: `radial-gradient(circle, ${roleColor}22 0%, transparent 65%)`, ['--orb-dur' as string]: '14s' }} />

      <div className="w-full max-w-sm relative z-10">

        {/* Meerkat image */}
        <div className="flex justify-center mb-6" style={{ position: 'relative', height: 180 }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse at 50% 100%, ${roleColor}30 0%, transparent 65%)`,
          }} />
          {meerkat && meerkat.id !== 'custom' && meerkat.imagen ? (
            <Image
              src={meerkat.imagen}
              alt={name}
              width={160}
              height={180}
              style={{ objectFit: 'contain', objectPosition: 'bottom center', position: 'relative', zIndex: 1 }}
              priority
            />
          ) : (
            <div style={{
              width: 90, height: 90, borderRadius: 24, alignSelf: 'flex-end', marginBottom: 0,
              background: `${roleColor}22`, border: `1px solid ${roleColor}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 34, fontWeight: 900, color: roleColor, position: 'relative', zIndex: 1,
            }}>
              {name[0]?.toUpperCase() ?? 'C'}
            </div>
          )}
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-bold text-white mb-2 text-center" style={{ letterSpacing: '-0.02em' }}>
          Bienvenido al equipo.
        </h1>
        <p className="text-base text-center mb-1" style={{ color: 'rgba(255,255,255,0.72)' }}>
          <strong style={{ color: '#fff' }}>{name}</strong> ya forma parte de tu organización.
        </p>
        {role && (
          <p className="text-xs text-center mb-1" style={{ color: lightenHex(roleColor, 0.45) }}>{role}</p>
        )}
        <p className="text-sm text-center mb-8" style={{ color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
          En este momento estamos preparando su espacio de trabajo.
        </p>

        {/* Checklist card */}
        <div className="rounded-2xl mb-5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
              Preparando
            </p>
          </div>
          <div style={{ padding: '10px 18px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {CHECKLIST.map((item, i) => {
              const done = i < revealed;
              return (
                <div
                  key={item.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 0',
                    opacity: done ? 1 : 0,
                    animation: done ? 'item-fade-in 0.35s ease forwards' : 'none',
                    borderBottom: i < CHECKLIST.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: done ? 'rgba(34,197,94,0.14)' : `${roleColor}14`,
                    border: `1px solid ${done ? 'rgba(34,197,94,0.3)' : `${roleColor}30`}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.3s, border-color 0.3s',
                  }}>
                    {done
                      ? <Check size={13} color="#4ade80" />
                      : <item.icon size={13} color={`${roleColor}80`} />
                    }
                  </div>
                  <span style={{ fontSize: 13, color: done ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.35)', fontWeight: done ? 500 : 400, transition: 'color 0.3s' }}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Time estimate */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={13} style={{ color: roleColor, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              Tiempo estimado: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>2 minutos</strong>
            </span>
          </div>
        </div>

        {/* CTA */}
        {token && (
          <a
            href={`/portal/${token}/setup`}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-sm text-white text-center transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${roleColor}, #9B6DFF)` }}
          >
            Configurar mi acceso al portal <ChevronRight size={15} />
          </a>
        )}

        <p className="text-xs text-center mt-5" style={{ color: 'rgba(255,255,255,0.22)' }}>
          ¿Tienes dudas? Escríbenos a{' '}
          <span style={{ color: '#9B6DFF' }}>hola@centinelia.mx</span>
        </p>
      </div>
    </div>
  );
}

function lightenHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (n >> 16) + Math.round(255 * amount));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (n & 0xff) + Math.round(255 * amount));
  return `rgb(${r},${g},${b})`;
}
