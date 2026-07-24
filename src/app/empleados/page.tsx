export const dynamic = 'force-static';

import type { Metadata } from 'next';
import Image      from 'next/image';
import Link       from 'next/link';
import {
  Check, ArrowRight,
  Phone, UserPlus, CalendarCheck, Users,
  PhoneForwarded, ShoppingBag, PhoneCall,
  Wrench, Network, X,
} from 'lucide-react';
import LandingNav       from '@/app/LandingNav';
import AnimatedSection  from '@/app/AnimatedSection';
import IndustryFooter   from '@/app/industrias/IndustryFooter';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

export const metadata: Metadata = {
  title: 'Empleados digitales | Centinelia',
  description: 'Conoce al equipo de empleados digitales de Centinelia: Nia, Noah, Nara, Nelia, Nico, Neo, Naia, Nova, Nox y más. Cada uno especializado en un área, trabajando 24/7 para tu organización.',
  alternates: { canonical: 'https://www.centinelia.mx/empleados' },
  openGraph: {
    title: 'Empleados digitales | Centinelia',
    description: 'Un equipo completo de empleados de IA especializados por rol. Recepción, ventas, cobranza, coordinación y más — activos 24/7 sin IMSS ni ausencias.',
    url: 'https://www.centinelia.mx/empleados',
  },
};

// ── Capability chips ──────────────────────────────────────────────────────────
// Shown for all employee types (voice). Coordinators get a separate chip set.
const VOICE_CAPS = [
  { key: 'lead_qualification',      icon: UserPlus,         label: 'Captura leads'              },
  { key: 'appointment_booking',     icon: CalendarCheck,    label: 'Agenda citas'               },
  { key: 'existing_client_support', icon: Users,            label: 'Atiende clientes actuales'  },
  { key: 'order_taking',            icon: ShoppingBag,      label: 'Toma pedidos'               },
  { key: 'outbound_calls',          icon: PhoneCall,        label: 'Llamadas salientes'         },
  { key: 'smart_transfer',          icon: PhoneForwarded,   label: 'Transferencia inteligente'  },
  { key: 'helpdesk',                icon: Wrench,           label: 'Mesa de ayuda IT'           },
] as const;

const COORD_CAPS = [
  { key: 'is_coordinator', icon: Network,   label: 'Coordina al equipo'       },
] as const;

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
    bullets:  [
      'Distribuye tareas al agente indicado según el caso',
      'Monitorea avances y escala lo que lleva tiempo sin resolverse',
      'Genera reportes de operación automáticos',
      'Trabaja con puro ops — sin voz, máxima eficiencia',
    ],
  },
  niva: {
    rolLabel: 'Directora General',
    tagline:  'Ve lo que otros no notan. Actúa antes de que sea urgente.',
    subtitle: 'Estrategia que se anticipa al problema',
    bullets:  [
      'Analiza el contexto antes de asignar cualquier tarea',
      'Detecta cuellos de botella y sus causas de raíz',
      'Construye rutinas que eliminan problemas recurrentes',
      'Trabaja con puro ops — sin voz, máxima eficiencia',
    ],
  },
  nia: {
    rolLabel: 'Recepción',
    tagline:  'Nunca se le escapa un dato',
    subtitle: 'Primera impresión impecable, todos los días',
    bullets:  [
      'Responde preguntas sobre tu negocio las 24 horas',
      'Captura los datos de cada prospecto que llama',
      'Agenda citas directamente en el calendario de tu equipo',
      'Transfiere al área correcta en el momento indicado',
    ],
  },
  noah: {
    rolLabel: 'Ventas',
    tagline:  'Siempre al teléfono, siempre cerrando',
    subtitle: 'Prospección y cierre sin descanso',
    bullets:  [
      'Califica prospectos con preguntas clave en la llamada',
      'Registra pedidos completos con todos los detalles',
      'Sale a buscar clientes con llamadas salientes',
      'Transfiere al equipo cuando el cliente está listo para cerrar',
    ],
  },
  nico: {
    rolLabel: 'Recuperación de Cartera',
    tagline:  'Ya tiene tu dinero contado',
    subtitle: 'Cobra sin dañar la relación',
    bullets:  [
      'Recuerda pagos pendientes con amabilidad y firmeza',
      'Negocia plazos y condiciones de forma autónoma',
      'Llama proactivamente a clientes con saldo vencido',
      'Registra cada acuerdo de pago para seguimiento',
    ],
  },
  nelia: {
    rolLabel: 'Atención al Cliente',
    tagline:  'Nunca deja esperando a un cliente',
    subtitle: 'Cada cliente sabe qué sigue',
    bullets:  [
      'Resuelve dudas frecuentes al instante sin escalar',
      'Da seguimiento a casos abiertos hasta su cierre',
      'Llama a clientes para confirmar, informar o encuestar',
      'Registra la retroalimentación de cada interacción',
    ],
  },
  neo: {
    rolLabel: 'Soporte IT',
    tagline:  'Laptop abierta, problema resuelto',
    subtitle: 'Tu helpdesk siempre disponible',
    bullets:  [
      'Abre tickets de soporte en segundos por teléfono',
      'Diagnostica el problema con preguntas clave',
      'Escala al técnico o área correcta de inmediato',
      'Registra cada incidente con estatus y folio',
    ],
  },
  nara: {
    rolLabel: 'Coordinación',
    tagline:  'Carpeta en mano, todo bajo control',
    subtitle: 'Seguimiento a cada expediente o trámite',
    bullets:  [
      'Consulta el estatus de casos, expedientes o trámites',
      'Gestiona solicitudes internas o ciudadanas',
      'Da seguimiento puntual hasta que se resuelva',
      'Transfiere a la dependencia o área responsable',
    ],
  },
  naia: {
    rolLabel: 'Recursos Humanos',
    tagline:  'Nunca pierde una falta o un permiso',
    subtitle: 'Tu equipo siempre en orden',
    bullets:  [
      'Registra faltas, permisos y vacaciones por teléfono',
      'Agenda entrevistas y procesos de ingreso',
      'Aclara dudas de nómina y prestaciones al instante',
      'Da seguimiento a solicitudes de personal pendientes',
    ],
  },
  nova: {
    rolLabel: 'Despacho',
    tagline:  'El cerebro operativo de tu equipo en campo.',
    subtitle: 'Cada unidad en el lugar correcto',
    bullets:  [
      'Recibe solicitudes de despacho en tiempo real',
      'Asigna la unidad más cercana o disponible',
      'Actualiza el estatus de cada unidad o brigada',
      'Registra y archiva cada operación automáticamente',
    ],
  },
  custom: {
    rolLabel: 'A tu medida',
    tagline:  'Cuando ningún rol estándar encaja, diseña el tuyo.',
    subtitle: 'Tú defines todo',
    bullets:  [
      'Nombre y personalidad únicos para tu negocio',
      'Tú defines el rol, las funciones y el tono de voz',
      'Configura cada capacidad manualmente en el portal',
      'Ideal para operaciones muy específicas o mixtas',
    ],
  },
};

// ── Per-image scale overrides ──────────────────────────────────────────────────
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

// ── Capability chips component ─────────────────────────────────────────────────
function CapabilityChips({ features, color, isCoordinator }: {
  features: Record<string, unknown>;
  color: string;
  isCoordinator: boolean;
}) {
  if (isCoordinator) {
    return (
      <div style={{ marginBottom: 40 }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSub, marginBottom: 12 }}>
          Capacidades
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {COORD_CAPS.map(({ key, icon: Icon, label }) => {
            const active = !!features[key];
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px',
                  borderRadius: 999,
                  fontSize: '0.78rem', fontWeight: 500,
                  background: active ? `${color}14` : 'rgba(26,10,59,0.04)',
                  color:      active ? color         : 'rgba(26,10,59,0.28)',
                  border:     `1px solid ${active ? `${color}30` : 'rgba(26,10,59,0.08)'}`,
                }}
              >
                <Icon size={12} strokeWidth={2} />
                {label}
              </span>
            );
          })}
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 999,
              fontSize: '0.78rem', fontWeight: 500,
              background: `${color}14`, color, border: `1px solid ${color}30`,
            }}
          >
            <Phone size={12} strokeWidth={2} />
            Sin llamadas entrantes
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 40 }}>
      <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSub, marginBottom: 12 }}>
        Capacidades
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {/* Always-on: phone reception */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 999,
          fontSize: '0.78rem', fontWeight: 500,
          background: `${color}14`, color, border: `1px solid ${color}30`,
        }}>
          <Phone size={12} strokeWidth={2} />
          Atención 24/7
        </span>

        {VOICE_CAPS.map(({ key, icon: Icon, label }) => {
          const active = !!features[key];
          return (
            <span
              key={key}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999,
                fontSize: '0.78rem', fontWeight: 500,
                background: active ? `${color}14` : 'rgba(26,10,59,0.04)',
                color:      active ? color         : 'rgba(26,10,59,0.22)',
                border:     `1px solid ${active ? `${color}30` : 'rgba(26,10,59,0.07)'}`,
                textDecoration: active ? 'none' : 'none',
              }}
            >
              {active
                ? <Icon size={12} strokeWidth={2} />
                : <X    size={12} strokeWidth={2} style={{ opacity: 0.5 }} />
              }
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

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
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
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
        const content        = CONTENT[m.id];
        if (!content || !m.imagen) return null;

        const reversed       = i % 2 === 1;
        const sectionBg      = i % 2 === 0 ? C.bg : C.bgAlt;
        const feats          = m.features as Record<string, unknown>;
        const isCoordinator  = !!feats.is_coordinator;

        return (
          <section
            key={m.id}
            id={m.id}
            style={{ background: sectionBg, borderTop: `1px solid ${C.border}` }}
          >
            <div className={`max-w-6xl mx-auto flex flex-col-reverse ${reversed ? 'sm:flex-row-reverse' : 'sm:flex-row'}`}>

              {/* Text */}
              <AnimatedSection
                className="flex-1 flex flex-col justify-center"
                style={{ padding: 'clamp(36px, 5vw, 80px) clamp(20px, 5vw, 72px)' }}
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
                  marginBottom: 32,
                }}>
                  {content.tagline}
                </p>

                {/* Capability chips */}
                <CapabilityChips
                  features={feats}
                  color={m.color}
                  isCoordinator={isCoordinator}
                />

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
              <AnimatedSection
                className={`flex-1 relative${m.id === 'nova' ? ' nova-img-wrap' : ''}`}
                style={{ minHeight: 'clamp(300px, 48vw, 580px)' }}
                delay={reversed ? 0 : 0.1}
                y={24}
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
              </AnimatedSection>

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
              <div className="flex flex-row flex-wrap gap-3">
                <Link
                  href="/registro"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
                  style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
                >
                  Contratar ahora <ArrowRight size={14} />
                </Link>
                <Link
                  href="/cotizar"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-sm font-medium transition-colors whitespace-nowrap"
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
            <AnimatedSection
              className="hidden lg:block relative flex-shrink-0 self-center"
              style={{ width: 860, height: 700 }}
              delay={0.18}
              y={32}
            >
              <Image
                src="/meerkats/grupo.png"
                alt="Equipo Centinelia"
                fill
                sizes="860px"
                style={{ objectFit: 'contain', objectPosition: 'center center' }}
              />
            </AnimatedSection>
          </div>

          {/* Group photo — mobile */}
          <div className="lg:hidden overflow-hidden" style={{ marginTop: -8 }}>
            <AnimatedSection className="relative" style={{ width: '125%', marginLeft: '-12.5%', aspectRatio: '2752/1536' }} delay={0.1} y={20}>
              <Image
                src="/meerkats/grupo.png"
                alt="Equipo Centinelia"
                fill
                sizes="125vw"
                style={{ objectFit: 'contain', objectPosition: 'center center' }}
              />
            </AnimatedSection>
          </div>
        </div>
      </section>

      <IndustryFooter />
    </div>
  );
}
