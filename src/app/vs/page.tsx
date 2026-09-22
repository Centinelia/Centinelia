import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { COMPARISONS } from '@/lib/vs/data';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title:       'Centinelia vs otras plataformas de agentes de voz',
  description: 'Comparaciones honestas entre Centinelia y las principales plataformas de agentes de voz: Bland AI, Retell AI y Vapi. Producto listo para México frente a herramientas para developers en Estados Unidos.',
  keywords: [
    'Centinelia comparación', 'alternativa Bland AI', 'alternativa Retell AI',
    'alternativa Vapi', 'agente de voz México comparativa', 'empleado digital vs voice AI',
  ],
  alternates: { canonical: `${BASE_URL}/vs` },
  openGraph: {
    title:       'Centinelia vs otras plataformas | Comparativas honestas',
    description: 'Comparaciones lado a lado con Bland AI, Retell AI y Vapi para negocios mexicanos.',
    url:         `${BASE_URL}/vs`,
    images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

const C = {
  bg:      '#FAFBFF',
  surface: '#FFFFFF',
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.55)',
  border:  'rgba(108,59,255,0.12)',
  accent:  '#6C3BFF',
};

export default function VsHubPage() {
  return (
    <>
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.18) 0%, transparent 60%)' }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative" style={{ paddingTop: 120, paddingBottom: 80, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Comparativas
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.8rem)', color: '#fff' }}>
            Centinelia frente a las{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              otras plataformas
            </span>
          </h1>
          <p className="mb-4 max-w-2xl mx-auto" style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
            Comparaciones honestas con las principales plataformas de agentes de voz. Cuándo conviene Centinelia y cuándo conviene la otra opción.
          </p>
        </div>
      </section>

      {/* Grid de comparaciones */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {COMPARISONS.map((c, i) => (
              <AnimatedSection key={c.slug} delay={i * 0.06}>
                <Link
                  href={`/vs/${c.slug}`}
                  className="block rounded-2xl p-6 h-full transition-all hover:scale-[1.02] hover:shadow-lg"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(108,59,255,0.10)' }}
                >
                  <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
                    Comparación
                  </p>
                  <h2 className="font-bold mb-3" style={{ color: C.text, fontSize: '1.35rem', lineHeight: 1.25 }}>
                    Centinelia vs {c.competitor}
                  </h2>
                  <p className="text-sm mb-4" style={{ color: C.textSub, lineHeight: 1.6, minHeight: 66 }}>
                    {c.tagline}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.accent }}>
                    Ver comparación <ArrowRight size={12} />
                  </span>
                </Link>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection delay={0.25}>
            <div className="mt-12 rounded-2xl text-center p-8" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
              <h3 className="font-bold mb-3" style={{ color: C.text, fontSize: '1.15rem' }}>
                ¿No ves la plataforma que buscas?
              </h3>
              <p className="text-sm mb-5" style={{ color: C.textSub, maxWidth: 480, margin: '0 auto 20px' }}>
                Escribe a hola@centinelia.mx con la plataforma que estás evaluando y hacemos una comparativa honesta.
              </p>
              <a
                href="mailto:hola@centinelia.mx"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: C.accent, color: '#fff' }}
              >
                Pedir comparativa <ArrowRight size={13} />
              </a>
            </div>
          </AnimatedSection>
        </div>
      </section>

      <IndustryFooter />
    </>
  );
}
