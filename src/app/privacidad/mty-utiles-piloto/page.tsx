import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad — Pre-registro Útiles MTY 2026 (Piloto)',
  description:
    'Aviso de privacidad del piloto de pre-registro de útiles escolares del Municipio de Monterrey operado técnicamente por Centinelia.',
  robots: { index: false, follow: false },
};

const C = {
  bg:       '#FAFBFF',
  text:     '#1A0A3B',
  textSub:  'rgba(26,10,59,0.65)',
  textMute: 'rgba(26,10,59,0.42)',
  border:   'rgba(108,59,255,0.1)',
  accent:   '#6C3BFF',
  warnBg:   'rgba(255,180,0,0.08)',
  warnBd:   'rgba(255,140,0,0.35)',
};

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, marginTop: 40, marginBottom: 14 }}>
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 15, color: C.textSub, lineHeight: 1.7, marginBottom: 12 }}>
      {children}
    </p>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
      <span style={{ color: C.accent, marginTop: 2, flexShrink: 0 }}>•</span>
      <p style={{ fontSize: 15, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{children}</p>
    </div>
  );
}

export default function AvisoUtilesMty() {
  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '80px 24px 120px' }}>
        <Link
          href="/"
          style={{ color: C.accent, fontSize: 14, textDecoration: 'none' }}
        >
          ← Volver a Centinelia
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 700, marginTop: 24, letterSpacing: '-0.02em' }}>
          Aviso de Privacidad
        </h1>
        <p style={{ fontSize: 16, color: C.textSub, marginTop: 8 }}>
          Programa de pre-registro de útiles escolares del Municipio de Monterrey — Piloto 2026
        </p>
        <p style={{ fontSize: 13, color: C.textMute, marginTop: 4 }}>
          Última actualización: 5 de agosto de 2026
        </p>

        <div
          style={{
            background:    C.warnBg,
            border:        `1px solid ${C.warnBd}`,
            borderRadius:  10,
            padding:       '14px 16px',
            marginTop:     28,
          }}
        >
          <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.55 }}>
            <strong>Aviso de piloto.</strong> Este documento corresponde a una fase de
            pruebas técnicas operada por Centinelia en representación del Municipio de
            Monterrey. Los datos capturados durante esta etapa se usan únicamente para
            validar la integración con los sistemas del municipio y no se comparten con
            terceros distintos al propio municipio.
          </p>
        </div>

        <H2>1. Responsable</H2>
        <P>
          El responsable del tratamiento de los datos personales es el{' '}
          <strong>Municipio de Monterrey</strong>, a través del programa de
          pre-registro de útiles escolares 2026. La operación técnica del canal de
          captura por voz y chat es realizada por Centinelia bajo instrucción del
          municipio.
        </P>
        <P>
          Para el ejercicio de derechos o cualquier consulta sobre este aviso, escribir
          a: <strong>ayuda.utiles@monterrey.gob.mx</strong>
        </P>

        <H2>2. Datos personales que se recaban</H2>
        <P>Para tramitar la pre-solicitud se captura, del adulto responsable y del estudiante:</P>
        <Bullet>CURP (18 caracteres) del adulto y del estudiante.</Bullet>
        <Bullet>Nombre y apellidos (paterno y materno) de ambos.</Bullet>
        <Bullet>Fecha de nacimiento del estudiante.</Bullet>
        <Bullet>Escuela, grado y turno del estudiante.</Bullet>
        <Bullet>Domicilio: calle, número, colonia, municipio, código postal.</Bullet>
        <Bullet>Teléfono de contacto del adulto (10 dígitos).</Bullet>
        <Bullet>Correo electrónico del adulto (opcional).</Bullet>
        <Bullet>Parentesco del adulto con el estudiante.</Bullet>
        <Bullet>Sede seleccionada para recoger el paquete de útiles.</Bullet>
        <P style={{ marginTop: 12 }}>
          <em>
            No se recaban datos personales sensibles en el sentido del artículo 3 fracción VI
            de la LFPDPPP.
          </em>
        </P>

        <H2>3. Finalidades del tratamiento</H2>
        <P>Los datos se usan únicamente para:</P>
        <Bullet>Validar la identidad del adulto y del estudiante contra el padrón del municipio.</Bullet>
        <Bullet>Registrar la pre-solicitud del paquete de útiles y generar un folio.</Bullet>
        <Bullet>
          Contactar al adulto responsable por teléfono o correo institucional
          (ayuda.utiles@monterrey.gob.mx) para confirmar sede, fecha y hora de entrega,
          o solicitar aclaraciones.
        </Bullet>
        <P style={{ marginTop: 12 }}>
          No se realizan transferencias a terceros distintos del propio Municipio de
          Monterrey. No se utilizan los datos para fines comerciales, publicitarios ni
          de perfilamiento.
        </P>

        <H2>4. Fundamento legal</H2>
        <P>El tratamiento se realiza en cumplimiento de:</P>
        <Bullet>Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados.</Bullet>
        <Bullet>Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</Bullet>
        <Bullet>Ley de Transparencia y Acceso a la Información Pública del Estado de Nuevo León.</Bullet>

        <H2>5. Consentimiento</H2>
        <P>
          Al continuar con el pre-registro (de forma verbal o por texto), el adulto
          responsable manifiesta haber leído este aviso y otorga su consentimiento para
          el tratamiento de sus datos personales y los del estudiante que representa,
          en los términos aquí descritos. Este consentimiento se registra en el sistema
          del municipio en el campo <code>aceptaPrivacidad</code>.
        </P>

        <H2>6. Derechos ARCO</H2>
        <P>
          Para ejercer los derechos de acceso, rectificación, cancelación u oposición
          (ARCO), o para revocar el consentimiento otorgado, escribir a{' '}
          <strong>ayuda.utiles@monterrey.gob.mx</strong> indicando:
        </P>
        <Bullet>Nombre completo del titular.</Bullet>
        <Bullet>CURP.</Bullet>
        <Bullet>Descripción clara del derecho a ejercer.</Bullet>
        <Bullet>Documento oficial que acredite identidad.</Bullet>
        <P style={{ marginTop: 12 }}>
          La respuesta se emitirá dentro de los 20 días hábiles siguientes.
        </P>

        <H2>7. Modificaciones al aviso</H2>
        <P>
          Este aviso puede actualizarse. La versión vigente se publica en{' '}
          <code>https://centinelia.mx/privacidad/mty-utiles-piloto</code>. Los cambios
          se notificarán a los titulares que hayan otorgado consentimiento durante la
          fase de prueba, al correo o teléfono registrados.
        </P>

        <div
          style={{
            marginTop:    56,
            paddingTop:   24,
            borderTop:    `1px solid ${C.border}`,
            fontSize:     13,
            color:        C.textMute,
          }}
        >
          Operado técnicamente por Centinelia. Para dudas del canal técnico:{' '}
          <a href="mailto:soporte@centinelia.mx" style={{ color: C.accent }}>
            soporte@centinelia.mx
          </a>
        </div>
      </div>
    </main>
  );
}
