import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Phone, ArrowRight, ShoppingBag, PhoneOff, Clock, MessageCircle, Star } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import LandingWidgets from '@/app/LandingWidgets';
import MeerkatReveal from '@/app/MeerkatReveal';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter from '@/app/industrias/IndustryFooter';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title: 'Recepcionista Virtual para Tiendas y Servicios',
  description: 'Agente de voz con IA que atiende llamadas, toma pedidos y responde sobre disponibilidad 24/7 para tiendas retail y negocios de servicio. Desde $2,997/mes.',
  keywords: [
    'recepcionista virtual tienda', 'toma pedidos telefónicos IA',
    'atención al cliente automatizada México', 'agente voz retail',
    'pedidos por teléfono automáticos', 'recepcionista IA negocio servicio',
  ],
  alternates: { canonical: `${BASE_URL}/industrias/tiendas` },
  openGraph: {
    title: 'Recepcionista Virtual para Tiendas y Servicios | Centinelia',
    description: 'Agente de voz con IA que atiende llamadas, toma pedidos y responde sobre disponibilidad 24/7. Desde $2,997/mes.',
    url: `${BASE_URL}/industrias/tiendas`,
    images: [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

const C = { bg: '#FAFBFF', text: '#1A0A3B', textSub: 'rgba(26,10,59,0.58)', accent: '#6C3BFF', border: 'rgba(108,59,255,0.12)' };

const PROBLEMS = [
  {
    icon: <PhoneOff size={22} color="#ef4444" />,
    title: 'Llamadas perdidas mientras atiendes el local',
    desc: 'Cuando hay clientes en tienda, el teléfono queda sin atender. Esos clientes que llaman para preguntar disponibilidad o hacer un pedido se van con quien sí contesta.',
  },
  {
    icon: <MessageCircle size={22} color="#f59e0b" />,
    title: '"¿Tienen el modelo X en talla M?", veinte veces al día',
    desc: 'Las mismas preguntas sobre disponibilidad, precios y horarios consumen tiempo que deberías dedicar a los clientes frente a ti o a hacer crecer tu negocio.',
  },
  {
    icon: <Clock size={22} color="#8b5cf6" />,
    title: 'Sin atención fuera del horario del local',
    desc: 'Los clientes deciden comprar cuando pueden, no cuando tú abres. Llaman por la noche o el domingo y si no hay respuesta, hacen el pedido en línea con la competencia.',
  },
];

const FEATURES = [
  { label: 'Responde disponibilidad, precios, tallas y características de productos' },
  { label: 'Toma pedidos para recoger en tienda o envío a domicilio' },
  { label: 'Informa horarios, ubicación y políticas de devolución' },
  { label: 'Registra cada pedido y notifica al equipo por WhatsApp' },
  { label: 'Captura datos de clientes interesados cuando el producto no está disponible' },
  { label: 'Atiende fuera de horario para no perder ventas nocturnas ni de fin de semana' },
];

const OUTBOUND_CASES = [
  {
    title: 'Ya llegó lo que buscabas',
    desc: 'Cuando repones un producto que estaba agotado, el agente llama a todos los clientes que preguntaron por él. La venta se cierra antes de que el producto llegue al estante.',
  },
  {
    title: 'Tu pedido va en camino',
    desc: 'El agente notifica al cliente cuando su pedido salió a entrega, con el tiempo estimado. Menos llamadas de "¿dónde está mi pedido?" y más clientes tranquilos.',
  },
  {
    title: 'Oferta exclusiva para ti',
    desc: 'El agente contacta clientes que no han comprado en 60 días con una promoción personalizada. La reactivación automática que nunca se hace por falta de tiempo.',
  },
];

const TESTIMONIALS = [
  {
    quote: 'Tenemos una floristería y en temporadas altas como San Valentín no dábamos abasto ni en el local ni en el teléfono. El agente tomó pedidos toda la noche del 13 y llegamos al 14 con el doble de ventas.',
    author: 'Dueña de floristería, Monterrey',
  },
  {
    quote: 'Mis clientes llaman para preguntar si tenemos repuesto de tal modelo antes de venir. El agente consulta lo que le cargué y les responde al momento. Ya no pierdo esa venta porque nadie contestó.',
    author: 'Dueño de taller de electrónica, Guadalajara',
  },
  {
    quote: 'Vendemos uniformes y en agosto nos caen cientos de llamadas de papás preguntando tallas y precios. El agente los atiende a todos y me manda los pedidos. Fue el agosto más ordenado que hemos tenido.',
    author: 'Administrador de tienda de uniformes escolares, CDMX',
  },
];

const FAQS = [
  {
    q: '¿El agente puede consultar inventario en tiempo real?',
    a: 'Puedes cargar tu catálogo de productos en el portal y actualizarlo cuando quieras. Para inventario en tiempo real con tu sistema de punto de venta, lo configuramos con una integración personalizada.',
  },
  {
    q: '¿Cómo maneja el agente los pedidos que toma?',
    a: 'Cada pedido llega a tu WhatsApp y al portal con todos los datos: producto, cantidad, nombre del cliente y tipo de entrega. También queda registrado para que puedas exportarlo. Si tu sistema POS lo permite, los pedidos se registran ahí automáticamente también.',
  },
  {
    q: '¿Puede el agente dar seguimiento a pedidos ya realizados?',
    a: 'Si le proporcionas la información del pedido, sí. Para seguimiento automatizado conectado a tu sistema de logística, lo configuramos como integración personalizada.',
  },
  {
    q: '¿Funciona para negocios de servicio además de tiendas (plomeros, electricistas, etc.)?',
    a: 'Perfectamente. Para servicios, el agente agenda citas de visita, toma datos del problema y filtra por zona geográfica. Muchos negocios de servicio a domicilio lo usan exactamente así.',
  },
];

export default function TiendasPage() {
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
          <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>Centinelia para tiendas y servicios</p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', color: '#fff' }}>
            Tu tienda vende aunque{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              estés ocupado
            </span>
          </h1>
          <p className="mb-8 max-w-xl mx-auto" style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>
            Responde disponibilidad, toma pedidos y captura clientes a cualquier hora, mientras atiendes el local o descansas.
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
        <MeerkatReveal className="agent-sway meerkat-headset-desk" style={{ zIndex: 2 }}>
          <Image src="/agent-headset.png" alt="" fill sizes="260px" style={{ objectFit: 'contain', objectPosition: 'top center' }} />
        </MeerkatReveal>
      </section>

      {/* ── PROBLEMS ── */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-start">
            <AnimatedSection>
              <h2 className="font-bold" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text, lineHeight: 1.2 }}>
                Cada llamada sin respuesta es una venta que se va
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

      {/* ── SOLUTION ── */}
      <section style={{ background: '#fff', padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <AnimatedSection>
              <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>Un vendedor que contesta, informa y toma pedidos sin descanso</h2>
              <p className="mb-8 leading-relaxed" style={{ color: C.textSub }}>Centinelia configura un agente entrenado con tu catálogo, precios, horarios y políticas. Habla como parte de tu equipo y registra cada interacción para que no se pierda ninguna venta.</p>
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
                    <ShoppingBag size={20} color="#fff" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: C.text }}>Agente activo ahora mismo</p>
                    <p className="text-xs" style={{ color: C.textSub }}>Tienda ejemplo · Domingo 8:40 pm</p>
                  </div>
                </div>
                {[
                  { msg: '"Hola, ¿tienen la sudadera gris que venden en Instagram en talla L?"' },
                  { msg: 'Sí, contamos con la sudadera gris en talla L. ¿Quiere recogerla en tienda o prefiere envío a domicilio?', agent: true },
                  { msg: '"Envío, por favor. ¿Cuánto tarda y cuánto cuesta?"' },
                  { msg: 'El envío a Monterrey tarda 2 días hábiles y tiene un costo de ochenta pesos. ¿Le tomamos el pedido ahora?', agent: true },
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

      {/* ── OUTBOUND ── */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="mb-10">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>El agente también llama</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-16 items-end">
              <h2 className="font-bold" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
                Avisa, reactiva y confirma sin intervención
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                Además de atender llamadas entrantes, el agente puede avisar de llegadas, confirmar entregas y reactivar clientes que no regresan.
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

      {/* ── TESTIMONIALS ── */}
      <section style={{ background: '#fff', padding: '80px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="mb-10">
            <h2 className="font-bold text-center" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: C.text }}>
              Lo que dicen los negocios que ya lo usan
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
          <AnimatedSection>
            <h2 className="font-bold text-center mb-10" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: C.text }}>Preguntas frecuentes de tiendas y servicios</h2>
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

      {/* ── CTA ── */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0D0520 0%, #1A0A3B 100%)' }}>
        <AnimatedSection>
          <div className="max-w-2xl mx-auto px-6 text-center" style={{ paddingTop: 80, paddingBottom: 'clamp(160px, 30vw, 280px)', position: 'relative', zIndex: 1 }}>
            <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#fff' }}>Tu negocio disponible a cualquier hora, cualquier día</h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.7 }}>Activo en menos de 24 horas. Sin contratos de permanencia. Desde $2,997/mes.</p>
            <Link href="/registro" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]" style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}>
              Activar mi agente ahora <ArrowRight size={15} />
            </Link>
          </div>
        </AnimatedSection>
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
