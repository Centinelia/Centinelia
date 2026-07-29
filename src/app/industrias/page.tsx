import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Stethoscope, UtensilsCrossed, Briefcase, Building2, ShoppingBag, PhoneIncoming, PhoneOutgoing, Check } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import LandingWidgets from '@/app/LandingWidgets';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter from '@/app/industrias/IndustryFooter';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title: { absolute: 'Centinelia por Industria | Empleado Telefónico IA para tu Negocio' },
  description: 'Elige tu industria y descubre cómo tu empleado telefónico IA atiende y realiza llamadas, agenda citas y captura leads las 24 horas, sin vacaciones ni horarios.',
  alternates: { canonical: `${BASE_URL}/industrias` },
  openGraph: {
    title: 'Centinelia por Industria | Empleado Telefónico IA',
    description: 'Elige tu industria y descubre cómo tu empleado telefónico IA atiende y realiza llamadas 24/7 adaptado a tu negocio.',
    url: `${BASE_URL}/industrias`,
    images: [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

const C = { bg: '#FAFBFF', text: '#1A0A3B', textSub: 'rgba(26,10,59,0.58)', accent: '#6C3BFF', border: 'rgba(108,59,255,0.12)' };

const INBOUND_BULLETS = [
  'Atiende cada llamada al instante, sin importar la hora',
  'Agenda citas y confirma disponibilidad en tiempo real',
  'Toma pedidos y resuelve dudas sin poner a nadie en espera',
  'Califica prospectos y captura sus datos automáticamente',
];

const OUTBOUND_BULLETS = [
  'Confirma citas el día anterior para reducir cancelaciones',
  'Avisa al cliente cuando su pedido está listo o hay un retraso',
  'Reactiva clientes frecuentes con una promoción del día',
  'Da seguimiento a prospectos que aún no han cerrado',
];

const INDUSTRIES = [
  {
    href: '/industrias/clinicas',
    icon: <Stethoscope size={28} color="#6C3BFF" />,
    label: 'Clínicas y Consultorios',
    desc: 'Agenda citas, confirma recordatorios y filtra urgencias, sin interrumpir la consulta.',
  },
  {
    href: '/industrias/restaurantes',
    icon: <UtensilsCrossed size={28} color="#6C3BFF" />,
    label: 'Restaurantes y Cafeterías',
    desc: 'Toma pedidos, agenda reservaciones y responde el menú en hora pico sin perder una llamada.',
  },
  {
    href: '/industrias/despachos',
    icon: <Briefcase size={28} color="#6C3BFF" />,
    label: 'Despachos y Consultorías',
    desc: 'Califica prospectos, agenda consultas y filtra llamadas de información mientras trabajas.',
  },
  {
    href: '/industrias/inmobiliarias',
    icon: <Building2 size={28} color="#6C3BFF" />,
    label: 'Inmobiliarias',
    desc: 'Responde prospectos al instante, filtra por presupuesto y agenda visitas automáticamente.',
  },
  {
    href: '/industrias/tiendas',
    icon: <ShoppingBag size={28} color="#6C3BFF" />,
    label: 'Tiendas y Servicios',
    desc: 'Atiende disponibilidad, toma pedidos y captura clientes aunque estés ocupado en el local.',
  },
];

export default function IndustriasPage() {
  return (
    <>
      <LandingNav />
      <LandingWidgets />

      {/* ── HERO ── */}
      <section style={{ background: 'linear-gradient(160deg, #0D0520 0%, #1A0A3B 100%)', paddingTop: 120, paddingBottom: 80 }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>Centinelia por industria</p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)', color: '#fff' }}>
            ¿En qué tipo de{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              organización trabajas?
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>
            Tu empleado digital se adapta a tu industria. Elige tu giro para ver cómo trabaja en la práctica.
          </p>
        </div>
      </section>

      {/* ── DOS MODOS ── */}
      <section style={{ background: '#fff', padding: '80px 24px' }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <h2 className="font-bold leading-tight" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', color: C.text }}>
              Atiende las llamadas que entran.<br className="hidden sm:block" /> Y también hace las que salen.
            </h2>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <AnimatedSection delay={0.05}>
              <div className="rounded-2xl p-8 flex flex-col gap-5 h-full" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl flex items-center justify-center" style={{ width: 44, height: 44, background: 'rgba(108,59,255,0.08)', flexShrink: 0 }}>
                    <PhoneIncoming size={22} color={C.accent} />
                  </div>
                  <span className="font-semibold" style={{ fontSize: '1rem', color: C.text }}>Recibe llamadas</span>
                </div>
                <ul className="flex flex-col gap-3">
                  {INBOUND_BULLETS.map((b) => (
                    <li key={b} className="flex items-start gap-2.5">
                      <Check size={15} color={C.accent} style={{ marginTop: 3, flexShrink: 0 }} />
                      <span className="text-sm leading-relaxed" style={{ color: C.textSub }}>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.1}>
              <div className="rounded-2xl p-8 flex flex-col gap-5 h-full" style={{ background: 'linear-gradient(135deg, #0D0520 0%, #1A0A3B 100%)', border: '1px solid rgba(108,59,255,0.3)' }}>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl flex items-center justify-center" style={{ width: 44, height: 44, background: 'rgba(108,59,255,0.25)', flexShrink: 0 }}>
                    <PhoneOutgoing size={22} color="#C4A8FF" />
                  </div>
                  <span className="font-semibold" style={{ fontSize: '1rem', color: '#fff' }}>También llama</span>
                </div>
                <ul className="flex flex-col gap-3">
                  {OUTBOUND_BULLETS.map((b) => (
                    <li key={b} className="flex items-start gap-2.5">
                      <Check size={15} color="#9B6DFF" style={{ marginTop: 3, flexShrink: 0 }} />
                      <span className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── INDUSTRY SELECTOR ── */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection className="mb-10">
            <h2 className="font-bold text-center" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: C.text }}>
              Elige tu industria
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {INDUSTRIES.map((ind, i) => (
              <AnimatedSection key={ind.href} delay={i * 0.07}>
                <Link
                  href={ind.href}
                  className="group rounded-2xl p-7 flex flex-col gap-4 h-full transition-all hover:shadow-md hover:-translate-y-0.5"
                  style={{ background: '#fff', border: `1px solid ${C.border}` }}
                >
                  <div className="rounded-xl flex items-center justify-center" style={{ width: 52, height: 52, background: 'rgba(108,59,255,0.08)' }}>
                    {ind.icon}
                  </div>
                  <div className="flex-1">
                    <h2 className="font-semibold mb-2" style={{ fontSize: '1rem', color: C.text }}>{ind.label}</h2>
                    <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{ind.desc}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold transition-all group-hover:gap-2.5" style={{ color: C.accent }}>
                    Ver cómo funciona <ArrowRight size={13} />
                  </span>
                </Link>
              </AnimatedSection>
            ))}

            <AnimatedSection delay={INDUSTRIES.length * 0.07}>
              <div
                className="rounded-2xl p-7 flex flex-col gap-4 h-full sm:col-span-2 lg:col-span-1"
                style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}
              >
                <p className="font-bold text-white" style={{ fontSize: '1rem' }}>¿No encuentras tu giro?</p>
                <p className="text-sm leading-relaxed flex-1" style={{ color: 'rgba(255,255,255,0.78)' }}>
                  Tu empleado digital funciona para cualquier organización que reciba o necesite hacer llamadas. Platica con nosotros y lo configuramos a tu medida.
                </p>
                <Link
                  href="/registro"
                  className="inline-flex items-center gap-1.5 text-xs font-bold mt-auto transition-opacity hover:opacity-90"
                  style={{ color: '#fff' }}
                >
                  Hablar con un asesor <ArrowRight size={13} />
                </Link>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      <IndustryFooter />
    </>
  );
}
