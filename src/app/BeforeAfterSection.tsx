'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { XCircle, CheckCircle } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

const BEFORE = [
  'Un cliente llamó y nadie respondió.',
  'Hay citas que nadie confirmó.',
  'Los seguimientos dependen de recordar hacerlos.',
  'Los correos se acumulan.',
  'Hay pagos que se olvidan.',
];

const AFTER = [
  'Cada llamada recibe respuesta.',
  'Cada cita llega confirmada.',
  'Ninguna oportunidad se pierde.',
  'Ningún cliente queda olvidado.',
  'Cada mensaje llega al responsable correcto.',
  'Más pagos llegan a tiempo.',
];

export default function BeforeAfterSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px 0px' });

  return (
    <section
      ref={ref}
      style={{
        background:   'linear-gradient(160deg, #F4F0FF 0%, #EAE4FF 100%)',
        borderTop:    '1px solid rgba(108,59,255,0.1)',
        borderBottom: '1px solid rgba(108,59,255,0.1)',
      }}
    >
      <div className="max-w-5xl mx-auto px-5 sm:px-10 py-20 sm:py-28">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: EASE }}
          className="text-center mb-14"
        >
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-4"
            style={{ color: '#6C3BFF' }}
          >
            El cambio real
          </p>
          <h2
            className="font-bold tracking-tight mb-4"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#1A0A3B', lineHeight: 1.1 }}
          >
            Lo que cambia el lunes.
          </h2>
          <p style={{ color: 'rgba(26,10,59,0.55)', fontSize: '1rem', lineHeight: 1.7 }}>
            Esto es lo primero que notarás al incorporarlos a tu equipo.
          </p>
        </motion.div>

        {/* Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

          {/* Antes — enters first */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: '#fff',
              border:     '1px solid rgba(239,68,68,0.18)',
              boxShadow:  '0 2px 16px rgba(239,68,68,0.06)',
            }}
          >
            <div style={{
              padding:      '13px 20px',
              borderBottom: '1px solid rgba(239,68,68,0.1)',
              background:   'rgba(239,68,68,0.04)',
            }}>
              <span style={{
                fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.09em',
                textTransform: 'uppercase' as const, color: '#ef4444',
              }}>
                Sin Centinelia
              </span>
            </div>

            <div style={{ padding: '6px 0' }}>
              {BEFORE.map((text, i) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0, x: -10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.07, ease: EASE }}
                  style={{
                    display: 'flex', alignItems: 'flex-start',
                    gap: 12, padding: '12px 20px',
                  }}
                >
                  <XCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 2, opacity: 0.7 }} />
                  <span style={{ fontSize: '0.875rem', color: 'rgba(26,10,59,0.5)', lineHeight: 1.55 }}>
                    {text}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Después — enters 300 ms later */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 2.65, ease: EASE }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: '#fff',
              border:     '1px solid rgba(108,59,255,0.2)',
              boxShadow:  '0 4px 28px rgba(108,59,255,0.12)',
            }}
          >
            <div style={{
              padding:      '13px 20px',
              borderBottom: '1px solid rgba(108,59,255,0.1)',
              background:   'rgba(108,59,255,0.04)',
            }}>
              <span style={{
                fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.09em',
                textTransform: 'uppercase' as const, color: '#6C3BFF',
              }}>
                Con Centinelia
              </span>
            </div>

            <div style={{ padding: '6px 0' }}>
              {AFTER.map((text, i) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0, x: 10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4, delay: 2.82 + i * 0.065, ease: EASE }}
                  style={{
                    display: 'flex', alignItems: 'center',
                    gap: 12, padding: '12px 20px',
                  }}
                >
                  <CheckCircle size={15} color="#22c55e" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1A0A3B', lineHeight: 1.45 }}>
                    {text}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

        </div>

        {/* Closing rows — philosophical punchline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-8 sm:mt-10">

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 1.0, ease: EASE }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '18px 24px', borderRadius: 16,
              background: 'rgba(239,68,68,0.04)',
              border: '1px solid rgba(239,68,68,0.13)',
            }}
          >
            <XCircle size={18} color="#ef4444" style={{ flexShrink: 0, opacity: 0.5 }} />
            <span style={{
              fontSize: '1rem', color: 'rgba(26,10,59,0.35)',
              fontStyle: 'italic', textDecoration: 'line-through',
              textDecorationColor: 'rgba(239,68,68,0.35)',
            }}>
              Todo depende de ti.
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 3.35, ease: EASE }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '18px 24px', borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(108,59,255,0.11) 0%, rgba(108,59,255,0.06) 100%)',
              border: '1px solid rgba(108,59,255,0.28)',
              boxShadow: '0 4px 24px rgba(108,59,255,0.12)',
            }}
          >
            <CheckCircle size={18} color="#6C3BFF" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1A0A3B', lineHeight: 1.4 }}>
              Tú diriges. Ellos trabajan.
            </span>
          </motion.div>

        </div>

      </div>
    </section>
  );
}
