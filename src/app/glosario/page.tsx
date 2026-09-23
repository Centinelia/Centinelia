import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Book } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { TERMINOS } from '@/lib/glosario/data';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title:       'Glosario: empleado digital, CFDI, PAC, RFC y más términos citables',
  description: 'Definiciones canónicas de términos usados en Centinelia y en el ecosistema fiscal y tecnológico mexicano: empleado digital, CFDI, PAC, RFC, LFPDPPP, Vapi, ElevenLabs, Anthropic Claude y más.',
  keywords: [
    'glosario empleado digital', 'qué es CFDI', 'qué es PAC', 'qué es RFC',
    'LFPDPPP', 'Vapi ai', 'ElevenLabs', 'Anthropic Claude', 'IMSS', 'aguinaldo',
    'CONTPAQi Comercial', 'timbrado electrónico', 'uso de CFDI',
  ],
  alternates: { canonical: `${BASE_URL}/glosario` },
  openGraph: {
    title:       'Glosario Centinelia | Empleado digital, CFDI, PAC, RFC y más',
    description: 'Definiciones canónicas para conceptos que aparecen en cada conversación de negocio y facturación mexicana.',
    url:         `${BASE_URL}/glosario`,
    images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

const C = {
  bg:      '#FAFBFF',
  bgAlt:   '#F4F0FF',
  surface: '#FFFFFF',
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.55)',
  border:  'rgba(108,59,255,0.12)',
  accent:  '#6C3BFF',
};

export default function GlosarioHub() {
  const dateModified = todayIso();

  const definedTermSetSchema = {
    '@context':   'https://schema.org',
    '@type':      'DefinedTermSet',
    '@id':        `${BASE_URL}/glosario`,
    name:         'Glosario de Centinelia',
    description:  'Definiciones canónicas de términos usados por Centinelia y en el ecosistema fiscal y tecnológico mexicano.',
    url:          `${BASE_URL}/glosario`,
    dateModified,
    hasDefinedTerm: TERMINOS.map(t => ({
      '@type':      'DefinedTerm',
      '@id':        `${BASE_URL}/glosario/${t.slug}`,
      name:         t.termino,
      alternateName: t.siglas ? [t.siglas] : undefined,
      description:  t.definicionCorta,
      url:          `${BASE_URL}/glosario/${t.slug}`,
    })),
  };

  const breadcrumb = breadcrumbSchema([
    { name: 'Inicio',   url: BASE_URL },
    { name: 'Glosario', url: `${BASE_URL}/glosario` },
  ]);

  // Agrupar por categoría
  const porCategoria = TERMINOS.reduce<Record<string, typeof TERMINOS>>((acc, t) => {
    (acc[t.categoria] = acc[t.categoria] ?? []).push(t);
    return acc;
  }, {});

  const orden = ['Producto', 'Fiscal MX', 'Compliance', 'Laboral MX', 'Tecnología'];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSetSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.18) 0%, transparent 60%)' }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative" style={{ paddingTop: 110, paddingBottom: 70, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Glosario
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.8rem)', color: '#fff' }}>
            Definiciones para{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              hablar el mismo idioma
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 620, margin: '0 auto' }}>
            Conceptos del producto, del ecosistema fiscal mexicano y del stack tecnológico. Referencia rápida para dueños de negocio, contadores y equipos técnicos.
          </p>
        </div>
      </section>

      {/* Grid por categoría */}
      <section style={{ background: C.bg, padding: '70px 24px' }}>
        <div className="max-w-5xl mx-auto">
          {orden.filter(cat => porCategoria[cat]?.length).map(categoria => (
            <AnimatedSection key={categoria} className="mb-12">
              <h2 id={categoria.toLowerCase().replace(/\s+/g, '-')} className="font-bold mb-5" style={{ fontSize: 'clamp(1.3rem, 2.4vw, 1.8rem)', color: C.text }}>
                {categoria}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {porCategoria[categoria]?.map((t, i) => (
                  <AnimatedSection key={t.slug} delay={i * 0.04}>
                    <Link
                      href={`/glosario/${t.slug}`}
                      className="block rounded-2xl p-5 h-full transition-all hover:scale-[1.02] hover:shadow-md"
                      style={{ background: '#fff', border: `1px solid ${C.border}` }}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <Book size={16} color={C.accent} className="flex-shrink-0 mt-1" />
                        <div>
                          <p className="font-semibold" style={{ color: C.text, fontSize: '1rem' }}>
                            {t.termino}
                          </p>
                          {t.siglas && (
                            <p style={{ fontSize: '0.75rem', color: C.textSub, marginTop: 2 }}>{t.siglas}</p>
                          )}
                        </div>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: C.textSub, lineHeight: 1.55 }}>
                        {t.definicionCorta.slice(0, 140)}{t.definicionCorta.length > 140 ? '...' : ''}
                      </p>
                    </Link>
                  </AnimatedSection>
                ))}
              </div>
            </AnimatedSection>
          ))}
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
