import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Phone, ArrowRight, CalendarDays, PhoneOff, Clock, MessageCircle, Star, PhoneOutgoing } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import LandingWidgets from '@/app/LandingWidgets';
import AnimatedSection from '@/app/AnimatedSection';
import MeerkatReveal from '@/app/MeerkatReveal';
import IndustryFooter from '@/app/industrias/IndustryFooter';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title: 'Recepcionista Virtual para Clínicas y Consultorios',
  description: 'Agente de voz con IA que agenda citas, responde preguntas y captura nuevos pacientes 24/7. Sin perder una sola llamada. Agente Comercial desde $2,997/mes.',
  keywords: [
    'recepcionista virtual consultorio', 'agenda citas automática clínica',
    'agente de voz para médicos', 'recepcionista IA consultorio México',
    'atención telefónica clínica', 'chatbot voz médico dentista',
  ],
  alternates: { canonical: `${BASE_URL}/industrias/clinicas` },
  openGraph: {
    title: 'Recepcionista Virtual para Clínicas y Consultorios | Centinelia',
    description: 'Agente de voz con IA que agenda citas, responde preguntas y captura nuevos pacientes 24/7. Agente Comercial desde $2,997/mes.',
    url: `${BASE_URL}/industrias/clinicas`,
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
    title: 'Llamadas que se pierden en horas pico',
    desc: 'La recepcionista está con un paciente y el teléfono suena sin que nadie conteste. Ese paciente llama al siguiente consultorio.',
  },
  {
    icon: <Clock size={22} color="#f59e0b" />,
    title: 'Cero atención fuera de horario',
    desc: 'El 40% de las llamadas llegan después de las 6pm o en fin de semana. Sin nadie que conteste, esas citas nunca se agendan.',
  },
  {
    icon: <MessageCircle size={22} color="#8b5cf6" />,
    title: 'La recepcionista responde lo mismo todo el día',
    desc: '"¿Cuánto cuesta la consulta?", "¿A qué hora abren?", "¿Tienen disponibilidad el viernes?", preguntas que consumen tiempo y atención.',
  },
];

const FEATURES = [
  { label: 'Agenda, modifica y cancela citas, sin intervención humana' },
  { label: 'Responde preguntas frecuentes: costos, seguros, horarios, ubicación' },
  { label: 'Captura datos de nuevos pacientes interesados' },
  { label: 'Transfiere a WhatsApp si el caso requiere atención directa' },
  { label: 'Funciona las 24 horas, los 7 días, sin descansos ni incapacidades' },
  { label: 'Resumen de cada llamada directo a tu WhatsApp o correo' },
];

const OUTBOUND_CASES = [
  {
    title: 'Recordatorio de cita, el día anterior',
    desc: 'Tu empleado llama a cada paciente 24 horas antes para confirmar su cita. Los no-shows cuestan más que cualquier suscripción mensual.',
  },
  {
    title: 'Cancelación aprovechada al instante',
    desc: 'Cuando un paciente cancela, tu empleado llama a quienes estaban en lista de espera. Ese hueco se llena antes de que lo notes.',
  },
  {
    title: 'Seguimiento post-consulta',
    desc: 'Dos días después de un procedimiento, tu empleado pregunta cómo se siente el paciente. Fideliza, detecta situaciones a tiempo y genera reseñas positivas.',
  },
];

const TESTIMONIALS = [
  {
    quote: 'Antes perdíamos citas porque nadie contestaba después de las 7pm. Ahora tu empleado las agenda solo y yo las veo en el portal al día siguiente.',
    author: 'Médico general, consultorio privado, Monterrey',
  },
  {
    quote: 'Mis pacientes llaman para preguntar el precio de la consulta a toda hora. Tu empleado les responde al momento y les agenda si quieren. Ya no dependo de que alguien esté en el escritorio.',
    author: 'Dentista, clínica dental, CDMX',
  },
  {
    quote: 'Pensé que mis pacientes iban a notar que era una IA, pero la mayoría pregunta por citas y listo. El que sí pregunta, tu empleado le dice la verdad y no ha pasado nada.',
    author: 'Psicóloga, consultorio, Guadalajara',
  },
];

const FAQS = [
  {
    q: '¿Puede manejar cancelaciones de último momento?',
    a: 'Sí. Tu empleado acepta cancelaciones y puede ofrecer reagendar en el momento. Tú recibes una notificación inmediata con el hueco disponible.',
  },
  {
    q: '¿Funciona si tenemos varios doctores y horarios distintos?',
    a: 'Sí. Puedes configurar disponibilidad por doctor o por servicio. Tu empleado consulta el calendario en tiempo real y solo ofrece horarios disponibles.',
  },
  {
    q: '¿Qué pasa si un paciente llama por algo urgente o de emergencia?',
    a: 'Tu empleado detecta urgencias y puede transferir la llamada de inmediato a tu número personal o enviar una alerta por WhatsApp para que atiendas tú directamente.',
  },
  {
    q: '¿Puede manejar información médica sensible?',
    a: 'Tu empleado no accede ni almacena expedientes médicos. Su función es logística: agendar, informar y capturar datos de contacto. La información clínica sigue siendo tuya.',
  },
];

export default function ClinicasPage() {
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
          <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Centinelia para clínicas y consultorios
          </p>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', color: '#fff' }}>
            Tu consultorio nunca más{' '}
            <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #C4A8FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              pierde una cita
            </span>
          </h1>
          <p className="mb-8 max-w-xl mx-auto" style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>
            Tu Asistente de clínica atiende llamadas, agenda citas y captura pacientes las 24 horas, sin que nadie falte.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
            >
              Contratar mi Asistente <ArrowRight size={15} />
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
                Cada llamada sin respuesta es un paciente que se va con la competencia
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
                Tu Asistente de clínica: nunca falta, nunca se cansa y siempre contesta
              </h2>
              <p className="mb-8 leading-relaxed" style={{ color: C.textSub }}>
                Centinelia configura un empleado telefónico IA entrenado con la información de tu consultorio. Sabe tus precios, tus horarios, tus servicios, y habla como parte de tu equipo.
              </p>
              <ul className="space-y-3">
                {FEATURES.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm" style={{ color: C.text }}>
                    <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                    {f.label}
                  </li>
                ))}
              </ul>
              <Link
                href="/registro"
                className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
              >
                Contratar ahora <ArrowRight size={14} />
              </Link>
            </AnimatedSection>
            <AnimatedSection delay={0.12}>
              <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(135deg, rgba(108,59,255,0.06), rgba(155,109,255,0.03))', border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="rounded-full flex items-center justify-center" style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}>
                    <CalendarDays size={20} color="#fff" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: C.text }}>Asistente de clínica activo</p>
                    <p className="text-xs" style={{ color: C.textSub }}>Clínica Dental ejemplo · Monterrey</p>
                  </div>
                </div>
                {[
                  { time: '8:34 pm', msg: '"Buenas noches, ¿tienen cita disponible esta semana para limpieza dental?"' },
                  { time: '8:34 pm', msg: 'Sí, tenemos el jueves a las 10am o el viernes a las 4pm. ¿Cuál le viene mejor?', agent: true },
                  { time: '8:35 pm', msg: '"El jueves a las 10, por favor. Me llamo Roberto Garza."' },
                  { time: '8:35 pm', msg: '¡Perfecto, Roberto! Quedaste agendado para el jueves a las 10am. Te llegará una confirmación. ¿Algo más?', agent: true },
                ].map((m, i) => (
                  <div key={i} className={`flex ${m.agent ? 'justify-end' : 'justify-start'} mb-3`}>
                    <div className="max-w-[85%]">
                      <p className="text-xs mb-1" style={{ color: C.textSub, textAlign: m.agent ? 'right' : 'left' }}>{m.time}</p>
                      <div className="rounded-2xl px-4 py-2.5 text-xs leading-relaxed" style={{
                        background: m.agent ? 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' : '#f3f4f6',
                        color: m.agent ? '#fff' : C.text,
                      }}>
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
                Reduce no-shows sin levantar el teléfono
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                Además de atender llamadas entrantes, tu empleado puede hacer llamadas salientes para confirmar, dar seguimiento y fidelizar pacientes.
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
              Lo que dicen los consultorios que ya lo usan
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
              Preguntas frecuentes de clínicas
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
            <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#fff' }}>
              Tu consultorio merece no perder más pacientes
            </h2>
            <p className="mb-8" style={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.7 }}>
              Activo en menos de 24 horas. Sin contratos de permanencia. Agente Comercial desde $2,997/mes.
            </p>
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
            >
              Contratar mi Asistente de clínica <ArrowRight size={15} />
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
