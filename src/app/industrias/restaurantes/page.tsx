import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Phone, ArrowRight, UtensilsCrossed, PhoneOff, Clock, Users, Star, PhoneOutgoing } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import LandingWidgets from '@/app/LandingWidgets';
import MeerkatReveal from '@/app/MeerkatReveal';
import IndustryFooter from '@/app/industrias/IndustryFooter';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title: 'Recepcionista Virtual para Restaurantes y Cafeterías',
  description: 'Agente de voz con IA que toma pedidos, agenda reservaciones y responde preguntas del menú 24/7. Sin perder una sola llamada. Reservaciones desde $3,490/mes · con toma de pedidos desde $6,490/mes.',
  keywords: [
    'recepcionista virtual restaurante', 'toma pedidos por teléfono IA',
    'reservaciones automáticas restaurante', 'agente voz cafetería México',
    'atención telefónica restaurante', 'pedidos telefónicos automatizados',
  ],
  alternates: { canonical: `${BASE_URL}/industrias/restaurantes` },
  openGraph: {
    title: 'Recepcionista Virtual para Restaurantes y Cafeterías | Centinelia',
    description: 'Agente de voz con IA que toma pedidos, agenda reservaciones y responde sobre el menú 24/7. Reservaciones desde $3,490/mes · con toma de pedidos desde $6,490/mes.',
    url: `${BASE_URL}/industrias/restaurantes`,
    images: [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

const C = {
  bg:      '#FAFBFF',
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.58)',
  accent:  '#6C3BFF',
  border:  'rgba(108,59,255,0.12)',
};

const PROBLEMS = [
  {
    icon: <PhoneOff size={22} color="#ef4444" />,
    title: 'El teléfono suena en hora pico y nadie puede contestar',
    desc: 'A la hora de la comida o la cena, todo el equipo está sirviendo mesas. Las llamadas entran y nadie las atiende, esas ventas se van.',
  },
  {
    icon: <Clock size={22} color="#f59e0b" />,
    title: 'Pedidos y reservaciones fuera de horario sin respuesta',
    desc: 'Los clientes llaman a las 10pm para reservar del día siguiente o hacer un pedido para llevar. Si no hay quien conteste, piden en otro lado.',
  },
  {
    icon: <Users size={22} color="#8b5cf6" />,
    title: 'Pedidos mal tomados por el ruido o las prisas',
    desc: 'Anotar un pedido en medio del bullicio del restaurante genera errores. Un pedido mal tomado cuesta más que el precio del platillo.',
  },
];

const FEATURES = [
  { label: 'Toma pedidos completos para llevar o a domicilio' },
  { label: 'Agenda y confirma reservaciones con nombre, fecha y número de personas' },
  { label: 'Responde preguntas del menú: precios, ingredientes, opciones sin gluten, etc.' },
  { label: 'Informa horarios, ubicación y tiempo de espera estimado' },
  { label: 'Registra cada pedido y lo notifica al equipo por WhatsApp' },
  { label: 'Disponible las 24 horas, incluso cuando el local está cerrado' },
];

const OUTBOUND_CASES = [
  {
    title: 'Tu pedido ya está listo',
    desc: 'El agente llama al cliente cuando su comida está lista para recoger. Nadie llega a un pedido frío ni espera en la puerta sin saber que ya está.',
  },
  {
    title: 'Reservación confirmada, hora antes',
    desc: 'Una hora antes de cada reservación, el agente confirma automáticamente. Menos lugares vacíos de último momento, menos desperdicio y menos sorpresas.',
  },
  {
    title: 'Promo del día para tus habituales',
    desc: 'El agente contacta a tus clientes frecuentes cuando tienes una promoción especial o un platillo de temporada. La llamada llega, la venta se genera.',
  },
];

const TESTIMONIALS = [
  {
    quote: 'En viernes a las 8pm no podíamos contestar el teléfono sin descuidar las mesas. Ahora el agente toma los pedidos y me los manda por WhatsApp. Ya no perdemos ventas en horas pico.',
    author: 'Dueño de restaurante familiar, Monterrey',
  },
  {
    quote: 'Mis clientes llaman para preguntar si tenemos opción vegetariana o sin gluten. El agente les responde al momento y si quieren hacer reservación, la agenda ahí mismo.',
    author: 'Dueña de café brunch, Guadalajara',
  },
  {
    quote: 'Antes anotábamos los pedidos en un papel y había errores constantemente. Ahora el agente los captura y yo los recibo en el celular. Cero confusiones.',
    author: 'Administrador de taquería con servicio a domicilio, CDMX',
  },
];

const FAQS = [
  {
    q: '¿El agente puede manejar un menú extenso con variantes y modificadores?',
    a: 'Sí. Le proporcionas tu menú en el portal, platillos, precios, variantes (tamaño, sin cebolla, extra queso), y el agente lo maneja en la conversación de forma natural.',
  },
  {
    q: '¿Cómo me llegan los pedidos y reservaciones?',
    a: 'Al instante por WhatsApp y correo electrónico. También quedan registrados en tu portal donde puedes verlos todos en un solo lugar. Si tu sistema POS lo permite, los pedidos y reservaciones se registran ahí automáticamente también.',
  },
  {
    q: '¿Puede coordinar con plataformas de delivery como Rappi o Uber Eats?',
    a: 'El agente maneja pedidos telefónicos directos, no integra con apps de terceros. Pero es ideal para los clientes que prefieren llamar en lugar de usar una app.',
  },
  {
    q: '¿Funciona si tenemos promociones o menú del día que cambia?',
    a: 'Sí. Puedes actualizar la información del menú desde el portal en cualquier momento. El agente toma los cambios al instante, sin necesidad de reprogramar nada.',
  },
];

export default function RestaurantesPage() {
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
          <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Centinelia para restaurantes y cafeterías
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', color: '#fff' }}>
            Tu restaurante nunca más{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              pierde un pedido
            </span>
          </h1>
          <p className="mb-8 max-w-2xl mx-auto" style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>
            Un agente de voz con IA atiende las llamadas de tu restaurante a cualquier hora. Toma pedidos, agenda reservaciones y responde sobre el menú, mientras tú y tu equipo se concentran en el servicio.
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
          <h2 className="font-bold text-center mb-12" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
            En hora pico, el teléfono es lo último que puedes atender
          </h2>
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
              <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: C.text }}>
                Un mesero virtual que atiende el teléfono mientras tú atiendes el restaurante
              </h2>
              <p className="mb-8 leading-relaxed" style={{ color: C.textSub }}>
                Centinelia configura un agente entrenado con tu menú, horarios y políticas. Habla de forma natural, sin sonar como un robot, y registra cada interacción para que no se pierda ningún detalle.
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
            </div>
            <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(135deg, rgba(108,59,255,0.06), rgba(155,109,255,0.03))', border: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="rounded-full flex items-center justify-center" style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}>
                  <UtensilsCrossed size={20} color="#fff" />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: C.text }}>Agente activo ahora mismo</p>
                  <p className="text-xs" style={{ color: C.textSub }}>Restaurante ejemplo · Viernes 9:14 pm</p>
                </div>
              </div>
              {[
                { msg: '"Buenas, ¿hacen pedidos para llevar a esta hora?"' },
                { msg: 'Claro que sí, estamos disponibles hasta las 11pm. ¿Qué le gustaría ordenar?', agent: true },
                { msg: '"Dos tacos de arrachera y una orden de quesadillas, para recoger en 30 minutos."' },
                { msg: 'Perfecto. ¿Me da su nombre para el pedido? El tiempo estimado es 25 minutos.', agent: true },
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
            Llamadas que se pagan solas
          </h2>
          <p className="text-center mb-12 max-w-xl mx-auto text-sm leading-relaxed" style={{ color: C.textSub }}>
            Además de atender llamadas entrantes, el agente puede hacer llamadas salientes en nombre de tu restaurante.
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
          <h2 className="font-bold text-center mb-12" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: C.text }}>
            Lo que dicen los restaurantes que ya lo usan
          </h2>
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
          <h2 className="font-bold text-center mb-10" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: C.text }}>
            Preguntas frecuentes de restaurantes
          </h2>
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
          <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#fff' }}>
            Deja de perder ventas en hora pico
          </h2>
          <p className="mb-8" style={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.7 }}>
            Activo en menos de 24 horas. Sin contratos de permanencia. Reservaciones desde $3,490/mes · con toma de pedidos desde $6,490/mes.
          </p>
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
