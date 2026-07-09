import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Preguntas frecuentes',
  description: 'Todo lo que necesitas saber sobre Centinelia: precios, capacidades, integraciones, industrias y mas. Respuestas directas, sin rodeos.',
  alternates: { canonical: 'https://www.centinelia.mx/faq' },
  openGraph: {
    title: 'Preguntas frecuentes | Centinelia',
    description: 'Todo lo que necesitas saber sobre los agentes de voz IA de Centinelia.',
    url: 'https://www.centinelia.mx/faq',
  },
};

const CATEGORIES = [
  {
    id: 'general',
    title: 'General',
    items: [
      {
        q: '¿Que es Centinelia?',
        a: 'Centinelia es un servicio de agentes de voz con inteligencia artificial para negocios mexicanos. En lugar de perder llamadas por falta de personal, tu negocio tiene un equipo de agentes especializados que contestan 24/7, agendan citas, capturan leads y realizan llamadas salientes. No es un bot de menu ("marque 1 para ventas"), es una conversacion natural con IA.',
      },
      {
        q: '¿Como funciona?',
        a: 'Contratas un plan, recibes acceso al portal, agregas la informacion de tu negocio (horarios, servicios, precios, preguntas frecuentes) y en menos de 24 horas tu agente esta activo atendiendo llamadas. Cada llamada se graba, transcribe y analiza. Los leads aparecen en tu portal en tiempo real.',
      },
      {
        q: '¿Es un chatbot o un agente de voz?',
        a: 'Es un agente de voz: el cliente llama a un numero de telefono y habla naturalmente, como con cualquier persona. No hay menus, no hay comandos de voz, no hay "diga si o diga no". La conversacion es fluida gracias a modelos de lenguaje de ultima generacion y las voces de ElevenLabs.',
      },
      {
        q: '¿Centinelia reemplaza a mi recepcionista?',
        a: 'Complementa o reemplaza segun el caso. Para negocios sin recepcionista, cubre la funcion completa. Para negocios que ya tienen personal, elimina las llamadas perdidas fuera de horario, los tiempos de espera y las tareas repetitivas, liberando al equipo humano para lo que realmente importa.',
      },
      {
        q: '¿Suena natural o robotico?',
        a: 'Natural. Usa voces de ElevenLabs, la misma tecnologia que usan estudios de doblaje y plataformas de contenido globales. La mayoria de los clientes no notan la diferencia. Si quieres comprobarlo, llama al numero demo: +52 (81) 2188 8490.',
      },
      {
        q: '¿Puedo probarlo antes de contratar?',
        a: 'Si. Tenemos un agente demo activo al que puedes llamar ahora mismo: +52 (81) 2188 8490. Es un agente real, no una grabacion. Habla con el y evalua la experiencia de tu cliente.',
      },
      {
        q: '¿Es un producto mexicano?',
        a: 'Si. Centinelia es desarrollado por Pneuma Studio en Monterrey, Nuevo Leon. Los precios estan en pesos mexicanos, el soporte es en espanol y el producto esta disenado para los usos, costumbres y tipos de negocios del mercado mexicano.',
      },
    ],
  },
  {
    id: 'capacidades',
    title: 'Capacidades',
    items: [
      {
        q: '¿Puede agendar citas?',
        a: 'Si, en los planes Comercial y Pro. El agente se integra con Cal.com (consulta disponibilidad en tiempo real y crea la cita directamente) o con Google Calendar y Calendly (captura los datos del cliente y envia el link de confirmacion por WhatsApp). El cliente sale de la llamada con su cita confirmada.',
      },
      {
        q: '¿Puede hacer llamadas salientes?',
        a: 'Si, en el Plan Pro. El agente puede llamar a prospectos para hacer seguimiento, confirmar citas antes del dia, reactivar clientes que no han comprado en tiempo, o gestionar cobros. El dueno define la lista de numeros y el agente llama automaticamente.',
      },
      {
        q: '¿Puede tomar pedidos por telefono?',
        a: 'Si, en el Plan Pro. El agente puede tomar pedidos (productos, cantidades, direccion de entrega o instrucciones) y registrarlos en el sistema. Ideal para restaurantes con servicio a domicilio, farmacias y negocios similares.',
      },
      {
        q: '¿Habla ingles?',
        a: 'Si, en el Plan Pro. El agente detecta automaticamente el idioma del cliente al inicio de la llamada y cambia entre espanol e ingles dentro de la misma conversacion si es necesario. Util para negocios en zonas turisticas o con clientela internacional.',
      },
      {
        q: '¿Puede transferir la llamada a una persona real?',
        a: 'Si. El agente puede transferir en vivo a cualquier numero configurado: el dueno, un vendedor, el medico de guardia, etc. Tambien puede escalar por WhatsApp cuando el cliente lo prefiere o cuando la situacion lo requiere.',
      },
      {
        q: '¿Los agentes se pueden comunicar entre si?',
        a: 'Si. Puedes tener tantos agentes especializados como necesites (recepcionista, vendedor, cobrador, etc.) y se transfieren llamadas en vivo. Tambien se dejan mensajes entre si en "La Oficina", el feed interno del portal. Si el recepcionista recibe una llamada que necesita al ejecutivo de ventas, lo transfiere en vivo.',
      },
      {
        q: '¿Cuantas llamadas puede atender al mismo tiempo?',
        a: 'Plan Comercial: 1 llamada simultanea. Plan Pro: hasta 3 llamadas en paralelo. Plan Empresarial: segun volumen, sin limite practico. Si tu negocio recibe muchas llamadas al mismo tiempo, el plan adecuado es Pro o Empresarial.',
      },
      {
        q: '¿Que pasa si el agente no sabe responder algo?',
        a: 'El agente lo dice con honestidad: "No tengo esa informacion, pero tomo tus datos para que el equipo te llame de regreso." Nunca inventa respuestas ni da informacion incorrecta. Puedes actualizar la base de conocimiento del agente en cualquier momento desde el portal.',
      },
      {
        q: '¿Los agentes pueden aprender con el tiempo?',
        a: 'Si. Despues de cada llamada mayor a 2 minutos, el sistema extrae automaticamente hasta 3 aprendizajes relevantes. El dueno los revisa en el portal y decide si aprobarlos. Si los aprueba, se agregan a la base de conocimiento del agente y se sincronizan inmediatamente. El agente mejora con cada llamada.',
      },
      {
        q: '¿Puede mandar mensajes de WhatsApp?',
        a: 'Si. El agente puede escalar conversaciones a WhatsApp cuando el cliente lo solicita o cuando la situacion lo requiere (por ejemplo, para enviar una cotizacion, un link de pago o el link para agendar). La mensajeria saliente se envia automaticamente al numero del cliente.',
      },
    ],
  },
  {
    id: 'precios',
    title: 'Precios y planes',
    items: [
      {
        q: '¿Cuanto cuesta Centinelia?',
        a: 'Hay dos planes con tres tiers de minutos cada uno. Plan Comercial (agendamiento, transferencias, WhatsApp): Starter $2,997/mes (300 min), Growth $5,994/mes (600 min), Scale $11,988/mes (1,200 min). Plan Pro (todo el Comercial mas llamadas salientes, pedidos, multiidioma): mismos tiers de precio. Cada plan tiene una cuota de instalacion unica: $8,990 MXN para Comercial y $14,990 MXN para Pro. Plan Empresarial bajo cotizacion.',
      },
      {
        q: '¿Que incluye la cuota de instalacion?',
        a: 'La configuracion inicial del agente: personalizacion de voz, carga de informacion del negocio, configuracion de flujos (citas, pedidos, transferencias), pruebas y ajustes antes de activar. Es un pago unico, no se cobra de nuevo a menos que el negocio cambie radicalmente.',
      },
      {
        q: '¿Que son los minutos incluidos?',
        a: 'Cada tier incluye minutos de llamada al mes: Starter 300 min, Growth 600 min, Scale 1,200 min. Cada minuto de llamada (entrante o saliente) consume del saldo mensual. La tasa es $9.99 MXN/min dentro del plan; los minutos extra fuera del plan se cobran a $12.99 MXN/min.',
      },
      {
        q: '¿Que pasa con los minutos no usados?',
        a: 'Los minutos no usados acumulan al mes siguiente hasta un maximo del doble de tu plan. Si tienes 300 min en Starter y solo usas 100, el siguiente mes empiezas con 500 min (300 incluidos + 200 acumulados). Al llegar al tope, los excedentes se pierden.',
      },
      {
        q: '¿Hay contrato de permanencia?',
        a: 'No. Los planes son mes a mes. Si decides cancelar, el servicio termina al final del ciclo de facturacion en curso. Sin penalizaciones, sin tramites complicados.',
      },
      {
        q: '¿Puedo cambiar de plan?',
        a: 'Si. Puedes subir de plan en cualquier momento (el cambio aplica de inmediato). Para bajar de plan, el cambio aplica en el siguiente ciclo de facturacion.',
      },
      {
        q: '¿Hay descuentos para multiples sucursales?',
        a: 'Si, bajo el Plan Empresarial. Si tienes 2 o mas sucursales con agentes independientes, contacta a hola@centinelia.mx para recibir una cotizacion con descuento por volumen.',
      },
    ],
  },
  {
    id: 'implementacion',
    title: 'Implementacion',
    items: [
      {
        q: '¿Cuanto tiempo tarda en estar activo?',
        a: 'Menos de 24 horas. El proceso es: contratas, recibes acceso al portal, agregas la informacion de tu negocio, el equipo de Centinelia finaliza la configuracion y activa el numero. No necesitas hacer nada tecnico.',
      },
      {
        q: '¿Necesito saber de tecnologia para configurarlo?',
        a: 'No. El portal esta disenado para que cualquier dueno de negocio pueda actualizar la informacion del agente, revisar llamadas, ver leads y comprar minutos sin ayuda tecnica. Si quieres cambios avanzados (nuevos flujos, integraciones), el equipo de Centinelia lo hace por ti.',
      },
      {
        q: '¿Necesito cambiar mi numero de telefono?',
        a: 'No. Centinelia te asigna un numero nuevo que publicas en tu sitio web, tarjetas y redes. Si quieres que el agente conteste tu numero actual, configuras un desvio de llamadas desde tu telefonia actual al numero de Centinelia. Tu numero actual sigue funcionando igual.',
      },
      {
        q: '¿Que informacion necesito para configurarlo?',
        a: 'Basicamente: nombre del negocio, horarios de atencion, servicios o productos que ofreces con precios si aplica, preguntas frecuentes de tus clientes, y el nombre y numero del responsable al que transferir llamadas urgentes. Entre mas detallada sea la informacion, mejor responde el agente.',
      },
      {
        q: '¿Como se integra con mi calendario?',
        a: 'Con Cal.com: conectas tu cuenta y el agente accede a tu disponibilidad en tiempo real para crear citas directamente. Con Google Calendar o Calendly: el agente captura los datos del cliente y le envia el link de agendamiento por WhatsApp para que el cliente confirme su horario.',
      },
    ],
  },
  {
    id: 'industrias',
    title: 'Industrias',
    items: [
      {
        q: '¿Funciona para restaurantes?',
        a: 'Si. El agente informa sobre el menu, horarios, ubicacion y estacionamiento. Puede tomar reservaciones (Plan Comercial) y pedidos para llevar o entrega (Plan Pro). Despues de la llamada, manda automaticamente el link de resena de Google al cliente.',
      },
      {
        q: '¿Funciona para clinicas y consultorios?',
        a: 'Si. El agente agenda consultas con el medico o especialista correcto segun el tipo de padecimiento, confirma citas el dia anterior para reducir no-shows, da indicaciones de ubicacion y puede recordar a pacientes frecuentes sus datos previos (Plan Pro).',
      },
      {
        q: '¿Funciona para despachos legales o contables?',
        a: 'Si. El agente califica el tipo de caso o servicio que busca el prospecto, agenda una consulta inicial y deriva llamadas urgentes directamente al abogado o contador de guardia. Mantiene el despacho visible 24/7 sin contratar una recepcionista de tiempo completo.',
      },
      {
        q: '¿Funciona para inmobiliarias?',
        a: 'Si. El agente califica al prospecto (busca compra, renta o venta; zona; presupuesto), agenda visitas a propiedades y notifica al asesor inmobiliario por WhatsApp con los datos del interesado. Ningu un lead se pierde por no contestar el telefono.',
      },
      {
        q: '¿Funciona para tiendas o negocios de retail?',
        a: 'Si. El agente puede informar sobre productos, precios, disponibilidad, horarios y sucursales. En el Plan Pro puede tomar pedidos telefonicos y registrar los datos de entrega.',
      },
      {
        q: '¿Funciona para academias o escuelas?',
        a: 'Si. El agente puede informar sobre cursos, horarios, precios e inscripciones, y transferir a un asesor cuando el prospecto esta listo para inscribirse. Tambien puede confirmar horarios de clases y recordar fechas de pago a alumnos activos (Plan Pro).',
      },
    ],
  },
  {
    id: 'seguridad',
    title: 'Seguridad y privacidad',
    items: [
      {
        q: '¿Mis datos y los de mis clientes estan seguros?',
        a: 'Si. Los datos se almacenan en infraestructura en la nube con cifrado en transito y en reposo. El acceso al portal requiere autenticacion. Los datos de llamadas y leads pertenecen a tu negocio y no se comparten con terceros ni se usan para entrenar modelos.',
      },
      {
        q: '¿Las llamadas se graban?',
        a: 'Si, en el Plan Pro. Las grabaciones son accesibles solo desde tu portal. Si un cliente pregunta durante la llamada si esta siendo grabada, el agente responde con honestidad que si. En planes sin grabacion, igual se generan transcripciones de texto.',
      },
      {
        q: '¿Centinelia cumple con la LFPDPPP?',
        a: 'Si. Seguimos los principios de la Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares: datos recabados con consentimiento, usados solo para los fines declarados, almacenados de forma segura y eliminados a solicitud del titular. El aviso de privacidad esta disponible en centinelia.mx/legal.',
      },
      {
        q: '¿Que pasa si cancelo? ¿Pierdo mis datos?',
        a: 'No inmediatamente. Al cancelar, tus datos (leads, grabaciones, transcripciones) permanecen disponibles por 30 dias adicionales para que puedas exportarlos. Despues de ese periodo se eliminan de forma permanente.',
      },
    ],
  },
];

const allQuestions = CATEGORIES.flatMap(c =>
  c.items.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
);

const schema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: allQuestions,
};

const C = {
  bg:      '#FAFBFF',
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.6)',
  textMute:'rgba(26,10,59,0.4)',
  surface: '#FFFFFF',
  border:  'rgba(108,59,255,0.1)',
  accent:  '#6C3BFF',
  accentL: '#9B6DFF',
};

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <div style={{ background: C.bg, minHeight: '100vh' }}>
        {/* Nav */}
        <header style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <div
            style={{
              maxWidth: 800,
              margin: '0 auto',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <Image src="/logo-icon.png" alt="Centinelia" width={36} height={36} style={{ width: 36, height: 36, objectFit: 'contain' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: 'var(--font-sora)' }}>
                Centinelia
              </span>
            </Link>
            <Link
              href="/registro"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#FFFFFF',
                background: C.accent,
                padding: '8px 18px',
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              Contratar
            </Link>
          </div>
        </header>

        <main style={{ maxWidth: 800, margin: '0 auto', padding: '48px 20px 80px' }}>
          {/* Hero */}
          <div style={{ marginBottom: 52 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.accentL, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Preguntas frecuentes
            </p>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 800, color: C.text, lineHeight: 1.2, marginBottom: 16, fontFamily: 'var(--font-sora)' }}>
              Todo lo que necesitas saber
            </h1>
            <p style={{ fontSize: 16, color: C.textSub, lineHeight: 1.7, maxWidth: 560 }}>
              Respuestas directas sobre Centinelia: precios, capacidades, integraciones e industrias.
              Si tienes una pregunta que no esta aqui, escribenos a{' '}
              <a href="mailto:hola@centinelia.mx" style={{ color: C.accent, textDecoration: 'none', fontWeight: 500 }}>
                hola@centinelia.mx
              </a>
              .
            </p>
          </div>

          {/* Jump links */}
          <nav
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 52,
              padding: '16px 20px',
              background: C.surface,
              borderRadius: 14,
              border: `1px solid ${C.border}`,
            }}
          >
            {CATEGORIES.map(cat => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.textSub,
                  textDecoration: 'none',
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  transition: 'color 0.15s',
                }}
              >
                {cat.title}
              </a>
            ))}
          </nav>

          {/* Categories */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 56 }}>
            {CATEGORIES.map(cat => (
              <section key={cat.id} id={cat.id}>
                <h2
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.accentL,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginBottom: 20,
                  }}
                >
                  {cat.title}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {cat.items.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        borderRadius: 14,
                        padding: '20px 24px',
                      }}
                    >
                      <h3
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: C.text,
                          marginBottom: 10,
                          lineHeight: 1.4,
                        }}
                      >
                        {item.q}
                      </h3>
                      <p
                        style={{
                          fontSize: 14,
                          color: C.textSub,
                          lineHeight: 1.7,
                          margin: 0,
                        }}
                      >
                        {item.a}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* CTA */}
          <div
            style={{
              marginTop: 64,
              padding: '36px 32px',
              background: 'linear-gradient(135deg, rgba(108,59,255,0.08) 0%, rgba(155,109,255,0.05) 100%)',
              border: `1px solid rgba(108,59,255,0.2)`,
              borderRadius: 20,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, color: C.accentL, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
              Siguiente paso
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 10, fontFamily: 'var(--font-sora)' }}>
              Escuchalo antes de decidir
            </h2>
            <p style={{ fontSize: 14, color: C.textSub, marginBottom: 24 }}>
              Llama al agente demo ahora mismo y evalua la experiencia de tu cliente.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="tel:+528121888490"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: C.accent,
                  padding: '12px 24px',
                  borderRadius: 12,
                  textDecoration: 'none',
                }}
              >
                Llamar al demo
              </a>
              <Link
                href="/registro"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: C.accent,
                  background: 'rgba(108,59,255,0.1)',
                  padding: '12px 24px',
                  borderRadius: 12,
                  textDecoration: 'none',
                  border: `1px solid rgba(108,59,255,0.2)`,
                }}
              >
                Ver planes
              </Link>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer
          style={{
            borderTop: `1px solid ${C.border}`,
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 12, color: C.textMute }}>
            <Link href="/" style={{ color: C.textMute, textDecoration: 'none' }}>Centinelia</Link>
            {' · '}
            <Link href="/legal" style={{ color: C.textMute, textDecoration: 'none' }}>Legal</Link>
            {' · '}
            <a href="mailto:hola@centinelia.mx" style={{ color: C.textMute, textDecoration: 'none' }}>hola@centinelia.mx</a>
          </p>
        </footer>
      </div>
    </>
  );
}
