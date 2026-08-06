import type { VoiceAgent } from '@/types/agent';

// ─── Paleta ────────────────────────────────────────────────────────────────────

const ACCENT     = '#6C3BFF';
const ACCENT_BG  = 'rgba(108,59,255,0.06)';
const ACCENT_BD  = 'rgba(108,59,255,0.16)';
const WARN_BG    = 'rgba(245,158,11,0.06)';
const WARN_BD    = 'rgba(245,158,11,0.22)';
const INK        = '#1A0A3B';
const INK_SOFT   = '#4a4266';
const MUTED      = '#8a83a3';
const RULE       = 'rgba(26,10,59,0.08)';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

function fmt(date: string) {
  return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Documento ─────────────────────────────────────────────────────────────────

export function ContractDocument({ agent }: { agent: VoiceAgent }) {
  const signedAt = agent.contract_accepted_at ? fmt(agent.contract_accepted_at) : null;
  const today    = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const business = agent.business_name;

  // Fallback: si hay contract_text custom (admin lo editó), respetarlo.
  if (agent.contract_text) {
    return (
      <div style={{ fontFamily: FONT_STACK, lineHeight: 1.75, color: INK, fontSize: '0.9rem' }}>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit', margin: 0 }}>
          {agent.contract_text}
        </pre>
        {signedAt && <SignatureBlock name={agent.client_name} date={signedAt} ip={agent.contract_ip} />}
      </div>
    );
  }

  return (
    <article style={{ fontFamily: FONT_STACK, color: INK, fontSize: '0.92rem', lineHeight: 1.75 }}>

      {/* ── Cover ────────────────────────────────────────────────────────── */}
      <header style={{ paddingBottom: '2rem', marginBottom: '2.75rem', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1.75rem' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: ACCENT }} />
          <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>
            Centinelia · Pneuma Studio
          </span>
        </div>
        <h1 style={{ fontSize: '2.1rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.15, color: INK }}>
          Términos de servicio
        </h1>
        <p style={{ marginTop: '0.85rem', color: INK_SOFT, fontSize: '0.95rem', maxWidth: '38rem' }}>
          Documento vigente para <strong style={{ color: INK }}>{business}</strong>. Emitido el {today}.
        </p>

        <div style={{ marginTop: '1.75rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          <Chip label="Sin permanencia" />
          <Chip label="Cancelable en cualquier momento" />
          <Chip label="Sujeto a revisión periódica" />
        </div>
      </header>

      {/* ── Preámbulo ─────────────────────────────────────────────────────── */}
      <p style={{ marginTop: 0, marginBottom: '2.5rem', fontSize: '0.95rem', color: INK_SOFT }}>
        Estos términos regulan el uso que <strong style={{ color: INK }}>{business}</strong> (&ldquo;el Cliente&rdquo;) hace de la plataforma <strong style={{ color: INK }}>Centinelia</strong>, desarrollada y operada por Pneuma Studio (&ldquo;Centinelia&rdquo;). Al activar cualquier empleado digital o funcionalidad, el Cliente confirma haber leído y aceptado estos términos.
      </p>

      {/* ── Cláusulas ─────────────────────────────────────────────────────── */}

      <Section n="01" title="Qué es Centinelia">
        <p>
          Centinelia es una <strong>plataforma en la nube de empleados digitales</strong> basados en inteligencia artificial. Cada empleado tiene un rol especializado (recepción, ventas, atención a clientes, cobranza, coordinación, recursos humanos, operaciones, entre otros) y opera de forma autónoma dentro de los límites que el Cliente configura desde el portal.
        </p>
        <p>
          El servicio se opera bajo un modelo SaaS: no hay software que instalar en las instalaciones del Cliente ni infraestructura que mantener. Todo el acceso y la administración se realiza desde el portal web de Centinelia.
        </p>
      </Section>

      <Section n="02" title="Capacidades de la plataforma">
        <p style={{ marginTop: 0 }}>
          Al momento de emitirse este documento, la plataforma incluye las siguientes familias de capacidades. El detalle específico habilitado para cada empleado depende del rol asignado y de la configuración vigente en el portal.
        </p>

        <CapabilityGroup title="Atención por voz 24/7">
          Recepción de llamadas entrantes, calificación de prospectos, agendamiento, toma de pedidos, atención a clientes existentes, transferencia inteligente al equipo humano, cobranza y llamadas salientes con cumplimiento LFPC.
        </CapabilityGroup>

        <CapabilityGroup title="Oficina digital">
          Procesamiento de correos entrantes con clasificación y respuesta asistida, generación de documentos (facturas, órdenes de compra, cotizaciones, notas, contratos, reportes) en PDF, Word, Excel y PowerPoint, gestión de plantillas de marca y flujo de aprobación humana opcional.
        </CapabilityGroup>

        <CapabilityGroup title="Coordinación entre empleados">
          Coordinadores internos (Nox, Niva) que delegan tareas entre el equipo digital, revisan resultados, generan briefs y reportes ejecutivos, y proponen mejoras basadas en la operación semanal.
        </CapabilityGroup>

        <CapabilityGroup title="Integraciones externas">
          Conexión vía OAuth con Gmail, Outlook, Google Calendar, Microsoft Calendar, Google Drive, OneDrive, Google Sheets, Notion, Mercado Libre y QuickBooks Online. Emisión y consulta de CFDI 4.0 a través de proveedor autorizado.
        </CapabilityGroup>

        <CapabilityGroup title="Automatizaciones opcionales">
          Check-in periódico, brief del día, reportes automáticos, aprendizaje semanal a partir de correos y patrones de interacción, encuestas telefónicas de satisfacción, y recordatorios de fechas críticas.
        </CapabilityGroup>

        <CapabilityGroup title="Gobierno y sector público">
          Módulo especializado para organismos municipales: registro de reportes ciudadanos con folio y seguimiento, coordinación de despacho, y consulta de historial.
        </CapabilityGroup>

        <CapabilityGroup title="Escalación humana">
          Los empleados pueden solicitar ayuda al propietario o a un aprobador designado cuando detectan situaciones que exceden su autoridad, con solicitudes tipificadas (información, acción o aprobación) y canal de respuesta trazable.
        </CapabilityGroup>

        <CapabilityGroup title="Portal de administración">
          Reportes, estadísticas y actividad en tiempo real, sub-usuarios con permisos granulares por módulo, personalización de voz, personalidad y base de conocimiento por empleado, límites de autoridad, metas medibles con seguimiento y grabación/transcripción de cada interacción.
        </CapabilityGroup>

        <Callout tone="accent">
          El catálogo de capacidades evoluciona continuamente. Centinelia se reserva el derecho de agregar, modificar o retirar capacidades del catálogo notificando al Cliente con antelación razonable cuando el cambio sea material.
        </Callout>
      </Section>

      <Section n="03" title="Modelo comercial">
        <p style={{ marginTop: 0 }}>
          Centinelia opera bajo un modelo de suscripción mensual. El plan vigente, número de empleados activos, saldo de minutos y tareas disponibles se muestran en tiempo real en la sección <em>Cuenta</em> del portal.
        </p>
        <ul style={ULIST}>
          <li><strong>Sin permanencia.</strong> El Cliente puede cancelar en cualquier momento desde el portal o notificando por correo a <strong>hola@centinelia.mx</strong>. La cancelación surte efecto al término del período mensual en curso.</li>
          <li><strong>Sin reembolsos parciales.</strong> El pago mensual no se prorratea por baja anticipada.</li>
          <li><strong>Recargas opcionales.</strong> Paquetes adicionales de minutos o tareas pueden adquirirse desde el portal cuando el Cliente lo requiera.</li>
          <li><strong>Facturación.</strong> Los pagos se procesan mediante Stripe. Centinelia emite CFDI 4.0 a solicitud del Cliente con los datos fiscales que éste proporcione.</li>
        </ul>
      </Section>

      <Section n="04" title="Limitación de responsabilidad">
        <p style={{ marginTop: 0 }}>
          El Cliente reconoce y acepta expresamente que:
        </p>
        <ul style={ULIST}>
          <li>Los empleados digitales son <strong>sistemas basados en inteligencia artificial</strong>. Aunque están entrenados y supervisados, sus respuestas pueden contener errores, imprecisiones u omisiones. El Cliente debe supervisar el desempeño y ajustar la configuración cuando lo estime necesario.</li>
          <li>Centinelia <strong>no sustituye asesoría profesional legal, médica, financiera, contable, fiscal ni de ninguna otra especialidad regulada</strong>. La información proporcionada por los empleados digitales no debe interpretarse como consejo profesional.</li>
          <li>Centinelia actúa <strong>exclusivamente como proveedor de tecnología</strong>. No es responsable por decisiones comerciales, transaccionales, contractuales o de cualquier otra índole que el Cliente, sus colaboradores o sus clientes finales tomen con base en interacciones con la plataforma.</li>
          <li>El Cliente es el <strong>único responsable de la exactitud y actualización de la información</strong> que carga en la plataforma: base de conocimiento, precios, políticas, disponibilidad, catálogo, datos de contacto y cualquier otro contenido. Centinelia no verifica ni valida el contenido cargado.</li>
          <li>Centinelia no garantiza que el servicio esté <strong>libre de interrupciones</strong>. Interrupciones causadas por proveedores upstream (telefonía, modelos de IA, correo, integraciones externas) están fuera del control directo de Centinelia; se hará el mejor esfuerzo por restablecer el servicio en tiempo razonable.</li>
        </ul>
        <Callout tone="warn">
          <strong>Límite de responsabilidad monetaria.</strong> La responsabilidad total de Centinelia frente al Cliente, por cualquier causa y bajo cualquier teoría legal, se limita al monto efectivamente pagado por el Cliente durante los tres meses anteriores al evento que motivó la reclamación.
        </Callout>
      </Section>

      <Section n="05" title="Uso responsable y cumplimiento legal">
        <ul style={{ ...ULIST, marginTop: 0 }}>
          <li><strong>Protección de datos personales.</strong> El Cliente es responsable de contar con el consentimiento requerido para tratar datos personales de sus clientes finales y de mantener un aviso de privacidad vigente conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).</li>
          <li><strong>Lista Nacional de No Llamar.</strong> Para llamadas salientes, el Cliente es el único responsable de verificar que los números de destino no estén registrados en la LNCL administrada por PROFECO, conforme a los artículos 17 BIS y 17 BIS 2 de la Ley Federal de Protección al Consumidor.</li>
          <li><strong>Notificación de grabación.</strong> Las interacciones telefónicas pueden ser grabadas con fines de calidad y mejora del servicio. El Cliente se compromete a informar a sus clientes finales conforme a la legislación aplicable.</li>
          <li><strong>Usos prohibidos.</strong> Queda expresamente prohibido usar la plataforma para (i) prospección masiva sin consentimiento previo, (ii) contactar reiteradamente a personas que hayan solicitado no ser contactadas, (iii) suplantación de identidad o fraude, o (iv) cualquier actividad contraria a la legislación mexicana aplicable.</li>
          <li><strong>Indemnización.</strong> El Cliente se obliga a mantener indemne a Centinelia frente a cualquier reclamación, sanción o multa iniciada por PROFECO, IFT, INAI o cualquier otra autoridad competente derivada del uso que el Cliente dé a la plataforma.</li>
        </ul>
      </Section>

      <Section n="06" title="Datos, privacidad y confidencialidad">
        <ul style={{ ...ULIST, marginTop: 0 }}>
          <li><strong>Propiedad del contenido.</strong> Toda la información cargada por el Cliente (base de conocimiento, contactos, correos, documentos, grabaciones de sus interacciones) es de su propiedad. Centinelia la procesa exclusivamente para operar el servicio contratado.</li>
          <li><strong>Retención.</strong> Grabaciones, transcripciones y documentos generados se conservan por el tiempo razonablemente necesario para operar el servicio (típicamente 12 meses, salvo obligación legal distinta). El Cliente puede solicitar la eliminación anticipada por escrito.</li>
          <li><strong>Confidencialidad.</strong> Centinelia trata la información del Cliente como confidencial y no la comparte con terceros salvo (i) proveedores subcontratados estrictamente necesarios para operar (telefonía, modelos de IA, almacenamiento en la nube) bajo acuerdos de confidencialidad equivalentes, y (ii) requerimientos legales de autoridad competente.</li>
          <li><strong>Uso agregado y anónimo.</strong> Centinelia podrá utilizar información agregada y despersonalizada para mejorar la plataforma, sin identificar al Cliente ni a sus clientes finales.</li>
        </ul>
      </Section>

      <Section n="07" title="Propiedad intelectual">
        <ul style={{ ...ULIST, marginTop: 0 }}>
          <li>La plataforma Centinelia, incluyendo su software, arquitectura, prompts, modelos entrenados, marca, personajes (los meerkats: Nia, Noah, Nico, Nara, Naia, Nelia, Neo, Nova, Nox, Niva y demás), voces sintéticas, ilustraciones, iconografía y diseño, es <strong>propiedad exclusiva de Pneuma Studio</strong>.</li>
          <li>Al Cliente se le otorga una licencia limitada, no exclusiva, no transferible y revocable para usar la plataforma durante la vigencia de la suscripción.</li>
          <li>El contenido cargado por el Cliente sigue siendo suyo. El Cliente concede a Centinelia una licencia técnica, limitada al fin de operar el servicio, para almacenar, procesar y desplegar dicho contenido.</li>
        </ul>
      </Section>

      <Section n="08" title="Modificaciones al servicio y a estos términos">
        <p style={{ marginTop: 0 }}>
          Centinelia mejora la plataforma continuamente. Podrá agregar, modificar o retirar funcionalidades. Los cambios materiales se notificarán con antelación razonable por correo o desde el portal.
        </p>
        <p>
          Estos términos pueden actualizarse en el tiempo. La versión vigente estará siempre disponible en el portal del Cliente. El uso continuado del servicio tras una actualización implica aceptación de los nuevos términos. Si el Cliente no está de acuerdo con una modificación material, puede cancelar sin penalización conforme a la Cláusula 03.
        </p>
      </Section>

      <Section n="09" title="Uso de marca y casos de éxito">
        <p style={{ marginTop: 0 }}>
          El Cliente autoriza a Centinelia y a Pneuma Studio a mencionar el nombre y logotipo de <strong>{business}</strong> como caso de referencia en materiales comerciales (sitio web, redes sociales, presentaciones, correos). Esta autorización no implica ningún respaldo activo del Cliente y puede revocarse en cualquier momento por escrito a <strong>hola@centinelia.mx</strong>.
        </p>
      </Section>

      <Section n="10" title="Aceptación">
        <p style={{ marginTop: 0 }}>
          Al activar cualquier funcionalidad del servicio o presionar el botón de aceptación en el portal, el Cliente declara haber leído, entendido y aceptado estos términos en su totalidad. La aceptación queda registrada digitalmente con fecha, hora e IP de origen.
        </p>
        <p>
          Estos términos se rigen por la legislación mexicana. Para cualquier controversia, las partes acuerdan someterse a la jurisdicción de los tribunales competentes de Monterrey, Nuevo León, renunciando expresamente a cualquier otra que pudiera corresponderles.
        </p>
      </Section>

      {/* ── Firma / footer ───────────────────────────────────────────────── */}
      {signedAt
        ? <SignatureBlock name={agent.client_name} date={signedAt} ip={agent.contract_ip} />
        : <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: `1px solid ${RULE}` }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: MUTED }}>
              Este documento no requiere firma manuscrita. La aceptación se completa desde el portal.
            </p>
          </div>
      }

      <p style={{ marginTop: '2rem', fontSize: '0.72rem', letterSpacing: '0.05em', color: MUTED, textAlign: 'center', textTransform: 'uppercase' }}>
        Centinelia by Pneuma Studio · Documento generado el {today}
      </p>
    </article>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function Chip({ label }: { label: string }) {
  return (
    <div style={{
      padding:      '0.55rem 0.75rem',
      background:   ACCENT_BG,
      border:       `1px solid ${ACCENT_BD}`,
      borderRadius: 8,
      fontSize:     '0.72rem',
      fontWeight:   600,
      color:        ACCENT,
      textAlign:    'center',
      letterSpacing: '0.01em',
    }}>
      {label}
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2.5rem', pageBreakInside: 'avoid' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '1rem' }}>
        <span style={{
          fontSize:       '0.72rem',
          fontWeight:     700,
          letterSpacing:  '0.15em',
          color:          ACCENT,
          minWidth:       '1.5rem',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {n}
        </span>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: INK, letterSpacing: '-0.008em' }}>
          {title}
        </h2>
      </div>
      <div style={{ paddingLeft: '2.5rem', color: INK_SOFT }}>
        {children}
      </div>
    </section>
  );
}

function CapabilityGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1.1rem', paddingTop: '1.1rem', borderTop: `1px solid ${RULE}` }}>
      <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: INK, letterSpacing: '0.005em' }}>
        {title}
      </p>
      <p style={{ margin: '0.35rem 0 0 0', color: INK_SOFT }}>
        {children}
      </p>
    </div>
  );
}

function Callout({ tone = 'accent', children }: { tone?: 'accent' | 'warn'; children: React.ReactNode }) {
  const bg = tone === 'warn' ? WARN_BG : ACCENT_BG;
  const bd = tone === 'warn' ? WARN_BD : ACCENT_BD;
  return (
    <div style={{
      marginTop:     '1.25rem',
      padding:       '0.9rem 1.1rem',
      background:    bg,
      border:        `1px solid ${bd}`,
      borderRadius:  10,
      fontSize:      '0.87rem',
      color:         INK_SOFT,
      lineHeight:    1.65,
    }}>
      {children}
    </div>
  );
}

const ULIST: React.CSSProperties = {
  margin:     '0.75rem 0 0 0',
  paddingLeft: '1.1rem',
  color:       INK_SOFT,
};

function SignatureBlock({ name, date, ip }: { name: string; date: string; ip?: string | null }) {
  return (
    <div style={{
      marginTop:  '3rem',
      paddingTop: '1.75rem',
      borderTop:  `2px solid ${INK}`,
      display:    'grid',
      gridTemplateColumns: '1fr 1fr',
      gap:        '2rem',
    }}>
      <div>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.75rem' }}>
          Prestador
        </div>
        <div style={{ fontSize: '0.9rem', color: INK, fontWeight: 600 }}>Centinelia · Pneuma Studio</div>
        <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: '0.25rem' }}>Emitido digitalmente</div>
      </div>
      <div>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.75rem' }}>
          Cliente
        </div>
        <div style={{ fontSize: '0.9rem', color: INK, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: '0.25rem' }}>Aceptado el {date}</div>
        {ip && <div style={{ fontSize: '0.7rem', color: MUTED, marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>IP: {ip}</div>}
      </div>
    </div>
  );
}
