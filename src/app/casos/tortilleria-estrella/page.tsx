// Caso real: Tortillería Estrella + Nelia.
// NO LINKEAR desde navegación pública (navbar, footer, sitemap) hasta
// que Beatriz autorice uso del nombre y logo del cliente.
// La ruta existe para compartir el URL directo con el cliente y pedir
// autorización viendo el asset renderizado.
// Datos verificados: pull directo de voice_calls / ai_ops_log / ops_ledger
// el 2026-10-01 sobre la cuenta agent_id=e22fbc64-c01c-4184-8365-62e423052d7a.

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check, Clock, Phone, Mail, FileText, UserPlus, AlertCircle, Calendar } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter from '@/app/industrias/IndustryFooter';

export const metadata: Metadata = {
  title: 'Caso Tortillería Estrella + Nelia',
  description: 'Primer mes operando: 183 llamadas atendidas, 141 con resolución productiva, 29 en fin de semana, 15 incidencias registradas, bitácora semanal entregada por correo.',
  robots: { index: false, follow: false },
};

const C = {
  bg:      '#FAFBFF',
  bgAlt:   '#F4F0FF',
  surface: '#FFFFFF',
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.60)',
  border:  'rgba(108,59,255,0.12)',
  accent:  '#6C3BFF',
  accentSoft: 'rgba(108,59,255,0.08)',
};

const RESULTADOS = [
  { icon: Phone,     n: '183', label: 'Llamadas atendidas en 34 días' },
  { icon: Check,     n: '141', label: 'Llamadas con resolución productiva (77%)' },
  { icon: Clock,     n: '29',  label: 'Llamadas atendidas en fin de semana' },
  { icon: Clock,     n: '4',   label: 'Llamadas atendidas fuera de horario' },
  { icon: Mail,      n: '31',  label: 'Avisos de queja al encargado por correo' },
  { icon: AlertCircle, n: '15', label: 'Expedientes de queja abiertos' },
  { icon: FileText,  n: '4',   label: 'Bitácoras entregadas por correo (3 semanales + 1 mensual)' },
  { icon: UserPlus,  n: '11',  label: 'Clientes nuevos capturados' },
];

const RESOLUCIONES = [
  { label: 'Preguntas de clientes resueltas', n: 108 },
  { label: 'Pedidos tomados por teléfono',    n: 12 },
  { label: 'Clientes nuevos capturados',      n: 11 },
  { label: 'Transferencias con contexto',     n: 5 },
  { label: 'Quejas registradas',              n: 3 },
  { label: 'Citas agendadas',                 n: 2 },
];

const QUE_HACE = [
  { icon: Phone,     titulo: 'Contesta las llamadas',           desc: 'Al número publicado del negocio. En menos de un timbre, con voz humana.' },
  { icon: Check,     titulo: 'Resuelve preguntas frecuentes',   desc: 'Horario, cobertura, precio, política de pedido. Sin pasarlas a nadie.' },
  { icon: AlertCircle, titulo: 'Registra quejas de clientes',   desc: 'Abre expediente, documenta el caso y notifica por correo al encargado.' },
  { icon: UserPlus,  titulo: 'Captura clientes nuevos',         desc: 'Toma los datos del prospecto y avisa a Beatriz para seguimiento.' },
  { icon: FileText,  titulo: 'Entrega bitácora semanal',        desc: 'Reporte estructurado del movimiento operativo, por correo, sin que se lo pidan.' },
  { icon: Calendar,  titulo: 'Transfiere cuando toca',          desc: 'Pasa la llamada a Beatriz con contexto cuando el caso lo amerita.' },
];

export default function CasoTortilleriaEstrellaPage() {
  return (
    <>
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.22) 0%, transparent 60%)' }} />
        <div className="max-w-5xl mx-auto px-6 relative" style={{ paddingTop: 120, paddingBottom: 90, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Caso real · Primer cliente PyME recurrente
          </p>
          <h1 className="font-bold leading-[1.08] mb-6" style={{ fontSize: 'clamp(2rem, 5vw, 3.4rem)', color: '#fff', maxWidth: 840 }}>
            Un mes, 183 llamadas atendidas. Ninguna se pierde en fin de semana.
          </h1>
          <p style={{ fontSize: 'clamp(1.05rem, 1.8vw, 1.2rem)', color: 'rgba(255,255,255,0.72)', lineHeight: 1.7, maxWidth: 720 }}>
            Tortillería Estrella atiende clientes mayoreo en Monterrey. Nelia, su empleada digital de atención al cliente, trabajó 34 días seguidos sin descanso. Estos son los números verificables de ese mes.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}>
              <Clock size={13} /> 28 agosto a 1 octubre 2026
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}>
              Monterrey · B2B · Tortillería
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold" style={{ background: 'rgba(108,59,255,0.25)', color: '#fff' }}>
              Jornada combinada
            </span>
          </div>
        </div>
      </section>

      {/* Resultados: grid principal */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-6xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3 text-center" style={{ color: C.accent }}>
              Resultados verificables
            </p>
            <h2 className="font-bold mb-4 text-center" style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)', color: C.text }}>
              Lo que hizo Nelia en 34 días
            </h2>
            <p className="text-center mb-12 max-w-2xl mx-auto" style={{ color: C.textSub, fontSize: '1rem', lineHeight: 1.65 }}>
              Datos tomados directo del sistema operativo de Centinelia el 1 de octubre de 2026. Son métricas de producción, no de prueba.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {RESULTADOS.map((r, i) => {
              const Icon = r.icon;
              return (
                <AnimatedSection key={r.label} delay={i * 0.04}>
                  <div className="rounded-2xl p-5 h-full" style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(108,59,255,0.05)' }}>
                    <div className="inline-flex items-center justify-center rounded-xl mb-3" style={{ background: C.accentSoft, width: 36, height: 36 }}>
                      <Icon size={18} color={C.accent} />
                    </div>
                    <p className="font-bold leading-none mb-2" style={{ fontSize: 'clamp(1.6rem, 3vw, 2rem)', color: C.text }}>
                      {r.n}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: C.textSub }}>
                      {r.label}
                    </p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* El reto */}
      <section style={{ background: '#fff', padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              El reto
            </p>
            <h2 className="font-bold mb-6" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
              Una tortillería B2B no puede permitirse perder llamadas
            </h2>
            <div className="space-y-4" style={{ color: C.textSub, fontSize: '1.05rem', lineHeight: 1.75 }}>
              <p>
                Tortillería Estrella le vende tortilla y masa a carnicerías, super centros, restaurantes y mayoreos en toda la zona metropolitana de Monterrey. Más de 25 cuentas activas, con códigos de cliente, políticas de crédito y rutas de reparto propias.
              </p>
              <p>
                Beatriz, encargada administrativa, atendía todo: pedidos nuevos, quejas de clientes mayoreo, confirmaciones de ruta, cobranza, altas y facturación. El teléfono suena todo el día, incluyendo fines de semana y después del horario normal.
              </p>
              <p style={{ color: C.text, fontWeight: 500 }}>
                Un cliente que llama a quejarse de un pedido mal entregado y no obtiene respuesta inmediata deja de pedir. Un prospecto que llama fuera de horario y nadie contesta llama a otra tortillería. Y las quejas que no quedan documentadas se olvidan y se repiten.
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* La solución: Nelia */}
      <section style={{ background: C.bg, padding: '80px 24px', borderTop: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
        {/* Meerkat Nelia desktop (absolute) */}
        <div className="hidden md:block absolute pointer-events-none" style={{ right: '-40px', top: '60px', width: 260, opacity: 0.92 }}>
          <Image src="/meerkats/nelia.png" alt="" width={260} height={260} style={{ width: '100%', height: 'auto' }} />
        </div>

        <div className="max-w-5xl mx-auto relative">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              La solución
            </p>
            <div className="flex items-center gap-4 mb-6 md:mb-4">
              {/* Meerkat Nelia mobile (in-flow) */}
              <div className="block md:hidden" style={{ width: 72, height: 72, flexShrink: 0 }}>
                <Image src="/meerkats/nelia.png" alt="Nelia" width={72} height={72} style={{ width: '100%', height: 'auto' }} />
              </div>
              <h2 className="font-bold" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
                Nelia, empleada digital de atención al cliente
              </h2>
            </div>
            <p className="max-w-2xl mb-10" style={{ color: C.textSub, fontSize: '1.05rem', lineHeight: 1.75 }}>
              Jornada combinada: 1,200 minutos de voz y 1,200 operaciones de negocio al mes. Atiende por teléfono, chat y correo. Trabaja fines de semana y madrugadas sin cobrar horas extra.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            {QUE_HACE.map((item, i) => {
              const Icon = item.icon;
              return (
                <AnimatedSection key={item.titulo} delay={i * 0.05}>
                  <div className="rounded-2xl p-5 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ background: C.accentSoft, width: 32, height: 32 }}>
                        <Icon size={16} color={C.accent} />
                      </div>
                      <h3 className="font-semibold" style={{ color: C.text, fontSize: '0.98rem' }}>{item.titulo}</h3>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: C.textSub, paddingLeft: 44 }}>{item.desc}</p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* Desglose de las 141 productivas */}
      <section style={{ background: '#fff', padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3 text-center" style={{ color: C.accent }}>
              Desglose
            </p>
            <h2 className="font-bold mb-10 text-center" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
              En qué terminaron las 141 llamadas con resolución
            </h2>
          </AnimatedSection>
          <div className="rounded-3xl overflow-hidden" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            {RESOLUCIONES.map((r, i) => (
              <AnimatedSection key={r.label} delay={i * 0.04}>
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: i < RESOLUCIONES.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <p className="font-medium" style={{ color: C.text, fontSize: '0.98rem' }}>{r.label}</p>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block rounded-full" style={{ width: `${(r.n / 108) * 180}px`, maxWidth: 180, height: 8, background: 'linear-gradient(90deg, rgba(108,59,255,0.3), #6C3BFF)' }} />
                    <p className="font-bold tabular-nums" style={{ color: C.text, fontSize: '1.1rem', minWidth: 32, textAlign: 'right' }}>{r.n}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Lo que esto significa */}
      <section style={{ background: C.bg, padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              Lo que esto significa
            </p>
            <h2 className="font-bold mb-8" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
              Qué cambió en la operación de Beatriz
            </h2>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <AnimatedSection delay={0.0}>
              <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                <p className="font-bold mb-2" style={{ color: C.text, fontSize: '1.05rem' }}>Ninguna queja sin expediente</p>
                <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                  Las 15 quejas registradas quedaron todas con expediente abierto y aviso al encargado el mismo día.
                </p>
              </div>
            </AnimatedSection>
            <AnimatedSection delay={0.08}>
              <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                <p className="font-bold mb-2" style={{ color: C.text, fontSize: '1.05rem' }}>Bitácora sin esfuerzo</p>
                <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                  3 bitácoras semanales y 1 mensual entregadas por correo. Beatriz no redactó ninguna.
                </p>
              </div>
            </AnimatedSection>
            <AnimatedSection delay={0.16}>
              <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                <p className="font-bold mb-2" style={{ color: C.text, fontSize: '1.05rem' }}>33 llamadas rescatadas</p>
                <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                  29 en fin de semana más 4 fuera de horario. Todas atendidas que antes se habrían perdido.
                </p>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Qué sigue */}
      <section style={{ background: '#fff', padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              Qué sigue
            </p>
            <h2 className="font-bold mb-6" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
              Segundo mes recurrente y un empleado digital más
            </h2>
            <div className="space-y-4" style={{ color: C.textSub, fontSize: '1.05rem', lineHeight: 1.75 }}>
              <p>
                Después del primer mes, Tortillería Estrella renovó. Hoy está activa como cliente recurrente en el segundo mes.
              </p>
              <p>
                Beatriz pidió sumar un segundo empleado digital para facturación de clientes mayoreo. Nala, empleada digital de facturista con adaptador contable, entró en trial el 8 de septiembre con un mapeo precargado de más de 25 clientes de la cartera activa.
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Metodología / honestidad */}
      <section style={{ background: C.bg, padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              Cómo medimos
            </p>
            <div className="rounded-2xl p-6" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
              <ul className="space-y-3 text-sm" style={{ color: C.textSub, lineHeight: 1.7 }}>
                <li className="flex items-start gap-2">
                  <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                  <span>Las cifras salen del sistema operativo de Centinelia (tablas de llamadas, operaciones y ledger de consumo).</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                  <span>Periodo medido: 28 de agosto al 1 de octubre de 2026, 34 días naturales.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                  <span>&ldquo;Resolución productiva&rdquo; incluye preguntas resueltas, pedidos, leads, transferencias con contexto, quejas registradas y citas agendadas.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                  <span>&ldquo;Llamadas atendidas&rdquo; incluye todas las que sonaron en el número publicado y pasaron por Nelia, incluso las que la contraparte colgó.</span>
                </li>
              </ul>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#0D0520', padding: '90px 24px' }}>
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: '#fff', lineHeight: 1.2 }}>
              ¿Quieres un primer mes así en tu negocio?
            </h2>
            <p className="mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1rem', lineHeight: 1.65 }}>
              Activa a tu empleado digital en menos de 24 horas. Sin permanencia.
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

      <IndustryFooter />
    </>
  );
}
