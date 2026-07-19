export const dynamic = 'force-static';

import Image      from 'next/image';
import Link       from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import LandingNav       from '@/app/LandingNav';
import AnimatedSection  from '@/app/AnimatedSection';
import IndustryFooter   from '@/app/industrias/IndustryFooter';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

// ── Copy per employee ──────────────────────────────────────────────────────────
const CONTENT: Record<string, {
  rolLabel: string;
  tagline:  string;
  subtitle: string;
  bullets:  string[];
}> = {
  nox: {
    rolLabel: 'Director General',
    tagline:  'El equipo siempre trabajando, sin que tengas que pedirlo.',
    subtitle: 'Coordinación total desde el centro',
    bullets:  ['Enruta cada tarea al agente indicado', 'Monitorea avances y escala lo vencido', 'Genera reportes de operación automáticos', 'Sin llamadas: puro ops, máxima eficiencia'],
  },
  niva: {
    rolLabel: 'Directora General',
    tagline:  'Ve lo que otros no notan. Actúa antes de que sea urgente.',
    subtitle: 'Estrategia que se anticipa al problema',
    bullets:  ['Analiza el contexto antes de asignar', 'Detecta cuellos de botella de raíz', 'Construye rutinas que evitan los problemas', 'Sin llamadas: estrategia y criterio puro'],
  },
  nia: {
    rolLabel: 'Recepción',
    tagline:  'Cada reporte encuentra seguimiento',
    subtitle: 'Cada reporte avanza hasta resolverse',
    bullets:  ['Recibe reportes', 'Actualiza estatus', 'Seguimiento a folios'],
  },
  noah: {
    rolLabel: 'Ventas',
    tagline:  'Hace el trabajo repetitivo por ti',
    subtitle: 'Hace que los procesos sucedan solos',
    bullets:  ['Actualiza información', 'Consulta bases de datos', 'Automatiza flujos'],
  },
  nico: {
    rolLabel: 'Recuperación',
    tagline:  'Nunca deja un cobro pendiente',
    subtitle: 'Cobra, recuerda y reporta',
    bullets:  ['Recuerda pagos', 'Genera cotizaciones', 'Conciliaciones básicas', 'Seguimiento de facturas'],
  },
  nelia: {
    rolLabel: 'Atención al Cliente',
    tagline:  'Nunca deja esperando a un cliente',
    subtitle: 'Cada cliente sabe qué sigue',
    bullets:  ['Resuelve preguntas frecuentes', 'Seguimiento de casos abiertos', 'Encuestas de satisfacción por llamada', 'Confirmaciones automáticas'],
  },
  neo: {
    rolLabel: 'Tecnología',
    tagline:  'Nunca deja un ticket sin resolver',
    subtitle: 'Tu helpdesk siempre disponible',
    bullets:  ['Abre tickets en segundos', 'Diagnostica el problema', 'Conecta con el técnico correcto', 'Registra cada incidente'],
  },
  nara: {
    rolLabel: 'Coordinación',
    tagline:  'Nunca olvida un pendiente',
    subtitle: 'Todo tiene un lugar',
    bullets:  ['Resume reuniones', 'Redacta correos', 'Seguimiento interno'],
  },
  naia: {
    rolLabel: 'Recursos Humanos',
    tagline:  'Nunca pierde una falta o un permiso',
    subtitle: 'Tu equipo siempre en orden',
    bullets:  ['Registra faltas y permisos', 'Informa saldos de vacaciones', 'Aclara dudas de nómina', 'Agenda entrevistas'],
  },
  nova: {
    rolLabel: 'Despacho',
    tagline:  'El cerebro operativo de tu equipo en campo.',
    subtitle: 'Cada unidad en el lugar correcto',
    bullets:  ['Despacha equipos en segundos', 'Coordina repartidores, técnicos o brigadas', 'Actualiza el estatus de cada unidad en tiempo real', 'Registra y archiva cada operación'],
  },
  custom: {
    rolLabel: 'A tu medida',
    tagline:  'Cuando ningún rol estándar encaja, diseña el tuyo.',
    subtitle: 'Tú defines todo',
    bullets:  ['Nombre y personalidad únicos para tu negocio', 'Tú defines el rol, las funciones y el tono de voz', 'Configura cada parámetro manualmente', 'Ideal para operaciones muy específicas'],
  },
};

// ── Per-image scale overrides (compensates for figure size differences) ───────
const IMAGE_SCALE: Partial<Record<string, number>> = {
  nova: 1.25,
};

// ── Color tokens ───────────────────────────────────────────────────────────────
const C = {
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.55)',
  border:  'rgba(108,59,255,0.1)',
  bg:      '#FAFBFF',
  bgAlt:   '#F4F0FF',
};

// ── Page ───────────────────────────────────────────────────────────────────────
export default function EmpleadosPage() {
  const directors   = MEERKAT_ROLES.filter(r => !!(r.features as Record<string, unknown>)?.is_coordinator);
  const specialists = MEERKAT_ROLES.filter(r => !(r.features as Record<string, unknown>)?.is_coordinator);
  const meerkats    = [...directors, ...specialists];

  return (
    <div style={{ background: C.bg, color: C.text, overflowX: 'hidden' }}>
      <LandingNav />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: 'linear-gradient(140deg, #1A0A3B 0%, #0D0520 100%)',
          paddingTop: 128, paddingBottom: 80,
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', width: 700, height: 600,
            top: -100, left: '50%', transform: 'translateX(-50%)',
            background: 'radial-gradient(circle, rgba(108,59,255,0.22) 0%, transparent 65%)',
          }} />
        </div>

        <div className="relative max-w-3xl mx-auto px-5 sm:px-8" style={{ zIndex: 1 }}>
          <p style={{
            color: 'rgba(155,109,255,0.85)',
            fontSize: '0.68rem', fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            marginBottom: 18,
          }}>
            Equipo Centinelia
          </p>
          <h1 style={{
            color: '#fff', fontWeight: 800,
            fontSize: 'clamp(2.6rem, 6.5vw, 5rem)',
            lineHeight: 1.04, marginBottom: 22,
            letterSpacing: '-0.025em',
          }}>
            Conoce a tu equipo
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.48)',
            fontSize: 'clamp(0.95rem, 2vw, 1.15rem)',
            lineHeight: 1.75, maxWidth: 520, margin: '0 auto 36px',
          }}>
            Dos Directores Generales, ocho especialistas y un empleado completamente personalizable, listos para integrarse a tu negocio desde el primer día.
          </p>
          <Link
            href="/registro"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
          >
            Contratar a mi equipo <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── EMPLOYEE SECTIONS ────────────────────────────────────────────── */}
      {meerkats.map((m, i) => {
        const content = CONTENT[m.id];
        if (!content || !m.imagen) return null;

        const reversed   = i % 2 === 1;
        const sectionBg  = i % 2 === 0 ? C.bg : C.bgAlt;

        return (
          <section
            key={m.id}
            id={m.id}
            style={{ background: sectionBg, borderTop: `1px solid ${C.border}` }}
          >
            {/*
              Mobile  → flex-col-reverse: image renders 2nd in DOM → appears on TOP via reversal
              Desktop → flex-row (odd) or flex-row-reverse (even) → alternating text/image sides
            */}
            <div className={`max-w-6xl mx-auto flex flex-col-reverse ${reversed ? 'sm:flex-row-reverse' : 'sm:flex-row'}`}>

              {/* Text */}
              <AnimatedSection
                className="flex-1 flex flex-col justify-center"
                style={{
                  padding: 'clamp(36px, 5vw, 80px) clamp(20px, 5vw, 72px)',
                }}
                delay={0.06}
              >
                {/* Role label */}
                <p style={{
                  fontSize: '0.68rem', fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: m.color, marginBottom: 12,
                }}>
                  {content.rolLabel}
                </p>

                {/* Name */}
                <h2 style={{
                  fontSize: 'clamp(3.8rem, 9vw, 7rem)',
                  fontWeight: 800, color: C.text,
                  lineHeight: 0.92, marginBottom: 16,
                  letterSpacing: '-0.035em',
                }}>
                  {m.nombre}
                </h2>

                {/* Tagline */}
                <p style={{
                  fontStyle: 'italic',
                  fontSize: 'clamp(0.95rem, 2vw, 1.15rem)',
                  color: C.textSub, lineHeight: 1.55,
                  marginBottom: 40,
                }}>
                  {content.tagline}
                </p>

                {/* Feature subtitle */}
                <p style={{
                  fontSize: 'clamp(0.88rem, 1.5vw, 1rem)',
                  fontWeight: 600, color: C.text,
                  marginBottom: 16,
                }}>
                  {content.subtitle}
                </p>

                {/* Bullets */}
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 44 }}>
                  {content.bullets.map(b => (
                    <li
                      key={b}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: '0.95rem', color: C.textSub,
                      }}
                    >
                      <Check size={15} color={m.color} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                      {b}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div>
                  <Link
                    href={`/registro?role=${m.id}`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.03] hover:opacity-90 cursor-pointer"
                    style={{
                      background: `${m.color}12`,
                      color: m.color,
                      border: `1px solid ${m.color}38`,
                    }}
                  >
                    Contratar a {m.nombre} <ArrowRight size={13} />
                  </Link>
                </div>
              </AnimatedSection>

              {/* Image */}
              <div
                className={`flex-1 relative${m.id === 'nova' ? ' nova-img-wrap' : ''}`}
                style={{ minHeight: 'clamp(300px, 48vw, 580px)' }}
              >
                <Image
                  src={m.imagen}
                  alt={m.nombre}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  style={{
                    objectFit: 'contain',
                    objectPosition: 'bottom center',
                    transform: IMAGE_SCALE[m.id] ? `scale(${IMAGE_SCALE[m.id]})` : undefined,
                    transformOrigin: 'bottom center',
                  }}
                  priority={i < 2}
                />
              </div>

            </div>
          </section>
        );
      })}

      {/* ── GROUP CTA ─────────────────────────────────────────────────────── */}
      <section
        style={{
          background: '#1A0A3B',
          position: 'relative',
          overflow: 'hidden',
          borderTop: '1px solid rgba(108,59,255,0.2)',
        }}
      >
        {/* Glow */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', width: 900, height: 700,
            top: -80, left: '35%', transform: 'translateX(-50%)',
            background: 'radial-gradient(circle, rgba(108,59,255,0.2) 0%, transparent 65%)',
          }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8" style={{ zIndex: 1 }}>
          <div className="flex flex-col lg:flex-row items-end gap-0">

            {/* Text */}
            <AnimatedSection className="flex-1 py-20 sm:py-28 lg:py-32 lg:pr-16">
              <p style={{
                color: 'rgba(155,109,255,0.85)',
                fontSize: '0.68rem', fontWeight: 700,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                marginBottom: 16,
              }}>
                Tu equipo completo
              </p>
              <h2 style={{
                color: '#fff', fontWeight: 800,
                fontSize: 'clamp(2rem, 4.5vw, 3.8rem)',
                lineHeight: 1.06, marginBottom: 20,
                letterSpacing: '-0.025em',
              }}>
                Arma tu equipo<br />desde hoy
              </h2>
              <p style={{
                color: 'rgba(255,255,255,0.48)',
                fontSize: '1rem', lineHeight: 1.75,
                maxWidth: 420, marginBottom: 36,
              }}>
                Elige al empleado que tu negocio necesita, configúralo con
                tu información y empieza a recibir llamadas en menos de 24 horas.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/registro"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
                  style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
                >
                  Contratar ahora <ArrowRight size={14} />
                </Link>
                <Link
                  href="/registro?plan=empresarial"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-sm font-medium transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.7)',
                    border: '1px solid rgba(255,255,255,0.14)',
                  }}
                >
                  Cotizar equipo completo
                </Link>
              </div>
            </AnimatedSection>

            {/* Group photo — desktop */}
            <div className="hidden lg:block relative flex-shrink-0 self-center" style={{ width: 680, height: 560 }}>
              <Image
                src="/meerkats/grupo.png"
                alt="Equipo Centinelia"
                fill
                sizes="680px"
                style={{ objectFit: 'contain', objectPosition: 'center center' }}
              />
            </div>
          </div>

          {/* Group photo — mobile */}
          <div className="lg:hidden relative w-full" style={{ height: 300, marginTop: -16 }}>
            <Image
              src="/meerkats/grupo.png"
              alt="Equipo Centinelia"
              fill
              sizes="100vw"
              style={{ objectFit: 'cover', objectPosition: 'center center' }}
            />
          </div>
        </div>
      </section>

      <IndustryFooter />
    </div>
  );
}
