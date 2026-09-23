import Link from 'next/link';
import { ArrowRight, Check, Phone } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';
import type { CompetitorComparison } from './data';

interface Props {
  data: CompetitorComparison;
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

export default function ComparisonPage({ data }: Props) {
  const dateModified = todayIso();
  const canonical    = `${BASE_URL}/vs/${data.slug}`;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    dateModified,
    mainEntity: data.faq.map(f => ({
      '@type':          'Question',
      name:             f.q,
      acceptedAnswer:   { '@type': 'Answer', text: f.a },
    })),
  };

  const breadcrumb = breadcrumbSchema([
    { name: 'Inicio',        url: BASE_URL },
    { name: 'Comparaciones', url: `${BASE_URL}/vs` },
    { name: `Centinelia vs ${data.competitor}`, url: canonical },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.18) 0%, transparent 60%)' }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative" style={{ paddingTop: 120, paddingBottom: 90, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Comparación
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.8rem)', color: '#fff' }}>
            Centinelia vs{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {data.competitor}
            </span>
          </h1>
          <p className="mb-8 max-w-2xl mx-auto" style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
            {data.tagline}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
            >
              Contratar Centinelia <ArrowRight size={15} />
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
      </section>

      {/* Intro */}
      <section style={{ background: C.bg, padding: '70px 24px' }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <p style={{ fontSize: '1.05rem', color: C.text, lineHeight: 1.75 }}>
              {data.intro}
            </p>
            <p className="mt-6 text-sm" style={{ color: C.textSub }}>
              {data.competitor} es una plataforma de {data.origin}. Sitio oficial:{' '}
              <a href={data.competitorUrl} target="_blank" rel="noopener noreferrer nofollow"
                 style={{ color: C.accent, textDecoration: 'underline' }}>
                {data.competitorUrl.replace(/^https?:\/\//, '')}
              </a>.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Matriz comparativa */}
      <section style={{ background: '#fff', padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <h2 id="comparacion" className="font-bold mb-6 text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Comparación lado a lado
            </h2>
          </AnimatedSection>
          <AnimatedSection delay={0.05}>
            <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${C.border}` }}>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: C.bgAlt }}>
                    <th className="text-left px-5 py-4 font-semibold" style={{ color: C.text }}>Aspecto</th>
                    <th className="text-left px-5 py-4 font-semibold" style={{ color: C.accent }}>Centinelia</th>
                    <th className="text-left px-5 py-4 font-semibold" style={{ color: C.textSub }}>{data.competitor}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.matrix.map((row, i) => (
                    <tr key={row.aspect} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? '#fff' : C.bg }}>
                      <td className="px-5 py-3.5 font-medium" style={{ color: C.text }}>{row.aspect}</td>
                      <td className="px-5 py-3.5" style={{ color: C.text }}>{row.centinelia}</td>
                      <td className="px-5 py-3.5" style={{ color: C.textSub }}>{row.competitor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Cuándo elegir Centinelia */}
      <section style={{ background: C.bg, padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <h2 id="cuando-elegir-centinelia" className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Cuándo elegir Centinelia
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.whyCentinelia.map((item, i) => (
              <AnimatedSection key={item.title} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(108,59,255,0.08)' }}>
                  <div className="flex items-start gap-3 mb-2">
                    <Check size={20} color={C.accent} className="flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold" style={{ color: C.text, fontSize: '1rem' }}>{item.title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed pl-8" style={{ color: C.textSub }}>{item.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Cuándo elegir competidor (honestidad) */}
      <section style={{ background: '#fff', padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <h2 id="cuando-elegir-competidor" className="font-bold mb-3 text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Cuándo elegir {data.competitor}
            </h2>
            <p className="text-center mb-8" style={{ color: C.textSub, maxWidth: 560, margin: '0 auto 32px' }}>
              No todo negocio necesita lo mismo. Estos son los casos donde {data.competitor} puede ser mejor opción que Centinelia.
            </p>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.whyCompetitor.map((item, i) => (
              <AnimatedSection key={item.title} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <h3 className="font-semibold mb-2" style={{ color: C.text, fontSize: '0.95rem' }}>{item.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{item.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: C.bg, padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <h2 id="faq" className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Preguntas frecuentes
            </h2>
          </AnimatedSection>
          <div className="space-y-4">
            {data.faq.map((f, i) => (
              <AnimatedSection key={f.q} delay={i * 0.04}>
                <details className="rounded-2xl" style={{ background: '#fff', border: `1px solid ${C.border}`, padding: '0' }}>
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

      {/* CTA final */}
      <section style={{ background: '#0D0520', padding: '90px 24px' }}>
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="font-bold mb-6" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', lineHeight: 1.2 }}>
              Contrata tu primer empleado digital
            </h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem' }}>
              Activo en menos de 24 horas. Sin contratos de permanencia. Sin desarrolladores.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/registro"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
              >
                Contratar ahora <ArrowRight size={15} />
              </Link>
              <Link
                href="/vs"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                Ver otras comparaciones
              </Link>
            </div>
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
