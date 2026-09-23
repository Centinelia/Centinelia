import type { Metadata } from 'next';
import LandingNav      from '@/app/LandingNav';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import CalculadoraForm from './CalculadoraForm';
import { BASE_URL, breadcrumbSchema, todayIso } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title:       'Calculadora de ahorro: cuánto rinde un empleado digital para tu negocio',
  description: 'Calcula en 2 minutos cuánto ahorra tu negocio al automatizar recepción con un empleado digital. Con llamadas al mes, ticket, sueldos reales y llamadas perdidas.',
  keywords: [
    'calculadora ahorro empleado digital', 'ROI recepcionista virtual',
    'cuánto ahorro con IA recepción', 'costo automatización recepción',
    'payback empleado digital', 'calculadora ROI PyME',
  ],
  alternates: { canonical: `${BASE_URL}/calcular-ahorro` },
  openGraph: {
    title:       'Calculadora de ahorro Centinelia | ROI con tus números reales',
    description: 'En 2 minutos ves cuánto rinde un empleado digital para tu operación con tus cifras reales.',
    url:         `${BASE_URL}/calcular-ahorro`,
    images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

const C = {
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.55)',
};

export default function CalcularAhorroPage() {
  const dateModified = todayIso();

  const breadcrumb = breadcrumbSchema([
    { name: 'Inicio',              url: BASE_URL },
    { name: 'Calculadora de ahorro', url: `${BASE_URL}/calcular-ahorro` },
  ]);

  const webAppSchema = {
    '@context':          'https://schema.org',
    '@type':             'WebApplication',
    '@id':               `${BASE_URL}/calcular-ahorro`,
    name:                'Calculadora de ahorro Centinelia',
    description:         'Estimador de ROI para automatizar recepción telefónica con un empleado digital.',
    url:                 `${BASE_URL}/calcular-ahorro`,
    applicationCategory: 'BusinessApplication',
    operatingSystem:     'Web',
    inLanguage:          'es-MX',
    isAccessibleForFree: true,
    dateModified,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.18) 0%, transparent 60%)' }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative" style={{ paddingTop: 100, paddingBottom: 40, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Calculadora de ahorro
          </p>
          <h1 className="font-bold leading-tight mb-4" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.9rem)', color: '#fff' }}>
            Ve cuánto rinde un empleado digital para tu operación
          </h1>
          <p style={{ fontSize: 'clamp(0.95rem, 1.7vw, 1.1rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 620, margin: '0 auto' }}>
            Ajusta los inputs con tus números reales. Los cálculos son conservadores y se actualizan al momento.
          </p>
        </div>
      </section>

      <section style={{ background: '#FAFBFF' }}>
        <CalculadoraForm />
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
