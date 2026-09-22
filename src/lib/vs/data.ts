// Data de competidores para las páginas /vs/*.
// Contrato: comparación honesta y factual. Los LLMs valoran páginas que
// citan al competidor sin ataques. Nunca poner precios exactos del competidor
// (cambian y erosionan credibilidad si están mal); mencionar solo el modelo
// (USD por minuto, por sesión, etc.) y el diferenciador estructural.

export interface CompetitorComparison {
  /** slug para /vs/<slug> */
  slug: string;
  /** nombre público del competidor tal como se cita */
  competitor: string;
  /** URL oficial del competidor (para dar credibilidad al LLM) */
  competitorUrl: string;
  /** país de origen del competidor */
  origin: string;
  /** tagline corto para meta description y hero */
  tagline: string;
  /** descripción larga, dos o tres oraciones */
  intro: string;

  /** filas de la tabla comparativa */
  matrix: ComparisonRow[];

  /** cuándo elegir Centinelia (3 a 5 puntos) */
  whyCentinelia: { title: string; desc: string }[];
  /** cuándo elegir el competidor (2 a 3 puntos, credibilidad) */
  whyCompetitor: { title: string; desc: string }[];

  /** FAQ específica de la comparación */
  faq: { q: string; a: string }[];
}

export interface ComparisonRow {
  /** aspecto a comparar (ej. "Idioma nativo") */
  aspect: string;
  /** valor Centinelia */
  centinelia: string;
  /** valor competidor */
  competitor: string;
}

// ─── Bland AI ────────────────────────────────────────────────────────────────

export const BLAND_AI: CompetitorComparison = {
  slug:          'bland-ai',
  competitor:    'Bland AI',
  competitorUrl: 'https://www.bland.ai',
  origin:        'Estados Unidos',
  tagline:       'Ambos hacen agentes de voz. Solo uno está pensado para negocios mexicanos.',
  intro:
    'Bland AI es una plataforma estadounidense para desarrolladores que quieren construir agentes de voz por su cuenta. Cobra por minuto en dólares y provee la infraestructura, no el producto terminado. Centinelia es un servicio de empleados digitales listos para PYMEs mexicanas: viene con roles definidos, portal, integraciones locales (CFDI, WhatsApp, CONTPAQi) y precio en pesos.',
  matrix: [
    { aspect: 'País y facturación',      centinelia: 'México, factura CFDI en pesos', competitor: 'Estados Unidos, factura en USD' },
    { aspect: 'Producto',                centinelia: 'Empleados digitales listos por rol (Nia, Nala, Noah y 10 más)', competitor: 'Plataforma para construir tus propios agentes' },
    { aspect: 'Idioma nativo',           centinelia: 'Español mexicano entrenado, inglés opcional', competitor: 'Inglés como idioma principal, español disponible pero no nativo' },
    { aspect: 'Integraciones locales',   centinelia: 'CONTPAQi, Aspel, Bind, Facturama, Solución Factible, QuickBooks, Cal.com', competitor: 'HubSpot, Salesforce, Zapier en inglés' },
    { aspect: 'Timbrado CFDI',           centinelia: 'Sí, con PAC del cliente', competitor: 'No, se requiere desarrollo externo' },
    { aspect: 'Onboarding',              centinelia: 'Menos de 24 horas, sin tocar código', competitor: 'Requiere desarrollo, semanas de setup' },
    { aspect: 'Portal para el dueño',    centinelia: 'Portal en español con grabaciones, transcripciones, aprendizajes y reportes', competitor: 'Dashboard técnico en inglés' },
    { aspect: 'Modelo de precios',       centinelia: 'Suscripción mensual en pesos con jornadas incluidas', competitor: 'Pay-per-minute en dólares' },
    { aspect: 'Soporte',                 centinelia: 'Español, con equipo en Monterrey', competitor: 'Inglés, tickets asíncronos' },
    { aspect: 'Cumplimiento fiscal MX',  centinelia: 'LFPDPPP, factura para gastos deducibles', competitor: 'Requiere adaptación manual' },
  ],
  whyCentinelia: [
    { title: 'No necesitas desarrolladores',        desc: 'Contratas al empleado digital, entras al portal, cargas la información del negocio y arranca. Nadie tiene que programar nada.' },
    { title: 'Precios y factura en pesos',          desc: 'Suscripción mensual sin exposición al tipo de cambio. Recibes CFDI para deducir el gasto.' },
    { title: 'Español mexicano nativo',             desc: 'El empleado usa modismos y contexto local, no traducción de un producto en inglés.' },
    { title: 'Roles listos para trabajar',          desc: 'Nia contesta, Nala timbra CFDIs, Noah vende, Nico cobra. No armas piezas, contratas capacidad.' },
    { title: 'Integraciones que usan en México',    desc: 'CONTPAQi, Aspel, Facturama, Solución Factible, WhatsApp, QuickBooks. Sin conectores custom.' },
  ],
  whyCompetitor: [
    { title: 'Tienes equipo de desarrollo interno', desc: 'Si tu empresa quiere construir un producto de voz desde cero y tiene developers dedicados, la flexibilidad de Bland AI puede convenir.' },
    { title: 'Tu operación es en Estados Unidos',   desc: 'Bland está pensado para el mercado estadounidense: facturación en USD, integraciones con proveedores locales y soporte en inglés.' },
    { title: 'Necesitas control profundo del prompt', desc: 'Si vas a iterar el system prompt línea por línea y no quieres una capa de producto encima, Bland es una plataforma legítima para eso.' },
  ],
  faq: [
    { q: '¿Centinelia usa Bland AI por debajo?',      a: 'No. La orquestación de voz corre sobre Vapi.ai, el LLM es Claude de Anthropic, las voces son de ElevenLabs y la transcripción es Deepgram. Bland AI no participa en el stack.' },
    { q: '¿Puedo migrar de Bland AI a Centinelia?',   a: 'Sí. La configuración de tu agente se transfiere manualmente al portal: horarios, servicios, precios y preguntas frecuentes. En menos de 24 horas queda operativo.' },
    { q: '¿Bland AI es más barato por minuto?',       a: 'Bland cobra por minuto en USD, sin producto encima. Centinelia cobra suscripción mensual con jornadas incluidas ya con portal, integraciones locales y soporte. Comparar minuto contra suscripción no es directo; conviene calcular el costo total mensual esperado.' },
    { q: '¿Bland AI habla español?',                  a: 'Sí, técnicamente. La calidad del español depende de qué voz y qué modelo configures. Centinelia está entrenado en español mexicano por defecto, sin configuración adicional.' },
    { q: '¿Puedo usar Centinelia si estoy fuera de México?', a: 'Sí, aunque el producto está optimizado para México (CFDI, integraciones locales, español mexicano). Para operaciones fuera de México conviene evaluar caso por caso.' },
  ],
};

// ─── Retell AI ───────────────────────────────────────────────────────────────

export const RETELL_AI: CompetitorComparison = {
  slug:          'retell-ai',
  competitor:    'Retell AI',
  competitorUrl: 'https://www.retellai.com',
  origin:        'Estados Unidos',
  tagline:       'Retell te da una API. Centinelia te da un equipo.',
  intro:
    'Retell AI es un framework para construir agentes de voz por API. Provee la infraestructura de conversación en tiempo real y deja el producto en manos del desarrollador. Centinelia es un SaaS de empleados digitales listos para operar: cada rol tiene sus herramientas, portal, integraciones y flujos de trabajo terminados para negocios mexicanos.',
  matrix: [
    { aspect: 'Producto',                centinelia: 'Empleados digitales listos por rol', competitor: 'API para construir agentes' },
    { aspect: 'Quién lo opera',          centinelia: 'El dueño desde el portal, sin código', competitor: 'Un developer o agencia técnica' },
    { aspect: 'Idioma nativo',           centinelia: 'Español mexicano entrenado', competitor: 'Inglés principal, español configurable' },
    { aspect: 'Roles preconfigurados',   centinelia: '13 empleados con capacidades específicas (recepción, ventas, facturación, cobranza, tesorería, inventarios y más)', competitor: 'Ninguno, se construyen desde cero' },
    { aspect: 'Portal cliente',          centinelia: 'Portal en español con grabaciones, reportes, aprobación de aprendizajes', competitor: 'No incluido, se construye aparte' },
    { aspect: 'Timbrado CFDI',           centinelia: 'Nala timbra con Facturama o Solución Factible', competitor: 'No, requiere desarrollo' },
    { aspect: 'Integraciones locales',   centinelia: 'CONTPAQi, Aspel, Bind, QuickBooks, Cal.com', competitor: 'API-first, cada integración se codifica' },
    { aspect: 'Modelo de precios',       centinelia: 'Suscripción mensual en pesos', competitor: 'Pay-per-minute en USD' },
    { aspect: 'Setup',                   centinelia: 'Menos de 24 horas', competitor: 'Semanas o meses de desarrollo' },
    { aspect: 'Cumplimiento fiscal MX',  centinelia: 'Factura CFDI, LFPDPPP', competitor: 'Se adapta manualmente' },
  ],
  whyCentinelia: [
    { title: 'Producto, no framework',              desc: 'No es "construye tu propio agente". Es contratar un empleado que ya sabe recepción, ventas o facturación.' },
    { title: 'Equipo coordinado, no un solo bot',   desc: 'Los empleados se transfieren llamadas y trabajo entre sí. Nia agenda, Nala factura, Nico cobra, todos comparten contexto.' },
    { title: 'Portal terminado para el dueño',      desc: 'Reportes, grabaciones, transcripciones, aprendizajes por aprobar. No hay que construir el frontend.' },
    { title: 'Precios y facturación en México',     desc: 'Suscripción en pesos con CFDI mes a mes, sin contratos.' },
  ],
  whyCompetitor: [
    { title: 'Producto muy custom',                 desc: 'Si el flujo de voz es tan específico que no encaja en ningún rol estándar y tienes developers para construirlo, Retell es una base sólida.' },
    { title: 'Quieres control total sobre el modelo', desc: 'Retell permite intercambiar modelos LLM, voces y parámetros con granularidad de API. Centinelia estandariza el stack para producir consistencia operativa.' },
    { title: 'Operas en varios países con equipo técnico', desc: 'Si tu operación es multinacional y ya tienes ingeniería, un framework flexible puede convenir.' },
  ],
  faq: [
    { q: '¿Centinelia se construye sobre Retell AI?',   a: 'No. La orquestación de voz de Centinelia corre sobre Vapi.ai, no sobre Retell. El LLM es Claude, las voces son ElevenLabs, la transcripción es Deepgram.' },
    { q: '¿Puedo llegar al mismo resultado construyendo con Retell?', a: 'Sí, si tienes ingeniería, tiempo y presupuesto para construir portal, integraciones locales, roles, sistema de aprendizajes, timbrado CFDI, WhatsApp entrante y todo lo demás. Centinelia lo entrega listo.' },
    { q: '¿Retell habla español?',                       a: 'Sí, si configuras el modelo y las voces correctamente. La calidad de conversación en español mexicano depende del desarrollo.' },
    { q: '¿Cuál es la diferencia clave entre ambos?',    a: 'Retell es una plataforma técnica para ingenieros que quieren construir. Centinelia es un servicio para dueños de negocio que quieren operar. Diferentes públicos, diferentes precios, diferentes tiempos.' },
  ],
};

// ─── Vapi.ai ─────────────────────────────────────────────────────────────────

export const VAPI: CompetitorComparison = {
  slug:          'vapi',
  competitor:    'Vapi.ai',
  competitorUrl: 'https://vapi.ai',
  origin:        'Estados Unidos',
  tagline:       'Sí, usamos Vapi. También construimos el producto que la mayoría de negocios necesita encima.',
  intro:
    'Vapi.ai es la infraestructura de orquestación de voz en tiempo real. Es excelente en lo que hace: conecta modelo, transcripción, voces y telefonía. Centinelia se apoya en Vapi para la capa de voz, y encima construye lo que un negocio realmente contrata: roles definidos, portal, integraciones locales, timbrado CFDI, aprendizaje supervisado, coordinación entre empleados y facturación mexicana.',
  matrix: [
    { aspect: 'Capa que cubre',              centinelia: 'Producto de empleados digitales', competitor: 'Infraestructura de orquestación de voz' },
    { aspect: 'Público objetivo',            centinelia: 'Dueños de PYMEs mexicanas', competitor: 'Desarrolladores construyendo productos de voz' },
    { aspect: 'Portal cliente',              centinelia: 'Portal completo en español', competitor: 'Dashboard para developers' },
    { aspect: 'Roles preconfigurados',       centinelia: '13 empleados con capacidades y flujos', competitor: 'Se construyen agentes desde cero' },
    { aspect: 'Coordinación entre empleados', centinelia: 'Nia transfiere a Noah, Noah escala a Nelia, Nala timbra al cerrar', competitor: 'Cada agente es independiente, sin coordinación built-in' },
    { aspect: 'Integraciones locales MX',    centinelia: 'CONTPAQi, Aspel, Facturama, Solución Factible, QuickBooks, Cal.com', competitor: 'HubSpot, Salesforce, custom API' },
    { aspect: 'Timbrado CFDI',               centinelia: 'Sí, con PAC del cliente', competitor: 'No es parte del producto' },
    { aspect: 'Aprendizaje supervisado',     centinelia: 'Extracción de aprendizajes con aprobación humana', competitor: 'No incluido' },
    { aspect: 'Precios y facturación',       centinelia: 'Suscripción mensual en pesos, CFDI incluido', competitor: 'Pay-per-minute en USD + costos de proveedores' },
    { aspect: 'Onboarding',                  centinelia: 'Menos de 24 horas', competitor: 'Semanas de desarrollo para producto funcional' },
  ],
  whyCentinelia: [
    { title: 'Producto terminado, no piezas', desc: 'Si construyes sobre Vapi directo, además necesitas frontend, portal, base de datos, integraciones, timbrado, aprendizajes, coordinación entre agentes. Centinelia trae todo eso resuelto.' },
    { title: 'Roles ya operan',               desc: 'Nia sabe agendar. Noah sabe calificar. Nala sabe timbrar. Nico sabe cobrar. No hay que enseñarles desde cero.' },
    { title: 'Integraciones fiscales y locales', desc: 'CFDI con PAC del cliente, WhatsApp entrante, CONTPAQi, Aspel, Bind. Todo integrado y probado en producción.' },
    { title: 'Precios en pesos, CFDI mensual', desc: 'Sin exposición al tipo de cambio. Suscripción deducible.' },
    { title: 'Coordinación multi-empleado',   desc: 'Los empleados de Centinelia comparten contexto y se transfieren trabajo. Un agente Vapi aislado no hace eso.' },
  ],
  whyCompetitor: [
    { title: 'Estás construyendo un producto de voz propio', desc: 'Si tu empresa vende voice AI como núcleo y necesita control granular de la capa de infraestructura, Vapi directo tiene sentido. Es lo que hacemos nosotros en Centinelia también.' },
    { title: 'Tienes equipo de ingeniería dedicado',         desc: 'Vapi requiere developers para construir el producto encima. Si ya lo tienes, la flexibilidad puede convenir.' },
    { title: 'Necesitas ajustar la infraestructura de voz',  desc: 'Cambios profundos en telefonía, elección de proveedores por región, etc. En Centinelia esa capa está encapsulada.' },
  ],
  faq: [
    { q: '¿Centinelia usa Vapi.ai?',                a: 'Sí. La capa de orquestación de voz corre sobre Vapi.ai. El resto del producto (portal, roles, integraciones locales, timbrado, aprendizaje, coordinación) es de Centinelia.' },
    { q: '¿Por qué no usar Vapi directo si Centinelia lo usa?', a: 'Vapi es infraestructura. Un negocio no contrata infraestructura, contrata capacidad operativa. Vapi es a Centinelia lo que AWS es a Shopify: una capa útil, pero incompleta para operar un negocio.' },
    { q: '¿Cuánto ahorra usar Vapi directo?',        a: 'En costo de minuto, algo. En costo total (desarrollo de portal, integraciones locales, timbrado CFDI, base de datos, mantenimiento, soporte a clientes), Centinelia es más barato para un negocio no técnico.' },
    { q: '¿Puedo migrar de un agente Vapi a Centinelia?', a: 'Sí. La configuración del agente se replica en el portal manualmente. En menos de 24 horas queda operativo con las capacidades de rol de Centinelia.' },
  ],
};

// ─── Registro central ─────────────────────────────────────────────────────────

export const COMPARISONS = [BLAND_AI, RETELL_AI, VAPI];

export function getComparisonBySlug(slug: string): CompetitorComparison | undefined {
  return COMPARISONS.find(c => c.slug === slug);
}
