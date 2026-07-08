import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Phone, BarChart3, PhoneOff, TrendingDown, PhoneOutgoing,
  Clock, Check, ArrowRight, Play, Target, Rocket, Star,
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

const FEATURES: {
  icon: React.ReactNode; color: string; title: string; desc: string;
  cardBg?: string; cardBorder?: string;
}[] = [
  {
    icon:  <Phone size={20} color="#6C3BFF" />,
    color: '#6C3BFF',
    title: 'Recepcionista 24/7',
    desc:  'Contesta cada llamada, captura leads, agenda citas y toma pedidos por teléfono. Disponible siempre, registra todo en tu portal.',
  },
  {
    icon:  <PhoneOutgoing size={20} color="#9B6DFF" />,
    color: '#9B6DFF',
    title: 'Llamadas salientes',
    desc:  'Tu agente llama a tus contactos para confirmar citas, hacer seguimiento y recupera las llamadas perdidas de forma automática.',
    cardBg: 'linear-gradient(145deg, rgba(155,109,255,0.18) 0%, rgba(155,109,255,0.05) 100%)',
    cardBorder: 'rgba(155,109,255,0.35)',
  },
  {
    icon:  <Target size={20} color="#6C3BFF" />,
    color: '#6C3BFF',
    title: 'Seguimiento automático',
    desc:  'Detecta prospectos que no contestaron y los llama de regreso. Ningún lead se enfría por falta de seguimiento.',
  },
  {
    icon:  <Rocket size={20} color="#9B6DFF" />,
    color: '#9B6DFF',
    title: 'Campañas salientes',
    desc:  'Lanza campañas de llamadas para confirmar citas, cobrar, encuestar o reactivar clientes inactivos.',
    cardBg: 'linear-gradient(145deg, rgba(108,59,255,0.2) 0%, rgba(108,59,255,0.06) 100%)',
    cardBorder: 'rgba(108,59,255,0.36)',
  },
  {
    icon:  <BarChart3 size={20} color="#6C3BFF" />,
    color: '#6C3BFF',
    title: 'Portal de reportes',
    desc:  'Monitorea llamadas, leads, citas y minutos desde tu portal exclusivo. Todo en un solo lugar.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
    color: '#4285F4',
    title: 'Reseñas Google automáticas',
    desc:  'Tras cada llamada exitosa, tu agente manda el link de tu reseña Google por WhatsApp. Más reseñas, sin pedir favores.',
    cardBg: 'linear-gradient(145deg, rgba(155,109,255,0.18) 0%, rgba(108,59,255,0.05) 100%)',
    cardBorder: 'rgba(155,109,255,0.35)',
  },
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
    label: 'al día en promedio tu negocio está cerrado, pero tus clientes no dejan de llamar.',
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
    id: 'comercial', name: 'Comercial', setupFee: 8990, color: '#6C3BFF',
    description: 'Para negocios con flujos estándar: recepción, leads, citas y seguimiento.',
    features: [
      'Recepcionista 24/7',
      'Captura de leads automática',
      'Agendamiento de citas',
      'Transferencia inteligente a staff',
      'Escalación a WhatsApp',
      'Reseñas Google automáticas',
      'Portal con reportes y horas pico',
    ],
    meerkat: '/agent-plan-estandar.png', meerkatBottom: 64,
    meerkatDesk: '/meerkat-transparente-11.png', meerkatDeskBottom: 66,
  },
  {
    id: 'pro', name: 'Pro', setupFee: 14990, color: '#9B6DFF', popular: true,
    description: 'Para negocios que necesitan personalización total y capacidades avanzadas.',
    features: [
      'Todo el plan Comercial',
      'Hasta 3 llamadas simultáneas',
      'Llamadas salientes y devolución automática',
      'Toma de pedidos por teléfono',
      'Multiidioma (español + inglés)',
      'Memoria de cliente entre llamadas',
      'Flujos complejos y voz personalizable',
    ],
    meerkat: '/agent-plan-pro.png', meerkatBottom: 66,
    meerkatDesk: '/meerkat-transparente-07.png', meerkatDeskBottom: 65,
  },
];

const MINUTE_TIERS: {
  id: string; label: string; minutes: number; price: number; popular?: boolean;
}[] = [
  { id: 'starter', label: 'Starter', minutes: 300,  price: 2997 },
  { id: 'growth',  label: 'Growth',  minutes: 600,  price: 5994, popular: true },
  { id: 'scale',   label: 'Scale',   minutes: 1200, price: 11988 },
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

        {/* Background image */}
        <Image
          src="/hero-bg.png"
          alt=""
          fill
          priority
          quality={100}
          sizes="(max-width: 640px) 200vw, (max-width: 1280px) 150vw, 100vw"
          className="hero-bg-img"
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
              El que contesta,
              <br />
              <span style={{
                background:           'linear-gradient(135deg, #9B6DFF 0%, #C4A8FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor:  'transparent',
              }}>
                vende.
              </span>
            </h1>

            {/* Rotating niche */}
            <p className="mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Perfecto para <RotatingNiche />
            </p>

            {/* Sub */}
            <p
              className="mb-8 leading-relaxed"
              style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.62)' }}
            >
              Tu agente atiende y realiza llamadas, captura leads, agenda citas
              y toma pedidos, mientras tú atiendes lo que importa.
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
                <Play size={13} style={{ fill: 'currentColor' }} /> Prueba la demo
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
                Mientras tu negocio no contesta, tu competencia sí lo hace.
                Esto le pasa a un negocio promedio cada semana:
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
              Mientras tu negocio no contesta, tu competencia sí lo hace.
              Esto le pasa a un negocio promedio cada semana:
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
                Centinelia resuelve los tres problemas a la vez.
              </p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.52)' }}>
                Un agente de voz que atiende, captura, agenda y también llama de regreso a los
                clientes que no alcanzó a atender — sin que tú tengas que intervenir.
              </p>
            </div>
          </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section
        className="py-20 sm:py-28 relative overflow-hidden"
        style={{
          background: `radial-gradient(ellipse at 10% 20%, rgba(108,59,255,0.09) 0%, transparent 55%),
                       radial-gradient(ellipse at 90% 80%, rgba(155,109,255,0.07) 0%, transparent 50%),
                       ${C.bgAlt}`,
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div className="max-w-5xl mx-auto px-5 sm:px-8" style={{ position: 'relative', zIndex: 1 }}>

          {/* Desktop: 2-col, texto izquierda, suricata derecha asomándose sobre las tarjetas */}
          <div className="hidden lg:flex items-end gap-10 mb-0">
            <AnimatedSection className="flex-1">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
                Capacidades
              </p>
              <h2
                className="font-bold tracking-tight mb-4"
                style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: C.text }}
              >
                Todo lo que necesitas,<br />desde el primer día
              </h2>
              <p style={{ color: C.textSub }}>
                Tu agente aprende sobre tu negocio y comienza a atender llamadas en menos de 24 horas.
              </p>
            </AnimatedSection>

            {/* Suricata flotante */}
            <MeerkatReveal className="agent-float relative flex-shrink-0 pointer-events-none select-none"
              style={{ width: 280, height: 360, marginBottom: -160 }}>
              <Image src="/agent-f2.png" alt="" fill sizes="280px"
                style={{ objectFit: 'contain', objectPosition: 'top center' }} />
            </MeerkatReveal>
          </div>

          {/* Mobile: heading 2-col reserva espacio para la meerkat que asoma desde card[1] */}
          <div className="lg:hidden mb-4">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 138px' }}>
              <div>
                <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
                  Capacidades
                </p>
                <h2
                  className="font-bold tracking-tight mb-3"
                  style={{ fontSize: 'clamp(1.3rem, 5.5vw, 1.7rem)', color: C.text, lineHeight: 1.25 }}
                >
                  Todo lo que necesitas,<br />desde el primer día
                </h2>
                <p style={{ color: C.textSub, fontSize: '0.875rem', lineHeight: 1.6 }}>
                  Tu agente aprende sobre tu negocio y comienza a atender llamadas en menos de 24 horas.
                </p>
              </div>
              <div />{/* espacio reservado para meerkat */}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:mt-12">
            {FEATURES.map((f, i) => (
              <AnimatedSection key={f.title} delay={i * 0.07}>
                <div
                  className="feature-card rounded-2xl p-6 h-full"
                  style={{
                    background:  f.cardBg ?? C.surface,
                    border:      `1px solid ${f.cardBorder ?? C.border}`,
                    boxShadow:   '0 2px 16px rgba(108,59,255,0.05)',
                    position:    'relative',
                  }}
                >
                  {i === 1 && (
                    <div
                      className="block lg:hidden"
                      style={{
                        position: 'absolute',
                        top: -130,
                        right: 8,
                        width: 130,
                        height: 155,
                        zIndex: 0,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}
                    >
                      <MeerkatReveal style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <Image src="/agent-f2.png" alt="" fill sizes="130px"
                          style={{ objectFit: 'contain', objectPosition: 'top center' }} />
                      </MeerkatReveal>
                    </div>
                  )}
                  <div className="relative" style={{ zIndex: 1 }}>
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                      style={{ background: `${f.color}22`, border: `1px solid ${f.color}44` }}
                    >
                      {f.icon}
                    </div>
                    <h3 className="font-semibold mb-2" style={{ color: C.text }}>{f.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{f.desc}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>

          {/* Marquee, debajo de las tarjetas */}
          <div style={{ marginTop: 40, marginLeft: -20, marginRight: -20 }}>
            <Marquee />
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-20 lg:pb-12 relative overflow-hidden">

        <AnimatedSection className="mb-12 lg:mb-16">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
            Cómo funciona
          </p>
          <h2
            className="font-bold tracking-tight"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: C.text }}
          >
            En línea en 3 pasos
          </h2>
        </AnimatedSection>

        {/* Editorial numbered list — unique layout vs 3-col cards elsewhere */}
        <div className="lg:pr-72">
          {[
            { n: '01', title: 'Elige tu agente y tus minutos',  desc: 'Selecciona el tipo de agente que necesita tu negocio y los minutos mensuales que consumiría. Completa el pago en línea en menos de 5 minutos.' },
            { n: '02', title: 'Configura tu agente',             desc: 'Accede a tu portal, agrega la información de tu negocio y personaliza cómo responde tu agente.' },
            { n: '03', title: 'Recibe y realiza llamadas',       desc: 'Tu número queda activo en horas. Tu agente atiende llamadas entrantes, llama de regreso a los que no contestaron y ejecuta campañas salientes. Tú solo monitoreas desde el portal.' },
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

      </section>

      {/* ── DEMO EN VIVO ─────────────────────────────────────────────────── */}
      <section id="demo" style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
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
              Un agente.<br />Cualquier rol.
            </h2>
            <p className="max-w-lg mx-auto" style={{ color: C.textSub }}>
              Elige el escenario, llama y experimenta. Recepcionista, vendedor, tomador de pedidos,
              seguimiento: un solo agente configurado para lo que tu negocio necesite.
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
              El precio correcto<br />para tu negocio
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>
              Una compra única por tu agente, más una mensualidad según los minutos que uses.
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
                Elige tu tipo de agente
              </h3>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-16">
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
                    </div>
                    <div className="text-right">
                      {t.popular && (
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold mb-1.5"
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
                Múltiples agentes y sucursales, integración con tu POS o CRM, flujos a medida y SLA dedicado.
              </p>
              <p className="text-xs sm:hidden mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Múltiples agentes · POS/CRM · SLA dedicado
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
      <section className="relative overflow-hidden" style={{ padding: '0' }}>
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
              Mientras tú atiendes tu negocio,<br />ellos atienden el teléfono.
            </h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.52)' }}>
              Tu agente puede estar en línea en menos de 24 horas.<br />Sin contratos largos. Sin complicaciones.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/registro" className="cta-pulse inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
                Contratar ahora <ArrowRight size={15} />
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
              Mientras tú atiendes<br />tu negocio, ellos<br />atienden el teléfono.
            </h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.52)', maxWidth: 420 }}>
              Tu agente puede estar en línea en menos de 24 horas. Sin contratos largos. Sin complicaciones.
            </p>
            <div className="flex items-start gap-3">
              <Link href="/registro" className="cta-pulse inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
                Contratar ahora <ArrowRight size={15} />
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
            <Link href="/registro" className="text-xs transition-opacity hover:opacity-70" style={{ color: C.textMute }}>
              Contratar
            </Link>
            <Link href="/portal/login" className="text-xs transition-opacity hover:opacity-70" style={{ color: C.textMute }}>
              Portal de clientes
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
