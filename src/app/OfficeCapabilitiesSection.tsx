'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { Phone, Calendar, TrendingUp, BarChart3, type LucideIcon } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

const CATEGORIES: {
  Icon: LucideIcon;
  color: string;
  bg: string;
  title: string;
  items: string[];
}[] = [
  {
    Icon: Phone,
    color: '#6C3BFF',
    bg: 'rgba(108,59,255,0.09)',
    title: 'Atender',
    items: ['Llamadas', 'WhatsApp', 'Correo', 'Formularios'],
  },
  {
    Icon: Calendar,
    color: '#0284C7',
    bg: 'rgba(2,132,199,0.09)',
    title: 'Organizar',
    items: ['Citas', 'Recordatorios', 'Tareas', 'Documentos'],
  },
  {
    Icon: TrendingUp,
    color: '#16a34a',
    bg: 'rgba(22,163,74,0.09)',
    title: 'Vender',
    items: ['Seguimiento', 'Llamadas salientes', 'Recuperación', 'Reseñas'],
  },
  {
    Icon: BarChart3,
    color: '#d97706',
    bg: 'rgba(217,119,6,0.09)',
    title: 'Informarte',
    items: ['Reportes', 'Grabaciones', 'KPIs', 'Resúmenes'],
  },
];

export default function OfficeCapabilitiesSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px 0px' });

  return (
    <section
      ref={ref}
      style={{
        background:   '#fff',
        borderBottom: '1px solid rgba(26,10,59,0.06)',
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
            Tu oficina digital
          </p>
          <h2
            className="font-bold tracking-tight mb-4"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#1A0A3B', lineHeight: 1.1 }}
          >
            ¿Qué te ofrece tu oficina digital?
          </h2>
          <p style={{ color: 'rgba(26,10,59,0.55)', fontSize: '1rem', lineHeight: 1.7 }}>
            Tu oficina puede...
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
          {CATEGORIES.map(({ Icon, color, bg, title, items }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 22 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: EASE }}
              style={{
                background:   '#fff',
                border:       '1px solid rgba(26,10,59,0.08)',
                borderRadius: 20,
                padding:      '24px 22px 26px',
                boxShadow:    '0 2px 14px rgba(26,10,59,0.05)',
                display:      'flex',
                flexDirection: 'column',
              }}
            >
              {/* Icon badge */}
              <div style={{
                width:          44,
                height:         44,
                borderRadius:   12,
                background:     bg,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                marginBottom:   16,
                flexShrink:     0,
              }}>
                <Icon size={20} color={color} strokeWidth={2} />
              </div>

              {/* Title */}
              <p style={{
                fontSize:     '1.05rem',
                fontWeight:   700,
                color:        '#1A0A3B',
                marginBottom: 14,
                lineHeight:   1.2,
              }}>
                {title}
              </p>

              {/* Pill tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {items.map((item, j) => (
                  <motion.span
                    key={item}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={inView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.28, delay: 0.3 + i * 0.1 + j * 0.055 }}
                    style={{
                      padding:      '4px 11px',
                      borderRadius: 20,
                      background:   bg,
                      color:        color,
                      fontSize:     '0.78rem',
                      fontWeight:   600,
                      border:       `1px solid ${color}28`,
                      lineHeight:   1.5,
                    }}
                  >
                    {item}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
