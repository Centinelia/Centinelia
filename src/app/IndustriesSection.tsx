'use client';

import { useRef, useState } from 'react';
import { motion, useInView, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import {
  Stethoscope, UtensilsCrossed, Home, Landmark,
  Wrench, Scale, GraduationCap, Sparkles, type LucideIcon,
} from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

type AgentId = 'nia' | 'noah' | 'nelia' | 'nara' | 'nico' | 'naia' | 'neo' | 'nova' | 'nox' | 'niva';

const AGENTS: { id: AgentId; name: string }[] = [
  { id: 'nia',   name: 'Nia'   },
  { id: 'noah',  name: 'Noah'  },
  { id: 'nelia', name: 'Nelia' },
  { id: 'nara',  name: 'Nara'  },
  { id: 'nico',  name: 'Nico'  },
  { id: 'naia',  name: 'Naia'  },
  { id: 'neo',   name: 'Neo'   },
  { id: 'nova',  name: 'Nova'  },
  { id: 'nox',   name: 'Nox'   },
  { id: 'niva',  name: 'Niva'  },
];

const IMG_CFG: Record<AgentId, { pos: string; scale?: number; tx?: string; ty?: string }> = {
  nia:   { pos: 'center 10%', scale: 1.50, tx: '8.5px', ty: '-2.5px' },
  noah:  { pos: 'center 8%', scale: 1.2, ty: '3px' },
  nelia: { pos: 'center 8%', ty: '3px' },
  nara:  { pos: 'center 8%',  scale: 1.2,  tx: '-1.5px',  ty: '4px' },
  nico:  { pos: 'center 8%', tx: '0.5px', ty: '2px' },
  naia:  { pos: 'center 8%' },
  neo:   { pos: 'center 10%', scale: 1.45, tx: '11.5px', ty: '3.5px' },
  nova:  { pos: 'center 5%',  scale: 2.00, tx: '16px',   ty: '4px' },
  nox:   { pos: 'center 5%',  scale: 2.5, tx: '1px' },
  niva:  { pos: 'center 5%',  scale: 2.3 },
};

interface Industry {
  Icon:     LucideIcon;
  color:    string;
  bg:       string;
  label:    string;
  article:  'una' | 'un';
  active:   AgentId[];
  flow:     string[];
  result:   string;
  special?: true;
}

const INDUSTRIES: Industry[] = [
  {
    Icon: Stethoscope, color: '#0891B2', bg: 'rgba(8,145,178,0.08)',
    label: 'Clínica', article: 'una',
    active: ['nia', 'nelia', 'nara'],
    flow: ['Atiende llamadas', 'Agenda pacientes', 'Confirma citas', 'Envía recordatorios', 'Da seguimiento'],
    result: 'Todas las citas quedan confirmadas.',
  },
  {
    Icon: UtensilsCrossed, color: '#D97706', bg: 'rgba(217,119,6,0.08)',
    label: 'Restaurante', article: 'un',
    active: ['nia', 'noah', 'nara'],
    flow: ['Atiende reservaciones', 'Confirma mesas', 'Envía ubicación', 'Gestiona esperas', 'Recupera llamadas'],
    result: 'Nunca pierdes una reservación.',
  },
  {
    Icon: Wrench, color: '#64748B', bg: 'rgba(100,116,139,0.08)',
    label: 'Taller Mecánico', article: 'un',
    active: ['nia', 'nico', 'nova'],
    flow: ['Atiende llamadas', 'Cotiza servicios', 'Confirma entrada', 'Informa avances', 'Notifica entrega'],
    result: 'Ningún cliente queda sin respuesta.',
  },
  {
    Icon: Home, color: '#0EA5E9', bg: 'rgba(14,165,233,0.08)',
    label: 'Inmobiliaria', article: 'una',
    active: ['nia', 'noah', 'nico'],
    flow: ['Captura prospectos', 'Califica interesados', 'Agenda visitas', 'Da seguimiento', 'Recupera oportunidades'],
    result: 'Ninguna oportunidad cae en el olvido.',
  },
  {
    Icon: Scale, color: '#1D4ED8', bg: 'rgba(29,78,216,0.08)',
    label: 'Despacho Jurídico', article: 'un',
    active: ['nia', 'nara', 'niva'],
    flow: ['Recibe consulta', 'Agenda cita', 'Abre expediente', 'Da seguimiento', 'Entrega actualización'],
    result: 'Ningún expediente queda sin seguimiento.',
  },
  {
    Icon: Landmark, color: '#16A34A', bg: 'rgba(22,163,74,0.08)',
    label: 'Municipio', article: 'un',
    active: ['nia', 'nara', 'neo'],
    flow: ['Recibe solicitudes', 'Crea ticket', 'Asigna área', 'Informa avance', 'Confirma resolución'],
    result: 'Cada ciudadano recibe respuesta.',
  },
  {
    Icon: GraduationCap, color: '#DC2626', bg: 'rgba(220,38,38,0.08)',
    label: 'Universidad', article: 'una',
    active: ['nia', 'nelia', 'naia'],
    flow: ['Atiende consultas', 'Orienta proceso', 'Agenda asesoría', 'Confirma inscripción', 'Da seguimiento'],
    result: 'Ningún alumno queda sin orientación.',
  },
  {
    Icon: Sparkles, color: '#6C3BFF', bg: 'rgba(108,59,255,0.08)',
    label: '¿No ves tu industria?', article: 'un',
    active: ['nia', 'noah', 'nelia', 'nara', 'nico', 'naia', 'neo', 'nova', 'nox', 'niva'],
    flow: ['Analizamos tu organización', 'Definimos el flujo', 'Asignamos especialistas', 'Entrenamos a tu oficina digital', 'Tu organización opera'],
    result: 'Cada solicitud encuentra al especialista correcto.',
    special: true,
  },
];

export default function IndustriesSection() {
  const ref      = useRef(null);
  const inView   = useInView(ref, { once: true, margin: '-500px 0px' });
  const [active, setActive] = useState(0);
  const ind = INDUSTRIES[active];

  return (
    <section
      ref={ref}
      style={{ background: '#FAFBFF', borderBottom: '1px solid rgba(26,10,59,0.06)' }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-10 py-20 sm:py-28">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: EASE }}
          className="text-center mb-14"
        >
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: '#6C3BFF' }}>
            Para tu tipo de negocio
          </p>
          <h2
            className="font-bold tracking-tight mb-4"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#1A0A3B', lineHeight: 1.1 }}
          >
            Cada industria tiene una oficina distinta
          </h2>
          <p style={{ color: 'rgba(26,10,59,0.55)', fontSize: '1rem', lineHeight: 1.7 }}>
            Tu oficina aprende cómo trabaja tu organización.
          </p>
        </motion.div>

        {/* Two-panel layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
          className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start"
        >

          {/* Left: industry selector */}
          <div className="w-full lg:w-56 flex-shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-2">
              {INDUSTRIES.map((industry, i) => {
                const isActive = active === i;
                return (
                  <button
                    key={industry.label}
                    onPointerEnter={(e) => { if (e.pointerType === 'mouse') setActive(i); }}
                    onClick={() => setActive(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '10px 12px', borderRadius: 12, width: '100%',
                      border: isActive
                        ? `1px solid ${industry.color}40`
                        : '1px solid rgba(26,10,59,0.07)',
                      background: isActive ? industry.bg : '#fff',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.18s ease',
                      boxShadow: isActive ? `0 2px 10px ${industry.color}14` : 'none',
                    }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      background: isActive ? industry.bg : 'rgba(26,10,59,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.18s ease',
                    }}>
                      <industry.Icon
                        size={14}
                        color={isActive ? industry.color : 'rgba(26,10,59,0.35)'}
                        strokeWidth={2}
                      />
                    </div>
                    <span style={{
                      fontSize: '0.8rem', lineHeight: 1.3,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#1A0A3B' : 'rgba(26,10,59,0.5)',
                      transition: 'all 0.18s ease',
                    }}>
                      {industry.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: preview panel */}
          <div className="flex-1 w-full min-h-[300px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: EASE }}
                style={{
                  background: '#fff',
                  border: `1px solid ${ind.color}28`,
                  borderRadius: 20,
                  padding: '28px 28px 30px',
                  boxShadow: `0 4px 28px ${ind.color}10`,
                }}
              >
                {/* Panel title */}
                <div style={{ marginBottom: 24 }}>
                  <p style={{
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase' as const, color: ind.color, marginBottom: 4,
                  }}>
                    {ind.special ? 'Tu organización' : `Así trabaja en ${ind.article} ${ind.label}`}
                  </p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1A0A3B', lineHeight: 1.3 }}>
                    {ind.special
                      ? 'Tu oficina se adapta a cualquier organización.'
                      : 'Estos Centinelias trabajan para esta organización.'}
                  </p>
                </div>

                {/* Agent avatars */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 26, flexWrap: 'wrap' }}>
                  {AGENTS.map(({ id, name }) => {
                    const activeIndex = ind.active.indexOf(id);
                    const isOn = activeIndex !== -1;
                    return (
                      <motion.div
                        key={id}
                        animate={{ opacity: inView && isOn ? 1 : 0.18 }}
                        transition={{ duration: 0.35, delay: isOn ? 0.3 + activeIndex * 0.6 : 0 }}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          filter: isOn ? 'none' : 'grayscale(100%)',
                          transition: 'filter 0.35s ease',
                          willChange: 'opacity',
                        }}
                      >
                        <div style={{
                          width: 52, height: 52, borderRadius: '50%', overflow: 'hidden',
                          position: 'relative', flexShrink: 0,
                          border: isOn ? `2.5px solid ${ind.color}` : '2.5px solid rgba(26,10,59,0.08)',
                          boxShadow: isOn ? `0 0 14px ${ind.color}44` : 'none',
                          transition: 'border-color 0.35s, box-shadow 0.35s',
                        }}>
                          <Image
                            src={`/meerkats/${id}.png?v=2`}
                            alt={name}
                            fill
                            style={{
                              objectFit:      'cover',
                              objectPosition: IMG_CFG[id].pos,
                              transform:      [
                                IMG_CFG[id].tx || IMG_CFG[id].ty
                                  ? `translate(${IMG_CFG[id].tx ?? '0'}, ${IMG_CFG[id].ty ?? '0'})`
                                  : null,
                                IMG_CFG[id].scale ? `scale(${IMG_CFG[id].scale})` : null,
                              ].filter(Boolean).join(' ') || undefined,
                              transformOrigin: 'center 10%',
                            }}
                          />
                        </div>
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: isOn ? 700 : 400,
                          color: isOn ? ind.color : 'rgba(26,10,59,0.25)',
                          transition: 'all 0.35s',
                        }}>
                          {name}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Flow */}
                <div style={{ padding: '14px 18px', borderRadius: 12, background: ind.bg }}>
                  {ind.flow.map((step, i) => (
                    <div key={step}>
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
                        transition={{ duration: 0.3, delay: 0.5 + i * 0.2, ease: EASE }}
                        style={{
                          padding: '6px 14px', borderRadius: 8,
                          background: '#fff',
                          border: `1px solid ${ind.color}25`,
                          fontSize: '0.8rem', fontWeight: 600,
                          color: ind.color, textAlign: 'center' as const,
                        }}
                      >
                        {step}
                      </motion.div>
                      {i < ind.flow.length - 1 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={inView ? { opacity: 1 } : { opacity: 0 }}
                          transition={{ duration: 0.2, delay: 0.5 + i * 0.2 + 0.18, ease: EASE }}
                          style={{
                            textAlign: 'center' as const,
                            color: `${ind.color}55`,
                            fontSize: '0.8rem',
                            padding: '2px 0',
                            lineHeight: 1,
                          }}
                        >
                          ↓
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Resultado */}
                <motion.div
                  key={`result-${active}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                  transition={{ duration: 0.3, delay: 0.5, ease: EASE }}
                  style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: `${ind.color}15`,
                    border: `1.5px solid ${ind.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: '0.65rem', color: ind.color, fontWeight: 900 }}>✓</span>
                  </div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1A0A3B', lineHeight: 1.4 }}>
                    {ind.result}
                  </span>
                </motion.div>

              </motion.div>
            </AnimatePresence>
          </div>

        </motion.div>
      </div>
    </section>
  );
}
