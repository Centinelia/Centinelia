import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Target } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { SOLUCIONES } from '@/lib/soluciones/data';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title:       'Soluciones: perder llamadas, no contratar más, atender 24/7',
  description: 'Segmentado por el dolor operativo, no por industria. Cómo resolver el problema real de tu negocio con empleados digitales de Centinelia.',
  keywords: [
    'soluciones empleado digital', 'perder llamadas solución',
    'crecer sin contratar', 'atender clientes 24/7',
    'automatización operativa dolor',
  ],
  alternates: { canonical: `${BASE_URL}/soluciones` },
  openGraph: {
    title:       'Soluciones Centinelia | Automatización por dolor operativo',
    description: 'Perder llamadas, no querer contratar más, atender fuera de horario: soluciones cerradas por dolor.',
    url:         `${BASE_URL}/soluciones`,
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

export default function SolucionesHub() {
  const dateModified = todayIso();

  const breadcrumb = breadcrumbSchema([
    { name: 'Inicio',     url: BASE_URL },
    { name: 'Soluciones', url: `${BASE_URL}/soluciones` },
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
            Soluciones
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)', color: '#fff' }}>
            ¿Cuál es tu dolor operativo?
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 640, margin: '0 auto' }}>
            Cada solución responde a una razón concreta por la que un negocio llega a Centinelia. Elige la que suena a la tuya.
          </p>
        </div>
      </section>

      {/* Grid */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {SOLUCIONES.map((s, i) => (
              <AnimatedSection key={s.slug} delay={i * 0.06}>
                <Link
                  href={`/soluciones/${s.slug}`}
                  className="block rounded-2xl p-6 h-full transition-all hover:scale-[1.02] hover:shadow-md"
                  style={{ background: '#fff', border: `1px solid ${C.border}` }}
                >
                  <div className="inline-flex items-center justify-center rounded-xl mb-4" style={{ width: 44, height: 44, background: `${C.accent}18` }}>
                    <Target size={22} color={C.accent} />
                  </div>
                  <h2 className="font-bold mb-2" style={{ color: C.text, fontSize: '1.2rem', lineHeight: 1.25 }}>
                    {s.titulo}
                  </h2>
                  <p style={{ fontSize: '0.9rem', color: C.textSub, lineHeight: 1.6, minHeight: 70 }}>
                    {s.hero.slice(0, 160)}{s.hero.length > 160 ? '...' : ''}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold mt-4" style={{ color: C.accent }}>
                    Ver cómo resolverlo <ArrowRight size={12} />
                  </span>
                </Link>
              </AnimatedSection>
            ))}
          </div>
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
