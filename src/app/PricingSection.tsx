'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Star, Lightbulb } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

const fmt = (n: number) => new Intl.NumberFormat('es-MX').format(n);
const IVA = 0.16;

function AnimatedNumber({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef  = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    const to   = value;
    if (from === to) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const start    = performance.now();
    const duration = 520;

    const tick = (now: number) => {
      const t      = Math.min((now - start) / duration, 1);
      const eased  = 1 - Math.pow(1 - t, 4);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return <span className={className} style={style}>${fmt(display)}</span>;
}

const AGENT_TYPES = [
  {
    id: 'pro', name: 'Empleado Centinelia', setupFee: 14990, color: '#9B6DFF', popular: true,
    features: [
      'Voz profesional',
      'Memoria del negocio',
      'Número propio',
      'Portal privado',
      'Entrenamiento inicial',
      'Integración con tu oficina',
    ],
  },
];

const MINUTE_TIERS = [
  { id: 'starter', label: 'Media Jornada',    subtitle: 'Ideal para negocios pequeños.',            minutes: 300,  ops: 100, price: 2997,  callsPerDay: 5  },
  { id: 'growth',  label: 'Jornada Completa', subtitle: 'Ideal para la mayoría de las empresas.',   minutes: 600,  ops: 200, price: 5994,  callsPerDay: 10, popular: true },
  { id: 'scale',   label: 'Alta Demanda',     subtitle: 'Ideal para operaciones con alto volumen.', minutes: 1200, ops: 300, price: 11988, callsPerDay: 20 },
];

export default function PricingSection() {
  const [selectedId, setSelectedId] = useState('growth');
  const agent      = AGENT_TYPES[0];
  const tier       = MINUTE_TIERS.find(t => t.id === selectedId)!;
  const todayBase  = agent.setupFee + tier.price;
  const todayIVA   = Math.round(todayBase * IVA);
  const tierIVA    = Math.round(tier.price * IVA);

  return (
    <>
      {/* ─── 2-col layout: Paso 1 izq · Paso 2 der ─ */}
      <div className="flex flex-col lg:flex-row gap-5 items-stretch mb-5">

        {/* ── Columna izquierda: Paso 1 ── */}
        <div className="w-full lg:w-[44%] lg:flex-shrink-0 flex flex-col">
          <AnimatedSection>
            <div className="flex flex-col items-center gap-3 mb-6 text-center">
              <span className="text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(108,59,255,0.28)', color: '#B89CFF', border: '1.5px solid rgba(108,59,255,0.55)', boxShadow: '0 0 12px rgba(108,59,255,0.3)' }}>
                Paso 1
              </span>
              <h3 className="font-bold text-sm sm:text-[1.1rem]" style={{ color: '#fff' }}>
                Incorpora a tu primer Centinelia
              </h3>
            </div>
          </AnimatedSection>

          {AGENT_TYPES.map((a, i) => (
            <AnimatedSection key={a.id} delay={i * 0.09} className="flex-1 flex flex-col">
            <div
              className="rounded-2xl p-6 flex flex-col flex-1 relative"
              style={{
                background: a.popular ? `linear-gradient(145deg, ${a.color}22, ${a.color}0a)` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${a.popular ? a.color + '55' : 'rgba(255,255,255,0.09)'}`,
                boxShadow: a.popular ? `0 12px 48px ${a.color}30` : 'none',
                backdropFilter: 'blur(12px)',
              }}
            >
              {a.popular && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: `linear-gradient(90deg, ${a.color}, ${a.color}88)` }} />
              )}
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold" style={{ color: '#fff', fontSize: '1.1rem' }}>{a.name}</p>
              </div>
              <div className="flex flex-col gap-0.5 mb-5">
                <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>Incorporación</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    ${fmt(a.setupFee)}
                  </span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>pago único + IVA</span>
                </div>
              </div>
              <ul className="flex flex-col gap-2.5 flex-1">
                {a.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    <Check size={13} color={a.color} className="flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              {/* Nox popping out above the closing box, recargado a la derecha */}
              <div className="relative mt-4">
                <div className="absolute w-[120px] h-[165px] sm:w-[185px] sm:h-[245px]" style={{ bottom: '100%', right: 8 }}>
                  <Image
                    src="/meerkats/avatar/nox.png"
                    alt="Nox"
                    fill
                    style={{ objectFit: 'contain', objectPosition: 'bottom center' }}
                  />
                </div>
                <div className="rounded-xl px-4 py-4 relative overflow-hidden" style={{
                  background: `linear-gradient(135deg, ${a.color}18, ${a.color}08)`,
                  border: `1px solid ${a.color}30`,
                }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: `radial-gradient(ellipse at top left, ${a.color}20 0%, transparent 60%)`,
                    pointerEvents: 'none',
                  }} />
                  <p className="text-xs font-semibold text-center relative" style={{ color: `${a.color}cc`, letterSpacing: '0.01em', lineHeight: 1.6 }}>
                    Incluye todo lo necesario<br />para empezar desde el primer día.
                  </p>
                </div>
              </div>
            </div>
            </AnimatedSection>
          ))}
        </div>

        {/* ── Columna derecha: Paso 2 ── */}
        <div className="flex-1 w-full flex flex-col">
          <AnimatedSection>
            <div className="flex flex-col items-center gap-3 mb-5 text-center">
              <span className="text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(108,59,255,0.28)', color: '#B89CFF', border: '1.5px solid rgba(108,59,255,0.55)', boxShadow: '0 0 12px rgba(108,59,255,0.3)' }}>
                Paso 2
              </span>
              <h3 className="font-bold text-sm sm:text-[1.1rem]" style={{ color: '#fff' }}>
                Elige la jornada
              </h3>
            </div>
          </AnimatedSection>

          <div className="flex flex-col flex-1 gap-3">
            {MINUTE_TIERS.map((t, i) => {
              const isSelected = t.id === selectedId;
              return (
                <AnimatedSection key={t.id} delay={i * 0.08} className="flex-1">
                <motion.button
                  onClick={() => setSelectedId(t.id)}
                  className="h-full w-full text-left rounded-2xl p-4 sm:p-5 flex flex-col gap-3 relative overflow-hidden"
                  initial={false}
                  animate={{
                    boxShadow: isSelected
                      ? '0 8px 36px rgba(108,59,255,0.32), 0 0 0 1.5px rgba(108,59,255,0.65)'
                      : '0 2px 6px rgba(0,0,0,0.06), 0 0 0 1px rgba(255,255,255,0.09)',
                  }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(108,59,255,0.22), rgba(108,59,255,0.1))'
                      : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    transition: 'background 0.35s ease',
                  }}
                >
                  {isSelected && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                      background: 'linear-gradient(90deg, #6C3BFF, #9B6DFF88)' }} />
                  )}
                  {/* Top row */}
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-sm" style={{ color: '#fff' }}>{t.label}</p>
                        {t.popular && (
                          <Star size={11} className="absolute top-2.5 right-3" color="#9B6DFF" style={{ fill: '#9B6DFF' }} />
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold tabular-nums" style={{ color: isSelected ? '#9B6DFF' : '#fff' }}>
                          {fmt(t.minutes)}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>min/mes</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(155,109,255,0.6)' }}>
                        {t.ops} tareas incluidas
                      </p>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 self-stretch">
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-2xl font-bold tabular-nums" style={{ color: isSelected ? '#9B6DFF' : '#fff' }}>
                          ${fmt(t.price)}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>/mes + IVA</span>
                      </div>
                      <p className="text-xs mt-auto" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        ≈ <span style={{ color: isSelected ? '#9B6DFF' : 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{t.callsPerDay} llamadas</span>/día
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-center w-full font-bold" style={{ color: 'rgba(155,109,255,0.6)', fontStyle: 'italic' }}>
                    {t.subtitle}
                  </p>
                </motion.button>
                </AnimatedSection>
              );
            })}
          </div>

        </div>

      </div>

      <AnimatedSection>
        <p className="text-xs my-4 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Aumenta o reduce la jornada cuando tu operación cambie.
        </p>
      </AnimatedSection>

      {/* ─── Tu inversión (horizontal) ──────────────── */}
      <AnimatedSection>
      <div className="rounded-2xl overflow-hidden mb-4" style={{ border: '1px solid rgba(108,59,255,0.2)' }}>
        <div className="flex">

          {/* Hoy */}
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-6 py-7"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: '#C4A8FF' }}>Hoy</p>
            <AnimatedNumber value={todayBase + todayIVA} className="font-semibold tabular-nums" style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', color: 'rgba(255,255,255,0.6)', lineHeight: 1 }} />
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Incorporación + Jornada</p>
          </div>

          <div className="w-px self-stretch" style={{ background: 'rgba(108,59,255,0.2)' }} />

          {/* Después */}
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-6 py-7"
            style={{ background: 'rgba(108,59,255,0.1)' }}>
            <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: '#C4A8FF' }}>Después</p>
            <div className="flex items-baseline gap-1.5">
              <AnimatedNumber value={tier.price + tierIVA} className="font-bold tabular-nums" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', color: '#9B6DFF', lineHeight: 1 }} />
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>/mes</span>
            </div>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Solo Jornada</p>
          </div>

        </div>
      </div>
      </AnimatedSection>

      {/* ─── Tip: Horas extra ─────────────────────── */}
      <AnimatedSection>
        <div
          className="rounded-xl px-6 py-4 mb-6 flex flex-col items-center gap-1 text-center mx-auto w-fit"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#fff' }}>¿Tu operación creció este mes?</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
            Agrega minutos cuando los necesites. No tienes que cambiar de plan.
          </p>
        </div>
      </AnimatedSection>

      {/* ─── Paso 3: CTA ────────────────────────── */}
      <AnimatedSection>
        <div className="flex flex-col items-center gap-3 mb-14 text-center">
          <span className="text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full"
            style={{ background: 'rgba(108,59,255,0.28)', color: '#B89CFF', border: '1.5px solid rgba(108,59,255,0.55)', boxShadow: '0 0 12px rgba(108,59,255,0.3)' }}>
            Paso 3
          </span>
          <h3 className="font-bold text-sm sm:text-[1.1rem]" style={{ color: '#fff' }}>
            Tu oficina comienza a trabajar
          </h3>
          <Link
            href="/registro"
            className="px-10 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
            style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 8px 32px rgba(108,59,255,0.4)' }}
          >
            Contratar mi primer Centinelia
          </Link>
        </div>
      </AnimatedSection>
    </>
  );
}
