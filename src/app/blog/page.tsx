import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { postsSortedByDate } from '@/lib/blog/registry';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title:       'Blog: guías prácticas de automatización operativa para PyMEs mexicanas',
  description: 'Guías por industria, comparativas de costos y diagnósticos para dueños de PyMEs mexicanas evaluando automatizar recepción, ventas, facturación o cobranza.',
  keywords: [
    'blog automatización PyME', 'guías empleado digital',
    'automatizar recepción restaurante clínica', 'costo recepcionista México',
    'facturación CFDI automatizada', 'cobranza automatizada',
  ],
  alternates: {
    canonical: `${BASE_URL}/blog`,
    types:     { 'application/rss+xml': `${BASE_URL}/rss.xml` },
  },
  openGraph: {
    title:       'Blog Centinelia | Guías prácticas de automatización operativa',
    description: 'Contenido educativo para dueños de PyMEs mexicanas: cuándo automatizar, cuánto cuesta, cómo empezar.',
    url:         `${BASE_URL}/blog`,
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

const CATEGORIAS_ORDEN = ['Industria', 'Operaciones', 'Costos', 'Diagnóstico'] as const;

export default function BlogHub() {
  const posts = postsSortedByDate();
  const dateModified = todayIso();

  const breadcrumb = breadcrumbSchema([
    { name: 'Inicio', url: BASE_URL },
    { name: 'Blog',   url: `${BASE_URL}/blog` },
  ]);

  const blogSchema = {
    '@context':   'https://schema.org',
    '@type':      'Blog',
    '@id':        `${BASE_URL}/blog`,
    name:         'Blog Centinelia',
    description:  'Guías prácticas de automatización operativa para PyMEs mexicanas.',
    url:          `${BASE_URL}/blog`,
    dateModified,
    blogPost: posts.map(p => ({
      '@type':         'BlogPosting',
      '@id':           `${BASE_URL}/blog/${p.slug}`,
      headline:        p.titulo,
      description:     p.metaDescription,
      url:             `${BASE_URL}/blog/${p.slug}`,
      author:          { '@type': 'Organization', name: p.autor },
      datePublished:   p.datePublished,
      articleSection:  p.categoria,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.18) 0%, transparent 60%)' }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative" style={{ paddingTop: 110, paddingBottom: 70, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Blog
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.8rem)', color: '#fff' }}>
            Guías prácticas de{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              automatización operativa
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 640, margin: '0 auto' }}>
            Contenido para dueños de PyMEs mexicanas evaluando automatizar recepción, ventas, facturación o cobranza. Con datos concretos y sin humo.
          </p>
        </div>
      </section>

      {/* Grid por categoría */}
      <section style={{ background: C.bg, padding: '70px 24px' }}>
        <div className="max-w-6xl mx-auto">
          {CATEGORIAS_ORDEN.map(categoria => {
            const postsCat = posts.filter(p => p.categoria === categoria);
            if (postsCat.length === 0) return null;
            return (
              <AnimatedSection key={categoria} className="mb-12">
                <h2 id={categoria.toLowerCase().replace(/\s+/g, '-')} className="font-bold mb-5" style={{ fontSize: 'clamp(1.3rem, 2.4vw, 1.8rem)', color: C.text }}>
                  {categoria}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {postsCat.map((p, i) => (
                    <AnimatedSection key={p.slug} delay={i * 0.05}>
                      <Link
                        href={`/blog/${p.slug}`}
                        className="block rounded-2xl p-6 h-full transition-all hover:scale-[1.02] hover:shadow-md"
                        style={{ background: '#fff', border: `1px solid ${C.border}` }}
                      >
                        <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
                          {p.categoria}
                        </p>
                        <h3 className="font-bold mb-2" style={{ color: C.text, fontSize: '1.05rem', lineHeight: 1.35 }}>
                          {p.titulo}
                        </h3>
                        <p style={{ fontSize: '0.88rem', color: C.textSub, lineHeight: 1.6, marginBottom: 12 }}>
                          {p.subtitulo}
                        </p>
                        <div className="flex items-center gap-4 text-xs" style={{ color: C.textSub }}>
                          <span className="inline-flex items-center gap-1"><Clock size={11} /> {p.readingTime} min</span>
                          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: C.accent }}>
                            Leer <ArrowRight size={11} />
                          </span>
                        </div>
                      </Link>
                    </AnimatedSection>
                  ))}
                </div>
              </AnimatedSection>
            );
          })}
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
