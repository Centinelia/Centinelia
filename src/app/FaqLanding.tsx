'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import AnimatedSection from './AnimatedSection';

const C = {
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.58)',
  textMute:'rgba(26,10,59,0.40)',
  accent:  '#6C3BFF',
  accentLt:'#9B6DFF',
  border:  'rgba(108,59,255,0.10)',
  surface: '#ffffff',
};

const CATEGORIES = [
  {
    label: 'Incorporación',
    color: '#6C3BFF',
    items: [
      {
        q: '¿Tengo que cambiar mi número telefónico?',
        a: 'El tuyo no. Tu Centinelia opera desde un número propio. Tu número personal sigue siendo tuyo.',
      },
      {
        q: '¿Cuánto tarda en estar listo?',
        a: 'Máximo 24 horas desde que incorporas a tu empleado. Nosotros configuramos todo.',
      },
      {
        q: '¿Necesito saber de tecnología para configurarlo?',
        a: 'No. El proceso es guiado paso a paso. Tú describes tu organización y nosotros lo dejamos funcionando.',
      },
    ],
  },
  {
    label: 'Operación',
    color: '#22c55e',
    items: [
      {
        q: '¿Puede transferir llamadas a una persona?',
        a: 'Sí. Resuelve la mayoría de las llamadas por sí mismo, y transfiere a alguien de tu equipo cuando sea necesario.',
      },
      {
        q: '¿Qué pasa si recibe más llamadas de las contratadas?',
        a: 'Nunca deja de responder. Los minutos adicionales se cobran automáticamente según la tarifa vigente. Solo necesitas tener una tarjeta registrada en tu cuenta.',
      },
      {
        q: '¿Aprende mi organización?',
        a: 'Sí. Tu oficina aprende tus procesos, clientes y forma de trabajar. Con cada llamada mejora.',
      },
      {
        q: '¿Puedo modificar su comportamiento?',
        a: 'Sí. Desde tu portal puedes cambiar instrucciones, respuestas, horarios y permisos en cualquier momento.',
      },
    ],
  },
  {
    label: 'Crecimiento',
    color: '#f59e0b',
    items: [
      {
        q: '¿Mis datos son privados?',
        a: 'Sí. Toda la información permanece aislada para tu organización. Solo las personas que autorices pueden acceder a ella.',
      },
      {
        q: '¿Y si después necesito más empleados digitales?',
        a: 'Incorporas otro directamente desde tu portal de cliente. Todos trabajan juntos desde la misma oficina digital.',
      },
      {
        q: '¿Qué pasa si mi organización cambia?',
        a: 'No necesitas empezar de nuevo. Tu oficina evoluciona contigo: puedes modificar procesos, incorporar nuevos empleados o ampliar la capacidad conforme crece tu organización.',
      },
    ],
  },
];

function ClosingCard({ accent, text, textSub }: { accent: string; text: string; textSub: string }) {
  return (
    <div
      className="rounded-2xl p-6 sm:p-7"
      style={{
        background: 'linear-gradient(135deg, rgba(108,59,255,0.06) 0%, rgba(155,109,255,0.03) 100%)',
        border: '1px solid rgba(108,59,255,0.14)',
      }}
    >
      <p className="font-semibold mb-1" style={{ fontSize: '0.9375rem', color: text }}>
        ¿Prefieres hablar con alguien?
      </p>
      <p className="text-sm mb-5" style={{ color: textSub, lineHeight: 1.6 }}>
        En 15 minutos te mostramos cómo se vería una oficina como la tuya.
      </p>
      <Link
        href="/registro"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
        style={{ background: accent, color: '#fff' }}
      >
        Agendar una demostración <ArrowRight size={13} />
      </Link>
    </div>
  );
}

type ItemKey = `${number}-${number}`;

export default function FaqLanding() {
  const firstKey: ItemKey = '0-0';
  const [open, setOpen] = useState<ItemKey | null>(firstKey);

  const toggle = (key: ItemKey) => setOpen(prev => prev === key ? null : key);

  return (
    <section
      style={{
        background: '#FAFBFF',
        borderTop: '1px solid rgba(108,59,255,0.08)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16">

          {/* ── Left column: header + stats + closing card (desktop) ─── */}
          <div className="lg:col-span-2 flex flex-col">
            <AnimatedSection>
              <p
                className="text-xs font-bold tracking-widest uppercase mb-4"
                style={{ color: C.accent }}
              >
                Preguntas frecuentes
              </p>
              <h2
                className="font-bold tracking-tight mb-5"
                style={{
                  fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)',
                  color: C.text,
                  lineHeight: 1.12,
                }}
              >
                Antes de construir<br />tu oficina
              </h2>
              <p
                className="mb-10 leading-relaxed"
                style={{ color: C.textSub, fontSize: '0.9375rem' }}
              >
                Aquí resolvemos las preguntas que casi todos hacen antes de empezar.
              </p>

              {/* Stats */}
              <div className="flex flex-col gap-5 items-start sm:items-start">
                {[
                  { num: '< 24h', label: 'Tiempo de activación' },
                  { num: '24/7',  label: 'Disponibilidad garantizada' },
                  { num: '∞',     label: 'Conversaciones simultáneas' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-4">
                    <span
                      className="font-extrabold tabular-nums"
                      style={{ fontSize: '1.5rem', color: C.accent, width: 72, textAlign: 'center', lineHeight: 1, flexShrink: 0 }}
                    >
                      {s.num}
                    </span>
                    <span style={{ fontSize: '0.875rem', color: C.textMute, lineHeight: 1.4 }}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </AnimatedSection>

            {/* Closing card — desktop only, anchored to bottom of left col */}
            <div className="hidden lg:block mt-auto pt-10">
              <AnimatedSection delay={0.25}>
                <ClosingCard accent={C.accent} text={C.text} textSub={C.textSub} />
              </AnimatedSection>
            </div>
          </div>

          {/* ── Right column: accordion ───────────────────────────────── */}
          <div className="lg:col-span-3 flex flex-col gap-8">

            {CATEGORIES.map((cat, ci) => (
              <AnimatedSection key={cat.label} delay={ci * 0.06}>
                {/* Category label */}
                <p
                  className="text-xs font-bold tracking-widest uppercase mb-3"
                  style={{ color: cat.color }}
                >
                  {cat.label}
                </p>

                <div style={{ borderTop: '1px solid rgba(26,10,59,0.07)' }}>
                  {cat.items.map((item, ii) => {
                    const key: ItemKey = `${ci}-${ii}`;
                    const isOpen = open === key;
                    return (
                      <div
                        key={ii}
                        style={{ borderBottom: '1px solid rgba(26,10,59,0.07)' }}
                      >
                        <button
                          onClick={() => toggle(key)}
                          className="w-full flex items-center justify-between gap-6 py-4 text-left"
                        >
                          <span
                            className="font-semibold text-sm"
                            style={{
                              color: isOpen ? C.accent : C.text,
                              transition: 'color 0.2s ease',
                              lineHeight: 1.4,
                            }}
                          >
                            {item.q}
                          </span>
                          <ChevronDown
                            size={14}
                            style={{
                              color: C.accent,
                              flexShrink: 0,
                              transform: isOpen ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.25s ease',
                            }}
                          />
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                              style={{ overflow: 'hidden' }}
                            >
                              <p
                                className="pb-4 text-sm leading-relaxed pr-6"
                                style={{ color: C.textSub }}
                              >
                                {item.a}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </AnimatedSection>
            ))}

          </div>
        </div>

        {/* Closing card — mobile only, after accordion */}
        <div className="lg:hidden mt-8">
          <AnimatedSection delay={0.1}>
            <ClosingCard accent={C.accent} text={C.text} textSub={C.textSub} />
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
