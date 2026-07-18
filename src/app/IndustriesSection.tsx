'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import {
  Stethoscope, UtensilsCrossed, Home, Landmark,
  Smile, Wrench, Scale, GraduationCap,
  Check, type LucideIcon,
} from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

const INDUSTRIES: {
  Icon:   LucideIcon;
  color:  string;
  bg:     string;
  label:  string;
  sub:    string;
  tasks:  string[];
}[] = [
  {
    Icon:  Stethoscope,
    color: '#0891B2',
    bg:    'rgba(8,145,178,0.08)',
    label: 'Clínica',
    sub:   'Así trabaja en una',
    tasks: [
      'Contesta llamadas.',
      'Agenda pacientes.',
      'Confirma citas.',
      'Envía recordatorios.',
      'Recupera cancelaciones.',
    ],
  },
  {
    Icon:  Smile,
    color: '#EC4899',
    bg:    'rgba(236,72,153,0.08)',
    label: 'Clínica Dental',
    sub:   'Así trabaja en una',
    tasks: [
      'Agenda limpiezas.',
      'Confirma citas.',
      'Atiende urgencias.',
      'Recupera pacientes.',
      'Informa tratamientos.',
    ],
  },
  {
    Icon:  UtensilsCrossed,
    color: '#D97706',
    bg:    'rgba(217,119,6,0.08)',
    label: 'Restaurante',
    sub:   'Así trabaja en un',
    tasks: [
      'Atiende reservaciones.',
      'Confirma mesas.',
      'Contesta WhatsApp.',
      'Envía ubicación.',
      'Recupera llamadas.',
    ],
  },
  {
    Icon:  Wrench,
    color: '#64748B',
    bg:    'rgba(100,116,139,0.08)',
    label: 'Taller Mecánico',
    sub:   'Así trabaja en un',
    tasks: [
      'Agenda servicios.',
      'Cotiza reparaciones.',
      'Informa avances.',
      'Cobra pendientes.',
      'Registra vehículos.',
    ],
  },
  {
    Icon:  Home,
    color: '#6C3BFF',
    bg:    'rgba(108,59,255,0.08)',
    label: 'Inmobiliaria',
    sub:   'Así trabaja en una',
    tasks: [
      'Captura leads.',
      'Agenda visitas.',
      'Da seguimiento.',
      'Recupera prospectos.',
      'Clasifica interesados.',
    ],
  },
  {
    Icon:  Scale,
    color: '#1D4ED8',
    bg:    'rgba(29,78,216,0.08)',
    label: 'Despacho Jurídico',
    sub:   'Así trabaja en un',
    tasks: [
      'Agenda consultas.',
      'Da seguimiento.',
      'Envía documentos.',
      'Clasifica expedientes.',
      'Coordina audiencias.',
    ],
  },
  {
    Icon:  Landmark,
    color: '#16A34A',
    bg:    'rgba(22,163,74,0.08)',
    label: 'Municipio',
    sub:   'Así trabaja en un',
    tasks: [
      'Atiende ciudadanos.',
      'Clasifica solicitudes.',
      'Crea tickets.',
      'Escala incidencias.',
      'Reporta avances.',
    ],
  },
  {
    Icon:  GraduationCap,
    color: '#DC2626',
    bg:    'rgba(220,38,38,0.08)',
    label: 'Universidad',
    sub:   'Así trabaja en una',
    tasks: [
      'Informa horarios.',
      'Atiende estudiantes.',
      'Agenda asesorías.',
      'Gestiona solicitudes.',
      'Canaliza trámites.',
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
      <div className="max-w-6xl mx-auto px-5 sm:px-10 py-20 sm:py-28">

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
            Tu oficina aprende cómo trabaja tu organización.
          </p>
        </motion.div>

        {/* Grid 4×2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {INDUSTRIES.map(({ Icon, color, bg, label, sub, tasks }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 22 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: 0.12 + i * 0.07, ease: EASE }}
              style={{
                background:   '#fff',
                border:       '1px solid rgba(26,10,59,0.08)',
                borderRadius: 18,
                padding:      '22px 20px 24px',
                boxShadow:    '0 2px 12px rgba(26,10,59,0.05)',
              }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: bg, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={17} color={color} strokeWidth={2} />
                </div>
                <div>
                  <p style={{
                    fontSize: '0.6rem', fontWeight: 700,
                    letterSpacing: '0.09em', textTransform: 'uppercase' as const,
                    color, marginBottom: 2,
                  }}>
                    {sub}
                  </p>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1A0A3B', lineHeight: 1.2 }}>
                    {label}
                  </p>
                </div>
              </div>

              {/* Task list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.map((task, j) => (
                  <motion.div
                    key={task}
                    initial={{ opacity: 0, x: -6 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.28, delay: 0.25 + i * 0.07 + j * 0.05, ease: EASE }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%',
                      background: bg, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={9} color={color} strokeWidth={2.5} />
                    </div>
                    <span style={{
                      fontSize: '0.82rem', color: 'rgba(26,10,59,0.65)', lineHeight: 1.45,
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
