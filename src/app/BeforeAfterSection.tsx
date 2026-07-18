'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import {
  PhoneMissed, Clock, CalendarX, ClipboardList, MailX, AlertTriangle,
  CheckCircle,
} from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

const BEFORE = [
  { icon: PhoneMissed,    text: 'Llamadas perdidas',       color: '#ef4444' },
  { icon: Clock,          text: 'Clientes esperando',      color: '#f97316' },
  { icon: CalendarX,      text: 'Citas olvidadas',         color: '#ef4444' },
  { icon: ClipboardList,  text: 'Seguimientos manuales',   color: '#94a3b8' },
  { icon: MailX,          text: 'Correos sin responder',   color: '#94a3b8' },
  { icon: AlertTriangle,  text: 'Cobros pendientes',       color: '#eab308' },
];

const AFTER = [
  'Todas las llamadas atendidas',
  'Todas las citas confirmadas',
  'Todos los leads registrados',
  'Todos los seguimientos creados',
  'Todos los correos clasificados',
  'Todos los cobros recordados',
];

export default function BeforeAfterSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px 0px' });

  return (
    <section
      ref={ref}
      style={{
        background:   '#F4F0FF',
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

          {/* Antes */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
            className="rounded-2xl overflow-hidden"
            style={{
              background:  '#fff',
              border:      '1px solid rgba(239,68,68,0.18)',
              boxShadow:   '0 2px 12px rgba(239,68,68,0.06)',
            }}
          >
            <div style={{
              padding:      '13px 20px',
              borderBottom: '1px solid rgba(239,68,68,0.1)',
              background:   'rgba(239,68,68,0.04)',
            }}>
              <span style={{
                fontSize:      '0.7rem',
                fontWeight:    800,
                letterSpacing: '0.09em',
                textTransform: 'uppercase' as const,
                color:         '#ef4444',
              }}>
                Antes
              </span>
            </div>

            <div>
              {BEFORE.map((item, i) => (
                <motion.div
                  key={item.text}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ duration: 0.35, delay: 0.28 + i * 0.055 }}
                  style={{
                    display:      'flex',
                    alignItems:   'center',
                    gap:          12,
                    padding:      '13px 20px',
                    borderBottom: i < BEFORE.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  <item.icon size={15} color={item.color} style={{ flexShrink: 0, opacity: 0.75 }} />
                  <span style={{
                    fontSize:              '0.875rem',
                    color:                 'rgba(26,10,59,0.45)',
                    lineHeight:            1.45,
                    textDecoration:        'line-through',
                    textDecorationColor:   'rgba(239,68,68,0.35)',
                    textDecorationThickness: '1.5px',
                  }}>
                    {item.text}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Después */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
            className="rounded-2xl overflow-hidden"
            style={{
              background:  '#fff',
              border:      '1px solid rgba(108,59,255,0.2)',
              boxShadow:   '0 4px 24px rgba(108,59,255,0.1)',
            }}
          >
            <div style={{
              padding:      '13px 20px',
              borderBottom: '1px solid rgba(108,59,255,0.1)',
              background:   'rgba(108,59,255,0.04)',
            }}>
              <span style={{
                fontSize:      '0.7rem',
                fontWeight:    800,
                letterSpacing: '0.09em',
                textTransform: 'uppercase' as const,
                color:         '#6C3BFF',
              }}>
                Después
              </span>
            </div>

            <div>
              {AFTER.map((text, i) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ duration: 0.35, delay: 0.38 + i * 0.055 }}
                  style={{
                    display:      'flex',
                    alignItems:   'center',
                    gap:          12,
                    padding:      '13px 20px',
                    borderBottom: i < AFTER.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  <CheckCircle size={15} color="#22c55e" style={{ flexShrink: 0 }} />
                  <span style={{
                    fontSize:   '0.875rem',
                    fontWeight: 500,
                    color:      '#1A0A3B',
                    lineHeight: 1.45,
                  }}>
                    {text}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
