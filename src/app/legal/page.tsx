import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Legal — Centinelia',
  description: 'Términos y condiciones, aviso de privacidad y políticas de uso de Centinelia.',
  robots: { index: true, follow: true },
};

const C = {
  bg:       '#FAFBFF',
  text:     '#1A0A3B',
  textSub:  'rgba(26,10,59,0.55)',
  textMute: 'rgba(26,10,59,0.38)',
  border:   'rgba(108,59,255,0.1)',
  accent:   '#6C3BFF',
};

const TOC = [
  { href: '#terminos',    label: 'Términos y Condiciones' },
  { href: '#privacidad',  label: 'Aviso de Privacidad' },
  { href: '#grabaciones', label: 'Grabación de Llamadas' },
  { href: '#lncl',        label: 'Uso Responsable / LNCL' },
];

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ borderTop: `1px solid ${C.border}`, paddingTop: 32, marginTop: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 16 }}>{title}</h2>
      {children}
    </div>
  );
}

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 15, color: C.textSub, lineHeight: 1.65, marginBottom: 10 }}>{children}</p>;
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
      <span style={{ color: C.accent, marginTop: 2, flexShrink: 0 }}>•</span>
      <p style={{ fontSize: 15, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{children}</p>
    </div>
  );
}

export default function LegalPage() {
  const updatedAt = '6 de julio de 2026';

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>
      {/* Header — sticky */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="transition-opacity hover:opacity-70">
            <Image src="/logo.png" alt="Centinelia" width={160} height={44} style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
          </Link>
          <Link href="/registro" className="px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90" style={{ background: C.accent, color: '#fff' }}>
            Contratar
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-5 sm:px-8" style={{ paddingTop: 56, paddingBottom: 80 }}>
        {/* Page title */}
        <p style={{ fontSize: 13, color: C.textMute, marginBottom: 8 }}>Última actualización: {updatedAt}</p>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: C.text, marginBottom: 16, lineHeight: 1.2 }}>Legal</h1>
        <p style={{ fontSize: 16, color: C.textSub, lineHeight: 1.7, maxWidth: 680 }}>
          Esta página concentra todos los documentos legales de Centinelia. Al contratar o usar el servicio
          aceptas lo establecido aquí.
        </p>

        {/* Mobile TOC pills */}
        <nav className="flex flex-col gap-1 mt-7 lg:hidden">
          {TOC.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium"
              style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text, textDecoration: 'none' }}
            >
              <span>{link.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>0{i + 1}</span>
            </a>
          ))}
        </nav>

        {/* Desktop 2-col: sticky sidebar + content */}
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-16 lg:items-start" style={{ marginTop: 32 }}>

          {/* Desktop sticky TOC sidebar */}
          <aside className="hidden lg:block" style={{ position: 'sticky', top: 88 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textMute, marginBottom: 12 }}>
              Contenido
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {TOC.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:text-[#6C3BFF] hover:bg-[rgba(108,59,255,0.06)]"
                  style={{ color: C.textSub, textDecoration: 'none' }}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <main>
            {/* ── 1. Términos y Condiciones ──────────────────────────────────────── */}
            <Section id="terminos" title="1. Términos y Condiciones del Servicio">
              <Clause title="1.1 Partes">
                <P>
                  <strong>Prestador del servicio:</strong> Pneuma Studio, desarrollador de la plataforma
                  Centinelia (en adelante &ldquo;Centinelia&rdquo;), contacto: hola@centinelia.mx.
                </P>
                <P>
                  <strong>Cliente:</strong> la persona física o moral que contrata, activa o usa el servicio
                  de agente de voz IA a través del sitio web o del portal de clientes de Centinelia.
                </P>
              </Clause>

              <Clause title="1.2 Objeto">
                <P>
                  Centinelia proporciona un agente de voz impulsado por inteligencia artificial que atiende y
                  realiza llamadas telefónicas en nombre del Cliente, según las capacidades del plan contratado.
                  El agente opera las 24 horas del día bajo la configuración y la base de conocimiento que el
                  Cliente establece en su portal.
                </P>
              </Clause>

              <Clause title="1.3 Activación y vigencia">
                <P>
                  El servicio se activa al completar el pago inicial de instalación a través de Stripe. La
                  vigencia es mensual con renovación automática. El Cliente puede cancelar en cualquier momento
                  con al menos 5 días naturales de anticipación a su fecha de renovación.
                </P>
              </Clause>

              <Clause title="1.4 Pagos">
                <P>
                  La mensualidad se cobra automáticamente a través de Stripe en la fecha de renovación.
                  En caso de fallo de pago, el Cliente recibe una notificación y cuenta con 3 días naturales
                  de gracia antes de que el agente sea pausado. El servicio se reactiva al actualizar el método
                  de pago. No se emiten reembolsos por períodos parciales.
                </P>
                <P>
                  Los minutos incluidos no utilizados en un mes se transfieren al siguiente, con un límite de
                  acumulación equivalente a un mes adicional del plan activo.
                </P>
              </Clause>

              <Clause title="1.5 Responsabilidades del Cliente">
                <Item>Mantener actualizada la base de conocimiento del agente (horarios, servicios, precios, FAQs).</Item>
                <Item>Verificar la exactitud de la información que el agente comunica a sus clientes finales.</Item>
                <Item>Notificar a sus clientes finales que las llamadas pueden ser grabadas, conforme a la LFPDPPP.</Item>
                <Item>Cumplir con la legislación aplicable en materia de telecomunicaciones, privacidad y protección al consumidor.</Item>
              </Clause>

              <Clause title="1.6 Limitación de responsabilidad">
                <P>
                  Centinelia es un agente de voz automatizado y no sustituye asesoría profesional de ningún
                  tipo (legal, médica, financiera u otra). Centinelia no se hace responsable de decisiones que
                  terceros tomen con base en la información del agente, ni de interrupciones derivadas de fallas
                  en proveedores de telecomunicaciones o infraestructura de terceros (Vapi, Twilio, ElevenLabs,
                  entre otros).
                </P>
                <P>
                  La responsabilidad máxima de Centinelia en cualquier circunstancia se limita al monto pagado
                  por el servicio en los tres (3) meses previos al evento que origina la reclamación.
                </P>
              </Clause>

              <Clause title="1.7 Suspensión y baja del servicio">
                <P>
                  Centinelia puede suspender o dar de baja el servicio, con previo aviso de 15 días naturales,
                  por incumplimiento de estos términos, uso del agente para actividades ilegales, o por decisión
                  de negocio con reembolso proporcional al período no utilizado.
                </P>
                <P>
                  Si el agente permanece pausado por más de 3 meses consecutivos sin regularización, Centinelia
                  podrá reasignar el número telefónico asignado, notificando con al menos 15 días de anticipación.
                </P>
              </Clause>

              <Clause title="1.8 Uso de marca">
                <P>
                  Al contratar el servicio, el Cliente autoriza a Centinelia a mencionar el nombre del negocio
                  como caso de éxito en materiales de marketing, sin revelar información confidencial. Esta
                  autorización puede revocarse en cualquier momento escribiendo a hola@centinelia.mx.
                </P>
              </Clause>

              <Clause title="1.9 Ley aplicable y jurisdicción">
                <P>
                  Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Las partes se someten
                  a los tribunales competentes de Monterrey, Nuevo León, renunciando a cualquier otro fuero.
                </P>
              </Clause>
            </Section>

            {/* ── 2. Aviso de Privacidad ─────────────────────────────────────────── */}
            <Section id="privacidad" title="2. Aviso de Privacidad">
              <P>
                Centinelia (Pneuma Studio) es responsable del tratamiento de tus datos personales conforme a
                la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
              </P>

              <Clause title="Datos que recopilamos">
                <Item>
                  <strong>Del Cliente:</strong> nombre, correo electrónico, teléfono y datos de facturación
                  procesados por Stripe (Centinelia no almacena datos de tarjeta).
                </Item>
                <Item>
                  <strong>Del negocio:</strong> nombre, descripción, horarios, base de conocimiento y
                  configuración del agente.
                </Item>
                <Item>
                  <strong>De los llamantes:</strong> número de teléfono, grabación y transcripción de la
                  llamada cuando el agente esté configurado para ello.
                </Item>
              </Clause>

              <Clause title="Finalidades">
                <Item>Prestar el servicio de agente de voz y generar los reportes del portal del cliente.</Item>
                <Item>Enviar resúmenes de llamadas y notificaciones operativas por WhatsApp y correo.</Item>
                <Item>Mejorar la precisión del servicio con datos anonimizados.</Item>
                <Item>Cumplir con obligaciones legales y fiscales.</Item>
              </Clause>

              <Clause title="Derechos ARCO">
                <P>
                  El Cliente y cualquier llamante pueden ejercer sus derechos de Acceso, Rectificación,
                  Cancelación u Oposición enviando una solicitud a <strong>hola@centinelia.mx</strong>.
                </P>
              </Clause>

              <P>
                Para el detalle completo consulta nuestro{' '}
                <Link href="/privacidad-datos" style={{ color: C.accent }}>
                  aviso de privacidad completo
                </Link>.
              </P>
            </Section>

            {/* ── 3. Grabación de llamadas ───────────────────────────────────────── */}
            <Section id="grabaciones" title="3. Grabación y Transcripción de Llamadas">
              <P>
                El agente puede estar configurado para grabar y transcribir las llamadas. Las grabaciones
                quedan disponibles en el portal del Cliente y se conservan por hasta 12 meses.
              </P>

              <Clause title="Aviso al llamante">
                <P>
                  Cuando la grabación está activa, el agente notifica al llamante al inicio de la conversación.
                  Esta notificación cumple con la Ley Federal de Telecomunicaciones y Radiodifusión (LFTR)
                  y la LFPDPPP. El Cliente no debe desactivar este aviso ni usar las grabaciones para fines
                  distintos a la mejora de su propio servicio.
                </P>
              </Clause>

              <Clause title="Acceso y uso">
                <Item>Solo el Cliente y el equipo de soporte de Centinelia con causa justificada tienen acceso a las grabaciones.</Item>
                <Item>Centinelia puede usar datos de llamadas anonimizados para mejorar sus modelos de IA. Nunca se comparten grabaciones identificables con terceros sin consentimiento explícito.</Item>
                <Item>Al cancelar el servicio, el Cliente puede solicitar la exportación o eliminación de sus grabaciones.</Item>
              </Clause>
            </Section>

            {/* ── 4. Uso Responsable / LNCL ──────────────────────────────────────── */}
            <Section id="lncl" title="4. Uso Responsable y Lista Nacional de No Llamar (LNCL)">
              <P>
                Esta sección aplica especialmente a Clientes que usan la funcionalidad de llamadas salientes.
              </P>

              <Clause title="4.1 Uso permitido">
                <P>El agente puede realizar llamadas salientes únicamente para:</P>
                <Item>Devolver llamadas que el negocio no pudo contestar (llamadas perdidas).</Item>
                <Item>Confirmar, modificar o cancelar citas con clientes con relación previa al negocio.</Item>
                <Item>Dar seguimiento a prospectos que proporcionaron sus datos voluntariamente.</Item>
                <Item>Comunicaciones operativas con clientes existentes (recordatorios, actualizaciones, etc.).</Item>
              </Clause>

              <Clause title="4.2 Lista Nacional de No Llamar (LNCL)">
                <P>
                  La LNCL es un registro de PROFECO en el que los consumidores se inscriben para no recibir
                  llamadas de telemercadeo no solicitadas, conforme a los artículos 17 BIS y 17 BIS 2 de la
                  Ley Federal de Protección al Consumidor (LFPC).
                </P>
                <P>
                  El <strong>Cliente</strong>, como proveedor que origina las llamadas, es el responsable legal
                  de verificar que los números de destino no estén inscritos en la LNCL cuando la naturaleza
                  de las llamadas así lo requiera. Centinelia actúa como proveedor de tecnología y no es parte
                  en las comunicaciones del agente.
                </P>
              </Clause>

              <Clause title="4.3 Usos prohibidos">
                <Item>Prospección masiva a listas de contactos sin consentimiento previo del destinatario.</Item>
                <Item>Contactar de forma reiterada a personas que hayan solicitado no ser contactadas.</Item>
                <Item>Difundir información falsa, engañosa o que induzca al error al consumidor.</Item>
                <Item>Cualquier actividad contraria a la legislación mexicana en materia de telecomunicaciones, protección al consumidor o datos personales.</Item>
              </Clause>

              <Clause title="4.4 Indemnización">
                <P>
                  El Cliente se compromete a indemnizar y sacar en paz a Centinelia respecto de cualquier
                  reclamación, sanción, multa o procedimiento administrativo iniciado por PROFECO, IFT o
                  cualquier autoridad competente, derivado del uso que el Cliente dé al servicio de llamadas
                  salientes.
                </P>
              </Clause>
            </Section>

            {/* Footer */}
            <div
              style={{
                marginTop: 64, paddingTop: 24,
                borderTop: `1px solid ${C.border}`,
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexWrap: 'wrap', gap: 12,
              }}
            >
              <p style={{ fontSize: 12, color: C.textMute }}>
                © {new Date().getFullYear()} Centinelia · Pneuma Studio
              </p>
              <Link href="/" style={{ fontSize: 12, color: C.accent }}>
                ← Volver al inicio
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
