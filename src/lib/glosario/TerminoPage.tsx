import Link from 'next/link';
import { ArrowRight, ArrowLeft, Book, ExternalLink } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';
import type { Termino } from './data';
import { getTerminoBySlug } from './data';

interface Props {
  data: Termino;
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

export default function TerminoPage({ data }: Props) {
  const dateModified = todayIso();
  const canonical    = `${BASE_URL}/glosario/${data.slug}`;

  const definedTermSchema = {
    '@context':    'https://schema.org',
    '@type':       'DefinedTerm',
    '@id':         canonical,
    name:          data.termino,
    alternateName: data.siglas ? [data.siglas] : undefined,
    description:   data.definicionCorta,
    url:           canonical,
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      '@id':   `${BASE_URL}/glosario`,
      name:    'Glosario de Centinelia',
    },
    dateModified,
  };

  const breadcrumb = breadcrumbSchema([
    { name: 'Inicio',     url: BASE_URL },
    { name: 'Glosario',   url: `${BASE_URL}/glosario` },
    { name: data.termino, url: canonical },
  ]);

  const relacionados = data.relacionados
    .map(slug => getTerminoBySlug(slug))
    .filter((t): t is Termino => !!t);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.16) 0%, transparent 60%)' }} />
        <div className="max-w-3xl mx-auto px-6 relative" style={{ paddingTop: 100, paddingBottom: 60, zIndex: 1 }}>
          <Link href="/glosario" className="inline-flex items-center gap-2 text-xs mb-6 transition-opacity hover:opacity-80" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <ArrowLeft size={12} /> Glosario
          </Link>
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {data.categoria}
          </p>
          <h1 className="font-bold leading-tight mb-4" style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', color: '#fff' }}>
            {data.termino}
            {data.siglas && (
              <span className="ml-3" style={{ fontSize: '0.55em', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
                ({data.siglas})
              </span>
            )}
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.72)', lineHeight: 1.7 }}>
            {data.definicionCorta}
          </p>
        </div>
      </section>

      {/* Definición larga */}
      <section style={{ background: C.bg, padding: '60px 24px' }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <h2 id="definicion" className="font-bold mb-6" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', color: C.text }}>
              Definición ampliada
            </h2>
            <div className="space-y-4">
              {data.definicionLarga.map((p, i) => (
                <p key={i} style={{ fontSize: '1rem', color: C.text, lineHeight: 1.75 }}>
                  {p}
                </p>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Ejemplos */}
      {data.ejemplos.length > 0 && (
        <section style={{ background: '#fff', padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
          <div className="max-w-3xl mx-auto">
            <AnimatedSection>
              <h2 id="ejemplos" className="font-bold mb-6" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', color: C.text }}>
                Ejemplos
              </h2>
              <div className="space-y-3">
                {data.ejemplos.map((ex, i) => (
                  <AnimatedSection key={i} delay={i * 0.04}>
                    <div className="rounded-2xl p-5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                      <p style={{ fontSize: '0.95rem', color: C.text, lineHeight: 1.65 }}>
                        {ex}
                      </p>
                    </div>
                  </AnimatedSection>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>
      )}

      {/* Referencias */}
      {data.referencias.length > 0 && (
        <section style={{ background: C.bg, padding: '50px 24px', borderTop: `1px solid ${C.border}` }}>
          <div className="max-w-3xl mx-auto">
            <AnimatedSection>
              <h2 id="referencias" className="font-bold mb-5" style={{ fontSize: 'clamp(1.2rem, 2vw, 1.6rem)', color: C.text }}>
                Referencias oficiales
              </h2>
              <ul className="space-y-2">
                {data.referencias.map(ref => (
                  <li key={ref.url}>
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
                      style={{ color: C.accent, fontSize: '0.95rem' }}
                    >
                      {ref.titulo} <ExternalLink size={12} />
                    </a>
                  </li>
                ))}
              </ul>
            </AnimatedSection>
          </div>
        </section>
      )}

      {/* Términos relacionados */}
      {relacionados.length > 0 && (
        <section style={{ background: '#fff', padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
          <div className="max-w-4xl mx-auto">
            <AnimatedSection>
              <h2 id="relacionados" className="font-bold mb-6" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', color: C.text }}>
                Términos relacionados
              </h2>
            </AnimatedSection>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {relacionados.map((r, i) => (
                <AnimatedSection key={r.slug} delay={i * 0.04}>
                  <Link
                    href={`/glosario/${r.slug}`}
                    className="block rounded-2xl p-5 transition-all hover:scale-[1.02] hover:shadow-md"
                    style={{ background: C.bg, border: `1px solid ${C.border}` }}
                  >
                    <div className="flex items-start gap-3">
                      <Book size={18} color={C.accent} className="flex-shrink-0 mt-1" />
                      <div>
                        <p className="font-semibold mb-1" style={{ color: C.text, fontSize: '0.95rem' }}>
                          {r.termino}
                          {r.siglas && <span className="ml-2" style={{ color: C.textSub, fontWeight: 400 }}>({r.siglas})</span>}
                        </p>
                        <p style={{ fontSize: '0.8rem', color: C.textSub, lineHeight: 1.5 }}>
                          {r.definicionCorta.slice(0, 130)}{r.definicionCorta.length > 130 ? '...' : ''}
                        </p>
                      </div>
                    </div>
                  </Link>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section style={{ background: '#0D0520', padding: '70px 24px' }}>
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color: '#fff' }}>
              Los empleados digitales de Centinelia dominan estos conceptos
            </h2>
            <p className="mb-6" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem' }}>
              Nia contesta el teléfono. Nala timbra CFDIs. Nico cobra. Todo 24/7, sin IMSS ni aguinaldo.
            </p>
            <Link
              href="/empleados"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
            >
              Conoce a los empleados <ArrowRight size={13} />
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
