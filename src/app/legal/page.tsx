import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import MobileSideNav from '@/components/MobileSideNav';

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
  { href: '#seguridad',   label: 'Medidas de Seguridad' },
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
  const updatedAt = '25 de julio de 2026';

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

        {/* Mobile sidebar nav */}
        <div className="lg:hidden">
          <MobileSideNav sections={TOC.map(t => ({ id: t.href.replace('#', ''), label: t.label }))} side="right" />
        </div>

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
            <Section id="privacidad" title="2. Aviso de Privacidad Integral">
              <P>
                En cumplimiento con lo dispuesto por los artículos 15, 16 y 17 de la Ley Federal de
                Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento,
                Centinelia pone a disposición del titular el presente Aviso de Privacidad Integral.
              </P>

              <Clause title="2.1 Identidad y domicilio del responsable">
                <P>
                  <strong>Pneuma Studio</strong>, desarrolladora y operadora de la plataforma Centinelia
                  (en adelante &ldquo;Centinelia&rdquo; o el &ldquo;Responsable&rdquo;), con domicilio
                  convencional para oír y recibir notificaciones en materia de datos personales en:
                  Monterrey, Nuevo León, México, y correo electrónico de contacto{' '}
                  <a href="mailto:privacidad@centinelia.mx" style={{ color: C.accent }}>privacidad@centinelia.mx</a>,
                  es el responsable del tratamiento de tus datos personales.
                </P>
              </Clause>

              <Clause title="2.2 Departamento de Datos Personales">
                <P>
                  Para atender cualquier asunto relacionado con el tratamiento de tus datos, incluida
                  la solicitud de derechos ARCO o la revocación del consentimiento, dirígete al
                  Departamento de Datos Personales de Centinelia:
                </P>
                <Item>Correo: <a href="mailto:privacidad@centinelia.mx" style={{ color: C.accent }}>privacidad@centinelia.mx</a></Item>
                <Item>Horario de atención: lunes a viernes de 9:00 a 18:00 hrs (tiempo del centro de México).</Item>
              </Clause>

              <Clause title="2.3 Datos personales que recabamos">
                <P>El Responsable recaba las siguientes categorías de datos personales:</P>
                <Item>
                  <strong>Del Cliente titular de la cuenta:</strong> nombre completo, correo electrónico,
                  teléfono, nombre y giro del negocio, RFC (cuando aplique KYC), y datos de facturación
                  procesados por Stripe (Centinelia no almacena datos de tarjeta).
                </Item>
                <Item>
                  <strong>Del negocio:</strong> descripción, horarios, base de conocimiento y configuración
                  del agente definida por el Cliente.
                </Item>
                <Item>
                  <strong>De los llamantes (usuarios finales que llaman al negocio del Cliente):</strong>
                  {' '}número de teléfono, grabación de audio y transcripción de la llamada cuando el agente
                  esté configurado para ello, y datos que el propio llamante proporcione voluntariamente
                  durante la conversación (nombre, correo, dirección, motivo del contacto, etc.).
                </Item>
                <Item>
                  <strong>De navegación:</strong> dirección IP y datos técnicos mínimos de sesión
                  (ver sección 2.7 &ldquo;Cookies y tecnologías&rdquo;).
                </Item>
              </Clause>

              <Clause title="2.4 Datos personales sensibles y menores de edad">
                <P>
                  Centinelia <strong>no recaba de manera intencional</strong> datos personales sensibles
                  (origen racial o étnico, estado de salud, información genética, creencias religiosas o
                  filosóficas, afiliación sindical, opiniones políticas, preferencia sexual). Si un
                  llamante los proporciona espontáneamente durante una llamada, se tratarán con las
                  medidas reforzadas descritas en la sección 3 de este documento y podrán ser eliminados
                  a petición expresa del titular.
                </P>
                <P>
                  El servicio no está dirigido a menores de edad. Si detectamos que se han recabado
                  datos de un menor sin consentimiento verificable del padre, madre o tutor, los
                  eliminaremos inmediatamente al ser notificados.
                </P>
              </Clause>

              <Clause title="2.5 Finalidades del tratamiento">
                <P>
                  Todas las finalidades para las que Centinelia trata tus datos son <strong>primarias
                  y necesarias</strong> para prestar el servicio contratado. No existen finalidades
                  secundarias (mercadotecnia, publicidad ni prospección comercial ajenas al servicio).
                </P>
                <P>Finalidades primarias:</P>
                <Item>Prestar el servicio de agente de voz IA y de operaciones para el Cliente.</Item>
                <Item>Generar los reportes, métricas y grabaciones que se muestran en el portal del Cliente.</Item>
                <Item>Enviar resúmenes de llamadas, notificaciones operativas y avisos del servicio por correo.</Item>
                <Item>Procesar el cobro de la mensualidad y emitir comprobantes fiscales.</Item>
                <Item>Cumplir con obligaciones legales, fiscales y regulatorias aplicables.</Item>
                <Item>Atender solicitudes de soporte, incidencias y consultas del Cliente.</Item>
              </Clause>

              <Clause title="2.6 Transferencias de datos">
                <P>
                  Para operar el servicio, Centinelia transfiere datos personales a los siguientes
                  encargados y subencargados, incluidas transferencias internacionales a Estados Unidos
                  de América y la Unión Europea. Estas transferencias son <strong>necesarias para el
                  cumplimiento de la relación jurídica</strong> entre el Cliente y el Responsable, por
                  lo que, conforme al artículo 37 de la LFPDPPP, <strong>no requieren consentimiento
                  adicional</strong> del titular:
                </P>
                <Item><strong>Supabase Inc. / AWS (EE.UU.):</strong> base de datos y almacenamiento.</Item>
                <Item><strong>Vercel Inc. (EE.UU.):</strong> alojamiento y entrega de la aplicación web.</Item>
                <Item><strong>Stripe, Inc. (EE.UU.):</strong> procesamiento de pagos, PCI DSS Nivel 1.</Item>
                <Item><strong>Vapi Inc. (EE.UU.):</strong> orquestación de llamadas.</Item>
                <Item><strong>Twilio Inc. (EE.UU.):</strong> telefonía y números virtuales.</Item>
                <Item><strong>ElevenLabs Inc. (EE.UU.):</strong> síntesis de voz.</Item>
                <Item><strong>Anthropic PBC (EE.UU.):</strong> modelos de lenguaje.</Item>
                <Item><strong>OpenAI L.L.C. (EE.UU.):</strong> modelos de lenguaje complementarios.</Item>
                <Item><strong>Deepgram Inc. (EE.UU.):</strong> transcripción de voz.</Item>
                <Item><strong>Upstash Inc. (EE.UU./UE):</strong> control de tasas de peticiones.</Item>
                <P>
                  Todos los proveedores anteriores están obligados contractualmente a proteger los
                  datos con estándares equivalentes o superiores a los establecidos en la LFPDPPP.
                  Centinelia <strong>no vende, alquila ni comparte datos personales con terceros
                  para fines comerciales</strong> ajenos al servicio.
                </P>
              </Clause>

              <Clause title="2.7 Cookies y tecnologías de rastreo">
                <P>
                  Centinelia utiliza únicamente cookies y almacenamiento local <strong>estrictamente
                  necesarios</strong> para el funcionamiento del sitio y del portal (mantener la sesión
                  iniciada, recordar preferencias mínimas de interfaz). No usamos cookies de publicidad,
                  perfilamiento ni rastreo entre sitios. No integramos redes sociales ni pixeles de
                  terceros con fines de marketing.
                </P>
              </Clause>

              <Clause title="2.8 Derechos ARCO">
                <P>
                  El titular tiene derecho a solicitar el <strong>Acceso</strong>, <strong>Rectificación</strong>,
                  <strong> Cancelación</strong> u <strong>Oposición</strong> (derechos ARCO) al tratamiento
                  de sus datos personales, así como a <strong>revocar el consentimiento</strong> otorgado
                  para dicho tratamiento.
                </P>
                <P><strong>Procedimiento:</strong></P>
                <Item>
                  <strong>1. Envío de solicitud.</strong> Enviar correo a{' '}
                  <a href="mailto:privacidad@centinelia.mx" style={{ color: C.accent }}>privacidad@centinelia.mx</a>{' '}
                  con el asunto &ldquo;Solicitud ARCO&rdquo;, indicando derecho que ejerce, datos que
                  desea acceder / rectificar / cancelar / oponerse, y motivo (si aplica).
                </Item>
                <Item>
                  <strong>2. Acreditación de identidad.</strong> Adjuntar copia de identificación oficial
                  vigente (INE, pasaporte o cédula) del titular o, en su caso, del representante legal
                  junto con el poder correspondiente.
                </Item>
                <Item>
                  <strong>3. Respuesta.</strong> Centinelia responderá en un plazo máximo de{' '}
                  <strong>20 días hábiles</strong> contados a partir de la recepción de la solicitud
                  completa, informando si la solicitud es procedente.
                </Item>
                <Item>
                  <strong>4. Ejecución.</strong> Si la solicitud es procedente, se hará efectiva
                  dentro de los <strong>15 días hábiles</strong> siguientes a la fecha en que se
                  comunique la respuesta.
                </Item>
                <P>
                  Los plazos anteriores podrán ampliarse por una sola vez y por un período igual
                  cuando las circunstancias del caso lo justifiquen. El ejercicio de los derechos
                  ARCO es gratuito; únicamente deberán cubrirse, en su caso, los gastos justificados
                  de envío o el costo de reproducción en copias u otros formatos.
                </P>
              </Clause>

              <Clause title="2.9 Limitación de uso o divulgación">
                <P>
                  Además de los derechos ARCO, el titular puede limitar el uso o divulgación de sus
                  datos mediante los mismos canales previstos en la sección 2.8. Asimismo, puede
                  inscribirse en el <strong>Registro Público de Consumidores (REPEP)</strong> de la
                  PROFECO o en el <strong>Registro Público para Evitar Publicidad (REP)</strong> del
                  propio consumidor para no recibir publicidad no deseada.
                </P>
              </Clause>

              <Clause title="2.10 Cambios al aviso de privacidad">
                <P>
                  Centinelia se reserva el derecho de modificar el presente aviso conforme evolucionen
                  el servicio y la legislación aplicable. Cualquier cambio sustancial será notificado
                  a los Clientes por correo electrónico con al menos 15 días naturales de anticipación
                  y publicado en esta misma página. La versión vigente siempre podrá consultarse en{' '}
                  <Link href="/legal#privacidad" style={{ color: C.accent }}>centinelia.mx/legal#privacidad</Link>.
                  La fecha de última actualización aparece al inicio de esta página.
                </P>
              </Clause>

              <Clause title="2.11 Autoridad reguladora">
                <P>
                  Si consideras que tu derecho a la protección de datos personales ha sido vulnerado
                  por Centinelia, puedes acudir al <strong>Instituto Nacional de Transparencia,
                  Acceso a la Información y Protección de Datos Personales (INAI)</strong> a través
                  de su portal:{' '}
                  <a href="https://home.inai.org.mx" target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>
                    home.inai.org.mx
                  </a>.
                </P>
              </Clause>

              <P>
                Si prefieres una explicación sin términos jurídicos, consulta la{' '}
                <Link href="/privacidad-datos" style={{ color: C.accent }}>
                  versión en lenguaje sencillo
                </Link>{' '}
                de este aviso.
              </P>
            </Section>

            {/* ── 3. Medidas de Seguridad Técnica ───────────────────────────────── */}
            <Section id="seguridad" title="3. Medidas de Seguridad Técnica">
              <P>
                Centinelia implementa las siguientes medidas de seguridad técnica y organizacional
                para proteger los datos personales que trata, conforme a lo establecido en el
                artículo 19 de la LFPDPPP y su Reglamento.
              </P>

              <Clause title="Cifrado en tránsito y en reposo">
                <Item>Todas las comunicaciones entre el navegador del Cliente y los servidores de Centinelia se realizan
                  exclusivamente mediante HTTPS con HSTS (<em>HTTP Strict Transport Security</em>),
                  lo que impide conexiones sin cifrado incluso si el usuario introduce una URL sin &ldquo;https&rdquo;.</Item>
                <Item>Las bases de datos están alojadas en Supabase (AWS), que aplica cifrado AES-256 en reposo
                  a nivel de almacenamiento.</Item>
              </Clause>

              <Clause title="Autenticación y control de acceso">
                <Item>Las contraseñas del portal de clientes se almacenan con hashing PBKDF2-SHA256 a 100,000 iteraciones
                  con salt único por cuenta, estándar equivalente al recomendado por NIST SP 800-132.</Item>
                <Item>Las sesiones se gestionan mediante tokens firmados con HMAC-SHA256 y fecha de vencimiento;
                  cualquier alteración invalida la sesión de forma inmediata.</Item>
                <Item>Las comparaciones de tokens de autenticación se realizan mediante operaciones de tiempo constante
                  para prevenir ataques de temporización (<em>timing attacks</em>).</Item>
                <Item>Cada solicitud a la API verifica que el usuario autenticado sea propietario del recurso
                  que solicita (control de acceso por objeto).</Item>
              </Clause>

              <Clause title="Pagos">
                <Item>Los pagos son procesados en su totalidad por Stripe Inc., certificado PCI DSS Nivel 1.
                  Centinelia nunca recibe, transmite ni almacena números de tarjeta, fechas de vencimiento
                  ni códigos de seguridad.</Item>
              </Clause>

              <Clause title="Protección de la infraestructura">
                <Item>Se aplican cabeceras de seguridad HTTP en todas las respuestas: Content Security Policy (CSP),
                  X-Frame-Options, X-Content-Type-Options, Referrer-Policy y Permissions-Policy.</Item>
                <Item>El agente de IA tiene restricciones técnicas que impiden que sea utilizado para acceder
                  a recursos internos de red (<em>SSRF protection</em>).</Item>
                <Item>Se aplican límites de peticiones por sesión (<em>rate limiting</em>) en todos los
                  endpoints sensibles para prevenir abuso y denegación de servicio.</Item>
                <Item>Las entradas que recibe el sistema están validadas en formato y longitud antes de ser
                  procesadas o enviadas a APIs de terceros.</Item>
              </Clause>

              <Clause title="Proveedores de infraestructura">
                <P>
                  Centinelia utiliza los siguientes subencargados para operar el servicio, todos con sus
                  propias certificaciones de seguridad:
                </P>
                <Item><strong>Supabase / AWS</strong> — base de datos y almacenamiento de archivos.</Item>
                <Item><strong>Vercel</strong> — alojamiento y entrega de la aplicación web.</Item>
                <Item><strong>Stripe</strong> — procesamiento de pagos (PCI DSS Nivel 1).</Item>
                <Item><strong>Vapi / Twilio / ElevenLabs</strong> — infraestructura de voz y telefonía.</Item>
                <Item><strong>Anthropic / OpenAI</strong> — modelos de inteligencia artificial.</Item>
                <Item><strong>Upstash</strong> — control de tasas de peticiones (Redis).</Item>
              </Clause>

              <Clause title="Incidentes de seguridad">
                <P>
                  En caso de que Centinelia detecte o tenga conocimiento de una vulneración de datos que
                  afecte a Clientes, se comprometería a notificarles en un plazo no mayor a 72 horas
                  desde que el incidente sea confirmado, informando la naturaleza de los datos comprometidos
                  y las medidas adoptadas.
                </P>
              </Clause>
            </Section>

            {/* ── 4. Grabación de llamadas ───────────────────────────────────────── */}
            <Section id="grabaciones" title="4. Grabación y Transcripción de Llamadas">
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

            {/* ── 5. Uso Responsable / LNCL ──────────────────────────────────────── */}
            <Section id="lncl" title="5. Uso Responsable y Lista Nacional de No Llamar (LNCL)">
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
