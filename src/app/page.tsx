import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Phone, Check, ArrowRight, Play, Rocket, Star,
  Inbox, BellOff, TrendingUp,
  ShoppingBag, MessageCircle, Users,
} from 'lucide-react';
import LandingNav from './LandingNav';
import LandingWidgets from './LandingWidgets';
import PricingSection from './PricingSection';
import RotatingNiche from './RotatingNiche';
import FaqSection from './FaqSection';
import NiaInterview from './NiaInterview';
import AnimatedSection from './AnimatedSection';
import MeerkatReveal from './MeerkatReveal';
import OverloadIllustration from './OverloadIllustration';
import AudioWaveform from './AudioWaveform';
import Marquee from './Marquee';
import TeamFlowSection from './TeamFlowSection';
import ReglasManifesto from './ReglasManifesto';
import FaqLanding from './FaqLanding';
import BeforeAfterSection from './BeforeAfterSection';
import IndustriesSection from './IndustriesSection';

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
  { nombre: 'Noah',  rol: 'Ventas',            desc: 'Llama prospectos, cotiza directo en QuickBooks y cierra oportunidades nuevas.', color: '#22c55e', img: '/meerkats/noah.png'  },
  { nombre: 'Nara',  rol: 'Coordinación',      desc: 'Coordina procesos, da seguimiento y mantiene la operación en orden.',  color: '#f97316', img: '/meerkats/nara.png'  },
  { nombre: 'Neo',   rol: 'Tecnología',        desc: 'Resuelve tickets, gestiona incidentes y mantiene los sistemas activos.', color: '#06b6d4', img: '/meerkats/neo.png'  },
  { nombre: 'Naia',  rol: 'Recursos Humanos',  desc: 'Organiza vacaciones, permisos y expedientes del equipo.',              color: '#ec4899', img: '/meerkats/naia.png'  },
  { nombre: 'Nico',  rol: 'Recuperación',      desc: 'Cobra, recuerda pagos y recupera clientes inactivos.',                 color: '#f59e0b', img: '/meerkats/nico.png'  },
  { nombre: 'Nelia', rol: 'Atención al Cliente', desc: 'Responde dudas y acompaña al cliente hasta resolverlas.',            color: '#3b82f6', img: '/meerkats/nelia.png' },
  { nombre: 'Nova',  rol: 'Despacho',         desc: 'Despacha equipos, actualiza estatus y coordina cada salida en campo.',                   color: '#ef4444', img: '/meerkats/nova.png'  },
  { nombre: 'Nala',  rol: 'Facturación',      desc: 'Timbra CFDIs, archiva comprobantes y mantiene el orden fiscal.',                         color: '#a16207', img: '/meerkats/nala.png'  },
  { nombre: 'Nami',  rol: 'Inventarios',      desc: 'Lleva el conteo del inventario, detecta faltantes y dispara reposiciones.',              color: '#6C3BFF', img: '/meerkats/nami.png'  },
];

const LIMITS = [
  {
    icon:  <Inbox size={20} color="#dc2626" />,
    title: 'Las conversaciones se acumulan.',
    items: ['Clientes esperando.', 'Mensajes sin responder.', 'Correos pendientes.'],
    color: '#dc2626',
    label: 'Conversaciones',
  },
  {
    icon:  <BellOff size={20} color="#d97706" />,
    title: 'Los seguimientos desaparecen.',
    items: ['Cotizaciones olvidadas.', 'Llamadas pendientes.', 'Oportunidades perdidas.'],
    color: '#d97706',
    label: 'Seguimientos',
  },
  {
    icon:  <TrendingUp size={20} color="#9ca3af" />,
    title: 'La capacidad deja de alcanzar.',
    items: ['Tu operación sigue creciendo.', 'Pero tu equipo sigue teniendo las mismas horas.'],
    color: '#6b7280',
    label: 'Capacidad',
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
      'Voz profesional',
      'Memoria de tu organización',
      'Número propio',
      'Portal privado',
      'Entrenamiento inicial',
      'Integración con tu oficina',
    ],
    meerkat: '/agent-plan-pro.png', meerkatBottom: 66,
    meerkatDesk: '/meerkat-transparente-07.png', meerkatDeskBottom: 65,
  },
];

// MINUTE_TIERS eliminado 2026-08-11: landmine con ops 100/200/300 stale
// (real es 320/420/520 según JORNADA_CONFIG.combinada — bump +200 el 2026-08-28
// para que las jornadas combinadas tengan mix trabajable de tareas). La landing
// renderiza PricingSection.tsx que lee de plans.ts en runtime. Ver
// [[feedback-audit-read-path-fidelity]].

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
    desc: 'Aprende tu organización y comienza a operar sin procesos largos de contratación.',
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

        {/* Pills — absolutely positioned on sides, don't affect content layout */}
        <div className="hidden lg:block" style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 220, height: 460, zIndex: 2, overflow: 'visible' }}>
          <OverloadIllustration half="left" />
        </div>
        <div className="hidden lg:block" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 220, height: 460, zIndex: 2, overflow: 'visible' }}>
          <OverloadIllustration half="right" />
        </div>

        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-28" style={{ position: 'relative', zIndex: 1 }}>

          <AnimatedSection className="text-center mb-10">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(155,109,255,0.7)' }}>
              El límite
            </p>
            <h2
              className="font-bold tracking-tight mb-4"
              style={{ fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', color: '#fff', lineHeight: 1.15 }}
            >
              Toda organización<br />tiene una capacidad
            </h2>
            <p className="mx-auto" style={{ color: 'rgba(255,255,255,0.52)', maxWidth: 500, lineHeight: 1.65 }}>
              Conforme una organización crece, también crecen las conversaciones, tareas y seguimientos. Llega un punto donde la capacidad humana simplemente deja de ser suficiente.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {LIMITS.map((p, i) => (
              <AnimatedSection key={p.title} delay={i * 0.1}>
                <div
                  className="rounded-2xl p-6 h-full"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: `${p.color}18`, border: `1px solid ${p.color}28` }}
                  >
                    {p.icon}
                  </div>
                  <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: p.color }}>
                    {p.label}
                  </p>
                  <p className="font-bold text-sm mb-3" style={{ color: '#fff', lineHeight: 1.3 }}>
                    {p.title}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {p.items.map(item => (
                      <p key={item} className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection delay={0.2} className="mt-8">
            <div
              className="mx-auto rounded-2xl px-7 py-5"
              style={{
                maxWidth: 500,
                background: 'rgba(108,59,255,0.09)',
                border: '1px solid rgba(108,59,255,0.2)',
                borderLeftWidth: 3,
                borderLeftColor: 'rgba(108,59,255,0.55)',
                borderLeftStyle: 'solid',
              }}
            >
              <p className="font-semibold" style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.55 }}>
                Las ventas generan crecimiento.<br />
                <span style={{ color: '#C4A8FF' }}>La capacidad determina hasta dónde puedes crecer.</span>
              </p>
            </div>
          </AnimatedSection>

        </div>
      </section>

      {/* ── EMPLEADO DIGITAL ─────────────────────────────────────────────── */}
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
              No es software.<br />No es recepcionista.<br />Es capacidad operativa que trabaja sola
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
              <span className="font-bold" style={{ color: C.accent }}>La mayoría de las organizaciones<br className="sm:hidden" /> no necesitan más clientes.</span><br />
              <span className="font-bold" style={{ color: C.accent }}>Necesitan más capacidad para atenderlos.</span>
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
                Construye tu oficina digital
              </h2>
              <p style={{ color: C.textSub }}>
                Cada Centinelia adopta tu misión. Juntos operan tu organización 24/7.
              </p>
            </AnimatedSection>
          </div>

          <AnimatedSection className="lg:hidden mb-6">
            <p className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: C.accent }}>
              Arma tu equipo.
            </p>
            <h2
              className="font-bold tracking-tight mb-3"
              style={{ fontSize: 'clamp(1.3rem, 5.5vw, 1.7rem)', color: C.text, lineHeight: 1.25 }}
            >
              Construye tu oficina digital
            </h2>
            <p style={{ color: C.textSub, fontSize: '0.875rem', lineHeight: 1.6 }}>
              Cada Centinelia adopta tu misión.<br />Juntos operan tu organización 24/7.
            </p>
          </AnimatedSection>

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

          {/* Fila 1 — 4 empleados */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEAM.slice(0, 4).map((m, i) => (
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

          {/* Fila 2 — 6 empleados, expandida 150% para igualar tamaño de tarjetas de la fila 1 (4 vs 6 = 1.5×) */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-3 sm:-mx-[25%]">
            {TEAM.slice(4).map((m, i, arr) => {
              const isLastOdd = i === arr.length - 1 && arr.length % 2 !== 0;
              return (
                <AnimatedSection key={m.nombre} delay={(i + 4) * 0.06}
                  className={`h-full${isLastOdd ? ' col-span-2 sm:col-span-1 flex justify-center' : ''}`}>
                  <div
                    className={`rounded-2xl overflow-hidden h-full${isLastOdd ? ' w-[calc(50%-6px)] sm:w-full' : ''}`}
                    style={{
                      background: C.surface,
                      border:     `1px solid ${C.border}`,
                      boxShadow:  '0 2px 12px rgba(108,59,255,0.20)',
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
              );
            })}
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
                Contrata capacidad,<br className="sm:hidden" />{' '}
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
                Conoce a los 11 empleados <ArrowRight size={13} />
              </Link>
            </div>
          </AnimatedSection>

        </div>
      </section>

      {/* ── CÓMO TRABAJAN ──────────────────────────────────────────────── */}
      <TeamFlowSection />

      {/* ── LO QUE CAMBIA EL LUNES ──────────────────────────────────────── */}
      <BeforeAfterSection />

      {/* ── ASÍ TRABAJA EN TU NEGOCIO ───────────────────────────────────── */}
      <IndustriesSection />

      {/* ── PRIMERA ENTREVISTA ───────────────────────────────────────────── */}
      <NiaInterview />

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
              Tu Oficina
            </p>
            <h2
              className="font-bold tracking-tight mb-6"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#fff' }}
            >
              Empieza a construir tu oficina digital
            </h2>
            <p
              className="font-bold tracking-tight mb-1"
              style={{ fontSize: 'clamp(1.3rem, 3vw, 2rem)', color: '#fff', lineHeight: 1.2 }}
            >
              Hoy pagas la incorporación.
            </p>
            <p
              className="font-bold tracking-tight"
              style={{
                fontSize: 'clamp(1.3rem, 3vw, 2rem)', lineHeight: 1.2,
                background: 'linear-gradient(90deg, #9B6DFF, #C4A8FF)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Después solo pagas<br className="sm:hidden" /> la jornada que necesites.
            </p>
          </AnimatedSection>

          {/* ─── Pricing interactive ─────────────────── */}
          <PricingSection />


          {/* ─── Empresarial ────────────────────────── */}
          <AnimatedSection>
          <div
            className="relative rounded-2xl p-7 sm:p-10 mt-8"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: 'linear-gradient(90deg, transparent, rgba(155,109,255,0.5), transparent)' }} />
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
              <div className="flex-1">
                <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'rgba(155,109,255,0.6)' }}>
                  Para equipos
                </p>
                <h3 className="font-bold mb-2" style={{ color: '#fff', fontSize: '1.25rem' }}>
                  ¿Necesitas una oficina a la medida?
                </h3>
                <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Diseñamos una oficina digital completa para organizaciones con múltiples sucursales, procesos complejos o necesidades especiales.
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                  {['Múltiples Centinelias', 'Sucursales', 'CRM', 'Flujos personalizados', 'Integraciones', 'SLA dedicado'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      <Check size={13} color="#9B6DFF" className="flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex sm:flex-col sm:items-end gap-3 sm:gap-4 flex-shrink-0 sm:pt-1">
                <Link
                  href="/cotizar"
                  className="px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 text-center"
                  style={{ background: 'rgba(108,59,255,0.25)', color: '#C4A8FF', border: '1.5px solid rgba(108,59,255,0.45)', whiteSpace: 'nowrap' }}
                >
                  Diseñar mi oficina digital
                </Link>
              </div>
            </div>
          </div>
          </AnimatedSection>

        </div>
      </section>


      {/* ── LAS REGLAS DE TU OFICINA DIGITAL ────────────────────────────── */}
      <ReglasManifesto />

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <FaqLanding />

      {/* ── BOTTOM CTA ───────────────────────────────────────────────────── */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* Desktop background — horizontal group */}
          <img
            src="/meerkats-happy-team.png?v=4"
            alt=""
            aria-hidden="true"
            className="hidden sm:block"
            style={{
              position:       'absolute',
              bottom:         0,
              left:           '50%',
              transform:      'translateX(-50%)',
              width:          '140%',
              maxWidth:       1600,
              height:         'auto',
              objectFit:      'cover',
              objectPosition: 'center bottom',
              opacity:        0.05,
              mixBlendMode:   'screen',
            }}
          />
          {/* Mobile background — vertical stack */}
          <img
            src="/meerkats-mobile-bg.png"
            alt=""
            aria-hidden="true"
            className="sm:hidden"
            style={{
              position:       'absolute',
              top:            '50%',
              left:           '50%',
              transform:      'translate(-50%, -50%)',
              width:          '100%',
              height:         'auto',
              opacity:        0.05,
            }}
          />
          <div style={{
            position: 'absolute', width: 900, height: 700,
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(ellipse, rgba(108,59,255,0.14) 0%, transparent 65%)',
          }} />
        </div>

        <div className="relative max-w-3xl mx-auto px-5 sm:px-10 py-32 sm:py-48 flex flex-col items-center text-center">

          {/* Headline */}
          <AnimatedSection>
            <h2 className="font-extrabold tracking-tight"
              style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)', color: '#fff', lineHeight: 1.08, letterSpacing: '-0.02em' }}>
              Hoy empieza una forma<br />distinta de trabajar
            </h2>
          </AnimatedSection>

          {/* Divider */}
          <AnimatedSection delay={0.1}>
            <div style={{ width: 44, height: 1, background: 'rgba(108,59,255,0.55)', margin: '2.5rem auto' }} />
          </AnimatedSection>

          {/* Pause */}
          <AnimatedSection delay={0.14}>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', marginBottom: '2.75rem' }}>
              Mientras lees esto...
            </p>
          </AnimatedSection>

          {/* Loss lines */}
          <AnimatedSection delay={0.18}>
            <div className="flex flex-col gap-2 mb-6">
              {[
                { text: 'Hay organizaciones esperando a que mañana sea lunes.', op: 0.58 },
                { text: 'Esperando a que alguien llegue.',                op: 0.44 },
                { text: 'Esperando a tener más capacidad.',               op: 0.3  },
              ].map(({ text, op }) => (
                <p key={text}
                  style={{ fontSize: 'clamp(1.05rem, 2.2vw, 1.35rem)', color: `rgba(255,255,255,${op})`, fontWeight: 400, lineHeight: 1.4 }}>
                  {text}
                </p>
              ))}
            </div>
            <p style={{ fontSize: 'clamp(1.05rem, 2.2vw, 1.35rem)', color: 'rgba(255,255,255,0.72)', fontWeight: 600, lineHeight: 1.4, marginBottom: '3rem' }}>
              Ya no tiene por qué ser así.
            </p>
          </AnimatedSection>

          {/* Contrast */}
          <AnimatedSection delay={0.22}>
            <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, maxWidth: 480, marginBottom: '3.5rem' }}>
              Las organizaciones que crecen más rápido<br />no son las que trabajan más horas.<br />
              <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.82)' }}>Son las que tienen más capacidad.</span>
            </p>
          </AnimatedSection>

          {/* Separator */}
          <AnimatedSection delay={0.25}>
            <div style={{ width: 180, height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: '3rem' }} />
          </AnimatedSection>

          {/* Sub-CTA line */}
          <AnimatedSection delay={0.28}>
            <p className="font-semibold mb-7"
              style={{ fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: 'rgba(255,255,255,0.68)' }}>
              El siguiente paso ya no es contratar más personas. Es ampliar tu capacidad.
            </p>
          </AnimatedSection>

          {/* Buttons */}
          <AnimatedSection delay={0.32}>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Link
                href="/registro"
                className="cta-pulse inline-flex items-center gap-2 px-10 py-4 rounded-2xl font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff', boxShadow: '0 8px 36px rgba(108,59,255,0.45)' }}
              >
                Incorporar mi primer Centinelia <ArrowRight size={15} />
              </Link>
              <a
                href="tel:+528116333559"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <Phone size={14} /> Habla con un asesor
              </a>
            </div>
          </AnimatedSection>

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
