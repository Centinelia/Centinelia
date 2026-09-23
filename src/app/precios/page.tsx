import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BarChart3 } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { PRECIOS } from '@/lib/precios/data';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title:       'Precios: comparativas cerradas con recepcionista, call center y chatbot',
  description: 'Cálculo real de costos 2026 en México. Empleado digital vs recepcionista humana, call center outsourced y chatbot tradicional. Con matrices lado a lado y desglose por concepto.',
  keywords: [
    'precios recepcionista virtual México', 'comparativa empleado digital costo',
    'costo call center México 2026', 'precio chatbot vs empleado digital',
    'automatización operativa precio', 'ahorro recepcionista IA',
  ],
  alternates: { canonical: `${BASE_URL}/precios` },
  openGraph: {
    title:       'Precios Centinelia | Comparativas cerradas con las alternativas',
    description: 'Costo integrado real: humana, call center, chatbot vs empleado digital. Cifras 2026 en pesos.',
    url:         `${BASE_URL}/precios`,
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

export default function PreciosHub() {
  const dateModified = todayIso();

  const breadcrumb = breadcrumbSchema([
    { name: 'Inicio',  url: BASE_URL },
    { name: 'Precios', url: `${BASE_URL}/precios` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.18) 0%, transparent 60%)' }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative" style={{ paddingTop: 110, paddingBottom: 70, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Precios y comparativas
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)', color: '#fff' }}>
            Cifras 2026 en pesos, sin trucos
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 640, margin: '0 auto' }}>
            Comparativas cerradas contra las tres alternativas más comunes: contratar humano, outsourcing y chatbot.
          </p>
        </div>
      </section>

      {/* Grid de comparativas */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PRECIOS.map((p, i) => (
              <AnimatedSection key={p.slug} delay={i * 0.06}>
                <Link
                  href={`/precios/${p.slug}`}
                  className="block rounded-2xl p-6 h-full transition-all hover:scale-[1.02] hover:shadow-md"
                  style={{ background: '#fff', border: `1px solid ${C.border}` }}
                >
                  <div className="inline-flex items-center justify-center rounded-xl mb-4" style={{ width: 44, height: 44, background: `${C.accent}18` }}>
                    <BarChart3 size={22} color={C.accent} />
                  </div>
                  <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: C.accent }}>
                    vs
                  </p>
                  <h2 className="font-bold mb-2" style={{ color: C.text, fontSize: '1.15rem', lineHeight: 1.3 }}>
                    {p.titulo}
                  </h2>
                  <p style={{ fontSize: '0.88rem', color: C.textSub, lineHeight: 1.6 }}>
                    {p.intro}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold mt-4" style={{ color: C.accent }}>
                    Ver comparativa <ArrowRight size={12} />
                  </span>
                </Link>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection delay={0.3}>
            <div className="mt-12 rounded-2xl text-center p-8" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
              <h3 className="font-bold mb-3" style={{ color: C.text, fontSize: '1.15rem' }}>
                Calcula el ahorro con tus números
              </h3>
              <p style={{ fontSize: '0.9rem', color: C.textSub, maxWidth: 480, margin: '0 auto 20px' }}>
                Con llamadas al mes, ticket promedio y sueldos actuales sacamos tu ROI estimado en minutos.
              </p>
              <Link
                href="/calcular-ahorro"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: C.accent, color: '#fff' }}
              >
                Ir a la calculadora <ArrowRight size={13} />
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
