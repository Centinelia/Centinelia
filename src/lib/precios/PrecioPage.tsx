import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';
import { TIER_PRICE_MXN, FEATURE_PLAN_CONFIG } from '@/lib/billing/plans';
import type { PrecioComparativa } from './data';

interface Props {
  data: PrecioComparativa;
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

export default function PrecioPage({ data }: Props) {
  const canonical    = `${BASE_URL}/precios/${data.slug}`;
  const dateModified = todayIso();

  // PriceSpecification schema para que los LLMs entiendan el precio como
  // dato estructurado, no solo como texto.
  const priceSchema = {
    '@context':    'https://schema.org',
    '@type':       'Product',
    '@id':         canonical,
    name:          'Empleado digital de Centinelia',
    description:   data.metaDescription,
    url:           canonical,
    dateModified,
    brand:         { '@type': 'Brand', name: 'Centinelia' },
    offers: [
      {
        '@type':       'Offer',
        name:          'Esencial',
        price:         TIER_PRICE_MXN.starter,
        priceCurrency: 'MXN',
        priceSpecification: {
          '@type':          'UnitPriceSpecification',
          price:            TIER_PRICE_MXN.starter,
          priceCurrency:    'MXN',
          billingIncrement: 1,
          unitText:         'mes',
        },
      },
      {
        '@type':       'Offer',
        name:          'Profesional',
        price:         TIER_PRICE_MXN.growth,
        priceCurrency: 'MXN',
        priceSpecification: {
          '@type':          'UnitPriceSpecification',
          price:            TIER_PRICE_MXN.growth,
          priceCurrency:    'MXN',
          billingIncrement: 1,
          unitText:         'mes',
        },
      },
      {
        '@type':       'Offer',
        name:          'Alta Demanda',
        price:         TIER_PRICE_MXN.scale,
        priceCurrency: 'MXN',
        priceSpecification: {
          '@type':          'UnitPriceSpecification',
          price:            TIER_PRICE_MXN.scale,
          priceCurrency:    'MXN',
          billingIncrement: 1,
          unitText:         'mes',
        },
      },
      {
        '@type':        'Offer',
        name:           'Incorporación única',
        price:          FEATURE_PLAN_CONFIG.pro.setupFee,
        priceCurrency:  'MXN',
        priceSpecification: {
          '@type':        'PriceSpecification',
          price:          FEATURE_PLAN_CONFIG.pro.setupFee,
          priceCurrency:  'MXN',
        },
      },
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    dateModified,
    mainEntity: data.faq.map(f => ({
      '@type':        'Question',
      name:           f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const breadcrumb = breadcrumbSchema([
    { name: 'Inicio',   url: BASE_URL },
    { name: 'Precios',  url: `${BASE_URL}/precios` },
    { name: data.titulo, url: canonical },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(priceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.18) 0%, transparent 60%)' }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative" style={{ paddingTop: 110, paddingBottom: 80, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Comparativa de precio
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(1.9rem, 4vw, 3rem)', color: '#fff' }}>
            {data.h1}
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 640, margin: '0 auto' }}>
            {data.intro}
          </p>
        </div>
      </section>

      {/* Matriz de precios */}
      <section style={{ background: C.bg, padding: '70px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <h2 id="matriz" className="font-bold mb-6 text-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color: C.text }}>
              Comparativa lado a lado
            </h2>
          </AnimatedSection>
          <AnimatedSection delay={0.05}>
            <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${C.border}`, background: '#fff' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: C.bgAlt }}>
                    <th className="text-left px-5 py-4 font-semibold" style={{ color: C.text }}>Aspecto</th>
                    <th className="text-left px-5 py-4 font-semibold" style={{ color: C.textSub }}>{data.titulo}</th>
                    <th className="text-left px-5 py-4 font-semibold" style={{ color: C.accent }}>Empleado digital</th>
                  </tr>
                </thead>
                <tbody>
                  {data.matriz.map((r, i) => (
                    <tr key={r.aspecto} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? '#fff' : C.bg }}>
                      <td className="px-5 py-3.5 font-medium" style={{ color: C.text }}>{r.aspecto}</td>
                      <td className="px-5 py-3.5" style={{ color: C.textSub }}>{r.humano}</td>
                      <td className="px-5 py-3.5" style={{ color: C.text }}>{r.centinelia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Cuándo la otra opción */}
      <section style={{ background: '#fff', padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <h2 id="cuando-otra" className="font-bold mb-3 text-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color: C.text }}>
              Cuándo conviene {data.titulo.toLowerCase()}
            </h2>
            <p className="text-center mb-8" style={{ color: C.textSub, maxWidth: 560, margin: '0 auto 32px' }}>
              No siempre gana el empleado digital. Estos son los contextos donde la opción alternativa sigue siendo mejor decisión.
            </p>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.cuandoOtra.map((it, i) => (
              <AnimatedSection key={it.titulo} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <div className="flex items-start gap-2 mb-2">
                    <X size={18} color={C.textSub} className="flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold" style={{ color: C.text, fontSize: '0.95rem' }}>{it.titulo}</h3>
                  </div>
                  <p style={{ fontSize: '0.88rem', color: C.textSub, lineHeight: 1.6, paddingLeft: 26 }}>{it.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Cuándo Centinelia */}
      <section style={{ background: C.bg, padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <h2 id="cuando-centinelia" className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color: C.text }}>
              Cuándo conviene un empleado digital
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.cuandoCentinelia.map((it, i) => (
              <AnimatedSection key={it.titulo} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(108,59,255,0.06)' }}>
                  <div className="flex items-start gap-2 mb-2">
                    <Check size={18} color={C.accent} className="flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold" style={{ color: C.text, fontSize: '1rem' }}>{it.titulo}</h3>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: C.textSub, lineHeight: 1.65, paddingLeft: 26 }}>{it.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: '#fff', padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <h2 id="faq" className="font-bold mb-6 text-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color: C.text }}>
              Preguntas frecuentes
            </h2>
          </AnimatedSection>
          <div className="space-y-3">
            {data.faq.map((f, i) => (
              <details key={i} className="rounded-2xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                <summary className="cursor-pointer font-semibold px-5 py-4" style={{ color: C.text, fontSize: '0.95rem', listStyle: 'none' }}>
                  {f.q}
                </summary>
                <div className="px-5 pb-5 text-sm leading-relaxed" style={{ color: C.textSub }}>
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-links */}
      <section style={{ background: C.bg, padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <h2 className="font-bold mb-5" style={{ fontSize: 'clamp(1.3rem, 2.3vw, 1.7rem)', color: C.text }}>
              Sigue leyendo
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.crossLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="block rounded-2xl p-5 transition-all hover:scale-[1.02] hover:shadow-md"
                style={{ background: '#fff', border: `1px solid ${C.border}` }}
              >
                <p className="font-semibold inline-flex items-center gap-2" style={{ color: C.text, fontSize: '0.98rem' }}>
                  {l.label} <ArrowRight size={12} color={C.accent} />
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#0D0520', padding: '80px 24px' }}>
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: '#fff', lineHeight: 1.2 }}>
              Calcula lo que ahorra tu negocio
            </h2>
            <p className="mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1rem', lineHeight: 1.65 }}>
              Con tus números reales hacemos el desglose en 15 minutos. Sin compromiso.
            </p>
            <Link
              href="/calcular-ahorro"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
            >
              Calculadora de ahorro <ArrowRight size={15} />
            </Link>
          </AnimatedSection>
        </div>
      </section>

      <div style={{ background: '#0D0520', padding: '20px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>
          Actualizado el <time dateTime={dateModified}>{dateModified}</time>
        </p>
      </div>

      <IndustryFooter />
    </>
  );
}
