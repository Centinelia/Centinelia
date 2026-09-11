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

// ── Sub-components ───────────────────────────────────────────────────────────

function PageShell({ children, pageLabel }: { children: React.ReactNode; pageLabel: string }) {
  return (
    <Page size="A4" style={S.page}>

      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 18,
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

      <View fixed style={[S.footer, { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 7.5, color: MUTED }}>
            {BRAND.footerText}  ·  {BRAND.phone}  ·  {BRAND.website}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                style={{ fontSize: 7.5, color: MUTED }} />
        </View>
      </View>
    </Page>
  );
}

function StepBox({ n, title, subtitle }: { n: string; title: string; subtitle?: string }) {
  return (
    <View style={{
      backgroundColor: ACCENT_BG,
      borderRadius: 6,
      borderLeftWidth: 3,
      borderLeftColor: ACCENT,
      padding: 10,
      marginTop: 12,
      marginBottom: 4,
    }} wrap={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{
          backgroundColor: ACCENT,
          borderRadius: 4,
          paddingVertical: 2,
          paddingHorizontal: 8,
          marginRight: 8,
        }}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff' }}>{n}</Text>
        </View>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, flex: 1 }}>
          {title}
        </Text>
      </View>
      {subtitle && (
        <Text style={{ fontSize: 9, color: MUTED, marginTop: 4, marginLeft: 32 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function ActionLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 4, marginTop: 4 }}>
      <Text style={{ width: 60, fontSize: 8, fontFamily: 'Helvetica-Bold', color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      <View style={{ flex: 1 }}>
        {children}
      </View>
    </View>
  );
}

function CopyPasteBlock({ text }: { text: string }) {
  return (
    <View style={{
      backgroundColor: '#F3F4F6',
      borderLeftWidth: 2,
      borderLeftColor: MUTED,
      padding: 8,
      marginTop: 4,
      marginBottom: 6,
      borderRadius: 3,
    }}>
      <Text style={{ fontSize: 9, fontFamily: 'Courier', color: INK, lineHeight: 1.5 }}>
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
      borderRadius: 4,
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

// ── Component ────────────────────────────────────────────────────────────────

export function ChecklistMeefiPdf() {
  return (
    <Document title="Demo Meefi 15-sept — Checklist" author="Centinelia">

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 1 · Portada + Overview
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Portada · 15-sept-2026">

        <View style={{ marginTop: 40, marginBottom: 30 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT, letterSpacing: 1.5 }}>
            CHECKLIST DE EJECUCIÓN
          </Text>
          <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 8 }}>
            Demo Meefi
          </Text>
          <Text style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>
            Nelia soporte + Niva compliance · 15 de septiembre 2026
          </Text>
        </View>

        <View style={{ backgroundColor: ACCENT_BG, padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT, marginBottom: 8 }}>
            Cómo usar este documento
          </Text>
          <Text style={{ fontSize: 10, color: INK, lineHeight: 1.6 }}>
            18 pasos numerados. Cada paso te dice qué link abrir y qué texto copiar. Después de cada acción hay 1-2 líneas de qué decir mientras la empleada responde. Todos los links del documento son clicables desde el PDF.
          </Text>
          <Text style={{ fontSize: 10, color: INK, lineHeight: 1.6, marginTop: 6 }}>
            Regla de oro: si algo se cae en vivo, no debugueás. Dices &quot;esto ya lo vieron funcionar; aquí un video del ensayo&quot; y sigues al siguiente bloque.
          </Text>
        </View>

        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
          Recorrido de la sesión (45-50 min)
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
          <View key={i} style={{ flexDirection: 'row', marginBottom: 6, alignItems: 'center' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginRight: 8 }} />
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, width: 220 }}>{b.label}</Text>
            <Text style={{ fontSize: 9, color: ACCENT, width: 60 }}>{b.mins}</Text>
            <Text style={{ fontSize: 9, color: MUTED, flex: 1 }}>{b.desc}</Text>
          </View>
        ))}

        <View style={{ marginTop: 24, backgroundColor: SOFT_BG, padding: 14, borderRadius: 6 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
            Credenciales que tienes que tener a mano
          </Text>
          <View style={{ flexDirection: 'row', marginBottom: 3 }}>
            <Text style={{ fontSize: 9, color: MUTED, width: 110 }}>Portal Meefi login</Text>
            <Text style={{ fontSize: 9, color: INK }}>meefi-demo@centinelia.mx · MeefiDemo2026!</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 3 }}>
            <Text style={{ fontSize: 9, color: MUTED, width: 110 }}>Gmail Nelia</Text>
            <Text style={{ fontSize: 9, color: INK }}>centinelia.dev@gmail.com (ya conectada al backend)</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 3 }}>
            <Text style={{ fontSize: 9, color: MUTED, width: 110 }}>Gmail Nazre</Text>
            <Text style={{ fontSize: 9, color: INK }}>nazre20@gmail.com (para ver correos escalados con alias)</Text>
          </View>
        </View>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 2 · Paso 0 y Bloque 1
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque 1 · Password reset">

        <StepBox n="0" title="Apertura verbal" subtitle="Sin nada que abrir · 2-3 min" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9.5, color: INK, lineHeight: 1.5, fontStyle: 'italic' }}>
              Gera, Alan, Emilio (si asisten): gracias por hacer espacio. Hoy les voy a mostrar 5 casos que hoy escalan a su equipo por Intercom, resueltos por dos empleadas: Nelia en soporte, Niva en compliance. Vamos a ver caso por caso cómo la reciben, cómo trabajan y cómo entregan. Empezamos con soporte.
            </Text>
          </ActionLine>
        </View>

        <StepBox n="1" title="Abrir Bloque 1 · Password reset" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Abrir">
            <Link src="https://www.centinelia.mx/demo/meefi?scenario=1" style={{ fontSize: 9, color: ACCENT, textDecoration: 'underline' }}>
              centinelia.mx/demo/meefi?scenario=1
            </Link>
          </ActionLine>
          <ActionLine label="Clic">
            <Text style={{ fontSize: 9, color: INK }}>Burbuja azul con N abajo-derecha para abrir el chat de Nelia</Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Esta es la vista del usuario. Nelia vive abajo a la derecha, como cualquier chatbot del que ya están acostumbrados con Intercom.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="2" title="Enviar mensaje del usuario" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Copiar y pegar">
            <View />
          </ActionLine>
          <CopyPasteBlock text="Hola, no puedo cambiar mi contrasena. Ya intente varias veces y el link no me funciona." />
          <ActionLine label="Enter">
            <Text style={{ fontSize: 9, color: INK }}>Esperar respuesta de Nelia (~15 seg)</Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Miren la diferencia con Intercom. Intercom les mandaría un link genérico y listo. Nelia primero está revisando la cuenta real del usuario en Meefi para saber por qué el reset no le está funcionando.&quot;
            </Text>
          </ActionLine>
          <ActionLine label="Esperado">
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
              Nelia identifica que el correo del usuario no está confirmado y guía a buscar el correo de bienvenida.
            </Text>
          </ActionLine>
          <ActionLine label="Cierre">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Detectó el motivo real. Correo no confirmado. Le está guiando al paso concreto. Si no funciona, entonces sí escalamos. Pero primero: diagnóstico.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="3" title="Segundo mensaje del usuario" />
        <View style={{ marginLeft: 8 }}>
          <CopyPasteBlock text="Ya confirme mi correo, ahora si." />
          <ActionLine label="Esperado">
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
              Nelia intenta el reset, ve que sigue bloqueado, guía a esperar 2-3 min y revisar spam. No miente, no escala sin razón.
            </Text>
          </ActionLine>
          <ActionLine label="Cierre">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Nelia no le miente ni le manda un link roto. Le da información honesta. Un chatbot que aprueba a ciegas destruye la confianza del usuario. Nelia no lo hace.&quot;
            </Text>
          </ActionLine>
        </View>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 3 · Bloque 2 HERO
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque 2 · Transferencia HERO">

        <View style={{ backgroundColor: ACCENT_STRONG, padding: 8, borderRadius: 4, marginTop: 6, marginBottom: 4 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: ACCENT, letterSpacing: 0.5 }}>
            HERO · CASO QUE MÁS ESCALA HOY POR INTERCOM
          </Text>
        </View>

        <StepBox n="4" title="Abrir Bloque 2" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Abrir">
            <Link src="https://www.centinelia.mx/demo/meefi?scenario=2" style={{ fontSize: 9, color: ACCENT, textDecoration: 'underline' }}>
              centinelia.mx/demo/meefi?scenario=2
            </Link>
          </ActionLine>
          <ActionLine label="Clic">
            <Text style={{ fontSize: 9, color: INK }}>Burbuja Nelia</Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Este es el caso que más les escala Intercom. Transferencia no reflejada.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="5" title="Enviar mensaje del usuario" />
        <View style={{ marginLeft: 8 }}>
          <CopyPasteBlock text="Hice una transferencia de 50 mil pesos hace como dos horas y no me aparece en mi cuenta." />
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Intercom aquí simplemente escalaría diciendo &apos;un momento por favor&apos; porque no tiene acceso al sistema. Nelia sí lo tiene.&quot;
            </Text>
          </ActionLine>
          <ActionLine label="Esperado">
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
              Nelia consulta el estado. Dice: monto $50,000, destino BBVA, pendiente en rieles SPEI, ETA antes de 19:00 CDMX. Pregunta si hay urgencia.
            </Text>
          </ActionLine>
          <ActionLine label="Cierre">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Sin escalar. Le dio: monto, destino, estado y ETA. Y está preguntando activamente si hay urgencia, para decidir si escalar. Eso es lo que un buen agente humano hace.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="6" title="Segundo mensaje (urgencia declarada)" />
        <View style={{ marginLeft: 8 }}>
          <CopyPasteBlock text="Si, es urgente. Es a un proveedor y tiene cierre de operaciones hoy a las 5." />
          <ActionLine label="Esperado">
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
              Nelia escala. Confirma ticket esc_XXXXXXXX con Emilio de Operaciones.
            </Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Ahora sí escala. Y vamos a ver exactamente qué es lo que Emilio recibe.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="7" title="Ver el correo que Nelia mandó a Emilio" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Abrir">
            <Link src="https://mail.google.com/mail/u/0/#search/to%3Anazre20%2Bemilio+meefi" style={{ fontSize: 9, color: ACCENT, textDecoration: 'underline' }}>
              mail.google.com (filtro: to:nazre20+emilio meefi)
            </Link>
          </ActionLine>
          <ActionLine label="Mostrar">
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
              Header morado &quot;Meefi Soporte&quot;, tabla con metadata (ticket, prioridad, tema, responsable, usuario, hora GMT-6), sección Resumen con datos, Hipótesis, Próxima acción, botón CTA &quot;Abrir conversación en Meefi&quot;.
            </Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Emilio no tiene que preguntarle nada al usuario. Recibe el caso con el contexto ejecutivo listo. Monto, destino, deadline. Y la conversación original a un clic. Esto es lo que quisieran que Intercom hiciera cuando escala.&quot;
            </Text>
          </ActionLine>
        </View>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 4 · Bloque 3 + 4
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloques 3 y 4 · Help Center y 2FA">

        <StepBox n="8" title="Abrir Bloque 3 · Consulta Help Center" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Abrir">
            <Link src="https://www.centinelia.mx/demo/meefi?scenario=3" style={{ fontSize: 9, color: ACCENT, textDecoration: 'underline' }}>
              centinelia.mx/demo/meefi?scenario=3
            </Link>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Caso simple pero importante. Preguntas informativas sobre su plataforma.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="9" title="Enviar pregunta" />
        <View style={{ marginLeft: 8 }}>
          <CopyPasteBlock text="Cuanto tiempo tarda una transferencia SPEI a otro banco?" />
          <ActionLine label="Esperado">
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
              Nelia cita literal del artículo con detalle por banco (BBVA/Santander 15 min, Banorte 30 min, HSBC hora en punto) + 2 links a help.meefi.io.
            </Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Ese contenido sale del Help Center ingerido. No memoriza, no aproxima. Cita textualmente y da el link. Si mañana ustedes cambian el artículo, Nelia responde con el nuevo texto sin retocar nada.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="10" title="Abrir Bloque 4 · 2FA recovery" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Abrir">
            <Link src="https://www.centinelia.mx/demo/meefi?scenario=4" style={{ fontSize: 9, color: ACCENT, textDecoration: 'underline' }}>
              centinelia.mx/demo/meefi?scenario=4
            </Link>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Caso más ambicioso. Recovery 2FA. Hoy con Intercom se convierte en ping-pong de 10 correos con Ashley.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="11" title="Enviar mensaje del usuario" />
        <View style={{ marginLeft: 8 }}>
          <CopyPasteBlock text="Perdi el celular donde tenia el Authenticator. Ya no puedo entrar a mi cuenta." />
          <ActionLine label="Esperado">
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
              Nelia abre ticket rec_XXXXXXXX y pide 4 items en lista clara (INE frente, reverso, selfie con INE, últimos 4 cuenta).
            </Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;En un solo mensaje. Los 4 items exactos que Ashley necesita. No 3 correos separados. Cinco segundos con el checklist completo.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="12" title="Segundo mensaje (evidencia)" />
        <View style={{ marginLeft: 8 }}>
          <CopyPasteBlock text="Listo, subi las tres fotos (INE frente, reverso y selfie con la INE). Los ultimos 4 digitos son 4872." />
          <ActionLine label="Esperado">
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
              Nelia confirma los 4 items y escala con esc_XXXXXXXX a Ashley.
            </Text>
          </ActionLine>
        </View>

        <StepBox n="13" title="Ver el correo a Ashley" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Abrir">
            <Link src="https://mail.google.com/mail/u/0/#search/to%3Anazre20%2Bashley+meefi" style={{ fontSize: 9, color: ACCENT, textDecoration: 'underline' }}>
              mail.google.com (filtro: to:nazre20+ashley meefi)
            </Link>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Ashley abre esto y ya sabe exactamente qué hacer. No arma el rompecabezas. Nelia se lo armó.&quot;
            </Text>
          </ActionLine>
        </View>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 5 · Niva
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Bloque Niva · Compliance">

        <StepBox n="14" title="Transición verbal a Niva" subtitle="Sin nada que abrir" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Todo lo que vieron aplica a soporte. La misma lógica aplica en compliance. Y esto es relevante porque van a tener un Head of Compliance nuevo entrando. Les enseño lo que ya está operando debajo. Cambio de empleada: Niva, directora de análisis y compliance.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="15" title="Abrir el chat de Niva en el portal" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Abrir">
            <Link src="https://www.centinelia.mx/portal/5RP13tnLK6XX/empleados" style={{ fontSize: 9, color: ACCENT, textDecoration: 'underline' }}>
              centinelia.mx/portal/5RP13tnLK6XX/empleados
            </Link>
          </ActionLine>
          <ActionLine label="Clic">
            <Text style={{ fontSize: 9, color: INK }}>Tarjeta de Niva → buscar chat/bandeja</Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Vista interna. Es como el equipo de ustedes hoy operaría. Niva vive acá, procesa casos, deja bitácora, escala.&quot;
            </Text>
          </ActionLine>
        </View>

        <StepBox n="16" title="Enviar prompt del expediente" subtitle="Copy-paste largo, un solo bloque" />
        <View style={{ marginLeft: 8 }}>
          <CopyPasteBlock text="Niva, tengo el expediente de Comercializadora Bajio SA de CV, importadora de refacciones de EEUU. Datos: representante legal Juan Perez Ramirez, INE vigente. RFC CBA850101ABC, opinion 32-D positiva al 2026-08-15, domicilio Monterrey NL vigente. BCF: Ana Sanchez Romero (65%, mexicana, residente MX) y Luis Ramirez Torres (35%, mexicano, residente MX). Volumen mensual estimado 300 mil USD, corredor USD-MXN, bancos origen BBVA-Banorte. Frecuencia semanal. Corre checks OFAC, UIF, PLD y screening PEP, dame el analisis con recomendacion para Sofia." />
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Este expediente un analista jr tardaría 30 min en procesar. Niva lo hace en 90 segundos con estructura.&quot;
            </Text>
          </ActionLine>
          <ActionLine label="Esperado">
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.5 }}>
              Memo con 5 secciones: Resumen expediente / Checks OFAC-UIF-PEP / Análisis riesgo / Gaps documentales / Recomendación (aprobación condicionada).
            </Text>
          </ActionLine>
        </View>

        <StepBox n="17" title="Recorrer el memo con 3 anchors verbatim" />
        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Anchor 1">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              (Cuando muestres análisis de riesgo) &quot;Detectó que Ana Sánchez con 65% activa revisión enhanced. Un analista jr sin experiencia hubiera pasado por alto ese threshold porque son mexicanos ambos y sin flags OFAC. Niva no.&quot;
            </Text>
          </ActionLine>
          <ActionLine label="Anchor 2">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              (Cuando muestres sección OFAC) &quot;Esto va a apreciar tu Head of Compliance. Niva es honesta sobre sus límites. Cito literal: la búsqueda web pública no equivale a la API OFAC directa. En producción se conecta a WorldCheck o LexisNexis y lo declara.&quot;
            </Text>
          </ActionLine>
          <ActionLine label="Anchor 3">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              (Cuando muestres gaps + recomendación) &quot;Le dio a Sofía 7 documentos concretos que le faltan. Sofía no tiene que preguntar qué le falta. Ya lo tiene priorizado. Y le dio condiciones operativas: monitoreo desde mes 1 con baseline 3-sigma. Eso lo aprende de los casos de ustedes.&quot;
            </Text>
          </ActionLine>
          <ActionLine label="Cierre">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Y queda en expediente auditable. El Head of Compliance llega y ya tiene historial: casos procesados, criterios aplicados, escalamientos. Puede calibrar thresholds si quiere.&quot;
            </Text>
          </ActionLine>
        </View>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 6 · Cierre + Pricing
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Cierre · Propuesta y pricing">

        <StepBox n="18" title="Cierre comercial" subtitle="Recorrido narrativo · pricing · pregunta owner" />

        <View style={{ marginLeft: 8, marginBottom: 12 }}>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Vieron 5 casos. Los 4 primeros son los que hoy más escalan por Intercom. El quinto va a ocupar buena parte del tiempo del Head of Compliance nuevo.&quot;
            </Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Nelia y Niva no reemplazan a Ashley, Emilio, Jaime, ni al Head of Compliance. Los liberan del ping-pong para que se concentren en casos que sí requieren criterio humano.&quot;
            </Text>
          </ActionLine>
        </View>

        <View style={{ backgroundColor: ACCENT_BG, padding: 12, borderRadius: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT, marginBottom: 6 }}>
            Propuesta piloto · 4 semanas
          </Text>
          {[
            { w: 'Semana 1', d: 'Setup e ingesta del Help Center real, calibración de reglas de escalamiento' },
            { w: 'Semana 2', d: 'Dry runs contra ambiente sandbox con casos reales de Meefi' },
            { w: 'Semana 3', d: 'Shadow con equipo Meefi, comparación de respuestas' },
            { w: 'Semana 4', d: 'Producción gradual con 20% del tráfico + monitoreo. Si KPIs reducen escalamientos ≥60%, agregamos Niva' },
          ].map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 3 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: ACCENT, width: 70 }}>{r.w}</Text>
              <Text style={{ fontSize: 9, color: INK, flex: 1, lineHeight: 1.5 }}>{r.d}</Text>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: SOFT_BG, padding: 12, borderRadius: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
            Pricing base · 2 empleadas
          </Text>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ fontSize: 9, color: MUTED, width: 150 }}>Nelia · Plan Pro Profesional</Text>
            <Text style={{ fontSize: 9, color: INK }}>600 min + 200 tareas/mes · $5,994 MXN + IVA</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ fontSize: 9, color: MUTED, width: 150 }}>Niva · Plan Pro Profesional</Text>
            <Text style={{ fontSize: 9, color: INK }}>600 min + 200 tareas/mes · $5,994 MXN + IVA</Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 6, paddingTop: 6, flexDirection: 'row' }}>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, width: 150 }}>Total base mensual</Text>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT }}>$11,988 MXN + IVA</Text>
          </View>
        </View>

        <View style={{ backgroundColor: SOFT_BG, padding: 12, borderRadius: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
            Automatizaciones adicionales · según necesidad
          </Text>
          <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 6, lineHeight: 1.5 }}>
            Costos que aplican solo si Meefi decide activarlas. Cotización específica por módulo después de la reunión de setup.
          </Text>
          {[
            { m: 'Integración API Meefi (webhook + lookup real de cuentas)', cost: 'Setup $3,500 + $800/mes + IVA' },
            { m: 'Ingesta continua Help Center (sync automático desde Intercom)', cost: 'Setup $1,500 + $400/mes + IVA' },
            { m: 'Ruteo inteligente a canal Slack (además del correo)', cost: 'Setup $1,200 + $300/mes + IVA' },
            { m: 'Dashboard de KPIs de escalamiento (evitados vs escalados)', cost: 'Setup $2,000 + $500/mes + IVA' },
            { m: 'Módulos custom (por decisión Meefi post-piloto)', cost: 'Cotización específica' },
          ].map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 3 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginRight: 6, marginTop: 4 }} />
              <Text style={{ fontSize: 8.5, color: INK, flex: 1, lineHeight: 1.5 }}>{r.m}</Text>
              <Text style={{ fontSize: 8.5, color: ACCENT, marginLeft: 8 }}>{r.cost}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginLeft: 8 }}>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Cotización formal se las mando esta semana con el detalle desglosado. Una pregunta antes de cerrar: ¿quién queda como owner operativo del piloto de su lado, tú, Alan, Emilio, o los 3?&quot;
            </Text>
          </ActionLine>
          <ActionLine label="Decir">
            <Text style={{ fontSize: 9, color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
              &quot;Les mando esta misma tarde el correo con próximos pasos y bloque de calendario para arrancar setup el miércoles 17 o jueves 18. ¿Les funciona?&quot;
            </Text>
          </ActionLine>
        </View>

      </PageShell>

      {/* ═══════════════════════════════════════════════════════════════════════
          PÁGINA 7 · Contingencias + Post-cita
      ═══════════════════════════════════════════════════════════════════════ */}
      <PageShell pageLabel="Contingencias y post-cita">

        <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 6, marginBottom: 10 }}>
          Contingencias durante la cita
        </Text>

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

        <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 20, marginBottom: 8 }}>
          Post-cita el mismo día
        </Text>

        <View style={{ backgroundColor: ACCENT_BG, padding: 12, borderRadius: 6 }}>
          <Text style={{ fontSize: 9, color: INK, lineHeight: 1.6 }}>
            Antes de las 5 PM del mismo lunes, mandas correo de gracias con siguiente paso. Draft en 3 variantes según cómo salió la cita (A pegó / B con reservas / C no pegó). Elegís una y ajustas 2-3 frases con detalles reales.
          </Text>
          <Text style={{ fontSize: 9, color: MUTED, marginTop: 8 }}>
            Archivo: demos/meefi-gac/25-correos-post-cita-drafts.md
          </Text>
        </View>

        <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 20, marginBottom: 8 }}>
          Links de referencia rápida
        </Text>

        <View style={{ backgroundColor: SOFT_BG, padding: 12, borderRadius: 6 }}>
          {[
            { l: 'Bloque 1 · Password reset', u: 'centinelia.mx/demo/meefi?scenario=1', href: 'https://www.centinelia.mx/demo/meefi?scenario=1' },
            { l: 'Bloque 2 · Transferencia HERO', u: 'centinelia.mx/demo/meefi?scenario=2', href: 'https://www.centinelia.mx/demo/meefi?scenario=2' },
            { l: 'Bloque 3 · Help Center', u: 'centinelia.mx/demo/meefi?scenario=3', href: 'https://www.centinelia.mx/demo/meefi?scenario=3' },
            { l: 'Bloque 4 · 2FA recovery', u: 'centinelia.mx/demo/meefi?scenario=4', href: 'https://www.centinelia.mx/demo/meefi?scenario=4' },
            { l: 'Gmail correo a Emilio', u: 'mail.google.com filtro to:nazre20+emilio meefi', href: 'https://mail.google.com/mail/u/0/#search/to%3Anazre20%2Bemilio+meefi' },
            { l: 'Gmail correo a Ashley', u: 'mail.google.com filtro to:nazre20+ashley meefi', href: 'https://mail.google.com/mail/u/0/#search/to%3Anazre20%2Bashley+meefi' },
            { l: 'Portal Meefi (para Niva)', u: 'centinelia.mx/portal/5RP13tnLK6XX/empleados', href: 'https://www.centinelia.mx/portal/5RP13tnLK6XX/empleados' },
          ].map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
              <Text style={{ fontSize: 8.5, color: MUTED, width: 180 }}>{r.l}</Text>
              <Link src={r.href} style={{ fontSize: 8.5, color: ACCENT, textDecoration: 'underline', flex: 1 }}>{r.u}</Link>
            </View>
          ))}
        </View>

      </PageShell>

    </Document>
  );
}
