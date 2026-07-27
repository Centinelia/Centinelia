import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Phone, ArrowRight, Briefcase, PhoneOff, Clock, TrendingDown, Star, PhoneOutgoing } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import LandingWidgets from '@/app/LandingWidgets';
import AnimatedSection from '@/app/AnimatedSection';
import MeerkatReveal from '@/app/MeerkatReveal';
import IndustryFooter from '@/app/industrias/IndustryFooter';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title: 'Recepcionista Virtual para Despachos y Consultorías',
  description: 'Agente de voz con IA que califica leads, agenda consultas y atiende llamadas 24/7 para despachos de abogados, contadores y agencias. Desde $2,997/mes.',
  keywords: [
    'recepcionista virtual despacho abogados', 'agente voz bufete contadores',
    'atención telefónica despacho México', 'agenda consultas automática',
    'calificación leads despacho', 'recepcionista IA agencia consultoría',
  ],
  alternates: { canonical: `${BASE_URL}/industrias/despachos` },
  openGraph: {
    title: 'Recepcionista Virtual para Despachos y Consultorías | Centinelia',
    description: 'Agente de voz con IA que califica leads, agenda consultas y atiende llamadas 24/7. Desde $2,997/mes.',
    url: `${BASE_URL}/industrias/despachos`,
    images: [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

const C = { bg: '#FAFBFF', text: '#1A0A3B', textSub: 'rgba(26,10,59,0.58)', accent: '#6C3BFF', border: 'rgba(108,59,255,0.12)' };

const PROBLEMS = [
  {
    icon: <PhoneOff size={22} color="#ef4444" />,
    title: 'Prospectos que llaman y no encuentran a nadie',
    desc: 'Un prospecto que llama mientras estás en reunión o con un cliente raramente vuelve a llamar. La competencia que sí contesta se queda con ese caso.',
  },
  {
    icon: <TrendingDown size={22} color="#f59e0b" />,
    title: 'Tu tiempo profesional desperdiciado en llamadas de información',
    desc: '"¿Cuánto cobran por una consulta?", "¿Llevan casos de divorcio?", "¿Tienen disponibilidad esta semana?", preguntas que consumen horas de trabajo facturable.',
  },
  {
    icon: <Clock size={22} color="#8b5cf6" />,
    title: 'Leads calificados que llegan fuera de horario',
    desc: 'Los profesionistas toman decisiones importantes a cualquier hora. Si nadie contesta a las 8pm cuando alguien busca un abogado, pierdes la oportunidad.',
  },
];

const FEATURES = [
  { label: 'Califica prospectos: área legal/contable, tipo de caso, presupuesto y urgencia' },
  { label: 'Agenda consultas iniciales directo en tu calendario' },
  { label: 'Responde preguntas sobre servicios, honorarios y proceso de trabajo' },
  { label: 'Captura datos completos del prospecto para seguimiento' },
  { label: 'Transfiere llamadas urgentes a tu celular en tiempo real' },
  { label: 'Resumen de cada llamada con nivel de interés del prospecto' },
];

const OUTBOUND_CASES = [
  {
    title: 'Tus documentos están listos para firma',
    desc: 'Tu empleado notifica al cliente cuando un trámite avanzó y necesita su atención. Sin recordatorios manuales, sin procesos atascados por falta de seguimiento.',
  },
  {
    title: '¿Todavía le interesa? El recontacto que cierra',
    desc: 'A los 30 días de un prospecto sin respuesta, tu empleado hace el seguimiento. Muchos casos se cierran en ese segundo intento que nadie tiene tiempo de hacer.',
  },
  {
    title: 'Novedad en tu caso',
    desc: 'Cuando hay un avance importante, tu empleado informa al cliente de inmediato. El cliente se siente atendido; tú no interrumpes lo que estás haciendo.',
  },
];

const TESTIMONIALS = [
  {
    quote: 'Cuando estoy en audiencia o con un cliente no puedo contestar. Ahora tu empleado recibe al prospecto, le explica mis servicios y agenda la consulta. Cuando salgo ya tengo una cita esperándome.',
    author: 'Abogado litigante, despacho independiente, Monterrey',
  },
  {
    quote: 'El 80% de las llamadas eran para preguntar precios o si llevamos declaraciones anuales. Tu empleado responde todo eso y solo me pasa los prospectos que ya quieren agendar. Recuperé horas de mi semana.',
    author: 'Contador público, despacho fiscal, CDMX',
  },
  {
    quote: 'Pensaba que mis clientes esperarían. Pero varios me dijeron que llamaron a tres agencias y la mía fue la única que contestó de inmediato. Tu empleado hizo la diferencia.',
    author: 'Directora de agencia de marketing, Guadalajara',
  },
];

const FAQS = [
  {
    q: '¿Puede explicar mis áreas de práctica o servicios específicos?',
    a: 'Sí. Le proporcionas la información de tu despacho, áreas, tipos de casos que manejas, honorarios generales, y tu empleado la usa para responder con precisión.',
  },
  {
    q: '¿Puede filtrar casos que no me interesen?',
    a: 'Sí. Le puedes indicar qué tipos de consultas no atiendes y tu empleado lo comunica con respeto, evitándote perder tiempo en casos que no vas a tomar.',
  },
  {
    q: '¿La información que comparten los prospectos es confidencial?',
    a: 'Los datos capturados se almacenan de forma segura y solo tú tienes acceso desde tu portal. Tu empleado no comparte información entre clientes.',
  },
  {
    q: '¿Puedo configurar que solo agende con ciertos requisitos previos?',
    a: 'Sí. Puedes indicarle que solo agende consultas si el prospecto cumple ciertos criterios, como tipo de caso o presupuesto mínimo.',
  },
];

export default function DespachosPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQS.map(f => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }),
        }}
      />
      <LandingNav />
      <LandingWidgets />

      {/* ── HERO ── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <Image src="/hero-bg.png" alt="" fill priority quality={85} style={{ objectFit: 'cover', objectPosition: 'center' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(13,5,32,0.88) 0%, rgba(26,10,59,0.93) 100%)' }} />
        </div>
        <div className="max-w-4xl mx-auto px-6 text-center" style={{ paddingTop: 120, paddingBottom: 100, position: 'relative', zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>Centinelia para despachos y consultorías</p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', color: '#fff' }}>
            Nunca más pierdas un prospecto{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              por no contestar
            </span>
          </h1>
          <p className="mb-8 max-w-xl mx-auto" style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>
            Califica prospectos, agenda consultas y atiende llamadas las 24 horas, mientras tú te concentras en el trabajo que genera valor.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/registro" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
              Contratar mi Asistente <ArrowRight size={15} />
            </Link>
            <a href="tel:+528116333559" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-medium" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <Phone size={14} /> Habla con un asesor
            </a>
          </div>
        </div>
        <MeerkatReveal className="agent-sway meerkat-headset-desk" style={{ zIndex: 2 }}>
          <Image src="/agent-headset.png" alt="" fill sizes="260px" style={{ objectFit: 'contain', objectPosition: 'top center' }} />
        </MeerkatReveal>
      </section>

      {/* ── EL PROBLEMA ── */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-start">
            <AnimatedSection>
              <h2 className="font-bold" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text, lineHeight: 1.2 }}>
                Tu tiempo vale demasiado para perderlo en llamadas de información
              </h2>
            </AnimatedSection>
            <div>
              {PROBLEMS.map((p, i) => (
                <AnimatedSection key={i} delay={i * 0.1}>
                  <div className="flex gap-4 items-start" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, paddingBottom: 20 }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>{p.icon}</div>
                    <div>
                      <h3 className="font-semibold mb-1.5 text-sm" style={{ color: C.text }}>{p.title}</h3>
                      <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{p.desc}</p>
                    </div>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── LA SOLUCIÓN ── */}
      <section style={{ background: '#fff', padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <AnimatedSection>
              <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
                Tu Asistente jurídico: califica prospectos y agenda mientras tú trabajas
              </h2>
              <p className="mb-8 leading-relaxed" style={{ color: C.textSub }}>
                Centinelia configura un empleado digital entrenado con la información de tu despacho. Sabe qué casos manejas, tus honorarios generales y cómo calificar a un prospecto antes de pasártelo.
              </p>
              <ul className="space-y-3">
                {FEATURES.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm" style={{ color: C.text }}>
                    <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                    {f.label}
                  </li>
                ))}
              </ul>
              <Link href="/registro" className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
                Contratar ahora <ArrowRight size={14} />
              </Link>
            </AnimatedSection>
            <AnimatedSection delay={0.12}>
              <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(135deg, rgba(108,59,255,0.06), rgba(155,109,255,0.03))', border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="rounded-full flex items-center justify-center" style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}>
                    <Briefcase size={20} color="#fff" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: C.text }}>Asistente jurídico activo</p>
                    <p className="text-xs" style={{ color: C.textSub }}>Despacho jurídico ejemplo · 7:45 pm</p>
                  </div>
                </div>
                {[
                  { msg: '"Buenas tardes, necesito un abogado para un tema de divorcio. ¿Llevan ese tipo de casos?"' },
                  { msg: 'Sí, manejamos derecho familiar incluyendo divorcios. ¿Me podría decir si ya tienen acuerdo con su pareja o sería un proceso contencioso?', agent: true },
                  { msg: '"No hay acuerdo, hay propiedades de por medio."' },
                  { msg: 'Entendido. Puedo agendar una consulta inicial con el licenciado para revisar su caso. ¿Le queda bien esta semana?', agent: true },
                ].map((m, i) => (
                  <div key={i} className={`flex ${m.agent ? 'justify-end' : 'justify-start'} mb-3`}>
                    <div className="max-w-[85%]">
                      <div className="rounded-2xl px-4 py-2.5 text-xs leading-relaxed" style={{ background: m.agent ? 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' : '#f3f4f6', color: m.agent ? '#fff' : C.text }}>
                        {m.msg}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── EL AGENTE TAMBIÉN LLAMA ── */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="mb-10">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>Tu empleado también llama</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-16 items-end">
              <h2 className="font-bold" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
                Seguimiento automático que cierra más casos
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                Además de atender llamadas entrantes, tu empleado puede hacer llamadas salientes para dar seguimiento, reactivar prospectos y mantener a tus clientes informados.
              </p>
            </div>
          </AnimatedSection>
          <div>
            {OUTBOUND_CASES.map((c, i) => (
              <AnimatedSection key={i} delay={i * 0.1}>
                <div className="flex gap-6 items-start" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, paddingBottom: 24 }}>
                  <span className="font-bold tabular-nums flex-shrink-0" style={{ fontSize: '2rem', lineHeight: 1, color: C.accent, opacity: 0.22 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="font-semibold mb-1.5" style={{ color: C.text }}>{c.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{c.desc}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIOS ── */}
      <section style={{ background: '#fff', padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="mb-10">
            <h2 className="font-bold text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: C.text }}>
              Lo que dicen los despachos que ya lo usan
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <AnimatedSection className="lg:col-span-3">
              <div className="rounded-2xl p-8 flex flex-col h-full" style={{ background: 'linear-gradient(160deg, #0D0520 0%, #1A0A3B 100%)', border: '1px solid rgba(108,59,255,0.3)' }}>
                <div className="flex gap-0.5 mb-5">
                  {Array.from({ length: 5 }).map((_, j) => <Star key={j} size={14} fill="#9B6DFF" color="#9B6DFF" />)}
                </div>
                <p className="leading-relaxed flex-1" style={{ color: 'rgba(255,255,255,0.85)', fontSize: '1rem' }}>
                  &ldquo;{TESTIMONIALS[0].quote}&rdquo;
                </p>
                <p className="mt-6 text-sm font-semibold" style={{ color: '#9B6DFF' }}>{TESTIMONIALS[0].author}</p>
              </div>
            </AnimatedSection>
            <div className="lg:col-span-2 flex flex-col gap-6">
              {TESTIMONIALS.slice(1).map((t, i) => (
                <AnimatedSection key={i} delay={(i + 1) * 0.1} className="flex-1">
                  <div className="rounded-2xl p-6 flex flex-col gap-3 h-full" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, j) => <Star key={j} size={13} fill="#6C3BFF" color="#6C3BFF" />)}
                    </div>
                    <p className="text-sm leading-relaxed flex-1" style={{ color: C.textSub }}>&ldquo;{t.quote}&rdquo;</p>
                    <p className="text-xs font-semibold" style={{ color: C.accent }}>{t.author}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-2xl mx-auto">
          <AnimatedSection className="mb-10">
            <h2 className="font-bold text-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: C.text }}>
              Preguntas frecuentes de despachos
            </h2>
          </AnimatedSection>
          <div className="space-y-4">
            {FAQS.map((f, i) => (
              <AnimatedSection key={i} delay={i * 0.07}>
                <div className="rounded-xl p-5" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                  <p className="font-semibold text-sm mb-2" style={{ color: C.text }}>{f.q}</p>
                  <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{f.a}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0D0520 0%, #1A0A3B 100%)' }}>
        <div className="max-w-2xl mx-auto px-6 text-center" style={{ paddingTop: 80, paddingBottom: 'clamp(160px, 30vw, 280px)', position: 'relative', zIndex: 1 }}>
          <AnimatedSection>
            <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#fff' }}>Tu despacho abierto para nuevos clientes las 24 horas</h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.7 }}>Activo en menos de 24 horas. Sin contratos de permanencia. Desde $2,997/mes.</p>
            <Link href="/registro" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
              Contratar mi Asistente jurídico <ArrowRight size={15} />
            </Link>
          </AnimatedSection>
        </div>
        <MeerkatReveal
          className="agent-sway absolute bottom-[-50px] sm:bottom-[-80px] left-1/2 -translate-x-1/2 pointer-events-none select-none w-[300px] h-[216px] sm:w-[580px] sm:h-[420px]"
          style={{ zIndex: 1 }}
        >
          <Image src="/agent-duo-call.png" alt="Equipo Centinelia" fill sizes="(max-width: 640px) 300px, 580px" style={{ objectFit: 'contain', objectPosition: 'bottom center' }} />
        </MeerkatReveal>
      </section>
      <IndustryFooter />
    </>
  );
}
