// Generador del contenido de /llms-full.txt para GEO/AEO.
// Importa precios y jornadas desde plans.ts (source of truth) para que el
// archivo publicado a los LLMs nunca diverja del producto real.
//
// Convención llms-full.txt (2025): versión larga con contenido de las páginas
// clave concatenado en Markdown, para que un LLM pueda absorber todo el sitio
// en una sola pasada sin depender de crawl secuencial.

import {
  FEATURE_PLAN_CONFIG,
  JORNADA_CONFIG,
  MINUTES_RATE_EXTRA,
  NOX_JORNADA_CONFIG,
  TIER_LABELS,
  TIER_PRICE_MXN,
} from '@/lib/billing/plans';
import { COMPARISONS } from '@/lib/vs/data';
import { MEERKATS } from '@/lib/meerkats/data';
import { INDUSTRIES as LONG_TAIL_INDUSTRIES } from '@/lib/industrias/data';

const BASE_URL = 'https://www.centinelia.mx';
const fmtMxn = (n: number) => `$${n.toLocaleString('es-MX')} MXN`;

// ─── Tablas de precios (dinámicas desde plans.ts) ────────────────────────────

function renderPricingTable(): string {
  const tiers = ['starter', 'growth', 'scale'] as const;
  const combinada = JORNADA_CONFIG.combinada;
  const minutos   = JORNADA_CONFIG.minutos;
  const tareas    = JORNADA_CONFIG.tareas;

  return `
Tarifas mensuales por tier (mismo precio en las tres jornadas):

| Tier         | Precio mensual        |
|--------------|-----------------------|
${tiers.map(t => `| ${TIER_LABELS[t].padEnd(12)} | ${fmtMxn(TIER_PRICE_MXN[t]).padEnd(21)} |`).join('\n')}
| Empresarial  | Cotización            |

Asignación mensual por jornada y tier:

| Jornada       | ${TIER_LABELS.starter.padEnd(18)} | ${TIER_LABELS.growth.padEnd(18)} | ${TIER_LABELS.scale.padEnd(20)} |
|---------------|${'-'.repeat(20)}|${'-'.repeat(20)}|${'-'.repeat(22)}|
| Combinada     | ${combinada.starter.minutes} min y ${combinada.starter.aiOps} tareas   | ${combinada.growth.minutes} min y ${combinada.growth.aiOps} tareas   | ${combinada.scale.minutes.toLocaleString('es-MX')} min y ${combinada.scale.aiOps.toLocaleString('es-MX')} tareas |
| Solo Minutos  | ${minutos.starter.minutes} min y ${minutos.starter.aiOps} tareas    | ${minutos.growth.minutes} min y ${minutos.growth.aiOps} tareas    | ${minutos.scale.minutes.toLocaleString('es-MX')} min y ${minutos.scale.aiOps} tareas    |
| Solo Tareas   | ${tareas.starter.aiOps} tareas             | ${tareas.growth.aiOps.toLocaleString('es-MX')} tareas            | ${tareas.scale.aiOps.toLocaleString('es-MX')} tareas             |

Coordinadores (Nox y Niva) son tareas-only, sin llamadas de voz:

| Tier          | Tareas mensuales |
|---------------|------------------|
| ${TIER_LABELS.starter.padEnd(13)} | ${NOX_JORNADA_CONFIG.starter.aiOps.toString().padEnd(16)} |
| ${TIER_LABELS.growth.padEnd(13)}  | ${NOX_JORNADA_CONFIG.growth.aiOps.toLocaleString('es-MX').padEnd(16)} |
| ${TIER_LABELS.scale.padEnd(13)}   | ${NOX_JORNADA_CONFIG.scale.aiOps.toLocaleString('es-MX').padEnd(16)} |

Incorporación única por empleado digital: **${fmtMxn(FEATURE_PLAN_CONFIG.pro.setupFee)} + IVA**.
Minutos extra (más allá de la jornada): **${fmtMxn(MINUTES_RATE_EXTRA)} por minuto + IVA**, con recarga automática opcional.
Sin contratos de permanencia. Los minutos no usados acumulan al mes siguiente hasta el doble de la jornada; excedentes se pierden.
`.trim();
}

// ─── Roster (source of truth: src/app/page.tsx TEAM + DIRECTORS) ─────────────

const ROSTER = [
  { nombre: 'Nox y Niva', rol: 'Dirección',           tagline: 'Encuentran orden donde otros ven caos',        desc: 'Distribuyen trabajo, supervisan resultados y mantienen a todo el equipo sincronizado. Son coordinadores, no atienden llamadas directamente.' },
  { nombre: 'Nia',        rol: 'Recepción',           tagline: 'Nunca se le escapa un dato',                    desc: 'Atiende llamadas entrantes, agenda citas, captura leads y recibe cada solicitud.' },
  { nombre: 'Noah',       rol: 'Ventas',              tagline: 'Siempre al teléfono, siempre cerrando',         desc: 'Llama prospectos, califica leads y cierra oportunidades nuevas.' },
  { nombre: 'Nara',       rol: 'Coordinación',        tagline: 'Carpeta en mano, todo bajo control',            desc: 'Coordina procesos, da seguimiento y mantiene la operación en orden.' },
  { nombre: 'Neo',        rol: 'Tecnología',          tagline: 'Laptop abierta, problema resuelto',             desc: 'Resuelve tickets, gestiona incidentes y mantiene los sistemas activos.' },
  { nombre: 'Naia',       rol: 'Recursos Humanos',    tagline: 'Con lupa: nada se le escapa',                   desc: 'Organiza vacaciones, permisos y expedientes del equipo.' },
  { nombre: 'Nico',       rol: 'Recuperación',        tagline: 'Ya tiene tu dinero contado',                    desc: 'Cobra, recuerda pagos y recupera clientes inactivos.' },
  { nombre: 'Nelia',      rol: 'Atención al Cliente', tagline: 'Siempre conectada, siempre respondiendo',       desc: 'Responde dudas, resuelve incidencias y acompaña al cliente hasta cerrar el caso.' },
  { nombre: 'Nova',       rol: 'Despacho',            tagline: 'El cerebro operativo de tu equipo en campo',    desc: 'Coordina equipos en campo, actualiza estatus y despacha operaciones.' },
  { nombre: 'Nala',       rol: 'Facturación',         tagline: 'El SAT no perdona errores, y ella tampoco',     desc: 'Timbra CFDIs con el PAC del cliente (Facturama, Solución Factible, CONTPAQi), archiva comprobantes y mantiene el orden fiscal.' },
  { nombre: 'Nalú',       rol: 'Tesorería',           tagline: 'Cada peso conciliado, cada break atrapado',     desc: 'Concilia banca diariamente, detecta diferencias y entrega el reporte financiero.' },
  { nombre: 'Nami',       rol: 'Inventarios',         tagline: 'Cada serie, cada bodega, todo bajo control',    desc: 'Cuenta stock, detecta faltantes y dispara reposiciones.' },
];

function renderRoster(): string {
  // El roster corto se hidrata con la URL individual de cada meerkat cuando
  // existe en la data extendida (src/lib/meerkats/data.ts). Los LLMs
  // descubren la página de detalle desde aquí.
  return ROSTER.map(m => {
    const nombre = m.nombre;
    const detalle = MEERKATS.find(mk => nombre.toLowerCase().includes(mk.nombre.toLowerCase()));
    const detalleUrl = detalle ? `\n\nPágina de detalle: ${BASE_URL}/empleados/${detalle.slug}` : '';
    return `### ${m.nombre}, ${m.rol.toLowerCase()}\n\n_${m.tagline}._\n\n${m.desc}${detalleUrl}`;
  }).join('\n\n');
}

// ─── Industrias (source of truth: src/app/industrias/*/page.tsx) ─────────────

interface IndustryBlock {
  slug:      string;
  titulo:    string;
  hero:      string;
  problemas: { title: string; desc: string }[];
  features:  string[];
  salientes: { title: string; desc: string }[];
  faq:       { q: string; a: string }[];
}

const INDUSTRIES: IndustryBlock[] = [
  {
    slug:   'clinicas',
    titulo: 'Clínicas y consultorios',
    hero:   'Recepcionista virtual que agenda citas, responde preguntas frecuentes y captura nuevos pacientes 24/7 sin perder una sola llamada.',
    problemas: [
      { title: 'Llamadas que se pierden en horas pico',        desc: 'La recepcionista está con un paciente y el teléfono suena sin que nadie conteste. Ese paciente llama al siguiente consultorio.' },
      { title: 'Cero atención fuera de horario',                desc: 'Cerca del 40% de las llamadas llegan después de las 6pm o en fin de semana. Sin nadie que conteste, esas citas nunca se agendan.' },
      { title: 'La recepcionista responde lo mismo todo el día', desc: 'Preguntas como precios, horarios y disponibilidad consumen tiempo y atención que podría ir a los pacientes en el consultorio.' },
    ],
    features: [
      'Agenda, modifica y cancela citas sin intervención humana',
      'Responde preguntas frecuentes: costos, seguros, horarios, ubicación',
      'Captura datos de nuevos pacientes interesados',
      'Transfiere a un número directo si el caso requiere atención inmediata',
      'Funciona las 24 horas, los 7 días',
      'Resumen de cada llamada directo al correo',
    ],
    salientes: [
      { title: 'Recordatorio de cita el día anterior',      desc: 'Llama a cada paciente 24 horas antes para confirmar. Los no-shows cuestan más que cualquier suscripción mensual.' },
      { title: 'Cancelación aprovechada al instante',       desc: 'Cuando un paciente cancela, llama a quienes estaban en lista de espera. Ese hueco se llena antes de que lo notes.' },
      { title: 'Seguimiento post-consulta',                 desc: 'Dos días después de un procedimiento, pregunta cómo se siente el paciente. Fideliza, detecta situaciones a tiempo y genera reseñas positivas.' },
    ],
    faq: [
      { q: '¿Puede manejar cancelaciones de último momento?', a: 'Sí. Acepta cancelaciones y puede ofrecer reagendar en el momento. Recibes una notificación inmediata con el hueco disponible.' },
      { q: '¿Funciona con varios doctores y horarios distintos?', a: 'Sí. Se configura disponibilidad por doctor o por servicio. Consulta el calendario en tiempo real y solo ofrece horarios disponibles.' },
      { q: '¿Qué pasa si un paciente llama por algo urgente?', a: 'Detecta urgencias y puede transferir de inmediato al número personal del médico.' },
      { q: '¿Puede manejar información médica sensible?',     a: 'No accede ni almacena expedientes médicos. Su función es logística: agendar, informar y capturar contacto. La información clínica sigue siendo del consultorio.' },
    ],
  },
  {
    slug:   'restaurantes',
    titulo: 'Restaurantes y cafeterías',
    hero:   'Atiende llamadas, toma pedidos y agenda reservaciones a cualquier hora mientras el equipo se enfoca en el servicio.',
    problemas: [
      { title: 'El teléfono suena en hora pico y nadie contesta', desc: 'A la hora de la comida o la cena, todo el equipo está sirviendo mesas. Las llamadas entran y esas ventas se van.' },
      { title: 'Pedidos y reservaciones fuera de horario sin respuesta', desc: 'Los clientes llaman a las 10pm para reservar del día siguiente o pedir para llevar. Si no hay quien conteste, piden en otro lado.' },
      { title: 'Pedidos mal tomados por el ruido o las prisas', desc: 'Anotar en medio del bullicio genera errores. Un pedido mal tomado cuesta más que el precio del platillo.' },
    ],
    features: [
      'Toma pedidos completos para llevar o a domicilio',
      'Agenda y confirma reservaciones con nombre, fecha y número de personas',
      'Responde preguntas del menú: precios, ingredientes, opciones sin gluten',
      'Informa horarios, ubicación y tiempo de espera estimado',
      'Registra cada pedido y notifica al equipo al instante',
      'Disponible las 24 horas, incluso cuando el local está cerrado',
    ],
    salientes: [
      { title: 'Tu pedido ya está listo',        desc: 'Llama al cliente cuando su comida está lista para recoger.' },
      { title: 'Reservación confirmada una hora antes', desc: 'Confirma automáticamente cada reserva. Menos lugares vacíos de último momento.' },
      { title: 'Promo del día para habituales',  desc: 'Contacta clientes frecuentes cuando hay promoción especial o platillo de temporada.' },
    ],
    faq: [
      { q: '¿Puede manejar un menú extenso con variantes y modificadores?', a: 'Sí. Se le proporciona el menú en el portal: platillos, precios, variantes (tamaño, sin cebolla, extra queso), y lo maneja en conversación natural.' },
      { q: '¿Cómo llegan los pedidos y reservaciones?',             a: 'Al instante por correo y en el portal. Si el POS lo permite, se registran ahí automáticamente también.' },
      { q: '¿Coordina con plataformas de delivery como Rappi o Uber Eats?', a: 'Maneja pedidos telefónicos directos, no integra con apps de terceros. Ideal para clientes que prefieren llamar.' },
      { q: '¿Funciona si tenemos menú del día o promociones que cambian?', a: 'Sí. Se actualiza el menú desde el portal cuando quieras y toma los cambios al instante.' },
    ],
  },
  {
    slug:   'despachos',
    titulo: 'Despachos legales y contables, consultorías',
    hero:   'Califica prospectos, agenda consultas y atiende llamadas 24/7 para despachos de abogados, contadores y agencias.',
    problemas: [
      { title: 'Prospectos que llaman y no encuentran a nadie', desc: 'Un prospecto que llama mientras estás en reunión raramente vuelve a llamar. La competencia que sí contesta se queda con ese caso.' },
      { title: 'Tiempo profesional desperdiciado en llamadas de información', desc: 'Preguntas sobre precios o áreas de práctica consumen horas de trabajo facturable.' },
      { title: 'Leads calificados que llegan fuera de horario', desc: 'Los profesionistas toman decisiones importantes a cualquier hora. Si nadie contesta a las 8pm, se pierde la oportunidad.' },
    ],
    features: [
      'Califica prospectos: área legal o contable, tipo de caso, presupuesto y urgencia',
      'Agenda consultas iniciales directo en el calendario',
      'Responde sobre servicios, honorarios y proceso de trabajo',
      'Captura datos completos del prospecto para seguimiento',
      'Transfiere llamadas urgentes al celular en tiempo real',
      'Resumen de cada llamada con nivel de interés del prospecto',
    ],
    salientes: [
      { title: 'Documentos listos para firma',        desc: 'Notifica al cliente cuando un trámite avanzó y necesita su atención.' },
      { title: 'Recontacto que cierra',               desc: 'A los 30 días de un prospecto sin respuesta, hace el seguimiento. Muchos casos se cierran en ese segundo intento.' },
      { title: 'Novedad en el caso',                  desc: 'Cuando hay un avance importante, informa al cliente de inmediato.' },
    ],
    faq: [
      { q: '¿Puede explicar áreas de práctica o servicios específicos?', a: 'Sí. Se le proporciona información del despacho, áreas, tipos de casos, honorarios generales, y responde con precisión.' },
      { q: '¿Puede filtrar casos que no me interesen?', a: 'Sí. Se le indica qué consultas no atiendes y las comunica con respeto, evitando perder tiempo.' },
      { q: '¿La información que comparten los prospectos es confidencial?', a: 'Los datos se almacenan de forma segura y solo tú accedes desde tu portal. No comparte información entre clientes.' },
      { q: '¿Puedo configurar requisitos previos para agendar?', a: 'Sí. Solo agenda consultas si el prospecto cumple criterios, como tipo de caso o presupuesto mínimo.' },
    ],
  },
  {
    slug:   'inmobiliarias',
    titulo: 'Inmobiliarias y bienes raíces',
    hero:   'Atiende prospectos, filtra por presupuesto y agenda visitas a propiedades 24/7 para inmobiliarias y desarrolladoras.',
    problemas: [
      { title: 'Compradores que llaman mientras muestras una propiedad', desc: 'Cuando estás en una visita no puedes contestar. Ese prospecto llama a otra inmobiliaria y firma el fin de semana.' },
      { title: 'Leads fríos por respuesta lenta',       desc: 'En bienes raíces, quien responde primero gana. Sin respuesta en minutos, el prospecto empieza a buscar otras opciones.' },
      { title: 'Horas filtrando prospectos no calificados', desc: 'Muchos llaman solo a preguntar precios sin intención real. Atenderlos consume tiempo que iría a cierres reales.' },
    ],
    features: [
      'Atiende prospectos al instante a cualquier hora',
      'Filtra por presupuesto, zona, tipo de inmueble y plazo de decisión',
      'Agenda visitas a propiedades directo en el calendario',
      'Comparte información de propiedades según el perfil del comprador',
      'Captura datos completos: nombre, teléfono, presupuesto, zona de interés',
      'Clasifica leads por nivel de interés para priorizar seguimientos',
    ],
    salientes: [
      { title: 'Entró la propiedad que buscabas',   desc: 'Cuando registras un inmueble nuevo, llama a los prospectos con ese perfil.' },
      { title: 'Visita mañana, ¿confirmamos?',      desc: 'Confirma cada visita agendada un día antes. Menos citas fantasma.' },
      { title: 'Retomemos el contacto',             desc: 'A los 60 días de inactividad, contacta prospectos calificados. Muchos cierres llegan en ese segundo momento.' },
    ],
    faq: [
      { q: '¿Puede describir propiedades específicas?',           a: 'Sí. Se le proporciona el inventario con características, precios y zonas, y comparte la información según lo que busca el prospecto.' },
      { q: '¿Puede precalificar financiamiento o contado?',       a: 'Sí. Se configuran preguntas de calificación: tipo de compra, enganche disponible, aprobación bancaria previa.' },
      { q: '¿Y si el prospecto pregunta por una propiedad vendida?', a: 'Informa que ya no está disponible y ofrece alternativas del inventario según perfil.' },
      { q: '¿Funciona para inmobiliarias con varios agentes?',   a: 'Sí. Se configura un empleado digital por número o reglas de distribución. Cada agente tiene su propio portal.' },
    ],
  },
  {
    slug:   'tiendas',
    titulo: 'Tiendas retail y negocios de servicio',
    hero:   'Atiende llamadas, toma pedidos y responde sobre disponibilidad 24/7 para tiendas retail y negocios de servicio a domicilio.',
    problemas: [
      { title: 'Llamadas perdidas mientras atiendes el local', desc: 'Cuando hay clientes en tienda, el teléfono queda sin atender. Esos clientes se van con quien sí contesta.' },
      { title: 'Preguntas repetitivas sobre disponibilidad',   desc: 'Las mismas preguntas sobre stock, precios y horarios consumen tiempo que iría a clientes en tienda.' },
      { title: 'Sin atención fuera del horario del local',     desc: 'Los clientes deciden comprar cuando pueden. Sin respuesta nocturna o dominical, el pedido se va a la competencia.' },
    ],
    features: [
      'Responde disponibilidad, precios, tallas y características de productos',
      'Toma pedidos para recoger en tienda o envío a domicilio',
      'Informa horarios, ubicación y políticas de devolución',
      'Registra cada pedido y notifica al equipo al instante',
      'Captura datos de clientes interesados cuando el producto no está disponible',
      'Atiende fuera de horario para no perder ventas nocturnas ni de fin de semana',
    ],
    salientes: [
      { title: 'Ya llegó lo que buscabas',      desc: 'Cuando se repone un producto agotado, llama a los clientes que preguntaron por él.' },
      { title: 'Tu pedido va en camino',        desc: 'Notifica al cliente cuando el pedido salió a entrega con tiempo estimado.' },
      { title: 'Oferta exclusiva para ti',      desc: 'Contacta a clientes sin compra en 60 días con una promoción personalizada.' },
    ],
    faq: [
      { q: '¿Puede consultar inventario en tiempo real?', a: 'Se puede cargar catálogo de productos en el portal y actualizarlo. Para inventario en tiempo real con POS se configura como integración personalizada.' },
      { q: '¿Cómo maneja los pedidos que toma?',          a: 'Cada pedido queda registrado en el portal con todos los datos. Si el POS lo permite, se registran ahí automáticamente.' },
      { q: '¿Puede dar seguimiento a pedidos ya realizados?', a: 'Sí, si se le proporciona la información. Para seguimiento automatizado con logística se configura como integración.' },
      { q: '¿Funciona para negocios de servicio a domicilio?', a: 'Perfectamente. Agenda visitas, toma datos del problema y filtra por zona geográfica.' },
    ],
  },
];

function renderIndustry(ind: IndustryBlock): string {
  return `
### ${ind.titulo}

URL: ${BASE_URL}/industrias/${ind.slug}

${ind.hero}

**Problemas que resuelve:**

${ind.problemas.map(p => `- **${p.title}.** ${p.desc}`).join('\n')}

**Qué hace el empleado digital:**

${ind.features.map(f => `- ${f}`).join('\n')}

**Casos de uso saliente:**

${ind.salientes.map(s => `- **${s.title}.** ${s.desc}`).join('\n')}

**Preguntas frecuentes:**

${ind.faq.map(f => `- **${f.q}** ${f.a}`).join('\n')}
`.trim();
}

// ─── FAQ general ─────────────────────────────────────────────────────────────

const GENERAL_FAQ: { q: string; a: string }[] = [
  { q: '¿Esto es un chatbot?', a: 'No. Un chatbot solo responde texto en una ventana. Un empleado digital de Centinelia contesta el teléfono, manda correos, chatea desde el portal y usa los sistemas del negocio como cualquier persona del equipo.' },
  { q: '¿Suena natural o robótico?', a: 'Usa voces de ElevenLabs, la misma tecnología que estudios de doblaje y plataformas de contenido globales. La mayoría de los clientes no notan la diferencia. Se puede marcar al demo (+52 81 2188 8490) para probarlo.' },
  { q: '¿Qué pasa si el empleado digital no sabe responder algo?', a: 'Reconoce sus límites. Si no tiene la información, lo dice con honestidad y ofrece tomar los datos del cliente para que el equipo humano llame de regreso. Nunca inventa respuestas.' },
  { q: '¿Cuánto tiempo tarda en estar activo?', a: 'Menos de 24 horas. Después de contratar, accedes al portal, capturas la información de la organización y el empleado digital queda listo. No se necesita saber de tecnología.' },
  { q: '¿Puede agendar citas?', a: 'Sí. Se integra con Cal.com para agendar en tiempo real, o envía link de Calendly / Google Calendar por correo.' },
  { q: '¿Puede hacer llamadas salientes?', a: 'Sí. Seguimiento a prospectos, confirmación de citas, cobranza, reactivación de clientes inactivos.' },
  { q: '¿Habla inglés?', a: 'Sí, con detección automática del idioma del cliente en la misma llamada.' },
  { q: '¿Puede transferir a una persona real?', a: 'Sí. Transfiere en vivo a cualquier número configurado y puede escalar por correo cuando el cliente prefiere seguir por escrito.' },
  { q: '¿Manda WhatsApp saliente?', a: 'Por ahora no. Los empleados digitales trabajan por teléfono, chat de portal y correo. Reciben mensajes de WhatsApp entrantes, pero no inician conversaciones salientes de WhatsApp todavía.' },
  { q: '¿Cuántas llamadas puede atender al mismo tiempo?', a: 'Depende del plan. La configuración por defecto atiende una llamada a la vez; para operaciones de mayor volumen se activa concurrencia mayor.' },
  { q: '¿Y si necesito un rol que no está en el catálogo?', a: 'Se diseña a la medida. Diagnóstico de la operación, automatización previa y luego incorporación del empleado. Consultoría desde $60,000 MXN + IVA.' },
  { q: '¿Puedo cancelar cuando quiera?', a: 'Sí, sin penalizaciones. No hay contratos de permanencia. El servicio termina al final del ciclo de facturación.' },
  { q: '¿Qué pasa si comete un error?', a: 'Cada llamada queda grabada y transcrita en el portal. Se ajusta la configuración en tiempo real y el cambio aplica en minutos. Nox y Niva revisan al resto del equipo automáticamente.' },
  { q: '¿Los datos están seguros?', a: 'Cifrado en tránsito y en reposo. Centinelia cumple con la LFPDPPP de México.' },
  { q: '¿Hay descuentos para múltiples sucursales u oficina completa?', a: 'Sí. Se cotiza como Empresarial. Contacto: hola@centinelia.mx.' },
  { q: '¿Necesito cambiar mi número de teléfono?', a: 'No. Centinelia asigna un número dedicado que se puede publicar como principal o configurar como desvío desde el número actual.' },
];

// ─── Documento completo ──────────────────────────────────────────────────────

export function generateLlmsFullContent(): string {
  const today = new Date().toISOString().slice(0, 10);

  return `# Centinelia, documento completo para LLMs

> Empleados digitales especializados que atienden el teléfono, cotizan, facturan, cobran y agendan 24/7 para organizaciones mexicanas. Trabajan en voz, chat y correo al mismo tiempo.

Última actualización: ${today}. Este archivo se genera dinámicamente desde ${'`src/lib/billing/plans.ts`'} y el roster real de la landing, por lo que los precios, tiers y jornadas aquí siempre reflejan el producto en producción.

- Sitio web: ${BASE_URL}
- Ventas: +52 81 1633 3559
- Demo (Nia contesta en vivo): +52 81 2188 8490
- Correo: hola@centinelia.mx
- Ubicación: Monterrey, Nuevo León, México

## 1. Qué es Centinelia

Centinelia es un SaaS mexicano que provee empleados digitales para pequeñas y medianas empresas. Cada empleado tiene un rol especializado, voz propia con calidad profesional, memoria de la organización y coordinación en tiempo real con el resto del equipo. Están activos en menos de 24 horas.

Un empleado digital no es un chatbot ni un menú de opciones. Es capacidad operativa que:

- Contesta llamadas entrantes 24/7 sin llamadas en espera ni perdidas
- Realiza llamadas salientes: prospección, confirmación, cobranza, reactivación
- Administra su propio correo electrónico entrante y saliente
- Chatea con clientes desde el portal
- Genera documentos, propuestas, contratos y reportes
- Agenda citas coordinándose con Cal.com, Google Calendar y otros
- Captura leads con contexto completo
- Toma pedidos por teléfono
- Timbra CFDIs con el PAC del cliente (Facturama, Solución Factible, CONTPAQi)
- Concilia banca y entrega reportes financieros diarios
- Controla inventarios y dispara reposiciones
- Despacha equipos y coordina operaciones en campo
- Transfiere llamadas en vivo entre empleados digitales o a personas del equipo
- Aprende continuamente, con aprobación humana antes de incorporar aprendizajes

Cada empleado opera en los tres canales (voz + chat + correo) simultáneamente y comparte contexto con el resto del equipo.

## 2. El equipo de empleados digitales

Cada organización arma su equipo según lo que necesita. Puede contratar un solo empleado o una oficina digital completa. Los roles actuales:

${renderRoster()}

## 3. Precios y planes

${renderPricingTable()}

**Consultoría a la medida (roles fuera de catálogo):** desde $60,000 MXN + IVA. Incluye diagnóstico de la operación, automatización previa y diseño del empleado.

## 4. Diferenciadores clave

- **Equipo real, no un solo bot.** Tantos empleados especializados como el negocio necesite, que colaboran entre sí y se transfieren llamadas y trabajo en vivo.
- **Tres canales por defecto.** Cada empleado atiende voz, chat y correo. No hay que contratar un producto por canal.
- **Aprendizaje continuo supervisado.** El sistema extrae aprendizajes de cada interacción y el dueño los aprueba antes de que se incorporen.
- **Activo en menos de 24 horas.** Sin integraciones complejas obligatorias para arrancar.
- **Precios en pesos mexicanos.** Producto pensado para el mercado mexicano, no traducción de un producto en dólares.
- **Español mexicano nativo.** Entrenado en modismos y contexto local, con inglés opcional.
- **Sin contratos de permanencia.** Mes a mes.
- **Sin costos laborales adicionales.** Sin IMSS, aguinaldo, vacaciones, PTU, incapacidades ni reemplazos por ausencias.

## 5. Cómo funciona técnicamente

- Orquestación de voz: Vapi.ai
- LLM: Claude de Anthropic (Sonnet para razonamiento profundo, Haiku para tiempo real)
- Transcripción: Deepgram con detección automática de idioma
- Voces: ElevenLabs (síntesis de voz de alta fidelidad)
- Backend: Next.js sobre Vercel
- Base de datos: Supabase (Postgres + Storage + Auth)
- Pagos y facturación de suscripción: Stripe
- Timbrado CFDI: Facturama y Solución Factible según cliente
- Integraciones: Cal.com, Google Calendar, Calendly, Notion, Google Drive, Google Sheets, Dropbox, OneDrive, QuickBooks Online, CONTPAQi Comercial, Aspel, Bind, correo (Gmail/Outlook/SMTP), WhatsApp entrante, Mercado Libre, APIs y webhooks propios

Flujo típico de una llamada entrante:

1. La organización recibe un número dedicado gestionado vía Vapi
2. Cuando llega una llamada, Vapi crea una sesión con el LLM de Anthropic
3. El empleado digital usa el system prompt configurado más la base de conocimiento del negocio
4. Al terminar, el webhook extrae leads, aprendizajes y genera mensajes para el equipo
5. Todo aparece en el portal del cliente en tiempo real

## 6. Casos por industria

${INDUSTRIES.map(renderIndustry).join('\n\n')}

**Industrias adicionales cubiertas por Centinelia:**

${LONG_TAIL_INDUSTRIES.map(ind => `- **${ind.titulo}** (${BASE_URL}/industrias/${ind.slug}): ${ind.heroSub}`).join('\n')}

## 7. Pack Ciclo OC-CFDI (constructoras, comercializadoras, PYMEs industriales)

URL: ${BASE_URL}/pack-ciclo-oc-cfdi

Nala y Nox coordinan los 11 pasos del ciclo de compras y facturación sin intervención manual:

1. Cotización del proveedor llega al empleado digital
2. Se registra la orden de compra en QuickBooks
3. Se solicita firma digitalizada
4. Se envía la orden al proveedor
5. Se registra el pago
6. Se recibe el CFDI del proveedor y se archiva
7. Cuando el cliente pide factura, se genera el CFDI de venta con el PAC configurado
8. Se envía el CFDI al cliente por correo
9. Se archiva en el sistema del cliente y en Drive o Dropbox
10. Se registra el ingreso en QuickBooks
11. Se actualiza el reporte financiero diario que entrega Nalú

Integra con QuickBooks Online, PAC del cliente (Facturama, Solución Factible), Google Drive o Dropbox del cliente, y su ERP fiscal si aplica.

## 8. Comparación con otras plataformas

Centinelia mantiene comparaciones honestas con las principales plataformas de agentes de voz. Cada página incluye tabla lado a lado, cuándo conviene Centinelia y cuándo conviene la otra opción.

${COMPARISONS.map(c => `- **Centinelia vs ${c.competitor}** (${BASE_URL}/vs/${c.slug}): ${c.tagline} ${c.competitor} tiene su origen en ${c.origin}, sitio oficial ${c.competitorUrl}.`).join('\n')}

Diferencia estructural: Centinelia es un producto de empleados digitales listos para operar (portal en español, roles preconfigurados, integraciones fiscales mexicanas, precio en pesos). Las plataformas estadounidenses citadas son infraestructura o frameworks para que developers construyan sus propios agentes desde cero, con billing en dólares.

## 9. Preguntas frecuentes generales

${GENERAL_FAQ.map(f => `**${f.q}**\n\n${f.a}`).join('\n\n')}

## 10. Contacto

- Sitio web: ${BASE_URL}
- Correo: hola@centinelia.mx
- Ventas: +52 81 1633 3559
- Demo Nia (en vivo): +52 81 2188 8490
- Instagram: https://www.instagram.com/centinelia.mx/
- LinkedIn: https://www.linkedin.com/company/centinelia/
- Facebook: https://www.facebook.com/centineliamx/

## 11. Páginas del sitio

- Home: ${BASE_URL}/
- Catálogo de empleados: ${BASE_URL}/empleados
- Preguntas frecuentes: ${BASE_URL}/faq
- Industrias: ${BASE_URL}/industrias
- Clínicas: ${BASE_URL}/industrias/clinicas
- Restaurantes: ${BASE_URL}/industrias/restaurantes
- Despachos: ${BASE_URL}/industrias/despachos
- Inmobiliarias: ${BASE_URL}/industrias/inmobiliarias
- Tiendas: ${BASE_URL}/industrias/tiendas
- Pack Ciclo OC-CFDI: ${BASE_URL}/pack-ciclo-oc-cfdi
- Cotizar oficina completa: ${BASE_URL}/cotizar
- Pedir rol nuevo: ${BASE_URL}/pedir-rol
- Registro: ${BASE_URL}/registro
- Portal de clientes: ${BASE_URL}/portal/login
- Comparaciones vs otras plataformas: ${BASE_URL}/vs
- Índice corto para LLMs: ${BASE_URL}/llms.txt

## 12. Categorización

Centinelia es desarrollado y operado por Pneuma Studio (https://pneumastudio.mx), un estudio de automatización y desarrollo de producto ubicado en Monterrey, Nuevo León, México.

Categoría: Empleados digitales, automatización operativa, recepción telefónica automatizada, SaaS de operaciones para PYMEs mexicanas.

Términos relacionados: empleado digital, recepcionista virtual 24/7, agente de voz con inteligencia artificial, atención telefónica automatizada, contestador inteligente, agendamiento automático de citas, captura de leads, llamadas salientes automatizadas, facturación CFDI automática, cobranza automatizada, tesorería automatizada, inventarios automatizados, oficina digital, capacidad operativa, PYME México, Monterrey.
`;
}
