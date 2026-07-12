import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Privacidad de datos',
  description: 'Cómo Centinelia recopila, usa y protege los datos de tu negocio.',
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 32, marginTop: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 16 }}>{title}</h2>
      {children}
    </div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
      <span style={{ color: C.accent, marginTop: 2, flexShrink: 0 }}>•</span>
      <p style={{ fontSize: 15, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{children}</p>
    </div>
  );
}

export default function PrivacidadDatos() {
  const updatedAt = '11 de julio de 2026';

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>
      {/* Nav mínimo */}
      <header style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-8" style={{ height: 64, display: 'flex', alignItems: 'center' }}>
          <Link href="/" className="transition-opacity hover:opacity-70">
            <Image src="/logo.png" alt="Centinelia" width={160} height={44} style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
          </Link>
        </div>
      </header>

      {/* Contenido */}
      <main className="max-w-4xl mx-auto px-5 sm:px-8" style={{ paddingTop: 56, paddingBottom: 80 }}>
        <p style={{ fontSize: 13, color: C.textMute, marginBottom: 8 }}>Última actualización: {updatedAt}</p>

        <h1 style={{ fontSize: 32, fontWeight: 700, color: C.text, marginBottom: 16, lineHeight: 1.2 }}>
          Privacidad de datos
        </h1>
        <p style={{ fontSize: 16, color: C.textSub, lineHeight: 1.7, maxWidth: 680 }}>
          En Centinelia tomamos en serio la privacidad de tu negocio y de tus clientes.
          Esta página explica, en términos sencillos, qué información recopilamos, para qué la usamos
          y quién tiene acceso a ella.
        </p>

        <Section title="1. Qué datos recopilamos">
          <Item>
            <strong>Grabaciones de llamadas</strong>, Solo si tu plan las incluye y el agente está configurado para grabar.
            Las grabaciones quedan disponibles en tu portal de cliente.
          </Item>
          <Item>
            <strong>Transcripciones de llamadas</strong>, El texto de cada conversación que tuvo el agente con tus llamantes.
            Se usa para mostrar el historial en tu portal.
          </Item>
          <Item>
            <strong>Datos del negocio</strong>, Nombre, giro, número de teléfono y la información que configuras en el
            perfil de tu agente (horarios, servicios, precios, etc.).
          </Item>
          <Item>
            <strong>Datos del dueño o responsable</strong>, Nombre, correo electrónico y número de contacto que proporcionas
            al crear tu cuenta.
          </Item>
          <Item>
            <strong>Datos de facturación</strong>, El pago se procesa directamente por Stripe. Nosotros nunca vemos ni
            almacenamos los números de tarjeta, Stripe se encarga de eso de forma segura.
          </Item>
        </Section>

        <Section title="2. Para qué usamos esos datos">
          <Item>
            <strong>Operar tu agente de voz</strong>, El agente necesita conocer la información de tu negocio para
            responder correctamente a tus clientes.
          </Item>
          <Item>
            <strong>Mostrar el historial en tu portal</strong>, Las llamadas, leads y citas capturadas aparecen en tu
            panel para que puedas darles seguimiento.
          </Item>
          <Item>
            <strong>Mejorar el desempeño del agente</strong>, Con tu consentimiento, podemos revisar transcripciones
            para detectar áreas de mejora en la configuración del agente.
          </Item>
          <Item>
            <strong>Facturación y soporte</strong>, Usamos tu correo y datos de contacto para enviarte recibos,
            notificaciones del servicio y atender cualquier duda.
          </Item>
        </Section>

        <Section title="3. Quién tiene acceso">
          <Item>
            <strong>Tú</strong>, Como cliente, tienes acceso completo a los datos de tu negocio y el historial de
            llamadas a través de tu portal.
          </Item>
          <Item>
            <strong>Centinelia</strong>, Solo accedemos a tus datos para operar el servicio o atender solicitudes de
            soporte. No vendemos ni compartimos tu información con terceros para fines comerciales.
          </Item>
          <Item>
            <strong>Proveedores de infraestructura.</strong> Para operar el servicio trabajamos con proveedores
            externos de confianza que procesan datos en nuestro nombre: almacenamiento de base de datos,
            síntesis y procesamiento de voz, y pagos. Cada proveedor cuenta con sus propias políticas
            de seguridad y privacidad.
          </Item>
        </Section>

        <Section title="4. Cuánto tiempo guardamos los datos">
          <Item>
            <strong>Grabaciones y transcripciones</strong>, Se conservan 90 días por defecto.
            Si necesitas un período diferente, escríbenos y lo ajustamos para tu cuenta.
          </Item>
          <Item>
            <strong>Datos de cuenta y configuración</strong>, Los mantenemos mientras tu cuenta esté activa.
            Tras la cancelación, los conservamos 30 días adicionales como respaldo y luego los eliminamos definitivamente.
          </Item>
        </Section>

        <Section title="5. Tus derechos">
          <Item>
            <strong>Solicitar eliminación</strong>, Puedes pedir que eliminemos todos tus datos escribiéndonos a{' '}
            <a href="mailto:hola@centinelia.mx" style={{ color: C.accent, textDecoration: 'none' }} className="hover:opacity-80 transition-opacity">
              hola@centinelia.mx
            </a>
            . Lo procesamos en un plazo máximo de 10 días hábiles.
          </Item>
          <Item>
            <strong>Exportar tu historial</strong>, Puedes descargar el historial de llamadas directamente desde
            tu portal de cliente.
          </Item>
          <Item>
            <strong>Corregir información</strong>, Si algún dato de tu cuenta o negocio es incorrecto,
            puedes actualizarlo desde tu portal o contactarnos.
          </Item>
        </Section>

        <Section title="6. Cómo protegemos tu información">
          <Item>
            <strong>Todo viaja cifrado.</strong> La conexión entre tu navegador y nuestros servidores
            usa HTTPS con HSTS, por lo que nunca se transmite información en texto abierto.
          </Item>
          <Item>
            <strong>Contraseñas irrecuperables.</strong> Guardamos tus contraseñas con un algoritmo
            de hashing de grado bancario (PBKDF2, 100,000 iteraciones). Nadie en Centinelia puede
            leer tu contraseña, ni siquiera nosotros.
          </Item>
          <Item>
            <strong>Sesiones firmadas.</strong> Cada vez que inicias sesión generamos una firma
            criptográfica única. Si alguien intenta alterar la sesión, se invalida de inmediato.
          </Item>
          <Item>
            <strong>Pagos fuera de nuestro alcance.</strong> Tu tarjeta la maneja Stripe directamente.
            Nosotros nunca vemos ni guardamos ese número.
          </Item>
          <Item>
            <strong>Acceso verificado por solicitud.</strong> Cada acción en la plataforma verifica
            que quien la pide sea el dueño legítimo de ese dato o recurso.
          </Item>
          <Item>
            <strong>Límites automáticos.</strong> Tenemos controles que detectan usos inusuales
            y bloquean intentos de acceso masivo o automatizado.
          </Item>
          <p style={{ fontSize: 14, color: C.textMute, lineHeight: 1.65, marginTop: 12, marginBottom: 0 }}>
            Si quieres ver el detalle técnico y legal de estas medidas, está en nuestra{' '}
            <Link href="/legal#seguridad" style={{ color: C.accent, textDecoration: 'none' }}>
              página Legal → Medidas de Seguridad Técnica
            </Link>.
          </p>
        </Section>

        <Section title="7. Contacto">
          <p style={{ fontSize: 15, color: C.textSub, lineHeight: 1.65 }}>
            Si tienes dudas sobre cómo manejamos tu información, escríbenos:{' '}
            <a href="mailto:hola@centinelia.mx" style={{ color: C.accent, textDecoration: 'none' }} className="hover:opacity-80 transition-opacity">
              hola@centinelia.mx
            </a>
            <br />
            También puedes contactarnos por WhatsApp al{' '}
            <a href="https://wa.me/528116333559" style={{ color: C.accent, textDecoration: 'none' }} className="hover:opacity-80 transition-opacity">
              +52 81 1633 3559
            </a>
            .
          </p>
          <p style={{ fontSize: 14, color: C.textMute, lineHeight: 1.65, marginTop: 12 }}>
            Nos reservamos el derecho de actualizar esta política cuando sea necesario.
            Si hay cambios importantes, te lo notificaremos por correo.
          </p>
        </Section>
      </main>

      {/* Footer */}
      <div style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <footer className="max-w-6xl mx-auto px-5 sm:px-8 pt-5 pb-10 sm:py-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="transition-opacity hover:opacity-70">
              <Image src="/logo-icon.png" alt="Centinelia" width={52} height={52} style={{ width: 52, height: 52, objectFit: 'contain', display: 'block' }} />
            </Link>
            <div className="flex items-center gap-5">
              <Link href="/registro" className="text-xs transition-colors" style={{ color: C.textMute }}>Contratar</Link>
              <Link href="/industrias" className="text-xs transition-colors" style={{ color: C.textMute }}>Industrias</Link>
              <a href="mailto:hola@centinelia.mx" className="text-xs" style={{ color: C.textMute }}>hola@centinelia.mx</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
