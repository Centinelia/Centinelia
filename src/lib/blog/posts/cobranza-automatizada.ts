import type { BlogPost } from '../types';

export const POST: BlogPost = {
  slug:      'cobranza-automatizada-recuperar-cartera-vencida',
  categoria: 'Operaciones',
  autor:     'Equipo Centinelia',
  datePublished: '2026-09-23',
  readingTime:   8,
  titulo:    'Cobranza automatizada: cómo recuperar cartera vencida sin dañar la relación',
  subtitulo: 'Guía práctica para automatizar el cobro con cadencia inteligente, opciones de pago flexibles y manejo respetuoso, con datos reales de operaciones mexicanas.',
  metaTitle: 'Cobranza automatizada en México: recuperar cartera sin dañar clientes',
  metaDescription: 'Cómo automatizar la cobranza de cartera vencida con llamadas, correos y WhatsApp entrante coordinados. Cadencia respetuoso, opciones de pago flexibles y cumplimiento PROFECO.',
  keywords: [
    'cobranza automatizada', 'recuperar cartera vencida', 'cobrador digital IA',
    'gestión cobranza PyME', 'cobranza sin dañar relación', 'cadencia cobro',
  ],
  intro: 'La cobranza es la operación que más rompe relaciones cuando se maneja mal, pero también es la que más margen recupera cuando se hace con disciplina. Este artículo explica cómo automatizar el proceso completo con [Nico](/empleados/nico), sin sonar hostil, sin gastar tiempo del dueño y con recuperación medible.',
  sections: [
    {
      id: 'realidad',
      heading: 'La realidad de la cartera vencida en PyMEs mexicanas',
      blocks: [
        { type: 'p', text: 'Datos observados en operaciones B2B mexicanas 2026:' },
        { type: 'ul', items: [
          '**30 días vencidos**: 20-35% de la cartera activa promedio',
          '**60 días vencidos**: 8-15%',
          '**90 días vencidos**: 3-7% (aquí ya es difícil recuperar sin abogado)',
          '**Costo de cada peso vencido**: además del principal, hay costos de gestión, oportunidad y potencialmente legal',
        ]},
        { type: 'p', text: 'La cobranza tradicional en PyMEs es reactiva: el dueño o contador llama cuando ya está muy atrasado, con presión y frustración acumulada. La automatización cambia el timing y el tono.' },
      ],
    },
    {
      id: 'cadencia',
      heading: 'La cadencia es la clave',
      blocks: [
        { type: 'p', text: 'La cadencia efectiva de cobranza en el mercado mexicano:' },
        { type: 'ol', items: [
          '**5 días antes del vencimiento**: recordatorio suave por correo o WhatsApp. Tono: "solo por si acaso". Convierte 60-70% de los pagos.',
          '**Día del vencimiento**: recordatorio de que hoy vence. Correo o WhatsApp.',
          '**3 días después**: primera llamada. Tono amable, pregunta si hubo algún problema con el link o la factura.',
          '**10 días después**: segunda llamada. Ofrece opciones de pago (parcialidad, extensión) si el cliente reporta dificultad.',
          '**20 días después**: llamada con tono más firme. Notifica consecuencias si aplica (suspensión de servicio, reporte a buró).',
          '**30 días después**: se escala al operador humano con el historial completo. Se decide si se manda a legal o se ofrece plan de reestructura.',
        ]},
        { type: 'p', text: 'Cada paso el sistema captura respuesta y ajusta. Si el cliente promete pagar el jueves, se llama el viernes para verificar. Si el cliente no contesta 3 veces seguidas, se cambia el canal (correo a WhatsApp, WhatsApp a llamada).' },
      ],
    },
    {
      id: 'tono',
      heading: 'El tono: firme pero respetuoso',
      blocks: [
        { type: 'p', text: 'La cobranza en México tiene mala fama por prácticas agresivas. Un empleado digital de cobranza está configurado para operar dentro de PROFECO y la regulación aplicable:' },
        { type: 'ul', items: [
          'Nunca amenaza con acciones ilegales',
          'No llama en horarios prohibidos (fuera de 7am-10pm hora local)',
          'No llama a familiares del deudor',
          'No divulga la deuda a terceros',
          'Ofrece siempre opciones antes de escalar',
          'Documenta cada interacción para auditoría',
        ]},
        { type: 'p', text: 'El tono default es "profesional cordial". Si la deuda avanza en el tiempo, el tono se vuelve más firme pero sigue respetuoso. Nunca hostil.' },
      ],
    },
    {
      id: 'opciones-pago',
      heading: 'Opciones de pago: flexibilidad estructurada',
      blocks: [
        { type: 'p', text: 'Nico puede ofrecer alternativas dentro de las reglas configuradas:' },
        { type: 'ol', items: [
          '**Pago total con descuento por pronto pago**: 3-5% si paga hoy, típico',
          '**Pago en 2-3 parcialidades**: sin cargos, con fechas claras',
          '**Extensión de plazo**: 15-30 días adicionales sin penalidad',
          '**Reestructuración larga**: 6-12 meses con cargo por manejo. Requiere autorización del dueño',
          '**Nota de crédito por ajuste**: si hubo error de facturación reconocido',
        ]},
        { type: 'p', text: 'El sistema captura el compromiso del cliente y genera el nuevo calendario de pago con [Nala](/empleados/nala) coordinando la refacturación si aplica.' },
      ],
    },
    {
      id: 'canales-integrados',
      heading: 'Multi-canal coordinado',
      blocks: [
        { type: 'p', text: 'La cobranza moderna usa múltiples canales según preferencia del cliente y etapa:' },
        { type: 'ul', items: [
          '**Correo**: primer contacto y recordatorios. Bajo costo, alta capacidad.',
          '**WhatsApp entrante**: cliente responde con "ya lo pagué" y adjunta comprobante. Sistema valida y cierra la deuda.',
          '**Llamada de voz**: para casos activos que no responden a los otros canales, o cuando la conversación requiere negociación.',
          '**SMS**: recordatorio corto con link de pago para clientes que no leen correos.',
        ]},
        { type: 'p', text: 'El sistema alterna canales automáticamente. Si el cliente responde por WhatsApp, se sigue por WhatsApp. Si no responde, se llama.' },
      ],
    },
    {
      id: 'link-pago',
      heading: 'Facilitar el pago: link directo',
      blocks: [
        { type: 'p', text: 'Cada comunicación incluye un link de pago Stripe con el monto exacto pre-cargado. El cliente paga con tarjeta o SPEI en 2 minutos. El sistema recibe confirmación automática y cierra la deuda.' },
        { type: 'p', text: 'Datos observados: la conversión sube 3-5x cuando hay link directo vs cuando se pide al cliente "haga transferencia a la cuenta X con concepto Y". Menos fricción, más recuperación.' },
      ],
    },
    {
      id: 'reactivacion',
      heading: 'Más allá de la cartera: reactivación de clientes',
      blocks: [
        { type: 'p', text: 'La cobranza es solo parte del rol. Nico también reactiva clientes inactivos que ya pagaron pero dejaron de comprar:' },
        { type: 'ul', items: [
          'A los 60 días sin actividad: contacto de "solo saludar" y ver si necesita algo',
          'A los 90 días: oferta o promoción personalizada',
          'A los 120 días: si sigue inactivo, se marca como "en riesgo" y se decide estrategia',
        ]},
        { type: 'p', text: 'Este flujo es donde la mayoría de PyMEs pierden ingresos: no reactivan clientes dormidos porque nadie tiene tiempo. La automatización lo hace consistentemente y con buena tasa de retorno.' },
      ],
    },
    {
      id: 'metricas',
      heading: 'Métricas típicas de cobranza automatizada',
      blocks: [
        { type: 'p', text: 'Resultados observados en operaciones mexicanas B2B tras 90 días de operación:' },
        { type: 'ul', items: [
          '**Cartera 30 días**: baja entre 30% y 50% por recordatorios preventivos',
          '**Cartera 60 días**: baja entre 40% y 60%',
          '**DSO** (días promedio de cobro): baja de 45-55 días a 25-35 días',
          '**Costo operativo de cobranza**: baja entre 60% y 75%',
          '**Satisfacción del cliente**: sube porque el proceso es predecible, no reactivo',
        ]},
        { type: 'p', text: 'El impacto no es solo en cash flow; es en la relación con el cliente. Un cobro predecible y bien manejado es más profesional que uno urgente y estresado.' },
      ],
    },
    {
      id: 'setup',
      heading: 'Setup: cómo arrancar',
      blocks: [
        { type: 'ol', items: [
          '**Día 1**: conexión con el sistema contable (QuickBooks, CONTPAQi, Aspel, Bind). Nico necesita ver el estado de cartera al día.',
          '**Día 2**: configuración de reglas: umbrales de descuento, plazos máximos, umbrales de escalación a humano.',
          '**Día 3**: conexión con Stripe para links de pago. Configuración de plantillas de correo y WhatsApp.',
          '**Día 4**: piloto con 5-10 casos supervisados por el equipo humano. Ajuste de tono y flujo.',
          '**Día 5+**: operación automática con revisión semanal de casos escalados.',
        ]},
      ],
    },
  ],
  faq: [
    { q: '¿Nico presiona o amenaza al cliente?', a: 'No. El tono se configura y por defecto es firme pero respetuoso. Cumple con PROFECO y las regulaciones aplicables de cobranza en México.' },
    { q: '¿Puede negociar directamente parcialidades?', a: 'Sí, dentro de las reglas configuradas (por ejemplo hasta 3 parcialidades sin autorización, más largo requiere aprobación). Fuera del rango, escala al dueño con contexto.' },
    { q: '¿Y si el cliente niega deber el monto?', a: 'Nico captura la disputa, la registra y escala al operador humano con el historial completo. Nunca insiste con un cliente que está en disputa activa.' },
    { q: '¿Se puede integrar con mi buró de crédito?', a: 'Sí, con integraciones custom. La mayoría de PyMEs no reportan a buró; para clientes recurrentes y B2B suele ser suficiente la gestión interna.' },
    { q: '¿Qué pasa con casos que requieren abogado?', a: 'Cuando Nico agotó las opciones y el caso supera el umbral (típicamente 60 o 90 días), escala con todo el historial documentado. Tu abogado recibe expediente completo listo para actuar.' },
  ],
  crossLinks: [
    { href: '/empleados/nico',            label: 'Nico, cobrador digital',        desc: 'Detalles del rol: capacidades, integraciones y precios.' },
    { href: '/empleados/nala',            label: 'Nala, facturación digital',     desc: 'Coordinación entre cobranza y refacturación.' },
    { href: '/blog/reactivar-clientes-inactivos-llamadas', label: 'Reactivar clientes inactivos con llamadas', desc: 'Cómo diseñar campañas de reactivación efectivas.' },
    { href: '/glosario/empleado-digital', label: 'Qué es un empleado digital',    desc: 'Definición canónica y diferencia con chatbot.' },
  ],
  cta: {
    heading: 'Que la cobranza deje de robarte tiempo y buenos clientes',
    body:    'Nico automatiza el proceso completo, respeta el tono y recupera cartera sin dañar la relación. Cadencia consistente, resultados medibles.',
    button:  'Contratar Nico',
    href:    '/registro',
  },
};
