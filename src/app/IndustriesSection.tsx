'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { Stethoscope, UtensilsCrossed, Home, Landmark, Check, type LucideIcon } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

const INDUSTRIES: {
  Icon:   LucideIcon;
  color:  string;
  bg:     string;
  label:  string;
  tasks:  string[];
}[] = [
  {
    Icon:  Stethoscope,
    color: '#0891B2',
    bg:    'rgba(8,145,178,0.08)',
    label: 'Clínica',
    tasks: [
      'Contesta llamadas.',
      'Agenda pacientes.',
      'Confirma citas.',
      'Envía recordatorios.',
      'Recupera cancelaciones.',
    ],
  },
  {
    Icon:  UtensilsCrossed,
    color: '#D97706',
    bg:    'rgba(217,119,6,0.08)',
    label: 'Restaurante',
    tasks: [
      'Atiende reservaciones.',
      'Confirma mesas.',
      'Contesta WhatsApp.',
      'Envía ubicación.',
      'Recupera llamadas.',
    ],
  },
  {
    Icon:  Home,
    color: '#6C3BFF',
    bg:    'rgba(108,59,255,0.08)',
    label: 'Inmobiliaria',
    tasks: [
      'Captura leads.',
      'Agenda visitas.',
      'Da seguimiento.',
      'Recupera prospectos.',
      'Clasifica interesados.',
    ],
  },
  {
    Icon:  Landmark,
    color: '#16A34A',
    bg:    'rgba(22,163,74,0.08)',
    label: 'Municipio',
    tasks: [
      'Atiende ciudadanos.',
      'Clasifica solicitudes.',
      'Crea tickets.',
      'Escala incidencias.',
      'Reporta avances.',
    ],
  },
];

export default function IndustriesSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px 0px' });

  return (
    <section
      ref={ref}
      style={{
        background:   '#FAFBFF',
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
            Para tu tipo de negocio
          </p>
          <h2
            className="font-bold tracking-tight mb-4"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#1A0A3B', lineHeight: 1.1 }}
          >
            Así trabaja en tu negocio.
          </h2>
          <p style={{ color: 'rgba(26,10,59,0.55)', fontSize: '1rem', lineHeight: 1.7 }}>
            No importa qué tipo de negocio seas.
          </p>
        </motion.div>

        {/* Grid 2×2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {INDUSTRIES.map(({ Icon, color, bg, label, tasks }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 22 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: EASE }}
              style={{
                background:    '#fff',
                border:        '1px solid rgba(26,10,59,0.08)',
                borderRadius:  20,
                padding:       '26px 28px 28px',
                boxShadow:     '0 2px 14px rgba(26,10,59,0.05)',
              }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 22 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 11,
                  background: bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={19} color={color} strokeWidth={2} />
                </div>
                <div>
                  <p style={{
                    fontSize: '0.65rem', fontWeight: 700,
                    letterSpacing: '0.09em', textTransform: 'uppercase' as const,
                    color, marginBottom: 2,
                  }}>
                    Así trabaja en una
                  </p>
                  <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1A0A3B', lineHeight: 1.2 }}>
                    {label}
                  </p>
                </div>
              </div>

              {/* Task list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tasks.map((task, j) => (
                  <motion.div
                    key={task}
                    initial={{ opacity: 0, x: -8 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.3, delay: 0.28 + i * 0.1 + j * 0.06, ease: EASE }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: bg, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={10} color={color} strokeWidth={2.5} />
                    </div>
                    <span style={{
                      fontSize: '0.9rem', color: 'rgba(26,10,59,0.68)', lineHeight: 1.45,
                    }}>
                      {task}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
