'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'motion/react';
import Image from 'next/image';
import { Phone, Mail } from 'lucide-react';

interface AgentDef {
  id:         string;
  role:       string;
  color:      string;
  img:        string | null;
  imgPos?:    string;
  imgScale?:  number;
  imgOrigin?: string;
  imgShiftX?: string;
  imgShiftY?: string;
  label?:     string;
  badge?:     boolean;
}

const CLIENTE: AgentDef = {
  id: 'cliente', role: 'Cliente', color: '#94a3b8', img: null,
};

const NIA: AgentDef = {
  id: 'nia', role: 'Recepcionista', label: 'Primer contacto', badge: true, color: '#6C3BFF',
  img: '/meerkats/nia.png', imgPos: 'center 10%', imgScale: 1.35, imgOrigin: 'center 12%', imgShiftX: '10.5px',
};

const SPECIALISTS: AgentDef[] = [
  { id: 'noah',  role: 'Ventas',       color: '#22c55e', img: '/meerkats/noah.png',  imgPos: 'center 3%' },
  { id: 'nara',  role: 'Coordinadora', color: '#f97316', img: '/meerkats/nara.png',  imgPos: 'center 3%', imgScale: 1.2, imgOrigin: 'center 10%', imgShiftX: '-2px', imgShiftY: '4px' },
  { id: 'nico',  role: 'Cobranza',     color: '#f59e0b', img: '/meerkats/nico.png',  imgPos: 'center 3%' },
  { id: 'naia',  role: 'RR.HH.',       color: '#ec4899', img: '/meerkats/naia.png',  imgPos: 'center 3%' },
  { id: 'nelia', role: 'Atención',     color: '#3b82f6', img: '/meerkats/nelia.png', imgPos: 'center 3%' },
  { id: 'neo',   role: 'Operaciones',  color: '#06b6d4', img: '/meerkats/neo.png',   imgPos: 'center 10%', imgScale: 1.45, imgOrigin: 'center 12%', imgShiftX: '12px', imgShiftY: '5px' },
  { id: 'nova',  role: 'Coordinación', color: '#ef4444', img: '/meerkats/nova.png',  imgPos: 'center 5%', imgScale: 2.00, imgOrigin: 'center 12%', imgShiftX: '17.5px', imgShiftY: '4px' },
];

const NOX_COLOR  = '#0d9488';
const NIVA_COLOR = '#7c3aed';
const EASE_EXPO  = [0.16, 1, 0.3, 1] as const;

// Total 8 nodes: Nia at index 0 (top), specialists at 1-7
const ALL_NODES = [NIA, ...SPECIALISTS];
// Unit-circle positions (computed once, scaled inside component)
const NODE_UNIT = ALL_NODES.map((_, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / ALL_NODES.length;
  return { x: Math.cos(a), y: Math.sin(a) };
});

// All specialist pairs for ghost chords (21 pairs)
const ALL_PAIRS: [number, number][] = [];
for (let i = 0; i < SPECIALISTS.length; i++) {
  for (let j = i + 1; j < SPECIALISTS.length; j++) {
    ALL_PAIRS.push([i, j]);
  }
}

function RolePill({ color, role, delay, inView, badge = false }: {
  color: string; role: string; delay: number; inView: boolean; badge?: boolean;
}) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.3, delay }}
      style={badge ? {
        fontSize: '0.53rem',
        color: '#fff',
        fontWeight: 700,
        background: color,
        padding: '3px 10px',
        borderRadius: 20,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        letterSpacing: '0.04em',
        textTransform: 'uppercase' as const,
      } : {
        fontSize: '0.58rem',
        color,
        fontWeight: 600,
        background: `${color}1A`,
        padding: '2px 7px',
        borderRadius: 20,
        border: `1px solid ${color}35`,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      {role}
    </motion.span>
  );
}

function AvatarNode({
  agent, size, delay, inView, isClient = false, hidePill = false, dimmed = false,
}: {
  agent: AgentDef; size: number; delay: number; inView: boolean; isClient?: boolean; hidePill?: boolean; dimmed?: boolean;
}) {
  const transform = [
    (agent.imgShiftX || agent.imgShiftY)
      ? `translate(${agent.imgShiftX ?? '0'}, ${agent.imgShiftY ?? '0'})`
      : null,
    agent.imgScale ? `scale(${agent.imgScale})` : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={inView ? { scale: 1, opacity: 1 } : {}}
        transition={{ duration: 0.4, delay, type: 'spring', stiffness: 240, damping: 20 }}
        style={{
          width: size, height: size,
          borderRadius: '50%',
          border: `2px solid ${agent.color}`,
          boxShadow: `0 0 16px ${agent.color}44`,
          overflow: 'hidden',
          position: 'relative',
          background: agent.img ? '#EDE8FF' : `${agent.color}18`,
          flexShrink: 0,
        }}
      >
        {agent.img ? (
          <motion.div
            style={{ position: 'absolute', inset: 0 }}
            animate={{ opacity: dimmed ? 0.28 : 1 }}
            transition={{ duration: 0.5 }}
          >
            <Image
              src={agent.img}
              alt={agent.role}
              fill
              style={{
                objectFit: 'cover',
                objectPosition: agent.imgPos ?? 'center 3%',
                transform,
                transformOrigin: agent.imgOrigin ?? 'center 10%',
              }}
            />
          </motion.div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}>
            <Phone size={Math.round(size * 0.25)} color={agent.color} />
            <Mail  size={Math.round(size * 0.25)} color={agent.color} />
          </div>
        )}
      </motion.div>

      <motion.div animate={{ opacity: dimmed ? 0.28 : 1 }} transition={{ duration: 0.5 }}>
        {isClient ? (
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.3, delay: delay + 0.1 }}
            style={{ fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', textAlign: 'center' }}
          >
            Nueva Solicitud
          </motion.span>
        ) : !hidePill ? (
          <RolePill color={agent.color} role={agent.label ?? agent.role} delay={delay + 0.1} inView={inView} badge={agent.badge} />
        ) : null}
      </motion.div>
    </div>
  );
}

export default function TeamFlowSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px 0px' });

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 1–3 random specialists active at a time — cycles every 2.8s
  const [activeSet, setActiveSet] = useState<Set<number>>(new Set([0]));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!inView) return;
    const pickSet = (prev: Set<number>): Set<number> => {
      const count = Math.floor(Math.random() * 3) + 1;
      const shuffled = [...Array(SPECIALISTS.length).keys()].sort(() => Math.random() - 0.5);
      const next = new Set<number>(shuffled.slice(0, count));
      const same = next.size === prev.size && [...next].every(n => prev.has(n));
      return same ? new Set<number>(shuffled.slice(count, count + 1)) : next;
    };
    const start = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        setActiveSet(prev => pickSet(prev));
      }, 2800);
    }, 1800);
    return () => {
      clearTimeout(start);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [inView]);

  // Orbital layout — scales with viewport
  const ORBIT_D  = isMobile ? 320 : 620;
  const CX       = ORBIT_D / 2;
  const CY       = ORBIT_D / 2;
  const ORBIT_R  = isMobile ? 112 : 224;

  const nodePos  = NODE_UNIT.map(u => ({ x: CX + ORBIT_R * u.x, y: CY + ORBIT_R * u.y }));
  const NIA_XY   = nodePos[0];
  const SPEC_XY  = nodePos.slice(1);

  const clienteSize = isMobile ? 40 : 62;
  const niaSize     = isMobile ? 44 : 78;
  const specSize    = isMobile ? 27 : 56;
  const dirSize     = isMobile ? 72  : 100;

  return (
    <section
      ref={ref}
      style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}
    >
      {/* Ambient glow */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', width: 700, height: 700,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(108,59,255,0.12) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', width: 400, height: 400,
          top: '15%', right: '-10%',
          background: 'radial-gradient(circle, rgba(34,197,94,0.05) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', width: 300, height: 300,
          bottom: '10%', left: '-5%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 70%)',
        }} />
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-10 py-20 sm:py-28" style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: EASE_EXPO }}
          className="text-center mb-14"
        >
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: '#9B6DFF' }}>
            El flujo en acción
          </p>
          <h2
            className="font-bold tracking-tight mb-5"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', lineHeight: 1.1 }}
          >
            Así funciona una oficina<br />que nunca duerme.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', margin: '0 auto', lineHeight: 1.75, fontSize: '1rem' }}>
            Cada tarea llega automáticamente al especialista correcto.
          </p>
        </motion.div>

        {/* Flow diagram */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* Cliente */}
          <AvatarNode agent={CLIENTE} size={clienteSize} delay={0} inView={inView} isClient />

          {/* Cliente → Nia connector — pulses constantly */}
          <motion.div
            initial={{ scaleY: 0 }}
            animate={inView ? { scaleY: 1, opacity: [0.4, 1, 0.4] } : {}}
            transition={{
              scaleY: { duration: 0.35, delay: 0.12, ease: EASE_EXPO },
              opacity: { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
            }}
            style={{
              width: 2, height: 24,
              background: 'linear-gradient(180deg, #94a3b8, #6C3BFF)',
              borderRadius: 2, transformOrigin: 'top',
            }}
          />

          {/* Orbital ring — flex centers Dirección; SVG + avatars are absolute */}
          <div style={{ position: 'relative', width: ORBIT_D, height: ORBIT_D, overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

            {/* SVG overlay — all connections */}
            <svg
              viewBox={`0 0 ${ORBIT_D} ${ORBIT_D}`}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                overflow: 'visible', pointerEvents: 'none',
              }}
            >
              <defs>
                <filter id="tf-orbit-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <radialGradient id="tf-center-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#6C3BFF" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#6C3BFF" stopOpacity="0" />
                </radialGradient>
                {/* Per-pair chord gradients — specialist color A → color B */}
                {ALL_PAIRS.map(([i, j]) => (
                  <linearGradient
                    key={`chord-grad-def-${i}-${j}`}
                    id={`chord-grad-${i}-${j}`}
                    gradientUnits="userSpaceOnUse"
                    x1={SPEC_XY[i].x} y1={SPEC_XY[i].y}
                    x2={SPEC_XY[j].x} y2={SPEC_XY[j].y}
                  >
                    <stop offset="0%" stopColor={SPECIALISTS[i].color} />
                    <stop offset="100%" stopColor={SPECIALISTS[j].color} />
                  </linearGradient>
                ))}
              </defs>

              {/* Soft glow behind center */}
              <motion.circle
                cx={CX} cy={CY} r={ORBIT_R * 0.52}
                fill="url(#tf-center-glow)"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 1.2, delay: 0.5 }}
              />

              {/* Ghost orbit ring */}
              <motion.circle
                cx={CX} cy={CY} r={ORBIT_R}
                stroke="rgba(255,255,255,0.07)" strokeWidth={1}
                fill="none" strokeDasharray="3 9"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              />

              {/* Ghost lines — Nia to all specialists (siempre visibles, muy tenues) */}
              {SPEC_XY.map((pos, i) => (
                <motion.line key={`ghost-nia-spec-${i}`}
                  x1={NIA_XY.x} y1={NIA_XY.y} x2={pos.x} y2={pos.y}
                  stroke={NIA.color} strokeWidth={0.6}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 0.1 } : { opacity: 0 }}
                  transition={{ duration: 0.6, delay: 0.32 + i * 0.04 }}
                />
              ))}
              {/* Nia → especialista activo — glow */}
              {SPEC_XY.map((pos, i) => (
                <motion.line key={`glow-nia-spec-${i}`}
                  x1={NIA_XY.x} y1={NIA_XY.y} x2={pos.x} y2={pos.y}
                  stroke={NIA.color} strokeWidth={4}
                  filter="url(#tf-orbit-glow)"
                  strokeDasharray="5 12"
                  animate={inView ? {
                    opacity: activeSet.has(i) ? 0.32 : 0,
                    strokeDashoffset: [0, -17],
                  } : { opacity: 0 }}
                  transition={{
                    opacity: { duration: 0.4 },
                    strokeDashoffset: { duration: 1.0, repeat: Infinity, ease: 'linear' },
                  }}
                />
              ))}
              {/* Nia → especialista activo — main */}
              {SPEC_XY.map((pos, i) => (
                <motion.line key={`flow-nia-spec-${i}`}
                  x1={NIA_XY.x} y1={NIA_XY.y} x2={pos.x} y2={pos.y}
                  stroke={NIA.color} strokeWidth={1.5}
                  strokeDasharray="5 12"
                  animate={inView ? {
                    opacity: activeSet.has(i) ? 0.85 : 0,
                    strokeDashoffset: [0, -17],
                  } : { opacity: 0 }}
                  transition={{
                    opacity: { duration: 0.4 },
                    strokeDashoffset: { duration: 1.0, repeat: Infinity, ease: 'linear' },
                  }}
                />
              ))}

              {/* Ghost spokes — specialists to center */}
              {SPEC_XY.map((pos, i) => (
                <motion.line key={`ghost-spoke-${i}`}
                  x1={pos.x} y1={pos.y} x2={CX} y2={CY}
                  stroke={SPECIALISTS[i].color} strokeWidth={0.7}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 0.12 } : { opacity: 0 }}
                  transition={{ duration: 0.6, delay: 0.38 + i * 0.04 }}
                />
              ))}

              {/* Active spoke glow */}
              {SPEC_XY.map((pos, i) => (
                <motion.line key={`glow-spoke-${i}`}
                  x1={pos.x} y1={pos.y} x2={CX} y2={CY}
                  stroke={SPECIALISTS[i].color} strokeWidth={4}
                  filter="url(#tf-orbit-glow)"
                  strokeDasharray="5 12"
                  animate={inView ? {
                    opacity: activeSet.has(i) ? 0.32 : 0,
                    strokeDashoffset: [0, -17],
                  } : { opacity: 0 }}
                  transition={{
                    opacity: { duration: 0.4 },
                    strokeDashoffset: { duration: 1.0, repeat: Infinity, ease: 'linear' },
                  }}
                />
              ))}

              {/* Active spoke main */}
              {SPEC_XY.map((pos, i) => (
                <motion.line key={`flow-spoke-${i}`}
                  x1={pos.x} y1={pos.y} x2={CX} y2={CY}
                  stroke={SPECIALISTS[i].color} strokeWidth={1.5}
                  strokeDasharray="5 12"
                  animate={inView ? {
                    opacity: activeSet.has(i) ? 0.9 : 0,
                    strokeDashoffset: [0, -17],
                  } : { opacity: 0 }}
                  transition={{
                    opacity: { duration: 0.4 },
                    strokeDashoffset: { duration: 1.0, repeat: Infinity, ease: 'linear' },
                  }}
                />
              ))}

              {/* Ghost chord lines — all specialist pairs */}
              {ALL_PAIRS.map(([i, j]) => (
                <motion.line key={`ghost-chord-${i}-${j}`}
                  x1={SPEC_XY[i].x} y1={SPEC_XY[i].y}
                  x2={SPEC_XY[j].x} y2={SPEC_XY[j].y}
                  stroke="rgba(255,255,255,1)" strokeWidth={0.5}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 0.04 } : { opacity: 0 }}
                  transition={{ duration: 0.8, delay: 0.65 }}
                />
              ))}

              {/* Active chord glow — gradient of the two peers' colors */}
              {ALL_PAIRS.map(([i, j]) => {
                const active = activeSet.has(i) && activeSet.has(j);
                return (
                  <motion.line key={`glow-chord-${i}-${j}`}
                    x1={SPEC_XY[i].x} y1={SPEC_XY[i].y}
                    x2={SPEC_XY[j].x} y2={SPEC_XY[j].y}
                    stroke={`url(#chord-grad-${i}-${j})`} strokeWidth={3.5}
                    filter="url(#tf-orbit-glow)"
                    strokeDasharray="4 14"
                    animate={inView ? {
                      opacity: active ? 0.35 : 0,
                      strokeDashoffset: [0, -18],
                    } : { opacity: 0 }}
                    transition={{
                      opacity: { duration: 0.4 },
                      strokeDashoffset: { duration: 1.1, repeat: Infinity, ease: 'linear' },
                    }}
                  />
                );
              })}

              {/* Active chord main — gradient of the two peers' colors */}
              {ALL_PAIRS.map(([i, j]) => {
                const active = activeSet.has(i) && activeSet.has(j);
                return (
                  <motion.line key={`flow-chord-${i}-${j}`}
                    x1={SPEC_XY[i].x} y1={SPEC_XY[i].y}
                    x2={SPEC_XY[j].x} y2={SPEC_XY[j].y}
                    stroke={`url(#chord-grad-${i}-${j})`} strokeWidth={1.5}
                    strokeDasharray="4 14"
                    animate={inView ? {
                      opacity: active ? 0.75 : 0,
                      strokeDashoffset: [0, -18],
                    } : { opacity: 0 }}
                    transition={{
                      opacity: { duration: 0.4 },
                      strokeDashoffset: { duration: 1.1, repeat: Infinity, ease: 'linear' },
                    }}
                  />
                );
              })}

              {/* Node dots on ring */}
              {SPEC_XY.map((pos, i) => (
                <motion.circle key={`dot-spec-${i}`}
                  cx={pos.x} cy={pos.y}
                  r={activeSet.has(i) ? 3.5 : 2}
                  fill={SPECIALISTS[i].color}
                  filter={activeSet.has(i) ? 'url(#tf-orbit-glow)' : undefined}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: activeSet.has(i) ? 0.9 : 0.25 } : { opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 + i * 0.05 }}
                />
              ))}
            </svg>

            {/* Nia — top of orbit (12 o'clock) */}
            <div style={{
              position: 'absolute',
              left: NIA_XY.x,
              top: NIA_XY.y,
              transform: 'translate(-50%, -50%)',
              zIndex: 2,
            }}>
              <AvatarNode agent={NIA} size={niaSize} delay={0.18} inView={inView} />
            </div>

            {/* Dirección — exact center: outer div positions, motion.div animates */}
            <div style={{
              position: 'absolute',
              left: '50%', top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 3,
            }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.75 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.65, delay: 0.85, ease: EASE_EXPO }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
              >
                <div style={{
                  width: dirSize, height: dirSize,
                  borderRadius: '50%',
                  border: `3px solid ${NOX_COLOR}`,
                  boxShadow: `0 0 0 3px ${NIVA_COLOR}55, 0 0 32px ${NOX_COLOR}66, 0 0 32px ${NIVA_COLOR}66`,
                  overflow: 'hidden',
                  position: 'relative',
                  background: '#0D0520',
                  flexShrink: 0,
                }}>
                  <Image
                    src="/meerkats/nox-niva.png"
                    alt="Nox y Niva"
                    fill
                    style={{ objectFit: 'contain', objectPosition: 'center bottom' }}
                  />
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.04em',
                  background: `linear-gradient(90deg, ${NOX_COLOR}, ${NIVA_COLOR})`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>
                  Dirección
                </span>
              </motion.div>
            </div>

            {/* Specialists — distributed around orbit */}
            {SPECIALISTS.map((agent, i) => (
              <div key={agent.id} style={{
                position: 'absolute',
                left: SPEC_XY[i].x,
                top: SPEC_XY[i].y,
                transform: 'translate(-50%, -50%)',
                zIndex: 2,
              }}>
                <AvatarNode
                  agent={agent}
                  size={specSize}
                  delay={0.5 + i * 0.06}
                  inView={inView}
                  hidePill={isMobile}
                  dimmed={inView && !activeSet.has(i)}
                />
              </div>
            ))}
          </div>

          {/* Closing text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.7, delay: 1.2 }}
            style={{
              color: 'rgba(255,255,255,0.3)',
              fontSize: '0.85rem',
              lineHeight: 1.75,
              textAlign: 'center',
              marginTop: 36,
            }}
          >
            Lo complejo ocurre detrás. El cliente solo recibe una atención impecable.
          </motion.p>

        </div>
      </div>
    </section>
  );
}
