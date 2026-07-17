import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Phone, PhoneOff, TrendingDown,
  Clock, Check, ArrowRight, Play, Target, Rocket, Star,
  ShoppingBag, MessageCircle, Users,
} from 'lucide-react';
import LandingNav from './LandingNav';
import LandingWidgets from './LandingWidgets';
import RotatingNiche from './RotatingNiche';
import FaqSection from './FaqSection';
import DemoSelector from './DemoSelector';
import AnimatedSection from './AnimatedSection';
import MeerkatReveal from './MeerkatReveal';
import AudioWaveform from './AudioWaveform';
import Marquee from './Marquee';

// ─── Demo agent ───────────────────────────────────────────────────────────────
// Reemplaza con el número real del agente demo cuando esté configurado
const DEMO_PHONE      = '+52 (81) 2188 8490';
const DEMO_PHONE_HREF = 'tel:+528121888490';

// ─── Data ─────────────────────────────────────────────────────────────────────

const DIRECTORS = {
  nombres: 'Nox & Niva',
  rol:     'Dirección',
  desc:    'Dirigen a todo el equipo. Distribuyen trabajo, supervisan resultados y mantienen a todos sincronizados para que tu operación funcione sola.',
  color:   '#6C3BFF',
  img:     '/meerkats/nox-niva.png',
};

const TEAM = [
  { nombre: 'Nia',   rol: 'Recepción',         desc: 'Atiende llamadas, agenda citas y recibe cada solicitud.',              color: '#6C3BFF', img: '/meerkats/nia.png',  imgPad: '0px' },
  { nombre: 'Noah',  rol: 'Ventas',            desc: 'Llama prospectos, califica leads y cierra oportunidades nuevas.',      color: '#22c55e', img: '/meerkats/noah.png'  },
  { nombre: 'Nara',  rol: 'Coordinación',      desc: 'Coordina procesos, da seguimiento y mantiene la operación en orden.',  color: '#f97316', img: '/meerkats/nara.png'  },
  { nombre: 'Neo',   rol: 'Tecnología',        desc: 'Resuelve tickets, gestiona incidentes y mantiene los sistemas activos.', color: '#06b6d4', img: '/meerkats/neo.png'  },
  { nombre: 'Naia',  rol: 'Recursos Humanos',  desc: 'Organiza vacaciones, permisos y expedientes del equipo.',              color: '#ec4899', img: '/meerkats/naia.png'  },
  { nombre: 'Nico',  rol: 'Recuperación',      desc: 'Cobra, recuerda pagos y recupera clientes inactivos.',                 color: '#f59e0b', img: '/meerkats/nico.png'  },
  { nombre: 'Nelia', rol: 'Atención al Cliente', desc: 'Responde dudas y acompaña al cliente hasta resolverlas.',            color: '#3b82f6', img: '/meerkats/nelia.png' },
  { nombre: 'Nova',  rol: 'Despacho',          desc: 'Despacha equipos, actualiza estatus y coordina cada salida en campo.', color: '#ef4444', img: '/meerkats/nova.png'  },
];

const PAINS = [
  {
    icon:  <PhoneOff size={22} color="#dc2626" />,
    stat:  '62%',
    label: 'de los clientes no vuelve a llamar si no contestan a la primera.',
    color: '#dc2626',
  },
  {
    icon:  <TrendingDown size={22} color="#d97706" />,
    stat:  '5–20',
    label: 'oportunidades semanales se pierden solo por no contestar el teléfono.',
    color: '#d97706',
  },
  {
    icon:  <Clock size={22} color="#eab308" />,
    stat:  '16 h',
    label: 'al día en promedio tu organización está cerrada, pero tus clientes no dejan de llamar.',
    color: '#eab308',
  },
];

const AGENT_TYPES: {
  id: string; name: string; setupFee: number; color: string;
  description: string; features: string[]; popular?: boolean;
  meerkat: string; meerkatBottom: number;
  meerkatDesk: string; meerkatDeskBottom: number;
}[] = [
  {
    id: 'pro', name: 'Empleado Centinelia', setupFee: 14990, color: '#9B6DFF', popular: true,
    description: 'Todo lo que tu organización necesita para automatizar la atención telefónica desde el primer día.',
    features: [
      'Atención telefónica 24/7',
      'Captura de leads y agendamiento de citas',
      'Hasta 3 llamadas simultáneas',
      'Llamadas salientes y devolución automática',
      'Toma de pedidos por teléfono',
      'Multiidioma (español + inglés)',
      'Memoria de cliente entre llamadas',
      'Voz y flujos personalizables',
      'Reseñas Google automáticas',
      'Módulo Oficina completo',
    ],
    meerkat: '/agent-plan-pro.png', meerkatBottom: 66,
    meerkatDesk: '/meerkat-transparente-07.png', meerkatDeskBottom: 65,
  },
];

const MINUTE_TIERS: {
  id: string; label: string; minutes: number; ops: number; price: number; popular?: boolean;
}[] = [
  { id: 'starter', label: 'Starter', minutes: 300,  ops: 100, price: 2997 },
  { id: 'growth',  label: 'Growth',  minutes: 600,  ops: 200, price: 5994, popular: true },
  { id: 'scale',   label: 'Scale',   minutes: 1200, ops: 300, price: 11988 },
];

const DIFFERENTIATORS = [
  {
    num: '∞',
    title: 'Atiende varias conversaciones al mismo tiempo',
    desc: 'Mientras una persona solo puede hablar con un cliente, Centinelia puede atender 3 llamadas al mismo tiempo además de correos y chats simultáneamente.',
  },
  {
    num: '24/7',
    title: 'Siempre disponible',
    desc: 'Trabaja de día, de noche, fines de semana y días festivos.',
  },
  {
    num: '$0',
    title: 'Costos laborales adicionales',
    desc: 'Sin IMSS, vacaciones, incapacidades ni reemplazos por ausencias.',
  },
  {
    num: '<24h',
    title: 'Empieza a trabajar mañana',
    desc: 'Aprende tu negocio y comienza a operar sin procesos largos de contratación.',
  },
];

const fmt = (n: number) => new Intl.NumberFormat('es-MX').format(n);

// ─── Shared tokens ────────────────────────────────────────────────────────────

const C = {
  bg:       '#FAFBFF',
  bgAlt:    '#F4F0FF',
  surface:  '#FFFFFF',
  border:   'rgba(108,59,255,0.1)',
  text:     '#1A0A3B',
  textSub:  'rgba(26,10,59,0.55)',
  textMute: 'rgba(26,10,59,0.38)',
  accent:   '#6C3BFF',
  accentLt: '#9B6DFF',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div style={{ background: C.bg, color: C.text, overflowX: 'hidden' }}>
      <LandingNav />

      {/* ── HERO, full-screen cinematic image ───────────────────────────── */}
      <section className="relative film-grain" style={{ minHeight: '100svh', display: 'flex', alignItems: 'flex-start', overflow: 'hidden', clipPath: 'inset(0 0 0 0)' }}>

        {/* Background image — mobile */}
        <Image
          src="/hero-bg-mobile.png"
          alt=""
          fill
          priority
          quality={100}
          sizes="100vw"
          className="hero-bg-img block sm:hidden"
          style={{ objectFit: 'cover', objectPosition: 'center 30%' }}
        />
        {/* Background image — desktop */}
        <Image
          src="/hero-bg.png"
          alt=""
          fill
          priority
          quality={100}
          sizes="(max-width: 1280px) 150vw, 100vw"
          className="hero-bg-img hidden sm:block"
          style={{ objectFit: 'cover' }}
        />

        {/* Base dark overlay, ensures readability on mobile */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,1,18,0.55)' }} />
        {/* Left-to-right gradient, adds depth on larger screens */}
        <div className="hidden sm:block" style={{
          position:   'absolute',
          inset:      0,
          background: 'linear-gradient(95deg, rgba(5,1,18,0.5) 0%, rgba(5,1,18,0.3) 45%, transparent 75%)',
        }} />

        {/* Animated orbs */}
        <div className="orb" style={{
          width: 480, height: 480,
          top: -60, left: -120,
          background: 'radial-gradient(circle, rgba(108,59,255,0.35) 0%, transparent 65%)',
          ['--orb-dur' as string]: '9s',
          zIndex: 1,
        }} />
        <div className="orb" style={{
          width: 320, height: 320,
          top: 80, right: '15%',
          background: 'radial-gradient(circle, rgba(155,109,255,0.2) 0%, transparent 65%)',
          ['--orb-dur' as string]: '12s',
          animationDelay: '-4s',
          zIndex: 1,
        }} />

        {/* Bottom fade → blends into Problema dark section */}
        <div style={{
          position:   'absolute',
          bottom:     0,
          left:       0,
          right:      0,
          height:     80,
          background: 'linear-gradient(to bottom, transparent, #0D0520)',
          zIndex:     2,
        }} />

        {/* Content, centered on mobile, left-aligned on sm+ */}
        <div className="relative w-full max-w-6xl mx-auto px-5 sm:px-8 text-center sm:text-left" style={{ paddingTop: 100, paddingBottom: 80, zIndex: 3 }}>
          <div className="mx-auto sm:mx-0" style={{ maxWidth: 560 }}>

            {/* Live waveform indicator */}
            <div className="inline-flex items-center gap-3 mb-6">
              <span
                className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: '#C4A8FF' }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block', boxShadow: '0 0 8px #4ade80' }} />
                Centinelia EN LÍNEA
              </span>
              <AudioWaveform barCount={22} />
            </div>

            {/* Headline */}
            <h1
              className="font-bold leading-[1.06] tracking-tight mb-3"
              style={{ fontSize: 'clamp(2.8rem, 6vw, 5.2rem)', color: '#fff' }}
            >
              Tu primer empleado
              <br />
              <span style={{
                background:           'linear-gradient(135deg, #9B6DFF 0%, #C4A8FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor:  'transparent',
              }}>
                digital.
              </span>
            </h1>

            {/* Rotating niche */}
            <p className="mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Perfecto para <RotatingNiche />
            </p>

            {/* Sub */}
            <p
              className="mb-8 leading-relaxed mt-[20vw] sm:mt-0"
              style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.62)' }}
            >
              Primera oficina digital con empleados especializados que responden llamadas, correos, agendas, documentos y tareas.<br /><br />
              Trabajan juntos. Nunca descansan.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3">
              <Link
                href="/registro"
                className="cta-pulse flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)',
                  color:      '#fff',
                }}
              >
                Contratar ahora <ArrowRight size={15} />
              </Link>
              <a
                href="#demo"
                className="flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-medium transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color:      'rgba(255,255,255,0.82)',
                  border:     '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <Play size={13} style={{ fill: 'currentColor' }} /> Conoce a tu próximo empleado
              </a>
            </div>

          </div>
        </div>

        {/* Trust chips — pinned al fondo del hero, visible sin scroll */}
        <div
          className="trust-chips"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            zIndex: 3,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '6px 28px',
            padding: '0 20px',
          }}
        >
          {['Sin contrato mínimo', 'Activo en menos de 24 h', 'Número local incluido', 'Soporte en español'].map(t => (
            <span key={t} className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>
              <Check size={11} color="#9B6DFF" /> {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── PROBLEMA ─────────────────────────────────────────────────────── */}
      <section id="problema" style={{ background: '#0D0520', position: 'relative', transform: 'translateZ(0)' }}>
        {/* Clip layer separate from animated content, prevents Framer Motion repaint flicker */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {/* Pure gradient orb */}
          <div style={{
            position: 'absolute',
            width: 700, height: 700,
            top: -120, left: '50%', transform: 'translateX(-50%)',
            background: 'radial-gradient(circle, rgba(108,59,255,0.14) 0%, rgba(108,59,255,0.06) 40%, transparent 70%)',
            borderRadius: '50%',
          }} />
        </div>

        <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:pl-80 py-20 sm:py-28" style={{ position: 'relative', zIndex: 1 }}>
          {/* Suricata, dinero volando — dentro del contenedor para centrar en el espacio lg:pl-80 */}
          <MeerkatReveal className="meerkat-money">
            <Image
              src="/agent-money.png"
              alt=""
              fill
              sizes="(min-width: 1024px) 360px, 140px"
              style={{ objectFit: 'contain', objectPosition: 'top center' }}
            />
          </MeerkatReveal>

          {/* Mobile: suricata absoluta izquierda, desborda hacia tarjetas */}
          <div className="lg:hidden relative mb-4">
            {/* Suricata, ancla su bottom justo en el top de las tarjetas */}
            <MeerkatReveal className="absolute" style={{ bottom: -16, left: -5, width: 105, height: 188, zIndex: 0, pointerEvents: 'none', userSelect: 'none' }}>
              <Image
                src="/agent-money.png"
                alt=""
                fill
                sizes="105px"
                style={{ objectFit: 'contain', objectPosition: 'top center' }}
              />
            </MeerkatReveal>
            <div style={{ paddingLeft: 112 }}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'rgba(155,109,255,0.7)' }}>
                El problema
              </p>
              <h2
                className="font-bold tracking-tight mb-3"
                style={{ fontSize: 'clamp(1.3rem, 5.5vw, 1.7rem)', color: '#fff', lineHeight: 1.25 }}
              >
                Cada llamada perdida<br />es dinero perdido
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                Mientras tu organización no contesta, tu competencia sí lo hace.
                Esto le pasa a una organización promedio cada semana:
              </p>
            </div>
          </div>

          {/* Desktop: centered heading */}
          <div className="hidden lg:block text-center mb-14">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(155,109,255,0.7)' }}>
              El problema
            </p>
            <h2
              className="font-bold tracking-tight mb-4"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#fff' }}
            >
              Cada llamada perdida<br />es dinero perdido
            </h2>
            <p className="max-w-lg mx-auto" style={{ color: 'rgba(255,255,255,0.52)' }}>
              Mientras tu organización no contesta, tu competencia sí lo hace.
              Esto le pasa a una organización promedio cada semana:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5" style={{ position: 'relative', zIndex: 1 }}>
            {PAINS.map((p, i) => (
              <AnimatedSection key={p.stat} delay={i * 0.1}>
              <div
                className="rounded-2xl p-6 h-full"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${p.color}18`, border: `1px solid ${p.color}30` }}
                >
                  {p.icon}
                </div>
                <span className="text-4xl font-bold tabular-nums block mb-2" style={{ color: p.color }}>
                  {p.stat}
                </span>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.52)' }}>{p.label}</p>
              </div>
              </AnimatedSection>
            ))}
          </div>

          {/* Bridge */}
          <AnimatedSection delay={0.15}>
          <div
            className="mt-8 rounded-2xl px-7 py-6 flex flex-col sm:flex-row items-start sm:items-center gap-5"
            style={{ background: 'rgba(108,59,255,0.12)', border: `1px solid rgba(108,59,255,0.28)` }}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(108,59,255,0.25)', border: '1px solid rgba(108,59,255,0.4)' }}>
              <Target size={18} color="#C4A8FF" />
            </div>
            <div>
              <p className="font-semibold mb-1" style={{ color: '#fff' }}>
                Tu Empleado Digital resuelve los tres a la vez.
              </p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.52)' }}>
                Atiende, captura leads, agenda y llama de regreso, sin límite de horario
                ni de capacidad. Sin que tú tengas que intervenir.
              </p>
            </div>
          </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── EMPLEADO TELEFÓNICO CON IA ──────────────────────────────────── */}
      <section style={{
        background: `radial-gradient(ellipse at 90% 10%, rgba(108,59,255,0.07) 0%, transparent 55%), ${C.bgAlt}`,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-28" style={{ position: 'relative', zIndex: 1 }}>

          <AnimatedSection className="mb-12 sm:mb-16 text-center">
            <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: C.accent }}>
              Empleado Digital
            </p>
            <h2
              className="font-bold tracking-tight mb-4 mx-auto"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: C.text, lineHeight: 1.1, maxWidth: 640 }}
            >
              No es software.<br />No es recepcionista.<br />Es capacidad operativa que trabaja sola.
            </h2>
            <p className="mx-auto" style={{ color: C.textSub, maxWidth: 520, lineHeight: 1.7 }}>
              La diferencia no está en las funciones. Está en que, por primera vez, tienes un empleado sin los límites que tienen todos los demás.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-6">
            {DIFFERENTIATORS.map((d, i) => (
              <AnimatedSection key={d.title} delay={i * 0.08}>
                <div
                  className="rounded-2xl p-6 h-full"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 2px 16px rgba(108,59,255,0.20)' }}
                >
                  <span
                    className="font-bold tabular-nums block mb-3"
                    style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', color: C.accent, lineHeight: 1 }}
                  >
                    {d.num}
                  </span>
                  <h3 className="font-semibold mb-2" style={{ color: C.text, fontSize: '0.95rem' }}>{d.title}</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: C.textSub }}>{d.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection delay={0.2}>
            <p className="text-center mt-10" style={{ lineHeight: 1.8 }}>
              <span className="font-bold" style={{ color: C.accent }}>Los buenos empleados generan trabajo.</span><br />
              <span className="font-bold" style={{ color: C.accent }}>Los mejores también generan ingresos.</span><br />
              <span style={{ color: C.textSub, fontSize: '0.95rem' }}>Si Centinelia utiliza más minutos, normalmente significa exactamente eso.</span>
            </p>
          </AnimatedSection>

        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section
        className="py-20 sm:py-28 relative overflow-hidden"
        style={{
          background: `radial-gradient(ellipse at 10% 20%, rgba(108,59,255,0.09) 0%, transparent 55%),
                       radial-gradient(ellipse at 90% 80%, rgba(155,109,255,0.07) 0%, transparent 50%),
                       ${C.bg}`,
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div className="max-w-5xl mx-auto px-5 sm:px-8" style={{ position: 'relative', zIndex: 1 }}>

          <div className="hidden lg:block mb-10">
            <AnimatedSection>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
                Arma tu equipo.
              </p>
              <h2
                className="font-bold tracking-tight mb-4"
                style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: C.text }}
              >
                Construye tu oficina digital.
              </h2>
              <p style={{ color: C.textSub }}>
                Cada Centinelia adopta tu misión. Juntos operan tu negocio 24/7.
              </p>
            </AnimatedSection>
          </div>

          <div className="lg:hidden mb-6">
            <p className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: C.accent }}>
              Arma tu equipo.
            </p>
            <h2
              className="font-bold tracking-tight mb-3"
              style={{ fontSize: 'clamp(1.3rem, 5.5vw, 1.7rem)', color: C.text, lineHeight: 1.25 }}
            >
              Construye tu oficina digital.
            </h2>
            <p style={{ color: C.textSub, fontSize: '0.875rem', lineHeight: 1.6 }}>
              Cada Centinelia adopta tu misión. Juntos operan tu negocio 24/7.
            </p>
          </div>

          {/* Org chart: Nox al tope, equipo debajo */}

          {/* Dirección — Nox & Niva */}
          <AnimatedSection className="flex justify-center mb-1">
            <div
              className="rounded-2xl overflow-hidden w-full"
              style={{
                maxWidth: 480,
                background: C.surface,
                border: `1.5px solid ${DIRECTORS.color}40`,
                boxShadow: `0 4px 28px ${DIRECTORS.color}15`,
              }}
            >
              <div style={{ height: 200, background: `${DIRECTORS.color}08`, position: 'relative' }}>
                <Image src={DIRECTORS.img} alt="Nox y Niva" fill sizes="480px"
                  style={{ objectFit: 'contain', objectPosition: 'bottom center' }} />
              </div>
              <div style={{ padding: '12px 16px 14px', borderTop: `2px solid ${DIRECTORS.color}` }}>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: DIRECTORS.color, marginBottom: 2 }}>
                  {DIRECTORS.rol}
                </p>
                <h3 className="font-bold" style={{ fontSize: '1.05rem', color: C.text, lineHeight: 1.2, marginBottom: 4 }}>
                  {DIRECTORS.nombres}
                </h3>
                <p style={{ fontSize: '0.75rem', color: C.textSub, lineHeight: 1.5 }}>{DIRECTORS.desc}</p>
              </div>
            </div>
          </AnimatedSection>

          {/* Red organizacional — desktop: tronco + barra + 4 caídas | mobile: tronco simple */}
          <div className="hidden sm:block relative mb-0" style={{ height: 40 }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '55%', background: 'rgba(108,59,255,0.20)' }} />
            <div style={{ position: 'absolute', left: '12.5%', right: '12.5%', top: '55%', height: 1, background: 'rgba(108,59,255,0.20)' }} />
            {['12.5%', '37.5%', '62.5%', '87.5%'].map(l => (
              <div key={l} style={{ position: 'absolute', left: l, top: '55%', width: 1, height: '45%', background: 'rgba(108,59,255,0.20)' }} />
            ))}
          </div>
          <div className="sm:hidden relative mb-0" style={{ height: 40 }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '55%', background: 'rgba(108,59,255,0.20)' }} />
            <div style={{ position: 'absolute', left: '25%', right: '25%', top: '55%', height: 1, background: 'rgba(108,59,255,0.20)' }} />
            {['25%', '75%'].map(l => (
              <div key={l} style={{ position: 'absolute', left: l, top: '55%', width: 1, height: '45%', background: 'rgba(108,59,255,0.20)' }} />
            ))}
          </div>

          {/* Equipo (8 empleados — 4 cols desktop, 2 cols mobile) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEAM.map((m, i) => (
              <AnimatedSection key={m.nombre} delay={i * 0.06} className="h-full">
                <div
                  className="rounded-2xl overflow-hidden h-full"
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    boxShadow: '0 2px 12px rgba(108,59,255,0.20)',
                  }}
                >
                  <div style={{ height: 130, background: `${m.color}0d`, position: 'relative' }}>
                    <Image src={m.img} alt={m.nombre} fill sizes="220px"
                      style={{ objectFit: 'contain', objectPosition: 'bottom center', padding: (m as any).imgPad ?? '6px 6px 0' }} />
                  </div>
                  <div style={{ padding: '10px 12px 12px', borderTop: `2px solid ${m.color}` }}>
                    <p style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: m.color, marginBottom: 2 }}>
                      {m.rol}
                    </p>
                    <h3 className="font-bold" style={{ fontSize: '0.95rem', color: C.text, lineHeight: 1.2, marginBottom: 4 }}>
                      {m.nombre}
                    </h3>
                    <p style={{ fontSize: '0.72rem', color: C.textSub, lineHeight: 1.5 }}>{m.desc}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>

          {/* Tagline cierre de sección */}
          <AnimatedSection delay={0.1}>
            <div
              className="rounded-2xl text-center mt-6"
              style={{
                background: `linear-gradient(135deg, rgba(108,59,255,0.06) 0%, rgba(155,109,255,0.03) 100%)`,
                border: `1px solid rgba(108,59,255,0.15)`,
                padding: 'clamp(24px, 4vw, 40px) clamp(20px, 5vw, 48px)',
              }}
            >
              <p className="text-sm mb-3" style={{ color: C.textMute }}>
                Un equipo que no incrementa tu nómina.
              </p>
              <p
                className="font-extrabold tracking-tight mb-8"
                style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.2rem)', color: C.text, lineHeight: 1.1 }}
              >
                Contrata capacidad,{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #6C3BFF 0%, #9B6DFF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  no personal.
                </span>
              </p>
              <Link
                href="/empleados"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{
                  background: C.accent,
                  color: '#fff',
                  border: 'none',
                }}
              >
                Conoce a los 9 empleados <ArrowRight size={13} />
              </Link>
            </div>
          </AnimatedSection>

        </div>
      </section>

      {/* ── CAPACIDAD EMPRESARIAL ───────────────────────────────────────── */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute',
            width: 900, height: 700,
            top: -200, left: '50%', transform: 'translateX(-50%)',
            background: 'radial-gradient(circle, rgba(108,59,255,0.14) 0%, transparent 65%)',
          }} />
        </div>

        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-28" style={{ position: 'relative', zIndex: 1 }}>

          <AnimatedSection className="text-center mb-14">
            <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: '#9B6DFF' }}>
              La diferencia que cambia todo
            </p>
            <h2
              className="font-bold tracking-tight mb-5"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#fff', lineHeight: 1.1 }}
            >
              No contratas uno.<br />Contratas los que necesites.
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.48)', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
              Mientras tu competencia tiene una recepcionista que descansa, enferma y renuncia,
              tú puedes tener un equipo completo activo al mismo tiempo. Sin contratar a nadie.
            </p>
          </AnimatedSection>

          {/* Manifiesto de escala */}
          <AnimatedSection delay={0.1}>
            <div
              className="rounded-2xl text-center mb-8"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: 'clamp(36px, 6vw, 64px) clamp(24px, 5vw, 56px)',
              }}
            >
              <p
                className="font-extrabold tracking-tight"
                style={{ fontSize: 'clamp(1.45rem, 4.5vw, 2.8rem)', lineHeight: 1.2, marginBottom: '2rem' }}
              >
                <span style={{ color: '#fff' }}>Una empresa. </span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Seis empleados. </span>
                <span style={{
                  background: 'linear-gradient(135deg, #9B6DFF 0%, #C4A8FF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  Cero nómina.
                </span>
              </p>

              <div style={{ width: 40, height: 1, background: 'rgba(108,59,255,0.4)', margin: '0 auto 2rem' }} />

              <p
                className="font-semibold"
                style={{
                  fontSize: 'clamp(0.95rem, 2.2vw, 1.2rem)',
                  color: 'rgba(255,255,255,0.6)',
                  lineHeight: 2,
                  maxWidth: 500,
                  margin: '0 auto 2rem',
                }}
              >
                {[
                  'Recepcionista',
                  'Ejecutivo comercial',
                  'Cobrador',
                  'Ejecutivo de seguimiento',
                  'Asistente de clínica',
                  'Supervisor de desempeño',
                ].map((role, i, arr) => (
                  <span key={role}>
                    {role}
                    <span style={{ color: '#6C3BFF' }}>
                      {i < arr.length - 1 ? '. ' : '.'}
                    </span>
                  </span>
                ))}
              </p>

              <p style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.25)',
              }}>
                Todos disponibles desde el día uno.
              </p>
            </div>
          </AnimatedSection>

          {/* Tagline card */}
          <AnimatedSection delay={0.42}>
            <div
              className="rounded-2xl text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(108,59,255,0.18) 0%, rgba(155,109,255,0.08) 100%)',
                border: '1px solid rgba(108,59,255,0.35)',
                padding: 'clamp(24px, 4vw, 40px) clamp(20px, 5vw, 48px)',
              }}
            >
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Todos activos al mismo tiempo. Las 24 horas. Sin nómina.
              </p>
              <p
                className="font-extrabold tracking-tight mb-8"
                style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.2rem)', color: '#fff', lineHeight: 1.1 }}
              >
                Contrata capacidad,{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #9B6DFF 0%, #C4A8FF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  no personal.
                </span>
              </p>
              <Link
                href="/empleados"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.72)',
                  border: '1px solid rgba(255,255,255,0.16)',
                }}
              >
                Conoce a los 9 empleados <ArrowRight size={13} />
              </Link>
            </div>
          </AnimatedSection>

        </div>
      </section>

      {/* ── CÓMO FUNCIONA ────────────────────────────────────────────────── */}
      <section style={{ background: C.bgAlt }}>
      <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-20 lg:pb-12 relative overflow-hidden">

        <AnimatedSection className="mb-12 lg:mb-16">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
            Cómo contratar tu empleado
          </p>
          <h2
            className="font-bold tracking-tight"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: C.text }}
          >
            Tu empleado, en línea en 3 pasos
          </h2>
        </AnimatedSection>

        {/* Editorial numbered list — unique layout vs 3-col cards elsewhere */}
        <div className="lg:pr-72">
          {[
            { n: '01', title: 'Elige tu empleado y tus minutos',  desc: 'Selecciona el tipo de empleado que necesita tu organización y los minutos mensuales que consumiría. Completa el pago en línea en menos de 5 minutos.' },
            { n: '02', title: 'Configura tu empleado',             desc: 'Accede a tu portal, agrega la información de tu organización y personaliza cómo responde tu empleado.' },
            { n: '03', title: 'Recibe y realiza llamadas',         desc: 'Tu número queda activo en horas. Tu empleado atiende llamadas entrantes, llama de regreso a los que no contestaron y ejecuta campañas salientes. Tú solo monitoreas desde el portal.' },
          ].map((s, i) => (
            <AnimatedSection key={s.n} delay={i * 0.12}>
              <div
                className="flex items-start gap-6 sm:gap-10 py-7 sm:py-8"
                style={{ borderBottom: i < 2 ? `1px solid ${C.border}` : 'none' }}
              >
                <span
                  className="font-bold tabular-nums flex-shrink-0 select-none"
                  style={{ fontSize: 'clamp(3rem, 5vw, 4rem)', color: 'rgba(108,59,255,0.13)', lineHeight: 1, minWidth: 72 }}
                >
                  {s.n}
                </span>
                <div className="pt-1">
                  <h3 className="font-semibold text-base sm:text-lg mb-2" style={{ color: C.text }}>{s.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{s.desc}</p>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>

        {/* Character peeking bottom-right, desktop only */}
        <MeerkatReveal
          className="agent-float-slow meerkat-duo-stand overflow-hidden"
          style={{ position: 'absolute', right: -16, bottom: -20 }}
        >
          <Image src="/agent-duo-stand2.png" alt="Agentes Centinelia" fill
            sizes="340px"
            style={{ objectFit: 'cover', objectPosition: 'center 85%' }} />
        </MeerkatReveal>

      </div>
      </section>

      {/* ── DEMO EN VIVO ─────────────────────────────────────────────────── */}
      <section id="demo" style={{ background: C.bg, borderTop: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
        {/* Headset meerkat, mobile: overflows from Demo into Planes section below */}
        <div className="meerkat-headset-mob">
          <MeerkatReveal style={{ position: 'relative', width: '100%', height: '100%' }}>
            <Image src="/agent-headset.png" alt="" fill sizes="170px"
              style={{ objectFit: 'contain', objectPosition: 'top center' }} />
          </MeerkatReveal>
        </div>
        {/* Desktop: left side */}
        <MeerkatReveal className="agent-sway meerkat-headset-desk-left">
          <Image src="/agent-headset.png" alt="" fill sizes="260px"
            style={{ objectFit: 'contain', objectPosition: 'top center' }} />
        </MeerkatReveal>
        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-20 pb-44 sm:pt-24 sm:pb-32">
          <AnimatedSection className="text-center mb-12">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              Demo en vivo
            </p>
            <h2
              className="font-bold tracking-tight mb-4"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: C.text }}
            >
              Tu empleado.<br />Cualquier rol.
            </h2>
            <p className="max-w-lg mx-auto" style={{ color: C.textSub }}>
              Elige el escenario, llama y experimenta. Vendedor, tomador de pedidos,
              soporte, seguimiento: un solo empleado configurado para lo que tu organización necesite.
            </p>
          </AnimatedSection>

          <AnimatedSection delay={0.15}>
            <DemoSelector demoPhone={DEMO_PHONE} demoPhoneHref={DEMO_PHONE_HREF} />
          </AnimatedSection>
        </div>
      </section>

      {/* ── PLANES ───────────────────────────────────────────────────────── */}
      <section
        className="py-20 sm:py-28 relative overflow-hidden"
        style={{ background: '#0D0520' }}
      >
        {/* Orb de profundidad */}
        <div className="orb" style={{
          width: 600, height: 600,
          top: -100, left: '50%', transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(108,59,255,0.2) 0%, transparent 65%)',
          ['--orb-dur' as string]: '13s',
        }} />

        <div className="max-w-5xl mx-auto px-5 sm:px-8" style={{ position: 'relative', zIndex: 1 }}>

          {/* Header */}
          <AnimatedSection className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accentLt }}>
              Precios
            </p>
            <h2
              className="font-bold tracking-tight mb-4"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#fff' }}
            >
              El precio correcto<br />para tu organización
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>
              Una compra única por tu empleado, más una mensualidad según los minutos que uses.
            </p>
          </AnimatedSection>

          {/* ─── PASO 1: Tipo de agente ─────────────── */}
          <AnimatedSection>
            <div className="flex flex-col items-center gap-3 mb-7 text-center">
              <span className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(108,59,255,0.2)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.3)' }}>
                Paso 1 · Pago único
              </span>
              <h3 className="font-bold text-sm sm:text-[1.1rem]" style={{ color: '#fff' }}>
                Tu Empleado Centinelia
              </h3>
            </div>
          </AnimatedSection>

          <div className="flex justify-center mb-16">
            <div className="w-full max-w-lg">
            {AGENT_TYPES.map((a, i) => (
              <AnimatedSection key={a.id} delay={i * 0.09}>
              <div
                className="rounded-2xl p-6 flex flex-col h-full relative overflow-hidden"
                style={{
                  background: a.popular ? `linear-gradient(145deg, ${a.color}22, ${a.color}0a)` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${a.popular ? a.color + '55' : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: a.popular ? `0 12px 48px ${a.color}30` : 'none',
                  backdropFilter: 'blur(12px)',
                }}
              >
                {a.popular && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg, ${a.color}, ${a.color}88)` }} />
                )}
                <div className="flex items-center justify-between mb-4">
                  <p className="font-bold" style={{ color: '#fff', fontSize: '1.1rem' }}>{a.name}</p>
                  {a.popular && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: a.color, color: '#fff' }}>
                      <Star size={9} style={{ fill: '#fff' }} /> Más completo
                    </span>
                  )}
                </div>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Instalación · pago único</p>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-4xl font-bold tabular-nums" style={{ color: a.popular ? a.color : '#fff' }}>
                    ${fmt(a.setupFee)}
                  </span>
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>+ IVA</span>
                </div>
                <p className="text-sm mb-5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.48)' }}>{a.description}</p>
                <ul className="flex flex-col gap-2 flex-1 mb-6">
                  {a.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <Check size={13} color={a.color} className="flex-shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                {/* Mobile meerkat */}
                <MeerkatReveal className="hidden" style={{
                  position: 'absolute', bottom: a.meerkatBottom, right: 10,
                  width: 136, height: 136, zIndex: 0, pointerEvents: 'none', userSelect: 'none',
                }}>
                  <Image src={a.meerkat} alt="" fill sizes="136px"
                    style={{ objectFit: 'cover', objectPosition: 'top center' }} />
                </MeerkatReveal>
                {/* Desktop meerkat */}
                <MeerkatReveal className="hidden sm:block" style={{
                  position: 'absolute', bottom: a.meerkatDeskBottom, right: 8,
                  width: 165, height: 165, zIndex: 0, pointerEvents: 'none', userSelect: 'none',
                }}>
                  <Image src={a.meerkatDesk} alt="" fill sizes="165px"
                    style={{ objectFit: 'cover', objectPosition: 'top center' }} />
                </MeerkatReveal>
                <Link
                  href={`/registro?plan=${a.id}`}
                  className="block text-center py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
                  style={{
                    background: a.popular ? a.color : 'rgba(108,59,255,0.2)',
                    color: '#fff',
                    border: a.popular ? 'none' : '1.5px solid rgba(108,59,255,0.4)',
                    position: 'relative', zIndex: 1,
                  }}
                >
                  Contratar {a.name}
                </Link>
              </div>
              </AnimatedSection>
            ))}
            </div>
          </div>

          {/* ─── PASO 2: Minutos mensuales ──────────── */}
          <AnimatedSection>
            <div className="flex flex-col items-center gap-3 mb-3 text-center">
              <span className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(155,109,255,0.15)', color: '#C4A8FF', border: '1px solid rgba(155,109,255,0.25)' }}>
                Paso 2 · Mensualidad
              </span>
              <h3 className="font-bold text-sm sm:text-[1.1rem]" style={{ color: '#fff' }}>
                Elige tus minutos al mes
              </h3>
            </div>
            <p className="text-sm mb-8 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Pagas solo los minutos del plan + IVA. Sin cuotas adicionales.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mb-5">
            {MINUTE_TIERS.map((t, i) => (
              <AnimatedSection key={t.id} delay={i * 0.08}>
              <div
                className="rounded-2xl p-5 sm:p-6 flex flex-col h-full relative overflow-hidden"
                style={{
                  background: t.popular ? 'linear-gradient(145deg, rgba(108,59,255,0.2), rgba(108,59,255,0.08))' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${t.popular ? 'rgba(108,59,255,0.5)' : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: t.popular ? '0 12px 48px rgba(108,59,255,0.25)' : 'none',
                }}
              >
                {t.popular && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: 'linear-gradient(90deg, #6C3BFF, #9B6DFF88)' }} />
                )}

                {/* Mobile layout — horizontal split: minutes left, price right */}
                <div className="sm:hidden">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="font-bold text-base mb-1" style={{ color: '#fff' }}>{t.label}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold tabular-nums" style={{ color: t.popular ? '#9B6DFF' : '#fff' }}>
                          {fmt(t.minutes)}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>min/mes</span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'rgba(155,109,255,0.6)' }}>
                        {t.ops} tareas
                      </p>
                    </div>
                    <div className="text-right">
                      {t.popular && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold mb-1.5"
                          style={{ background: '#6C3BFF', color: '#fff' }}>
                          <Star size={8} style={{ fill: '#fff' }} /> Más usado
                        </span>
                      )}
                      <div className="flex items-baseline gap-0.5 justify-end">
                        <span className="text-xl font-bold tabular-nums" style={{ color: t.popular ? '#9B6DFF' : '#fff' }}>
                          ${fmt(t.price)}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>/mes</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/registro?tier=${t.id}`}
                    className="block text-center py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                    style={{
                      background: t.popular ? '#6C3BFF' : 'rgba(108,59,255,0.2)',
                      color: '#fff',
                      border: t.popular ? 'none' : '1.5px solid rgba(108,59,255,0.4)',
                    }}
                  >
                    Seleccionar
                  </Link>
                </div>

                {/* Desktop layout */}
                <div className="hidden sm:flex sm:flex-col sm:flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <p className="font-bold text-base" style={{ color: '#fff' }}>{t.label}</p>
                    {t.popular && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: '#6C3BFF', color: '#fff' }}>
                        <Star size={9} style={{ fill: '#fff' }} /> Más usado
                      </span>
                    )}
                  </div>
                  <div className="mb-4">
                    <span className="text-5xl font-bold tabular-nums" style={{ color: t.popular ? '#9B6DFF' : '#fff' }}>
                      {fmt(t.minutes)}
                    </span>
                    <span className="text-sm ml-1" style={{ color: 'rgba(255,255,255,0.4)' }}>min/mes</span>
                    <p className="text-xs mt-1.5" style={{ color: 'rgba(155,109,255,0.65)' }}>
                      {t.ops} tareas incluidas
                    </p>
                  </div>
                  <div className="rounded-xl px-4 py-3 mb-5 flex flex-col gap-1 flex-1"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold tabular-nums" style={{ color: t.popular ? '#9B6DFF' : '#fff' }}>
                        ${fmt(t.price)}
                      </span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>/mes</span>
                    </div>
                  </div>
                  <Link
                    href={`/registro?tier=${t.id}`}
                    className="block text-center py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
                    style={{
                      background: t.popular ? '#6C3BFF' : 'rgba(108,59,255,0.2)',
                      color: '#fff',
                      border: t.popular ? 'none' : '1.5px solid rgba(108,59,255,0.4)',
                    }}
                  >
                    Seleccionar
                  </Link>
                </div>
              </div>
              </AnimatedSection>
            ))}
          </div>

          {/* Extra minutes note */}
          <AnimatedSection>
            <p className="text-center text-xs mb-14" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Minutos extra fuera del plan: $12.99 MXN / min
            </p>
          </AnimatedSection>

          {/* ─── Empresarial ────────────────────────── */}
          <AnimatedSection>
          <div
            className="relative rounded-2xl p-4 sm:p-8 flex flex-row items-center gap-3 sm:gap-6"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }}
          >
            <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(108,59,255,0.18)', border: '1px solid rgba(108,59,255,0.35)' }}>
              <Rocket size={16} color="#C4A8FF" />
            </div>
            <div className="flex-1 min-w-0 xl:pr-44">
              <p className="font-bold leading-tight" style={{ color: '#fff', fontSize: '1rem' }}>Empresarial</p>
              <p className="text-sm hidden sm:block mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Múltiples empleados y sucursales, integración con tu POS o CRM, flujos a medida y SLA dedicado.
              </p>
              <p className="text-xs sm:hidden mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Múltiples empleados · POS/CRM · SLA dedicado
              </p>
            </div>
            <Link
              href="/registro?plan=empresarial"
              className="flex-shrink-0 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: 'rgba(108,59,255,0.25)', color: '#C4A8FF', border: '1.5px solid rgba(108,59,255,0.45)' }}
            >
              Cotizar
            </Link>
          </div>
          </AnimatedSection>

        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ padding: '0', background: C.bgAlt }}>
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-28" style={{ position: 'relative', zIndex: 2 }}>
        <MeerkatReveal className="agent-float-slow meerkat-faq-desk">
          <Image src="/agent-duo-phones.png" alt="" fill sizes="360px"
            style={{ objectFit: 'contain', objectPosition: 'bottom center' }} />
        </MeerkatReveal>
        <div className="lg:grid lg:grid-cols-5 lg:gap-16 lg:items-start">
          <div className="mb-4 lg:mb-0 lg:col-span-2 lg:pt-2" style={{ position: 'relative' }}>
            <AnimatedSection>
              <div className="pr-40 lg:pr-0">
                <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
                  Preguntas frecuentes
                </p>
                <h2
                  className="font-bold tracking-tight"
                  style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: C.text, lineHeight: 1.1 }}
                >
                  Resolvemos<br />tus dudas
                </h2>
              </div>
            </AnimatedSection>
            <MeerkatReveal
              className="lg:hidden agent-float-slow absolute"
              style={{ bottom: -50, right: 0, width: 140, height: 180, zIndex: 0, pointerEvents: 'none', userSelect: 'none' }}
            >
              <Image src="/agent-duo-phones.png" alt="" fill sizes="140px"
                style={{ objectFit: 'contain', objectPosition: 'bottom center' }} />
            </MeerkatReveal>
          </div>
          <div className="lg:col-span-3" style={{ position: 'relative', zIndex: 1 }}>
            <FaqSection />
          </div>
        </div>
      </div>
      </section>

      {/* ── BOTTOM CTA ───────────────────────────────────────────────────── */}
      <section className="relative" style={{ background: '#1A0A3B' }}>
        {/* Glow wrapper — overflow:hidden aquí, no en section, para que los meerkats desborden */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{
            position:  'absolute',
            top:       0,
            left:      '30%',
            transform: 'translateX(-50%)',
            width:     700,
            height:    500,
            background:'radial-gradient(circle, rgba(108,59,255,0.3) 0%, transparent 65%)',
          }} />
        </div>

        {/* ── Mobile: centrado + duo al fondo ─────────────────────────── */}
        <div
          className="lg:hidden relative max-w-3xl mx-auto px-5 sm:px-8 pt-24 sm:pt-28 text-center"
          style={{ paddingBottom: 'clamp(160px, 30vw, 280px)' }}
        >
          <AnimatedSection>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(155,109,255,0.7)' }}>
              Tu equipo te espera
            </p>
            <h2 className="font-bold tracking-tight mb-5" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.8rem)', color: '#fff' }}>
              Mientras tú atiendes tu organización,<br />tu equipo atiende el teléfono.
            </h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.52)' }}>
              Tu empleado puede estar en línea en menos de 24 horas.<br />Sin contratos largos. Sin complicaciones.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/registro" className="cta-pulse inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
                Armar mi equipo <ArrowRight size={15} />
              </Link>
              <a href="tel:+528116333559" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-medium" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <Phone size={14} /> Habla con un asesor
              </a>
            </div>
          </AnimatedSection>
          <MeerkatReveal className="agent-sway absolute bottom-[-50px] sm:bottom-[-80px] left-1/2 -translate-x-1/2 pointer-events-none w-[300px] h-[216px] sm:w-[580px] sm:h-[420px]">
            <Image src="/agent-duo-call.png" alt="Equipo Centinelia" fill sizes="(max-width: 640px) 300px, 580px" style={{ objectFit: 'contain', objectPosition: 'bottom center' }} />
          </MeerkatReveal>
        </div>

        {/* ── Desktop: texto + meerkat dentro del contenedor max-6xl ────── */}
        <div
          className="hidden lg:block max-w-6xl mx-auto px-8 pt-28 pb-20"
          style={{ position: 'relative' }}
        >
          <AnimatedSection style={{ maxWidth: 520 }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(155,109,255,0.7)' }}>
              Tu equipo te espera
            </p>
            <h2 className="font-bold tracking-tight mb-5" style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)', color: '#fff', lineHeight: 1.1 }}>
              Mientras tú atiendes<br />tu organización, tu equipo<br />atiende el teléfono.
            </h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.52)', maxWidth: 420 }}>
              Tu empleado puede estar en línea en menos de 24 horas. Sin contratos largos. Sin complicaciones.
            </p>
            <div className="flex items-start gap-3">
              <Link href="/registro" className="cta-pulse inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
                Armar mi equipo <ArrowRight size={15} />
              </Link>
              <a href="tel:+528116333559" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-medium" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <Phone size={14} /> Habla con un asesor
              </a>
            </div>
          </AnimatedSection>

          {/* Meerkat absoluto dentro del max-6xl: right/bottom relativo a este contenedor */}
          <MeerkatReveal
            className="agent-sway"
            style={{ position: 'absolute', bottom: -20, right: 32, width: 500, height: 380 }}
          >
            <Image src="/agent-duo-call.png" alt="Equipo Centinelia" fill sizes="500px"
              style={{ objectFit: 'contain', objectPosition: 'bottom center' }} />
          </MeerkatReveal>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      {/* Wrapper full-width con z-index:1 para que el footer actúe como capa encima del meerkat */}
      <div style={{ position: 'relative', zIndex: 1, background: C.bg }}>
      <footer
        className="max-w-6xl mx-auto px-5 sm:px-8 pt-5 pb-24 sm:py-10 relative"
        style={{ borderTop: `1px solid ${C.border}` }}
      >
        {/* Mobile: logo + links en una fila */}
        <div className="flex sm:hidden items-center gap-2">
          <Link href="/" className="transition-opacity hover:opacity-70" style={{ flexShrink: 0, marginLeft: 4.5 }}>
            <Image
              src="/logo-icon.png"
              alt="Centinelia"
              width={52}
              height={52}
              style={{ width: 52, height: 52, objectFit: 'contain', display: 'block' }}
            />
          </Link>
          <div className="flex flex-1 items-center justify-evenly">
            <Link href="/industrias" className="text-xs transition-opacity hover:opacity-70" style={{ color: C.textMute }}>
              Industrias
            </Link>
            <Link href="/faq" className="text-xs transition-opacity hover:opacity-70" style={{ color: C.textMute }}>
              FAQ
            </Link>
            <Link href="/registro" className="text-xs transition-opacity hover:opacity-70" style={{ color: C.textMute }}>
              Contratar
            </Link>
            <Link href="/portal/login" className="text-xs transition-opacity hover:opacity-70" style={{ color: C.textMute }}>
              Portal
            </Link>
          </div>
        </div>

        {/* Mobile: crédito al fondo */}
        <div
          className="sm:hidden flex flex-col items-center"
          style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', gap: 6 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <a href="https://www.instagram.com/centinelia.mx/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="transition-opacity hover:opacity-70">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E1306C" strokeWidth="2"/>
                <circle cx="12" cy="12" r="4" stroke="#E1306C" strokeWidth="2"/>
                <circle cx="17.5" cy="6.5" r="1.2" fill="#E1306C"/>
              </svg>
            </a>
            <a href="https://www.linkedin.com/company/centinelia/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="transition-opacity hover:opacity-70">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
            <a href="https://www.facebook.com/centineliamx/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="transition-opacity hover:opacity-70">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
          </div>
          <a href="https://pneumastudio.mx" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, color: C.textMute }}
            className="hover:opacity-80 transition-opacity whitespace-nowrap"
          >Powered by Pneuma Studio</a>
        </div>

        {/* Desktop: icon + Pneuma | links */}
        <div className="hidden sm:flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="transition-opacity hover:opacity-70">
              <Image
                src="/logo-icon.png"
                alt="Centinelia"
                width={52}
                height={52}
                style={{ width: 52, height: 52, objectFit: 'contain', display: 'block' }}
              />
            </Link>
            <span className="text-xs" style={{ color: C.textMute }}>
              · <a href="https://pneumastudio.mx" target="_blank" rel="noopener noreferrer" style={{ color: C.textMute }} className="hover:opacity-80 transition-opacity">Powered by Pneuma Studio</a>
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/industrias" className="text-xs transition-colors" style={{ color: C.textMute }}>
              Industrias
            </Link>
            <Link href="/faq" className="text-xs transition-colors" style={{ color: C.textMute }}>
              Preguntas frecuentes
            </Link>
            <Link href="/portal/login" className="text-xs transition-colors" style={{ color: C.textMute }}>
              Portal de clientes
            </Link>
            <Link href="/registro" className="text-xs" style={{ color: C.textMute }}>
              Contratar
            </Link>
            <Link href="/legal" className="text-xs transition-colors" style={{ color: C.textMute }}>
              Legal
            </Link>
            <a href="https://www.instagram.com/centinelia.mx/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="transition-opacity hover:opacity-70">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E1306C" strokeWidth="2"/>
                <circle cx="12" cy="12" r="4" stroke="#E1306C" strokeWidth="2"/>
                <circle cx="17.5" cy="6.5" r="1.2" fill="#E1306C"/>
              </svg>
            </a>
            <a href="https://www.linkedin.com/company/centinelia/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="transition-opacity hover:opacity-70">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
            <a href="https://www.facebook.com/centineliamx/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="transition-opacity hover:opacity-70">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
            <a href="mailto:hola@centinelia.mx" className="text-xs" style={{ color: C.textMute }}>
              hola@centinelia.mx
            </a>
          </div>
        </div>

      </footer>
      </div>

      <LandingWidgets />
    </div>
  );
}
