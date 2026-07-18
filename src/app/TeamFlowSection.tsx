'use client';

import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import Image from 'next/image';
import { Phone } from 'lucide-react';

interface Step {
  id:     string;
  name:   string;
  role:   string;
  action: string;
  color:  string;
  img:    string | null;
}

const STEPS: Step[] = [
  { id: 'client', name: 'Cliente',  role: 'Llamada entrante', action: '¿Me pueden ayudar?',                    color: '#94a3b8', img: null },
  { id: 'nia',    name: 'Nia',      role: 'Recepción',        action: 'Hola, ¿en qué le puedo ayudar hoy?',   color: '#6C3BFF', img: '/meerkats/nia.png' },
  { id: 'noah',   name: 'Noah',     role: 'Ventas',           action: 'Aquí veo una oportunidad. Le transfiero.', color: '#22c55e', img: '/meerkats/noah.png' },
  { id: 'nara',   name: 'Nara',     role: 'Coordinación',     action: 'Le agendo para el martes a las 10.',   color: '#f97316', img: '/meerkats/nara.png' },
  { id: 'neo',    name: 'Neo',      role: 'Tecnología',       action: 'Ticket de seguimiento creado. #1042.', color: '#06b6d4', img: '/meerkats/neo.png' },
  { id: 'nox',    name: 'Nox',      role: 'Director',         action: 'Resumen del día listo. Todo en orden.', color: '#0d9488', img: '/meerkats/nox.png' },
];

export default function TeamFlowSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px 0px' });

  return (
    <section
      ref={ref}
      style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}
    >
      {/* Ambient glow */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute',
          width: 700, height: 700,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(108,59,255,0.12) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute',
          width: 400, height: 400,
          top: '15%', right: '-10%',
          background: 'radial-gradient(circle, rgba(34,197,94,0.05) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute',
          width: 300, height: 300,
          bottom: '10%', left: '-5%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 70%)',
        }} />
      </div>

      <div className="max-w-xl mx-auto px-5 sm:px-8 py-20 sm:py-28" style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: '#9B6DFF' }}>
            El flujo en acción
          </p>
          <h2
            className="font-bold tracking-tight mb-5"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', lineHeight: 1.1 }}
          >
            ¿Cómo trabajan juntos?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', maxWidth: 380, margin: '0 auto', lineHeight: 1.75, fontSize: '1rem' }}>
            No son ocho personajes sueltos.<br />
            <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Son una oficina.</span>
          </p>
        </motion.div>

        {/* Flow */}
        <div>
          {STEPS.map((step, i) => (
            <div key={step.id} style={{ display: 'flex', gap: 20 }}>

              {/* Left column: avatar + vertical connector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 52 }}>

                {/* Avatar */}
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={inView ? { scale: 1, opacity: 1 } : {}}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.16, type: 'spring', stiffness: 220, damping: 18 }}
                  style={{
                    width: 52, height: 52,
                    borderRadius: '50%',
                    border: `2.5px solid ${step.color}`,
                    boxShadow: `0 0 22px ${step.color}55`,
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#EDE8FF',
                    flexShrink: 0,
                  }}
                >
                  {step.img ? (
                    <Image
                      src={step.img}
                      alt={step.name}
                      fill
                      style={{ objectFit: 'cover', objectPosition: 'center 3%' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <Phone size={20} color={step.color} />
                    </div>
                  )}
                </motion.div>

                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      width: 2,
                      minHeight: 48,
                      borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)',
                      position: 'relative',
                      overflow: 'hidden',
                      margin: '5px 0',
                    }}
                  >
                    {/* Draw fill */}
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={inView ? { scaleY: 1 } : {}}
                      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.38 + i * 0.16 }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(180deg, ${step.color}, ${STEPS[i + 1].color})`,
                        transformOrigin: 'top',
                      }}
                    />
                    {/* Pulse dot */}
                    <motion.div
                      initial={{ top: '0%', opacity: 0 }}
                      animate={inView ? { top: '100%', opacity: [0, 1, 1, 0] } : {}}
                      transition={{ duration: 0.5, delay: 0.52 + i * 0.16 }}
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 9, height: 9,
                        borderRadius: '50%',
                        background: step.color,
                        boxShadow: `0 0 12px ${step.color}, 0 0 24px ${step.color}80`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Right column: content */}
              <motion.div
                initial={{ opacity: 0, x: 16 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.28 + i * 0.16 }}
                style={{
                  flex: 1,
                  paddingTop: 6,
                  paddingBottom: i < STEPS.length - 1 ? 20 : 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                    {step.name}
                  </span>
                  <span style={{
                    fontSize: '0.68rem',
                    color: step.color,
                    fontWeight: 600,
                    background: `${step.color}18`,
                    padding: '2px 8px',
                    borderRadius: 20,
                    border: `1px solid ${step.color}30`,
                    letterSpacing: '0.02em',
                  }}>
                    {step.role}
                  </span>
                </div>
                <p style={{
                  fontSize: '0.9rem',
                  color: 'rgba(255,255,255,0.55)',
                  lineHeight: 1.6,
                  margin: 0,
                  fontStyle: 'italic',
                }}>
                  "{step.action}"
                </p>
              </motion.div>

            </div>
          ))}
        </div>

        {/* Bottom tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.7, delay: 0.2 + STEPS.length * 0.16 }}
          className="text-center mt-12"
          style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', lineHeight: 1.7 }}
        >
          Todo en una sola llamada. Sin que el cliente lo note.
        </motion.p>

      </div>
    </section>
  );
}
