import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check, Phone } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { FEATURE_PLAN_CONFIG, TIER_PRICE_MXN } from '@/lib/billing/plans';
import type { Meerkat } from './data';
import { MEERKATS } from './data';

interface Props {
  data: Meerkat;
}

const C = {
  bg:      '#FAFBFF',
  bgAlt:   '#F4F0FF',
  surface: '#FFFFFF',
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.55)',
  border:  'rgba(108,59,255,0.12)',
  accent:  '#6C3BFF',
};

export default function MeerkatPage({ data }: Props) {
  const productSchema = {
    '@context': 'https://schema.org',
    '@type':    'Product',
    name:       `${data.nombre}, ${data.rol}`,
    image:      `https://www.centinelia.mx${data.image}`,
    description: data.descLarga,
    brand:      { '@type': 'Brand', name: 'Centinelia' },
    category:   'BusinessApplication',
    offers: [
      { '@type': 'Offer', name: `${data.rol} - Esencial`,     price: TIER_PRICE_MXN.starter, priceCurrency: 'MXN', description: 'Plan mensual, sin contratos.' },
      { '@type': 'Offer', name: `${data.rol} - Profesional`,  price: TIER_PRICE_MXN.growth,  priceCurrency: 'MXN', description: 'Plan mensual, sin contratos.' },
      { '@type': 'Offer', name: `${data.rol} - Alta Demanda`, price: TIER_PRICE_MXN.scale,   priceCurrency: 'MXN', description: 'Plan mensual, sin contratos.' },
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    mainEntity: data.faq.map(f => ({
      '@type':        'Question',
      name:           f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const relacionados = MEERKATS.filter(m => m.slug !== data.slug).slice(0, 4);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at top left, ${data.color}22 0%, transparent 60%)` }} />
        <div className="max-w-6xl mx-auto px-6 relative grid grid-cols-1 md:grid-cols-2 gap-8 items-center" style={{ paddingTop: 110, paddingBottom: 90, zIndex: 1 }}>
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {data.categoria === 'direccion' ? 'Dirección digital' : 'Empleado digital'}
            </p>
            <h1 className="font-bold leading-tight mb-3" style={{ fontSize: 'clamp(2.4rem, 5vw, 4rem)', color: '#fff' }}>
              {data.nombre},{' '}
              <span style={{ background: `linear-gradient(135deg, ${data.color}, #C4A8FF)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {data.rol.toLowerCase()}
              </span>
            </h1>
            <p className="mb-5 italic" style={{ color: 'rgba(255,255,255,0.55)', fontSize: '1rem' }}>
              {data.tagline}
            </p>
            <p className="mb-8 max-w-xl" style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.7 }}>
              {data.descCorta}
            </p>
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <Link
                href="/registro"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${data.color}, #9B6DFF)`, color: '#fff' }}
              >
                Contratar a {data.nombre} <ArrowRight size={15} />
              </Link>
              <a
                href="tel:+528116333559"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <Phone size={14} /> Hablar con un asesor
              </a>
            </div>
          </div>
          <div className="hidden md:block relative" style={{ height: 380 }}>
            <Image
              src={data.image}
              alt={`${data.nombre}, ${data.rol}`}
              fill
              priority
              quality={90}
              sizes="(max-width: 768px) 100vw, 400px"
              style={{ objectFit: 'contain', objectPosition: 'bottom center' }}
            />
          </div>
        </div>
      </section>

      {/* Intro larga */}
      <section style={{ background: C.bg, padding: '60px 24px' }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <p style={{ fontSize: '1.1rem', color: C.text, lineHeight: 1.75 }}>
              {data.descLarga}
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Capacidades */}
      <section style={{ background: '#fff', padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: data.color }}>
              Qué hace
            </p>
            <h2 className="font-bold mb-8" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Capacidades de {data.nombre}
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.capacidades.map((cap, i) => (
              <AnimatedSection key={cap} delay={i * 0.04}>
                <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <Check size={18} color={data.color} className="flex-shrink-0 mt-0.5" />
                  <p className="text-sm" style={{ color: C.text, lineHeight: 1.55 }}>{cap}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Casos de uso */}
      <section style={{ background: C.bg, padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: data.color }}>
              En qué la usan
            </p>
            <h2 className="font-bold mb-8" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Casos de uso reales
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.casosUso.map((c, i) => (
              <AnimatedSection key={c.titulo} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(108,59,255,0.06)' }}>
                  <h3 className="font-semibold mb-2" style={{ color: C.text, fontSize: '0.98rem' }}>{c.titulo}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{c.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Herramientas */}
      <section style={{ background: '#fff', padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: data.color }}>
              Herramientas
            </p>
            <h2 className="font-bold mb-8" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Con qué trabaja {data.nombre}
            </h2>
          </AnimatedSection>
          <div className="flex flex-wrap gap-3">
            {data.herramientas.map((h, i) => (
              <AnimatedSection key={h} delay={i * 0.03}>
                <span className="inline-block px-4 py-2 rounded-full text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }}>
                  {h}
                </span>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* vs humano */}
      <section style={{ background: C.bg, padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <h2 className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Por qué {data.nombre} y no un {data.rol.toLowerCase()} humano
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.vsHumano.map((v, i) => (
              <AnimatedSection key={v.titulo} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                  <div className="flex items-start gap-3 mb-2">
                    <Check size={20} color={data.color} className="flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold" style={{ color: C.text, fontSize: '1rem' }}>{v.titulo}</h3>
                  </div>
                  <p className="text-sm leading-relaxed pl-8" style={{ color: C.textSub }}>{v.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: '#fff', padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <h2 className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Preguntas frecuentes sobre {data.nombre}
            </h2>
          </AnimatedSection>
          <div className="space-y-3">
            {data.faq.map((f, i) => (
              <AnimatedSection key={f.q} delay={i * 0.04}>
                <details className="rounded-2xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <summary className="cursor-pointer font-semibold px-5 py-4" style={{ color: C.text, fontSize: '0.95rem', listStyle: 'none' }}>
                    {f.q}
                  </summary>
                  <div className="px-5 pb-5 text-sm leading-relaxed" style={{ color: C.textSub }}>
                    {f.a}
                  </div>
                </details>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Precios summary + Otros empleados */}
      <section style={{ background: C.bg, padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <div className="rounded-2xl p-8 mb-10 text-center" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
              <h3 className="font-bold mb-3" style={{ color: C.text, fontSize: '1.3rem' }}>
                Precios de {data.nombre}
              </h3>
              <p className="text-sm mb-5" style={{ color: C.textSub, maxWidth: 520, margin: '0 auto 16px' }}>
                Tres tiers: Esencial ${TIER_PRICE_MXN.starter.toLocaleString('es-MX')} MXN, Profesional ${TIER_PRICE_MXN.growth.toLocaleString('es-MX')} MXN, Alta Demanda ${TIER_PRICE_MXN.scale.toLocaleString('es-MX')} MXN, todos mensuales más IVA. Incorporación única de ${FEATURE_PLAN_CONFIG.pro.setupFee.toLocaleString('es-MX')} MXN.
              </p>
              <Link
                href="/#pricing"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: C.accent, color: '#fff' }}
              >
                Ver planes completos <ArrowRight size={13} />
              </Link>
            </div>
          </AnimatedSection>

          <AnimatedSection>
            <h3 className="font-semibold mb-5 text-center" style={{ color: C.text, fontSize: '1.05rem' }}>
              Otros empleados digitales
            </h3>
          </AnimatedSection>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {relacionados.map(m => (
              <Link
                key={m.slug}
                href={`/empleados/${m.slug}`}
                className="block rounded-2xl p-4 text-center transition-all hover:scale-[1.03] hover:shadow-md"
                style={{ background: '#fff', border: `1px solid ${C.border}` }}
              >
                <div className="relative mx-auto mb-2" style={{ width: 68, height: 68 }}>
                  <Image src={m.image} alt={m.nombre} fill sizes="68px" style={{ objectFit: 'contain' }} />
                </div>
                <p className="text-xs font-bold" style={{ color: m.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {m.rol}
                </p>
                <p className="font-bold" style={{ color: C.text, fontSize: '0.95rem' }}>{m.nombre}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section style={{ background: '#0D0520', padding: '90px 24px' }}>
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="font-bold mb-6" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', lineHeight: 1.2 }}>
              Incorpora a {data.nombre} a tu equipo
            </h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem' }}>
              Activa en menos de 24 horas. Sin contratos de permanencia.
            </p>
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg, ${data.color}, #9B6DFF)`, color: '#fff' }}
            >
              Contratar a {data.nombre} <ArrowRight size={15} />
            </Link>
          </AnimatedSection>
        </div>
      </section>

      <IndustryFooter />
    </>
  );
}
