import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check, Phone } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { MEERKATS } from '@/lib/meerkats/data';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';
import type { Industry } from './data';

interface Props {
  data: Industry;
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

export default function IndustryPage({ data }: Props) {
  const Icon         = data.icon;
  const dateModified = todayIso();
  const canonical    = `${BASE_URL}/industrias/${data.slug}`;

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
    { name: 'Inicio',      url: BASE_URL },
    { name: 'Industrias',  url: `${BASE_URL}/industrias` },
    { name: data.titulo,   url: canonical },
  ]);

  const meerkats = MEERKATS.filter(m => data.meerkatsRelevantes.includes(m.slug));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at top, ${data.color}22 0%, transparent 60%)` }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative" style={{ paddingTop: 120, paddingBottom: 90, zIndex: 1 }}>
          <div className="inline-flex items-center justify-center rounded-2xl mb-5" style={{ width: 60, height: 60, background: `${data.color}22`, border: `1px solid ${data.color}44` }}>
            <Icon size={28} color={data.color} />
          </div>
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Centinelia para {data.categoria.toLowerCase()}
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', color: '#fff' }}>
            {data.heroHeadline}{' '}
            <span style={{ background: `linear-gradient(135deg, ${data.color}, #C4A8FF)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {data.heroHighlight}
            </span>
          </h1>
          <p className="mb-8 max-w-2xl mx-auto" style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
            {data.heroSub}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg, ${data.color}, #9B6DFF)`, color: '#fff' }}
            >
              Contratar mi empleado <ArrowRight size={15} />
            </Link>
            <a
              href="tel:+528116333559"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-medium"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <Phone size={14} /> Habla con un asesor
            </a>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section style={{ background: C.bg, padding: '60px 24px' }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <p style={{ fontSize: '1.08rem', color: C.text, lineHeight: 1.75 }}>
              {data.intro}
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Problemas */}
      <section style={{ background: '#fff', padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: data.color }}>
              El problema
            </p>
            <h2 id="problemas" className="font-bold mb-8" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text, maxWidth: 640 }}>
              Cada llamada perdida es un cliente que se va con la competencia
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.problemas.map((p, i) => (
              <AnimatedSection key={p.titulo} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <h3 className="font-semibold mb-2" style={{ color: C.text, fontSize: '0.98rem' }}>{p.titulo}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{p.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ background: C.bg, padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: data.color }}>
              Qué hace
            </p>
            <h2 id="capacidades" className="font-bold mb-8" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Capacidades específicas para {data.categoria.toLowerCase()}
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.features.map((f, i) => (
              <AnimatedSection key={f} delay={i * 0.04}>
                <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                  <Check size={18} color={data.color} className="flex-shrink-0 mt-0.5" />
                  <p className="text-sm" style={{ color: C.text, lineHeight: 1.55 }}>{f}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Outbound cases */}
      <section style={{ background: '#fff', padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: data.color }}>
              Llamadas salientes
            </p>
            <h2 id="salientes" className="font-bold mb-8" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              También llama, no solo contesta
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.outboundCases.map((c, i) => (
              <AnimatedSection key={c.titulo} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <h3 className="font-semibold mb-2" style={{ color: C.text, fontSize: '0.98rem' }}>{c.titulo}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{c.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Meerkats relevantes */}
      {meerkats.length > 0 && (
        <section style={{ background: C.bg, padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
          <div className="max-w-5xl mx-auto">
            <AnimatedSection>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3 text-center" style={{ color: data.color }}>
                Empleados digitales recomendados
              </p>
              <h2 id="equipo-recomendado" className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
                Este equipo cubre {data.categoria.toLowerCase()}
              </h2>
            </AnimatedSection>
            <div className={`grid grid-cols-${Math.min(meerkats.length, 3)} md:grid-cols-${meerkats.length} gap-4 max-w-3xl mx-auto`}>
              {meerkats.map((m, i) => (
                <AnimatedSection key={m.slug} delay={i * 0.06}>
                  <Link
                    href={`/empleados/${m.slug}`}
                    className="block rounded-2xl p-5 text-center transition-all hover:scale-[1.03] hover:shadow-md"
                    style={{ background: '#fff', border: `1px solid ${C.border}` }}
                  >
                    <div className="relative mx-auto mb-3" style={{ width: 90, height: 90 }}>
                      <Image src={m.image} alt={m.nombre} fill sizes="90px" style={{ objectFit: 'contain' }} />
                    </div>
                    <p className="text-xs font-bold mb-1" style={{ color: m.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {m.rol}
                    </p>
                    <p className="font-bold mb-1" style={{ color: C.text, fontSize: '1.05rem' }}>{m.nombre}</p>
                    <p className="text-xs" style={{ color: C.textSub, lineHeight: 1.4 }}>{m.tagline}</p>
                  </Link>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section style={{ background: '#fff', padding: '70px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <h2 id="faq" className="font-bold mb-8 text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
              Preguntas frecuentes
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

      {/* CTA final */}
      <section style={{ background: '#0D0520', padding: '90px 24px' }}>
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="font-bold mb-6" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', lineHeight: 1.2 }}>
              Incorpora tu primer empleado digital
            </h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem' }}>
              Activo en menos de 24 horas. Sin contratos de permanencia.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/registro"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${data.color}, #9B6DFF)`, color: '#fff' }}
              >
                Contratar ahora <ArrowRight size={15} />
              </Link>
              <Link
                href="/industrias"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                Ver otras industrias
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
