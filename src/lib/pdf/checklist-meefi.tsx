import { Document, Page, View, Text, Link } from '@react-pdf/renderer';
import { S } from './doc';
import type { BrandKit } from '@/lib/brand/kit';

/**
 * Checklist ejecutivo para el día de la cita Meefi 15-sept-2026.
 * PDF multi-página, brandeado Centinelia, con pasos numerados,
 * links clicables, prompts para copy-paste y verbatims narrativos.
 *
 * Contenido source-of-truth: demos/meefi-gac/27-checklist-demo-15-sept.md
 * Se genera vía /api/admin/demos/meefi/checklist como PDF descargable.
 */

const BRAND: BrandKit = {
  businessName:   'Centinelia',
  logoUrl:        null,
  color:          '#6C3BFF',
  colorSecondary: null,
  phone:          '+52 81 1633 3559',
  website:        'centinelia.mx',
  address:        'Monterrey, Nuevo León',
  footerText:     'Centinelia · Empleados digitales',
};

const ACCENT       = BRAND.color!;
const ACCENT_BG    = `${ACCENT}0D`;
const ACCENT_STRONG = `${ACCENT}22`;
const INK          = '#1A0A3B';
const MUTED        = '#6B6480';
const SOFT_BG      = '#FAFBFF';
const WARN         = '#E11D48';
const SEP          = '#E5E7EB';

// ── Sub-components ───────────────────────────────────────────────────────────

function PageShell({ children, pageLabel }: { children: React.ReactNode; pageLabel: string }) {
  return (
    <Page size="A4" style={{ paddingTop: 44, paddingBottom: 60, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 10, color: INK, lineHeight: 1.5 }}>
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 22,
        paddingBottom: 10,
        borderBottomWidth: 2,
        borderBottomColor: ACCENT,
      }}>
        <View>
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: ACCENT, letterSpacing: 0.4 }}>
            CENTINELIA
          </Text>
          <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>
            Empleados digitales
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK }}>
            Demo Meefi
          </Text>
          <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>
            {pageLabel}
          </Text>
        </View>
      </View>

      {children}

      <View fixed style={{ position: 'absolute', bottom: 24, left: 44, right: 44, borderTopWidth: 1, borderTopColor: SEP, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 7.5, color: MUTED }}>
            Centinelia · Empleados digitales · centinelia.mx
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} style={{ fontSize: 7.5, color: MUTED }} />
        </View>
      </View>
    </Page>
  );
}

/**
 * Contenedor unificado de un paso. Layout vertical limpio:
 *   Header (número + título) → subtítulo opcional → children
 */
function Step({ n, title, subtitle, children }: { n: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
      }}>
        <View style={{
          backgroundColor: ACCENT,
          borderRadius: 3,
          paddingVertical: 3,
          paddingHorizontal: 8,
          marginRight: 8,
          minWidth: 26,
          alignItems: 'center',
        }}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff' }}>{n}</Text>
        </View>
        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK, flex: 1 }}>
          {title}
        </Text>
      </View>
      {subtitle && (
        <Text style={{ fontSize: 8.5, color: MUTED, marginLeft: 34, marginBottom: 6, marginTop: -3 }}>
          {subtitle}
        </Text>
      )}
      <View style={{ marginLeft: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: ACCENT_STRONG }}>
        {children}
      </View>
    </View>
  );
}

/**
 * Fila etiquetada del paso. Etiqueta arriba en morado pequeño, contenido debajo.
 * Reemplaza el layout 2-column previo que se rompía con etiquetas largas.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>
        {label}
      </Text>
      <View>{children}</View>
    </View>
  );
}

function LinkRow({ href, children }: { href: string; children: string }) {
  return (
    <Link src={href} style={{ fontSize: 9.5, color: ACCENT, textDecoration: 'underline' }}>
      {children}
    </Link>
  );
}

function BodyText({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 9.5, color: INK, lineHeight: 1.5 }}>{children}</Text>;
}

function VerbatimText({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: SOFT_BG, borderRadius: 3, padding: 8 }}>
      <Text style={{ fontSize: 9.5, color: INK, lineHeight: 1.5, fontStyle: 'italic' }}>
        &quot;{children}&quot;
      </Text>
    </View>
  );
}

function CopyPasteBlock({ text }: { text: string }) {
  return (
    <View style={{
      backgroundColor: '#F3F4F6',
      borderRadius: 3,
      padding: 10,
      borderLeftWidth: 3,
      borderLeftColor: MUTED,
    }}>
      <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: MUTED, marginBottom: 5, letterSpacing: 0.5 }}>
        COPIAR Y PEGAR
      </Text>
      <Text style={{ fontSize: 9, fontFamily: 'Courier', color: INK, lineHeight: 1.55 }}>
        {text}
      </Text>
    </View>
  );
}

function ContingencyBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: '#FFF7ED',
      borderLeftWidth: 3,
      borderLeftColor: WARN,
      padding: 10,
      marginBottom: 8,
      borderRadius: 3,
    }} wrap={false}>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: WARN, marginBottom: 4 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
        {children}
      </Text>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 8, marginBottom: 12 }}>
      {children}
    </Text>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function ChecklistMeefiPdf() {
  return (
    <Document title="Demo Meefi 15-sept — Checklist" author="Centinelia">

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 1 · Portada + Overview
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Portada · 15-sept-2026">

        <View style={{ marginTop: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT, letterSpacing: 1.5 }}>
            CHECKLIST DE EJECUCIÓN
          </Text>
          <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 12, lineHeight: 1.15 }}>
            Demo Meefi
          </Text>
          <Text style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>
            Nelia soporte + Niva compliance
          </Text>
          <Text style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
            15 de septiembre 2026
          </Text>
        </View>

        <View style={{ backgroundColor: ACCENT_BG, padding: 14, borderRadius: 6, marginBottom: 22 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT, marginBottom: 6 }}>
            Cómo usar este documento
          </Text>
          <Text style={{ fontSize: 10, color: INK, lineHeight: 1.6, marginBottom: 6 }}>
            18 pasos numerados. Cada paso te dice qué link abrir y qué texto copiar. Después de cada acción hay 1-2 líneas de qué decir mientras la empleada responde. Todos los links del documento son clicables desde el PDF.
          </Text>
          <Text style={{ fontSize: 10, color: INK, lineHeight: 1.6 }}>
            Regla de oro: si algo se cae en vivo, no debugueás. Dices &quot;esto ya lo vieron funcionar, aquí un video del ensayo&quot; y sigues al siguiente bloque.
          </Text>
        </View>

        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 8 }}>
          Recorrido de la sesión · 45-50 min
        </Text>

        {[
          { label: 'Apertura', mins: '2-3 min', desc: 'Contexto verbal, sin nada que abrir' },
          { label: 'Bloque 1 · Password reset', mins: '8 min', desc: 'Nelia diagnostica el motivo real, no manda link genérico' },
          { label: 'Bloque 2 · Transferencia HERO', mins: '12 min', desc: 'Nelia consulta estado, escala a Emilio con contexto ejecutivo' },
          { label: 'Bloque 3 · Consulta Help Center', mins: '5 min', desc: 'Nelia cita literal del artículo, no inventa' },
          { label: 'Bloque 4 · 2FA recovery', mins: '10 min', desc: 'Nelia recolecta evidencia y escala a Ashley' },
          { label: 'Bloque Niva · Compliance', mins: '6 min', desc: 'Análisis KYB con recomendación estructurada' },
          { label: 'Cierre comercial', mins: '4-6 min', desc: 'Propuesta, pricing, siguiente paso' },
        ].map((b, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: i < 6 ? 1 : 0, borderBottomColor: SEP }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT, marginRight: 8 }} />
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, width: 210 }}>{b.label}</Text>
            <Text style={{ fontSize: 9, color: ACCENT, width: 55 }}>{b.mins}</Text>
            <Text style={{ fontSize: 9, color: MUTED, flex: 1 }}>{b.desc}</Text>
          </View>
        ))}

        <View style={{ marginTop: 22, backgroundColor: SOFT_BG, padding: 12, borderRadius: 6 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 8 }}>
            Credenciales que tienes que tener a mano
          </Text>
          {[
            { l: 'Portal Meefi', v: 'meefi-demo@centinelia.mx · MeefiDemo2026!' },
            { l: 'Gmail Nelia (backend)', v: 'centinelia.dev@gmail.com (ya conectada)' },
            { l: 'Gmail Nazre (para ver escalamientos)', v: 'nazre20@gmail.com con alias +ashley y +emilio' },
          ].map((r, i) => (
            <View key={i} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>
                {r.l}
              </Text>
              <Text style={{ fontSize: 9.5, color: INK }}>{r.v}</Text>
            </View>
          ))}
        </View>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 2 · Paso 0 + Bloque 1
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque 1 · Password reset">

        <Step n="0" title="Apertura verbal" subtitle="Sin nada que abrir · 2-3 min">
          <Row label="Decir">
            <VerbatimText>
              Gera, Alan, Emilio: gracias por hacer espacio. Hoy les voy a mostrar 5 casos que hoy escalan a su equipo por Intercom, resueltos por dos empleadas: Nelia en soporte, Niva en compliance. Vamos a ver caso por caso cómo la reciben, cómo trabajan y cómo entregan. Empezamos con soporte.
            </VerbatimText>
          </Row>
        </Step>

        <Step n="1" title="Abrir Bloque 1 · Password reset">
          <Row label="Abrir">
            <LinkRow href="https://www.centinelia.mx/demo/meefi?scenario=1">centinelia.mx/demo/meefi?scenario=1</LinkRow>
          </Row>
          <Row label="Acción">
            <BodyText>Clic en la burbuja azul con la N abajo-derecha para abrir el chat de Nelia.</BodyText>
          </Row>
          <Row label="Decir">
            <VerbatimText>
              Esta es la vista del usuario. Nelia vive abajo a la derecha, como cualquier chatbot al que ya están acostumbrados con Intercom.
            </VerbatimText>
          </Row>
        </Step>

        <Step n="2" title="Enviar mensaje del usuario">
          <CopyPasteBlock text="Hola, no puedo cambiar mi contrasena. Ya intente varias veces y el link no me funciona." />
          <View style={{ marginTop: 8 }}>
            <Row label="Esperado">
              <BodyText>Nelia identifica que el correo del usuario no está confirmado y guía a buscar el correo de bienvenida.</BodyText>
            </Row>
            <Row label="Decir mientras responde">
              <VerbatimText>
                Miren la diferencia con Intercom. Intercom les mandaría un link genérico y listo. Nelia primero está revisando la cuenta real del usuario en Meefi para saber por qué el reset no le está funcionando.
              </VerbatimText>
            </Row>
            <Row label="Al terminar">
              <VerbatimText>
                Detectó el motivo real: correo no confirmado. Le está guiando al paso concreto. Si no funciona, entonces sí escalamos. Pero primero: diagnóstico.
              </VerbatimText>
            </Row>
          </View>
        </Step>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 3 · Paso 3 + Bloque 2 HERO
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque 2 · Transferencia HERO">

        <Step n="3" title="Segundo mensaje del usuario · Bloque 1">
          <CopyPasteBlock text="Ya confirme mi correo, ahora si." />
          <View style={{ marginTop: 8 }}>
            <Row label="Esperado">
              <BodyText>Nelia intenta el reset, ve que sigue bloqueado, guía a esperar 2-3 min y revisar spam. No miente, no escala sin razón.</BodyText>
            </Row>
            <Row label="Al terminar">
              <VerbatimText>
                Nelia no le miente ni le manda un link roto. Le da información honesta. Un chatbot que aprueba a ciegas destruye la confianza del usuario. Nelia no lo hace.
              </VerbatimText>
            </Row>
          </View>
        </Step>

        <View style={{ backgroundColor: ACCENT_STRONG, padding: 8, borderRadius: 4, marginBottom: 12, marginTop: 6 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: ACCENT, letterSpacing: 0.5 }}>
            HERO · CASO QUE MÁS ESCALA HOY POR INTERCOM
          </Text>
        </View>

        <Step n="4" title="Abrir Bloque 2 · Transferencia">
          <Row label="Abrir">
            <LinkRow href="https://www.centinelia.mx/demo/meefi?scenario=2">centinelia.mx/demo/meefi?scenario=2</LinkRow>
          </Row>
          <Row label="Acción">
            <BodyText>Clic en burbuja Nelia.</BodyText>
          </Row>
          <Row label="Decir">
            <VerbatimText>
              Este es el caso que más les escala Intercom. Transferencia no reflejada.
            </VerbatimText>
          </Row>
        </Step>

        <Step n="5" title="Enviar mensaje del usuario">
          <CopyPasteBlock text="Hice una transferencia de 50 mil pesos hace como dos horas y no me aparece en mi cuenta." />
          <View style={{ marginTop: 8 }}>
            <Row label="Esperado">
              <BodyText>Nelia consulta el estado. Reporta monto $50,000, destino BBVA, pendiente en rieles SPEI, ETA antes de 19:00 CDMX. Pregunta activamente si hay urgencia.</BodyText>
            </Row>
            <Row label="Decir mientras responde">
              <VerbatimText>
                Intercom aquí simplemente escalaría diciendo &apos;un momento por favor&apos; porque no tiene acceso al sistema. Nelia sí lo tiene.
              </VerbatimText>
            </Row>
            <Row label="Al terminar">
              <VerbatimText>
                Sin escalar. Le dio: monto, destino, estado y ETA. Y está preguntando activamente si hay urgencia, para decidir si escalar. Eso es lo que un buen agente humano hace.
              </VerbatimText>
            </Row>
          </View>
        </Step>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 4 · Paso 6-7
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque 2 · Escalamiento a Emilio">

        <Step n="6" title="Segundo mensaje del usuario · urgencia declarada">
          <CopyPasteBlock text="Si, es urgente. Es a un proveedor y tiene cierre de operaciones hoy a las 5." />
          <View style={{ marginTop: 8 }}>
            <Row label="Esperado">
              <BodyText>Nelia escala. Confirma ticket esc_XXXXXXXX con Emilio de Operaciones.</BodyText>
            </Row>
            <Row label="Al terminar">
              <VerbatimText>
                Ahora sí escala. Y vamos a ver exactamente qué es lo que Emilio recibe.
              </VerbatimText>
            </Row>
          </View>
        </Step>

        <Step n="7" title="Ver el correo que Nelia mandó a Emilio">
          <Row label="Abrir">
            <LinkRow href="https://mail.google.com/mail/u/0/#search/to%3Anazre20%2Bemilio+meefi">
              mail.google.com filtro: to:nazre20+emilio meefi
            </LinkRow>
          </Row>
          <Row label="Acción">
            <BodyText>Clic en el correo más reciente (top de la lista). Ctrl + &quot;+&quot; para zoom si es proyector.</BodyText>
          </Row>
          <Row label="Mostrar">
            <BodyText>
              Header morado &quot;Meefi Soporte · Escalamiento&quot;. Tabla con ticket, prioridad alta, tema, responsable Emilio, usuario, hora en GMT-6. Sección Resumen con monto, destino, deadline. Sección Hipótesis. Sección Próxima acción sugerida. Botón morado &quot;Abrir conversación en Meefi&quot;.
            </BodyText>
          </Row>
          <Row label="Decir">
            <VerbatimText>
              Emilio no tiene que preguntarle nada al usuario. Recibe el caso con el contexto ejecutivo listo. Monto, destino, deadline. Y la conversación original a un clic. Esto es lo que quisieran que Intercom hiciera cuando escala.
            </VerbatimText>
          </Row>
        </Step>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 5 · Bloque 3
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque 3 · Help Center">

        <Step n="8" title="Abrir Bloque 3 · Consulta Help Center">
          <Row label="Abrir">
            <LinkRow href="https://www.centinelia.mx/demo/meefi?scenario=3">centinelia.mx/demo/meefi?scenario=3</LinkRow>
          </Row>
          <Row label="Acción">
            <BodyText>Clic en burbuja Nelia.</BodyText>
          </Row>
          <Row label="Decir">
            <VerbatimText>
              Caso simple pero importante. Preguntas informativas sobre su plataforma.
            </VerbatimText>
          </Row>
        </Step>

        <Step n="9" title="Enviar pregunta del usuario">
          <CopyPasteBlock text="Cuanto tiempo tarda una transferencia SPEI a otro banco?" />
          <View style={{ marginTop: 8 }}>
            <Row label="Esperado">
              <BodyText>Nelia cita literal del artículo con detalle por banco: BBVA y Santander 15 min, Banorte 30 min, HSBC hora en punto. Incluye 2 links a help.meefi.io.</BodyText>
            </Row>
            <Row label="Decir">
              <VerbatimText>
                Ese contenido sale del Help Center ingerido. No memoriza, no aproxima. Cita textualmente y da el link. Si mañana ustedes cambian el artículo, Nelia responde con el nuevo texto sin retocar nada.
              </VerbatimText>
            </Row>
          </View>
        </Step>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 6 · Bloque 4
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque 4 · 2FA recovery">

        <Step n="10" title="Abrir Bloque 4 · 2FA recovery">
          <Row label="Abrir">
            <LinkRow href="https://www.centinelia.mx/demo/meefi?scenario=4">centinelia.mx/demo/meefi?scenario=4</LinkRow>
          </Row>
          <Row label="Acción">
            <BodyText>Clic en burbuja Nelia.</BodyText>
          </Row>
          <Row label="Decir">
            <VerbatimText>
              Caso más ambicioso. Recovery 2FA. Hoy con Intercom se convierte en ping-pong de 10 correos con Ashley.
            </VerbatimText>
          </Row>
        </Step>

        <Step n="11" title="Enviar mensaje del usuario">
          <CopyPasteBlock text="Perdi el celular donde tenia el Authenticator. Ya no puedo entrar a mi cuenta." />
          <View style={{ marginTop: 8 }}>
            <Row label="Esperado">
              <BodyText>Nelia abre ticket rec_XXXXXXXX y pide 4 items en lista clara: INE frente, INE reverso, selfie con INE, últimos 4 dígitos de la cuenta bancaria.</BodyText>
            </Row>
            <Row label="Decir">
              <VerbatimText>
                En un solo mensaje. Los 4 items exactos que Ashley necesita. No 3 correos separados. Cinco segundos con el checklist completo.
              </VerbatimText>
            </Row>
          </View>
        </Step>

        <Step n="12" title="Segundo mensaje del usuario · evidencia">
          <CopyPasteBlock text="Listo, subi las tres fotos (INE frente, reverso y selfie con la INE). Los ultimos 4 digitos son 4872." />
          <View style={{ marginTop: 8 }}>
            <Row label="Esperado">
              <BodyText>Nelia confirma que tiene los 4 items y escala con esc_XXXXXXXX a Ashley de Cuentas.</BodyText>
            </Row>
          </View>
        </Step>

        <Step n="13" title="Ver el correo que Nelia mandó a Ashley">
          <Row label="Abrir">
            <LinkRow href="https://mail.google.com/mail/u/0/#search/to%3Anazre20%2Bashley+meefi">
              mail.google.com filtro: to:nazre20+ashley meefi
            </LinkRow>
          </Row>
          <Row label="Mostrar">
            <BodyText>Mismo template que el de Emilio pero con prioridad media, responsable Ashley, resumen con evidencia recolectada, hipótesis de recovery legítimo, próxima acción sugerida.</BodyText>
          </Row>
          <Row label="Decir">
            <VerbatimText>
              Ashley abre esto y ya sabe exactamente qué hacer. No arma el rompecabezas. Nelia se lo armó.
            </VerbatimText>
          </Row>
        </Step>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 7 · Niva
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque Niva · Compliance">

        <Step n="14" title="Transición verbal a Niva" subtitle="Sin nada que abrir">
          <Row label="Decir">
            <VerbatimText>
              Todo lo que vieron aplica a soporte. La misma lógica aplica en compliance. Y esto es relevante porque van a tener un Head of Compliance nuevo entrando. Les enseño lo que ya está operando debajo. Cambio de empleada: Niva, directora de análisis y compliance.
            </VerbatimText>
          </Row>
        </Step>

        <Step n="15" title="Abrir el chat de Niva en el portal">
          <Row label="Abrir">
            <LinkRow href="https://www.centinelia.mx/portal/5RP13tnLK6XX/empleados">
              centinelia.mx/portal/5RP13tnLK6XX/empleados
            </LinkRow>
          </Row>
          <Row label="Acción">
            <BodyText>Clic en tarjeta de Niva. Buscar el chat o bandeja de la empleada.</BodyText>
          </Row>
          <Row label="Decir">
            <VerbatimText>
              Vista interna. Es como el equipo de ustedes hoy operaría. Niva vive acá, procesa casos, deja bitácora, escala.
            </VerbatimText>
          </Row>
        </Step>

        <Step n="16" title="Enviar prompt del expediente" subtitle="Copy-paste largo, un solo bloque">
          <CopyPasteBlock text="Niva, tengo el expediente de Comercializadora Bajio SA de CV, importadora de refacciones de EEUU. Datos: representante legal Juan Perez Ramirez, INE vigente. RFC CBA850101ABC, opinion 32-D positiva al 2026-08-15, domicilio Monterrey NL vigente. BCF: Ana Sanchez Romero (65%, mexicana, residente MX) y Luis Ramirez Torres (35%, mexicano, residente MX). Volumen mensual estimado 300 mil USD, corredor USD-MXN, bancos origen BBVA-Banorte. Frecuencia semanal. Corre checks OFAC, UIF, PLD y screening PEP, dame el analisis con recomendacion para Sofia." />
          <View style={{ marginTop: 8 }}>
            <Row label="Decir mientras procesa (~90 seg)">
              <VerbatimText>
                Este expediente un analista jr tardaría 30 min en procesar. Niva lo hace en 90 segundos con estructura.
              </VerbatimText>
            </Row>
            <Row label="Esperado">
              <BodyText>Memo con 5 secciones: Resumen expediente / Checks OFAC-UIF-PEP / Análisis riesgo / Gaps documentales / Recomendación (aprobación condicionada).</BodyText>
            </Row>
          </View>
        </Step>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 8 · Paso 17 (anchors Niva)
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque Niva · Anchors verbatim">

        <Step n="17" title="Recorrer el memo con 3 anchors verbatim" subtitle="Uno por sección del memo mientras haces scroll">
          <Row label="Anchor 1 · en Análisis de riesgo">
            <VerbatimText>
              Detectó que Ana Sánchez con 65% activa revisión enhanced. Un analista jr sin experiencia hubiera pasado por alto ese threshold porque son mexicanos ambos y sin flags OFAC. Niva no.
            </VerbatimText>
          </Row>
          <Row label="Anchor 2 · en la sección OFAC">
            <VerbatimText>
              Esto va a apreciar tu Head of Compliance. Niva es honesta sobre sus límites. Cito literal: la búsqueda web pública no equivale a la API OFAC directa. En producción se conecta a WorldCheck o LexisNexis y lo declara.
            </VerbatimText>
          </Row>
          <Row label="Anchor 3 · en Gaps documentales y Recomendación">
            <VerbatimText>
              Le dio a Sofía 7 documentos concretos que le faltan. Sofía no tiene que preguntar qué le falta. Ya lo tiene priorizado. Y le dio condiciones operativas: monitoreo desde mes 1 con baseline 3-sigma. Eso lo aprende de los casos de ustedes.
            </VerbatimText>
          </Row>
          <Row label="Cierre">
            <VerbatimText>
              Y queda en expediente auditable. El Head of Compliance llega y ya tiene historial: casos procesados, criterios aplicados, escalamientos. Puede calibrar thresholds si quiere.
            </VerbatimText>
          </Row>
        </Step>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 9 · Cierre + Pricing
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Cierre · Propuesta y pricing">

        <Step n="18" title="Cierre comercial" subtitle="Propuesta piloto · pricing · pregunta owner · siguiente paso">

          <Row label="Resumen inicial">
            <VerbatimText>
              Vieron 5 casos. Los 4 primeros son los que hoy más escalan por Intercom. El quinto va a ocupar buena parte del tiempo del Head of Compliance nuevo.
            </VerbatimText>
          </Row>
          <Row label="Framing">
            <VerbatimText>
              Nelia y Niva no reemplazan a Ashley, Emilio, Jaime, ni al Head of Compliance. Los liberan del ping-pong para que se concentren en casos que sí requieren criterio humano.
            </VerbatimText>
          </Row>
        </Step>

        <View style={{ backgroundColor: ACCENT_BG, padding: 12, borderRadius: 6, marginBottom: 12 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT, marginBottom: 8 }}>
            Propuesta piloto · 4 semanas
          </Text>
          {[
            { w: 'Semana 1', d: 'Setup e ingesta del Help Center real, calibración de reglas de escalamiento' },
            { w: 'Semana 2', d: 'Dry runs contra ambiente sandbox con casos reales de Meefi' },
            { w: 'Semana 3', d: 'Shadow con equipo Meefi, comparación de respuestas' },
            { w: 'Semana 4', d: 'Producción gradual con 20% del tráfico + monitoreo. Si KPIs reducen escalamientos ≥60%, agregamos Niva' },
          ].map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: ACCENT, width: 70 }}>{r.w}</Text>
              <Text style={{ fontSize: 9, color: INK, flex: 1, lineHeight: 1.5 }}>{r.d}</Text>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: SOFT_BG, padding: 12, borderRadius: 6, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 8 }}>
            Pricing base mensual · 2 empleadas
          </Text>
          <View style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK }}>Nelia · Atención al cliente</Text>
            <Text style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>Jornada Completa · 500 min voz + 600 tareas/mes</Text>
            <Text style={{ fontSize: 10, color: ACCENT, marginTop: 2, fontFamily: 'Helvetica-Bold' }}>$5,994 MXN + IVA</Text>
          </View>
          <View style={{ marginBottom: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: SEP }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK }}>Niva · Directora Compliance</Text>
            <Text style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>Jornada Completa coordinadora · 1,200 tareas/mes</Text>
            <Text style={{ fontSize: 10, color: ACCENT, marginTop: 2, fontFamily: 'Helvetica-Bold' }}>$5,994 MXN + IVA</Text>
          </View>
          <View style={{ borderTopWidth: 2, borderTopColor: ACCENT, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK }}>Total base mensual</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: ACCENT }}>$11,988 MXN + IVA</Text>
          </View>
        </View>

        <View style={{ backgroundColor: SOFT_BG, padding: 12, borderRadius: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
            Automatizaciones adicionales · según necesidad
          </Text>
          <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>
            Costos que aplican solo si Meefi decide activarlas. Cotización específica por módulo después de la reunión de setup.
          </Text>
          {[
            { m: 'Integración API Meefi (webhook + lookup real de cuentas)', cost: 'Setup $3,500 + $800/mes + IVA' },
            { m: 'Ingesta continua Help Center (sync desde Intercom)', cost: 'Setup $1,500 + $400/mes + IVA' },
            { m: 'Ruteo inteligente a canal Slack (además del correo)', cost: 'Setup $1,200 + $300/mes + IVA' },
            { m: 'Dashboard KPIs de escalamiento (evitados vs escalados)', cost: 'Setup $2,000 + $500/mes + IVA' },
            { m: 'Módulos custom (por decisión Meefi post-piloto)', cost: 'Cotización específica' },
          ].map((r, i) => (
            <View key={i} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: INK, lineHeight: 1.4 }}>{r.m}</Text>
              <Text style={{ fontSize: 8.5, color: ACCENT, marginTop: 1 }}>{r.cost}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 4 }}>
          <Row label="Cierre 1 · pregunta owner">
            <VerbatimText>
              Cotización formal se las mando esta semana con el detalle desglosado. Una pregunta antes de cerrar: ¿quién queda como owner operativo del piloto de su lado, tú, Alan, Emilio, o los 3?
            </VerbatimText>
          </Row>
          <Row label="Cierre 2 · siguiente paso">
            <VerbatimText>
              Les mando esta misma tarde el correo con próximos pasos y bloque de calendario para arrancar setup el miércoles 17 o jueves 18. ¿Les funciona?
            </VerbatimText>
          </Row>
        </View>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 10 · Contingencias + Post-cita
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Contingencias y post-cita">

        <SectionTitle>Contingencias durante la cita</SectionTitle>

        <ContingencyBox title="Si el chat de Nelia no responde">
          Cerrar la pestaña, abrir nueva con el mismo link, reintentar una vez. Si tampoco: dices &quot;este bloque se demoró más de lo normal, les enseño el video del ensayo&quot; y reproduces el Loom del bloque. Sigues al siguiente sin debugear.
        </ContingencyBox>

        <ContingencyBox title="Si el correo no llega en Gmail en 20 segundos">
          Refrescar Gmail. Si sigue sin llegar en 30 seg: &quot;está tardando más de lo normal. En producción el envío es asincrónico y el destinatario lo recibe en menos de 5 seg. Mientras tanto les muestro cómo se ve el correo cuando llega&quot; y abres un correo previo del dry run que ya está en tu bandeja.
        </ContingencyBox>

        <ContingencyBox title="Si Niva pide más info en vez de dar el memo">
          &quot;Está bien, miren lo que hace. Antes de decidir les pide el expediente completo. Este es el opuesto del chatbot genérico que aprueba sin datos. Ahora se lo doy y procesa.&quot; Pegar el mismo prompt otra vez.
        </ContingencyBox>

        <ContingencyBox title="Si Gera pregunta precio antes del Paso 18">
          &quot;Al final del recorrido les doy el número con contexto. Sigo con esto que es lo importante primero.&quot;
        </ContingencyBox>

        <ContingencyBox title="Si el portal está caído">
          Verificar en vercel.com desde el celular. Si está caído: &quot;les enseño los videos del ensayo&quot; y reproducir los 5 Loom en secuencia. Cierre comercial igual.
        </ContingencyBox>

        <SectionTitle>Post-cita el mismo día</SectionTitle>

        <View style={{ backgroundColor: ACCENT_BG, padding: 12, borderRadius: 6, marginBottom: 16 }}>
          <Text style={{ fontSize: 9.5, color: INK, lineHeight: 1.6 }}>
            Antes de las 5 PM del mismo lunes, mandar correo de gracias con siguiente paso. Draft en 3 variantes según cómo salió la cita (A pegó / B con reservas / C no pegó). Elegís una y ajustás 2-3 frases con detalles reales.
          </Text>
          <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 8 }}>
            Archivo: demos/meefi-gac/25-correos-post-cita-drafts.md
          </Text>
        </View>

        <SectionTitle>Links de referencia rápida</SectionTitle>

        <View style={{ backgroundColor: SOFT_BG, padding: 12, borderRadius: 6 }}>
          {[
            { l: 'Bloque 1 · Password reset', href: 'https://www.centinelia.mx/demo/meefi?scenario=1', short: 'centinelia.mx/demo/meefi?scenario=1' },
            { l: 'Bloque 2 · Transferencia HERO', href: 'https://www.centinelia.mx/demo/meefi?scenario=2', short: 'centinelia.mx/demo/meefi?scenario=2' },
            { l: 'Bloque 3 · Help Center', href: 'https://www.centinelia.mx/demo/meefi?scenario=3', short: 'centinelia.mx/demo/meefi?scenario=3' },
            { l: 'Bloque 4 · 2FA recovery', href: 'https://www.centinelia.mx/demo/meefi?scenario=4', short: 'centinelia.mx/demo/meefi?scenario=4' },
            { l: 'Correo a Emilio', href: 'https://mail.google.com/mail/u/0/#search/to%3Anazre20%2Bemilio+meefi', short: 'Gmail filtro to:nazre20+emilio meefi' },
            { l: 'Correo a Ashley', href: 'https://mail.google.com/mail/u/0/#search/to%3Anazre20%2Bashley+meefi', short: 'Gmail filtro to:nazre20+ashley meefi' },
            { l: 'Portal Meefi (Niva)', href: 'https://www.centinelia.mx/portal/5RP13tnLK6XX/empleados', short: 'centinelia.mx/portal/5RP13tnLK6XX/empleados' },
          ].map((r, i) => (
            <View key={i} style={{ marginBottom: 5 }}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {r.l}
              </Text>
              <Link src={r.href} style={{ fontSize: 9, color: ACCENT, textDecoration: 'underline' }}>
                {r.short}
              </Link>
            </View>
          ))}
        </View>

      </PageShell>

    </Document>
  );
}
