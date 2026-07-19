'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowRight, Phone, Mail } from 'lucide-react';
import Link from 'next/link';

function WhatsAppIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const WA_NUMBER = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '528116333559').replace(/\D/g, '');
const WA_LINK   = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('¡Hola! Quiero saber más sobre Centinelia.')}`;
const TEL_LINK  = 'tel:+528116333559';
const MAIL_LINK = 'mailto:hola@centinelia.mx';
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

const CONTACT_OPTIONS = [
  { icon: <Phone size={14} />,       label: 'Llamar',    href: TEL_LINK,  color: '#22c55e' },
  { icon: <WhatsAppIcon size={14} />, label: 'WhatsApp',  href: WA_LINK,   color: '#25D366' },
  { icon: <Mail size={14} />,        label: 'Correo',    href: MAIL_LINK, color: '#6C3BFF' },
];

function ClosingCard({ accent, text, textSub }: { accent: string; text: string; textSub: string }) {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div
      className="rounded-2xl p-6 sm:p-7"
      style={{
        background: 'linear-gradient(135deg, rgba(108,59,255,0.06) 0%, rgba(155,109,255,0.03) 100%)',
        border: '1px solid rgba(108,59,255,0.14)',
      }}
    >
      <AnimatePresence mode="wait">
        {!showOptions ? (
          <motion.div
            key="default"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
          >
            <p className="font-semibold mb-1" style={{ fontSize: '0.9375rem', color: text }}>
              ¿Prefieres hablar con alguien?
            </p>
            <p className="text-sm mb-5" style={{ color: textSub, lineHeight: 1.6 }}>
              En 15 minutos te mostramos cómo se vería una oficina como la tuya.
            </p>
            <button
              onClick={() => setShowOptions(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: accent, color: '#fff' }}
            >
              Agendar una demostración <ArrowRight size={13} />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="options"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
          >
            <p className="font-semibold mb-1" style={{ fontSize: '0.9375rem', color: text }}>
              ¿Cómo prefieres contactarnos?
            </p>
            <p className="text-sm mb-4" style={{ color: textSub, lineHeight: 1.6 }}>
              Elige la opción que más te acomode.
            </p>
            <div className="flex flex-col gap-2 mb-4">
              {CONTACT_OPTIONS.map(opt => (
                <a
                  key={opt.label}
                  href={opt.href}
                  target={opt.href.startsWith('http') ? '_blank' : undefined}
                  rel={opt.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.01]"
                  style={{ background: `${opt.color}14`, color: opt.color, border: `1px solid ${opt.color}30` }}
                >
                  {opt.icon}
                  {opt.label}
                </a>
              ))}
            </div>
            <button
              onClick={() => setShowOptions(false)}
              className="text-xs transition-opacity hover:opacity-60"
              style={{ color: textSub }}
            >
              Cancelar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
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
