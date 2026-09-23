// Landings de comparativa de precio con PriceSpecification schema.
// Cada comparativa cierra una duda concreta sobre costo del negocio con tabla
// determinística: qué se compara, montos exactos (o rangos), qué cubre cada
// opción y cuándo conviene cada una.

export interface FilaPrecio {
  aspecto:    string;
  humano:     string;
  centinelia: string;
}

export interface PrecioComparativa {
  slug:            string;
  titulo:          string;
  h1:              string;
  metaTitle:       string;
  metaDescription: string;
  intro:           string;
  keywords:        string[];
  matriz:          FilaPrecio[];
  cuandoOtra:      { titulo: string; desc: string }[];
  cuandoCentinelia:{ titulo: string; desc: string }[];
  faq:             { q: string; a: string }[];
  crossLinks:      { href: string; label: string }[];
}

// ─── vs recepcionista humana ────────────────────────────────────────────────

const VS_HUMANA: PrecioComparativa = {
  slug:      'vs-recepcionista-humana',
  titulo:    'Recepcionista humana',
  h1:        'Empleado digital vs recepcionista humana: precio y capacidad',
  metaTitle: 'Precio: empleado digital vs recepcionista humana en México 2026',
  metaDescription: 'Comparativa cerrada con cifras 2026. Costo integrado de una recepcionista humana en México (sueldo + IMSS + aguinaldo + PTU) vs Nia, la recepcionista digital de Centinelia.',
  intro: 'Contratar una recepcionista humana en México no cuesta el sueldo; cuesta el sueldo integrado con cuotas patronales, prestaciones, reclutamiento y cobertura de ausencias. Este es el cálculo real 2026.',
  keywords: [
    'costo recepcionista México 2026', 'sueldo recepcionista integrado',
    'empleado digital vs humana precio', 'recepcionista IA vs humana costo',
    'IMSS cuota patronal recepcionista', 'automatizar recepción vs contratar',
  ],
  matriz: [
    { aspecto: 'Sueldo base mensual',           humano: '$12,000 MXN',              centinelia: '$2,997 MXN (plan Esencial)' },
    { aspecto: 'Cuota patronal IMSS + INFONAVIT', humano: '$3,200 MXN',            centinelia: '$0 (no aplica)' },
    { aspecto: 'Aguinaldo mensualizado',        humano: '$500 MXN',                 centinelia: '$0' },
    { aspecto: 'Prima vacacional + vacaciones', humano: '$500 MXN',                 centinelia: '$0' },
    { aspecto: 'PTU proporcional',              humano: '$800 MXN',                 centinelia: '$0' },
    { aspecto: 'Reclutamiento amortizado',      humano: '$1,500 MXN',               centinelia: 'Incorporación única $14,990 + IVA' },
    { aspecto: 'Costo total mensual',           humano: '~$18,500 MXN',             centinelia: '$2,997 MXN' },
    { aspecto: 'Horas cubiertas por semana',    humano: '45 horas (con lunch)',     centinelia: '168 horas (24/7)' },
    { aspecto: 'Llamadas simultáneas',          humano: '1 a la vez',               centinelia: 'Hasta 3 al mismo tiempo' },
    { aspecto: 'Ausencias no cubiertas al año', humano: '25 a 40 días',             centinelia: '0 días' },
    { aspecto: 'Consistencia del guion',        humano: 'Variable según ánimo',      centinelia: '100% consistente' },
    { aspecto: 'Tiempo de onboarding',          humano: '2 semanas',                centinelia: 'Menos de 24 horas' },
  ],
  cuandoOtra: [
    { titulo: 'Recepción presencial obligatoria', desc: 'Si atienden clientes en piso además del teléfono, un humano físico es indispensable.' },
    { titulo: 'Ventas consultivas de alto ticket', desc: 'En transacciones de más de $500,000 con lectura fina de emociones, un humano experimentado sigue rindiendo mejor.' },
    { titulo: 'Marca premium con sello personal', desc: 'Spas de lujo, notarías de élite, terapias: donde la firma humana es parte del producto.' },
  ],
  cuandoCentinelia: [
    { titulo: 'Cobertura 24/7 sin costo laboral extra', desc: 'La franja de 6 pm a 10 am más fines de semana concentra 40% de las llamadas nuevas. Un humano no cubre ese horario sin doblar la nómina.' },
    { titulo: 'Volumen simultáneo en hora pico', desc: 'Cuando la humana está con un cliente, las llamadas siguen entrando. El empleado digital atiende hasta 3 al mismo tiempo.' },
    { titulo: 'Preguntas repetitivas', desc: 'Precios, horarios, disponibilidad. El empleado digital responde en 15 segundos. La humana consume 3-5 minutos por consulta.' },
    { titulo: 'Cuando piensas contratar una segunda persona', desc: 'La matemática favorece contundentemente al empleado digital. Cubre más horas y cuesta 5-7x menos.' },
  ],
  faq: [
    { q: '¿La cifra de $18,500 es real o exagerada?', a: 'Es un ejercicio conservador. Con salario base de $12,000 en Monterrey o CDMX, el costo integrado ronda entre $17,500 y $19,500 según prestaciones adicionales de mercado.' },
    { q: '¿Puedo tener ambos?', a: 'Sí, es el modelo óptimo. Humana en horario clave para clientes VIP; empleado digital para 24/7, hora pico y cobertura de ausencias.' },
    { q: '¿Y si mi recepcionista gana menos ($8,000 MXN)?', a: 'El costo integrado baja proporcionalmente (~$12,500 MXN), pero sigue siendo 4x el plan Esencial de Centinelia con menos cobertura.' },
    { q: '¿Los ahorros incluyen despedir a mi recepcionista actual?', a: 'No es necesario. La mayoría de clientes conservan a la humana y la usan para lo estratégico (ventas grandes, VIP), delegando volumen operativo al empleado digital.' },
  ],
  crossLinks: [
    { href: '/blog/costo-real-recepcionista-mexico-2026',           label: 'Costo real de una recepcionista en México 2026' },
    { href: '/blog/recepcionista-humana-vs-empleado-digital-2026',  label: 'Comparativa lado a lado (guía extendida)' },
    { href: '/empleados/nia',                                        label: 'Nia, la recepcionista digital' },
    { href: '/glosario/imss',                                        label: 'Cuota patronal IMSS explicada' },
  ],
};

// ─── vs call center outsourced ──────────────────────────────────────────────

const VS_CALLCENTER: PrecioComparativa = {
  slug:      'vs-call-center',
  titulo:    'Call center outsourced',
  h1:        'Empleado digital vs call center outsourced: precio y control',
  metaTitle: 'Precio: empleado digital vs call center outsourced en México 2026',
  metaDescription: 'Comparativa cerrada con precios de mercado 2026. Contratar un call center mexicano vs Nia, la recepcionista digital de Centinelia: costo, control operativo y calidad de atención.',
  intro: 'Los call centers outsourced cobran por posición (agente) o por minuto atendido. Este es el cálculo real 2026 versus un empleado digital dedicado con memoria de tu negocio.',
  keywords: [
    'precio call center México', 'call center vs empleado digital',
    'outsourcing recepción telefónica costo', 'call center BPO precio agente',
    'contratar call center México', 'automatizar call center IA',
  ],
  matriz: [
    { aspecto: 'Costo mensual por agente dedicado', humano: '$18,000 a $28,000 MXN',      centinelia: '$2,997 MXN (Esencial)' },
    { aspecto: 'Costo por hora fuera de horario',   humano: '1.5x a 2x tarifa base',      centinelia: 'Incluido en el plan' },
    { aspecto: 'Setup inicial',                     humano: 'Setup fee $10,000-$30,000 + capacitación 2-3 semanas', centinelia: 'Incorporación $14,990 + activo en 24 horas' },
    { aspecto: 'Contrato mínimo',                   humano: '6 a 12 meses típico',        centinelia: 'Sin permanencia, cancelas cuando quieras' },
    { aspecto: 'Rotación de agentes',               humano: 'Alta (30-60% anual), cada agente nuevo requiere retraining', centinelia: 'Cero rotación; el empleado digital no se va' },
    { aspecto: 'Memoria del cliente',               humano: 'Depende del turno; información se pierde entre agentes', centinelia: 'Memoria persistente accesible a todos los canales' },
    { aspecto: 'Consistencia del guion',            humano: 'Variable por agente, turno y estado de ánimo', centinelia: '100% consistente por diseño' },
    { aspecto: 'Cobertura 24/7',                    humano: 'Extra: turno nocturno cuesta 40-60% más',    centinelia: 'Incluida sin cargo adicional' },
    { aspecto: 'Grabaciones y transcripciones',     humano: 'Servicio opcional adicional',                 centinelia: 'Incluidas, accesibles desde portal' },
    { aspecto: 'Tiempo de escalación a tu equipo',  humano: 'Cadena de supervisor + ticket + respuesta',   centinelia: 'Transferencia en vivo instantánea o correo al dueño' },
  ],
  cuandoOtra: [
    { titulo: 'Volúmenes muy altos (10,000+ llamadas al mes)', desc: 'Cuando el volumen justifica un batallón de agentes humanos entrenados; ahí un call center especializado puede tener ventaja de escala.' },
    { titulo: 'Ventas consultivas complejas B2B', desc: 'Cierres de contratos grandes donde la lectura emocional del prospecto es determinante y requiere un ejecutivo humano experimentado.' },
    { titulo: 'Cumplimiento regulatorio muy exigente', desc: 'Sectores donde cada llamada requiere firma de agente certificado (algunos productos financieros o farmacéuticos).' },
  ],
  cuandoCentinelia: [
    { titulo: 'PyMEs con volumen medio', desc: 'Con menos de 3,000 llamadas al mes, un solo empleado digital cuesta menos que una posición de call center y cubre 24/7.' },
    { titulo: 'Necesitas control total del guion', desc: 'Cambias política una vez desde el portal y aplica en la siguiente llamada. Con un call center, los cambios llegan al agente días después.' },
    { titulo: 'No quieres compromisos de 6-12 meses', desc: 'Los call centers requieren contratos largos. Centinelia es mes a mes.' },
    { titulo: 'Requieres integración con tus sistemas', desc: 'Cal.com, CFDI, CONTPAQi, QuickBooks. Los call centers no se integran con estas herramientas; solo capturan datos y los mandan por correo.' },
  ],
  faq: [
    { q: '¿Cuánto cuesta contratar un call center en México?', a: 'La tarifa por posición (agente dedicado, 8 horas al día, 5 días a la semana) ronda $18,000 a $28,000 MXN mensuales según el proveedor y la especialización. Turno nocturno cuesta 40-60% más.' },
    { q: '¿Qué pasa cuando el agente del call center se enferma o rota?', a: 'El proveedor asigna un reemplazo, pero típicamente sin la memoria del cliente ni el guion refinado. El nuevo agente empieza de cero. Con Centinelia, no hay rotación.' },
    { q: '¿Puedo escalar rápido en temporada alta?', a: 'Los call centers requieren notificación previa de 2-4 semanas para agregar agentes. Centinelia escala automáticamente: los minutos extra se cobran a $12 MXN cada uno cuando se pasan del plan.' },
    { q: '¿Puedo combinarlos?', a: 'Sí. Empleado digital como primer contacto (filtra y agenda 80% de casos); call center o equipo humano solo para el 20% que requiere venta consultiva.' },
  ],
  crossLinks: [
    { href: '/empleados/nia',      label: 'Nia, la recepcionista digital' },
    { href: '/empleados/noah',     label: 'Noah, ventas digitales' },
    { href: '/vs/bland-ai',        label: 'Centinelia vs Bland AI' },
    { href: '/glosario/empleado-digital', label: 'Qué es un empleado digital' },
  ],
};

// ─── vs chatbot tradicional ─────────────────────────────────────────────────

const VS_CHATBOT: PrecioComparativa = {
  slug:      'vs-chatbot',
  titulo:    'Chatbot tradicional',
  h1:        'Empleado digital vs chatbot tradicional: precio y alcance real',
  metaTitle: 'Precio: empleado digital vs chatbot tradicional en México 2026',
  metaDescription: 'Comparativa cerrada. Un chatbot en tu web cuesta $500-$3,000 MXN al mes pero solo cubre chat. Un empleado digital cubre voz, chat y correo por $2,997 MXN.',
  intro: 'Un chatbot no es un empleado digital. Ambos existen y sirven; son cosas distintas. Este es el desglose para saber cuál necesitas.',
  keywords: [
    'chatbot vs empleado digital', 'precio chatbot México',
    'chatbot Manychat Landbot precio', 'chatbot WhatsApp Business API costo',
    'automatizar atención chatbot vs IA', 'chatbot precios PyME',
  ],
  matriz: [
    { aspecto: 'Costo mensual',                humano: '$500 a $3,000 MXN según plataforma',                        centinelia: '$2,997 MXN (Esencial)' },
    { aspecto: 'Setup y capacitación',         humano: '$5,000 a $30,000 MXN para diseño de flujos y contenido',    centinelia: 'Incorporación única $14,990 + IVA (llave en mano)' },
    { aspecto: 'Canales cubiertos',            humano: 'Solo chat (web o WhatsApp)',                                 centinelia: 'Voz + chat + correo simultáneos' },
    { aspecto: 'Conversación',                 humano: 'Guiada por menú de opciones o árbol de decisión',            centinelia: 'Natural, abierta, con manejo de contexto' },
    { aspecto: 'Fuera del flujo predefinido',  humano: 'Se rompe o cae en "no te entendí, intenta de nuevo"',        centinelia: 'Mantiene conversación y captura el caso' },
    { aspecto: 'Agendamiento real',            humano: 'Captura datos; un humano agenda después',                    centinelia: 'Agenda directo en Cal.com o Google Calendar' },
    { aspecto: 'Voz y sonido natural',         humano: 'No aplica (solo texto)',                                     centinelia: 'ElevenLabs, indistinguible de humano' },
    { aspecto: 'Timbrado de CFDI',             humano: 'No aplica',                                                  centinelia: 'Nala timbra con Facturama o Solución Factible' },
    { aspecto: 'Transferencia en vivo',        humano: 'No; solo notifica a un humano por correo',                   centinelia: 'Transfiere llamada en vivo al humano de guardia' },
    { aspecto: 'Aprendizaje continuo',         humano: 'Manual: el equipo edita flujos cuando algo cambia',           centinelia: 'Aprendizaje supervisado post-conversación con aprobación humana' },
  ],
  cuandoOtra: [
    { titulo: 'Necesitas solo chat en tu web con FAQ básica', desc: 'Un chatbot puro alcanza para responder 5-10 preguntas frecuentes en un widget de web.' },
    { titulo: 'Presupuesto ultra bajo con volumen mínimo', desc: 'Si tu negocio recibe menos de 30 consultas al mes y todas son texto, un chatbot básico de $500 MXN puede ser suficiente.' },
    { titulo: 'Automatización de un solo flujo cerrado', desc: 'Ej. "consulta tu saldo" o "sigue tu pedido" con inputs conocidos.' },
  ],
  cuandoCentinelia: [
    { titulo: 'Tu negocio recibe llamadas de voz', desc: 'Los chatbots no contestan el teléfono. Si te llaman por teléfono (y para la mayoría de PyMEs es la mayor parte del volumen), necesitas un empleado digital.' },
    { titulo: 'Conversaciones abiertas sin flujo cerrado', desc: 'Los clientes preguntan cosas raras. El chatbot se rompe; el empleado digital adapta.' },
    { titulo: 'Necesitas acciones reales, no solo captura', desc: 'Agendar en calendario, timbrar CFDI, generar link de pago, transferir en vivo. Un chatbot solo captura datos.' },
    { titulo: 'Cobertura multi-canal coordinada', desc: 'Voz + chat + correo del mismo cliente. El empleado digital mantiene contexto entre canales; el chatbot no ve la voz.' },
  ],
  faq: [
    { q: '¿Cuánto cuesta un chatbot?', a: 'Depende de la plataforma. Manychat, Landbot, Chatfuel: entre $500 y $3,000 MXN mensuales según volumen de conversaciones. WhatsApp Business API (Twilio, Meta): costo por mensaje que puede escalar rápido.' },
    { q: '¿Puedo usar chatbot y empleado digital al mismo tiempo?', a: 'Sí. El chatbot puede atender consultas cortas en la web durante la sesión de compra. El empleado digital atiende el teléfono y correos. Se pueden coordinar para mantener contexto.' },
    { q: '¿Nia contesta el WhatsApp?', a: 'Recibe WhatsApp entrante y responde. WhatsApp saliente iniciado por Nia todavía no está en producto; para outreach saliente se usa correo o llamada.' },
    { q: '¿Un chatbot moderno con GPT ya es un empleado digital?', a: 'Está más cerca, pero sigue cubriendo solo el canal de chat y raramente conecta con calendario, PAC, ERP, sistema contable o teléfono. Un empleado digital orquesta todos esos canales.' },
  ],
  crossLinks: [
    { href: '/glosario/empleado-digital', label: 'Qué es un empleado digital' },
    { href: '/empleados/nia',              label: 'Nia, la recepcionista digital' },
    { href: '/vs',                         label: 'Comparativas con otras plataformas' },
    { href: '/blog/7-senales-tu-negocio-necesita-empleado-digital', label: '7 señales de que necesitas un empleado digital' },
  ],
};

// ─── Registro ───────────────────────────────────────────────────────────────

export const PRECIOS: PrecioComparativa[] = [VS_HUMANA, VS_CALLCENTER, VS_CHATBOT];

export function getPrecioBySlug(slug: string): PrecioComparativa | undefined {
  return PRECIOS.find(p => p.slug === slug);
}

export function precioSlugs(): string[] {
  return PRECIOS.map(p => p.slug);
}
