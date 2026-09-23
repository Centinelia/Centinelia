import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check, AlertCircle } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';
import { MEERKATS } from '@/lib/meerkats/data';
import type { Solucion } from './data';

interface Props {
  data: Solucion;
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

export default function SolucionPage({ data }: Props) {
  const canonical    = `${BASE_URL}/soluciones/${data.slug}`;
  const dateModified = todayIso();

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
    { name: 'Inicio',     url: BASE_URL },
    { name: 'Soluciones', url: `${BASE_URL}/soluciones` },
    { name: data.titulo,  url: canonical },
  ]);

  const meerkats = MEERKATS.filter(m => data.meerkats.includes(m.slug));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.18) 0%, transparent 60%)' }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative" style={{ paddingTop: 110, paddingBottom: 80, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Solución
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.9rem)', color: '#fff' }}>
            {data.h1}
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.72)', lineHeight: 1.7, maxWidth: 720, margin: '0 auto' }}>
            {data.hero}
          </p>
        </div>
      </section>

      {/* Síntomas */}
      <section style={{ background: C.bg, padding: '70px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <h2 id="sintomas" className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color: C.text }}>
              Cómo se ve el problema
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.sintomas.map((s, i) => (
              <AnimatedSection key={s.titulo} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                  <div className="flex items-start gap-3 mb-2">
                    <AlertCircle size={20} color="#ef4444" className="flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold" style={{ color: C.text, fontSize: '1rem' }}>{s.titulo}</h3>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: C.textSub, paddingLeft: 30 }}>{s.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Respuesta corta */}
      <section style={{ background: '#fff', padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              La respuesta
            </p>
            <p style={{ fontSize: 'clamp(1.1rem, 2vw, 1.35rem)', color: C.text, lineHeight: 1.65, fontWeight: 500 }}>
              {data.respuesta}
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Cómo resolvemos */}
      <section style={{ background: C.bg, padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <h2 id="como-resolvemos" className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color: C.text }}>
              Cómo lo resolvemos
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.comoResolvemos.map((item, i) => (
              <AnimatedSection key={item.titulo} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(108,59,255,0.06)' }}>
                  <div className="flex items-start gap-3 mb-2">
                    <Check size={20} color={C.accent} className="flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold" style={{ color: C.text, fontSize: '1rem' }}>{item.titulo}</h3>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: C.textSub, paddingLeft: 30 }}>{item.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Meerkats */}
      {meerkats.length > 0 && (
        <section style={{ background: '#fff', padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
          <div className="max-w-5xl mx-auto">
            <AnimatedSection>
              <p className="text-xs font-bold tracking-widest uppercase mb-3 text-center" style={{ color: C.accent }}>
                Empleados digitales que lo resuelven
              </p>
              <h2 id="equipo" className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 1.9rem)', color: C.text }}>
                Este equipo se encarga
              </h2>
            </AnimatedSection>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
              {meerkats.map((m, i) => (
                <AnimatedSection key={m.slug} delay={i * 0.06}>
                  <Link
                    href={`/empleados/${m.slug}`}
                    className="block rounded-2xl p-5 text-center transition-all hover:scale-[1.03] hover:shadow-md"
                    style={{ background: C.bg, border: `1px solid ${C.border}` }}
                  >
                    <div className="relative mx-auto mb-2" style={{ width: 68, height: 68 }}>
                      <Image src={m.image} alt={m.nombre} fill sizes="68px" style={{ objectFit: 'contain' }} />
                    </div>
                    <p className="text-xs font-bold" style={{ color: m.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {m.rol}
                    </p>
                    <p className="font-bold" style={{ color: C.text, fontSize: '0.95rem' }}>{m.nombre}</p>
                  </Link>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section style={{ background: C.bg, padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <h2 id="faq" className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color: C.text }}>
              Preguntas frecuentes
            </h2>
          </AnimatedSection>
          <div className="space-y-3">
            {data.faq.map((f, i) => (
              <details key={i} className="rounded-2xl" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
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
      <section style={{ background: '#fff', padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
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
                style={{ background: C.bg, border: `1px solid ${C.border}` }}
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
              Empieza esta semana
            </h2>
            <p className="mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1rem', lineHeight: 1.65 }}>
              Sin permanencia. Activo en menos de 24 horas. Si en 2 meses no ves resultado, cancelas.
            </p>
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
            >
              Contratar mi primer empleado digital <ArrowRight size={15} />
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
