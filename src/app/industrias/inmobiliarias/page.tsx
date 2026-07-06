import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Phone, ArrowRight, Building2, PhoneOff, Clock, TrendingDown, Star, PhoneOutgoing } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import LandingWidgets from '@/app/LandingWidgets';
import MeerkatReveal from '@/app/MeerkatReveal';
import IndustryFooter from '@/app/industrias/IndustryFooter';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title: 'Recepcionista Virtual para Inmobiliarias',
  description: 'Agente de voz con IA que atiende prospectos, filtra por presupuesto y agenda visitas a propiedades 24/7. No pierdas otro comprador. Plan Comercial desde $3,490/mes.',
  keywords: [
    'recepcionista virtual inmobiliaria', 'agente voz bienes raíces México',
    'agenda visitas propiedades automática', 'calificación leads inmobiliarios',
    'atención telefónica inmobiliaria', 'IA para agentes de bienes raíces',
  ],
  alternates: { canonical: `${BASE_URL}/industrias/inmobiliarias` },
  openGraph: {
    title: 'Recepcionista Virtual para Inmobiliarias | Centinelia',
    description: 'Agente de voz con IA que atiende prospectos, filtra por presupuesto y agenda visitas 24/7. Plan Comercial desde $3,490/mes.',
    url: `${BASE_URL}/industrias/inmobiliarias`,
    images: [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

const C = { bg: '#FAFBFF', text: '#1A0A3B', textSub: 'rgba(26,10,59,0.58)', accent: '#6C3BFF', border: 'rgba(108,59,255,0.12)' };

const PROBLEMS = [
  {
    icon: <PhoneOff size={22} color="#ef4444" />,
    title: 'Compradores que llaman mientras muestras una propiedad',
    desc: 'Cuando estás en una visita no puedes contestar. Ese prospecto llama a otra inmobiliaria, ve una propiedad ese mismo día y firma el fin de semana.',
  },
  {
    icon: <TrendingDown size={22} color="#f59e0b" />,
    title: 'Leads fríos por respuesta lenta',
    desc: 'En bienes raíces, quien responde primero gana. Un prospecto que llama y no obtiene respuesta en minutos empieza a buscar otras opciones inmediatamente.',
  },
  {
    icon: <Clock size={22} color="#8b5cf6" />,
    title: 'Horas invertidas filtrando prospectos no calificados',
    desc: 'Muchos llaman solo a preguntar precios sin intención real de compra. Atenderlos consume tiempo que podría usarse en cierres reales.',
  },
];

const FEATURES = [
  { label: 'Atiende prospectos al instante, a cualquier hora del día' },
  { label: 'Filtra por presupuesto, zona, tipo de inmueble y plazo de decisión' },
  { label: 'Agenda visitas a propiedades directo en tu calendario' },
  { label: 'Comparte información de propiedades disponibles según el perfil del comprador' },
  { label: 'Captura datos completos: nombre, teléfono, presupuesto, zona de interés' },
  { label: 'Clasifica leads por nivel de interés para que priorices tus seguimientos' },
];

const OUTBOUND_CASES = [
  {
    title: 'Entró la propiedad que buscabas',
    desc: 'Cuando registras un inmueble nuevo, el agente llama a los prospectos con ese perfil. El lead más caliente vuelve a estar activo sin que muevas un dedo.',
  },
  {
    title: 'Visita mañana, ¿confirmamos?',
    desc: 'El agente confirma cada visita agendada un día antes. Menos citas fantasma, más recorridos reales y menos tiempo invertido en prospectos que no llegan.',
  },
  {
    title: 'Retomemos el contacto',
    desc: 'A los 60 días de inactividad, el agente contacta prospectos calificados. El mercado cambia, los presupuestos también, y muchos cierres llegan en ese segundo momento.',
  },
];

const TESTIMONIALS = [
  {
    quote: 'Estaba en una visita y llegaron tres llamadas. El agente las atendió, filtró a los que tenían presupuesto real y me mandó un resumen. Cuando salí ya tenía tres citas agendadas para esa semana.',
    author: 'Agente inmobiliario independiente, Monterrey',
  },
  {
    quote: 'Recibíamos muchas llamadas de personas con presupuesto muy por debajo del inventario. El agente hace las preguntas correctas y solo agenda a los prospectos que sí califican.',
    author: 'Directora comercial, desarrolladora inmobiliaria, CDMX',
  },
  {
    quote: 'Mis propiedades son de renta y la gente llama a toda hora para preguntar disponibilidad. El agente les da la información, toma sus datos y me los manda. Ya no estoy pegado al teléfono.',
    author: 'Inversionista con cartera de rentas, Guadalajara',
  },
];

const FAQS = [
  {
    q: '¿El agente puede describir propiedades específicas?',
    a: 'Sí. Le proporcionas tu inventario con características, precios y zonas y el agente comparte esa información de forma natural según lo que busca el prospecto.',
  },
  {
    q: '¿Puede el agente precalificar si el prospecto tiene financiamiento o es de contado?',
    a: 'Sí. Puedes configurar las preguntas de calificación que necesitas: tipo de compra, enganche disponible, si ya fue aprobado con algún banco, etc.',
  },
  {
    q: '¿Qué pasa si el prospecto pregunta por una propiedad que ya se vendió?',
    a: 'Le informa que esa propiedad ya no está disponible y le ofrece alternativas de tu inventario según su perfil o agenda una llamada para mostrarte opciones similares.',
  },
  {
    q: '¿Funciona para inmobiliarias con varios agentes?',
    a: 'Sí. Puedes tener un agente por número o configurar reglas de distribución. Cada agente tiene su propio portal con sus leads y citas.',
  },
];

export default function InmobiliariasPage() {
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

      <section style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Background image + overlay */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <Image src="/hero-bg.png" alt="" fill priority quality={85} style={{ objectFit: 'cover', objectPosition: 'center' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(13,5,32,0.88) 0%, rgba(26,10,59,0.93) 100%)' }} />
        </div>
        {/* Content */}
        <div className="max-w-4xl mx-auto px-6 text-center" style={{ paddingTop: 120, paddingBottom: 100, position: 'relative', zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>Centinelia para inmobiliarias</p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', color: '#fff' }}>
            El primer agente en responder{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              cierra la venta
            </span>
          </h1>
          <p className="mb-8 max-w-2xl mx-auto" style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>
            Un agente de voz con IA atiende a tus prospectos al instante, filtra por presupuesto y agenda visitas, mientras tú estás mostrando propiedades o cerrando otros tratos.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/registro" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
              Activar mi agente <ArrowRight size={15} />
            </Link>
            <a href="tel:+528116333559" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-medium" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <Phone size={14} /> Habla con un asesor
            </a>
          </div>
        </div>
        {/* Meerkat, desktop, peeks from bottom edge (clipped by overflow:hidden) */}
        <MeerkatReveal className="agent-sway meerkat-headset-desk" style={{ zIndex: 2 }}>
          <Image src="/agent-headset.png" alt="" fill sizes="260px" style={{ objectFit: 'contain', objectPosition: 'top center' }} />
        </MeerkatReveal>
      </section>

      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold tracking-widest uppercase text-center mb-3" style={{ color: C.accent }}>El problema</p>
          <h2 className="font-bold text-center mb-12" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>En bienes raíces, el tiempo de respuesta decide quién cierra</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PROBLEMS.map((p, i) => (
              <div key={i} className="rounded-2xl p-6" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                <div className="mb-4">{p.icon}</div>
                <h3 className="font-semibold mb-2 text-sm" style={{ color: C.text }}>{p.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: '#fff', padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>La solución</p>
              <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>Un agente que califica, informa y agenda mientras tú cierras</h2>
              <p className="mb-8 leading-relaxed" style={{ color: C.textSub }}>Centinelia configura un agente entrenado con tu inventario y criterios de calificación. Responde al instante, filtra a los prospectos serios y te los entrega listos para visitar.</p>
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
            </div>
            <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(135deg, rgba(108,59,255,0.06), rgba(155,109,255,0.03))', border: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="rounded-full flex items-center justify-center" style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}>
                  <Building2 size={20} color="#fff" />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: C.text }}>Agente activo ahora mismo</p>
                  <p className="text-xs" style={{ color: C.textSub }}>Inmobiliaria ejemplo · 6:20 pm</p>
                </div>
              </div>
              {[
                { msg: '"Hola, vi un departamento en Cumbres de 2 recámaras, ¿sigue disponible?"' },
                { msg: 'Sí, contamos con opciones en Cumbres. ¿Me puede decir su presupuesto aproximado para mostrarle las más adecuadas?', agent: true },
                { msg: '"Estamos pensando en algo entre dos y dos cinco millones."' },
                { msg: 'Perfecto, tenemos tres opciones en ese rango. ¿Le gustaría agendar una visita esta semana para conocerlas?', agent: true },
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
          </div>
        </div>
      </section>

      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold tracking-widest uppercase text-center mb-3" style={{ color: C.accent }}>El agente también llama</p>
          <h2 className="font-bold text-center mb-4" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
            Ningún lead se enfría solo
          </h2>
          <p className="text-center mb-12 max-w-xl mx-auto text-sm leading-relaxed" style={{ color: C.textSub }}>
            Además de atender llamadas entrantes, el agente puede hacer llamadas salientes para reactivar prospectos, confirmar visitas y avisar cuando hay propiedades nuevas.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {OUTBOUND_CASES.map((c, i) => (
              <div key={i} className="rounded-2xl p-6" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-center rounded-xl mb-4" style={{ width: 40, height: 40, background: 'rgba(108,59,255,0.08)', flexShrink: 0 }}>
                  <PhoneOutgoing size={18} color={C.accent} />
                </div>
                <h3 className="font-semibold mb-2 text-sm" style={{ color: C.text }}>{c.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: '#fff', padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="font-bold text-center mb-12" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: C.text }}>Lo que dicen las inmobiliarias que ya lo usan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                <div className="flex gap-0.5">{Array.from({ length: 5 }).map((_, j) => <Star key={j} size={13} fill="#6C3BFF" color="#6C3BFF" />)}</div>
                <p className="text-sm leading-relaxed flex-1" style={{ color: C.textSub }}>"{t.quote}"</p>
                <p className="text-xs font-semibold" style={{ color: C.accent }}>, {t.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: '#fff', padding: '80px 24px' }}>
        <div className="max-w-2xl mx-auto">
          <h2 className="font-bold text-center mb-10" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: C.text }}>Preguntas frecuentes de inmobiliarias</h2>
          <div className="space-y-4">
            {FAQS.map((f, i) => (
              <div key={i} className="rounded-xl p-5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                <p className="font-semibold text-sm mb-2" style={{ color: C.text }}>{f.q}</p>
                <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0D0520 0%, #1A0A3B 100%)' }}>
        <div className="max-w-2xl mx-auto px-6 text-center" style={{ paddingTop: 80, paddingBottom: 'clamp(160px, 30vw, 280px)', position: 'relative', zIndex: 1 }}>
          <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#fff' }}>Responde primero. Cierra más.</h2>
          <p className="mb-8" style={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.7 }}>Activo en menos de 24 horas. Sin contratos de permanencia. Plan Comercial desde $3,490/mes.</p>
          <Link href="/registro" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
            Activar mi agente ahora <ArrowRight size={15} />
          </Link>
        </div>
        {/* Meerkat duo, peeks from bottom edge (clipped by overflow:hidden) */}
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
