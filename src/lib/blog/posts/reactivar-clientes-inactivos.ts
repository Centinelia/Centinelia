import type { BlogPost } from '../types';

export const POST: BlogPost = {
  slug:      'reactivar-clientes-inactivos-llamadas',
  categoria: 'Operaciones',
  autor:     'Equipo Centinelia',
  datePublished: '2026-09-23',
  readingTime:   7,
  titulo:    'Reactivar clientes inactivos con llamadas automatizadas: casos y guión',
  subtitulo: 'La operación con mejor ROI y peor ejecución en PyMEs mexicanas. Guía para diseñar campañas de reactivación efectivas sin quemar la lista.',
  metaTitle: 'Reactivar clientes inactivos con llamadas IA: guía práctica 2026',
  metaDescription: 'Cómo diseñar y ejecutar campañas de reactivación de clientes inactivos con llamadas salientes automatizadas. Guión, cadencia y métricas de conversión reales.',
  keywords: [
    'reactivar clientes inactivos', 'campaña reactivación clientes',
    'llamadas salientes automatizadas', 'clientes dormidos',
    'recuperar clientes IA', 'reactivación PyME México',
  ],
  intro: 'La operación de mayor ROI en la mayoría de PyMEs mexicanas es la que casi nadie hace: llamar a los clientes que dejaron de comprar. Esta guía explica cómo diseñar y ejecutar campañas de reactivación efectivas con [Noah](/empleados/noah) o [Nico](/empleados/nico), con guión y métricas reales.',
  sections: [
    {
      id: 'por-que',
      heading: 'Por qué la reactivación es la operación con mejor ROI',
      blocks: [
        { type: 'p', text: 'Tres razones fundamentales:' },
        { type: 'ol', items: [
          '**El cliente ya te conoce**: no necesitas construir confianza desde cero, ya te compró. La conversión es 3-5x mayor que en prospección en frío.',
          '**El costo es marginal**: no gastas en anuncios ni en generar tráfico nuevo. Solo en la llamada.',
          '**El churn silencioso es el mayor sangrado**: los clientes que "solo dejan de venir" sin quejarse son mayoría. Sin campaña de reactivación, se van a la competencia sin que lo notes.',
        ]},
        { type: 'p', text: 'La realidad: pocas PyMEs ejecutan reactivación porque nadie tiene tiempo de llamar a 200 clientes dormidos con la misma energía. La automatización lo resuelve.' },
      ],
    },
    {
      id: 'segmentar',
      heading: 'Segmentar antes de llamar',
      blocks: [
        { type: 'p', text: 'Llamar a "todos los inactivos" es ruido. El sistema segmenta en tres cohortes:' },
        { type: 'ul', items: [
          '**Warm** (30-60 días sin compra): pequeño empujón con una oferta suave. Alta conversión.',
          '**Cool** (60-120 días sin compra): pregunta abierta sobre por qué no ha regresado. Media conversión pero alta información.',
          '**Cold** (120+ días sin compra): reactivación fuerte con oferta significativa. Conversión moderada pero recupera clientes ya casi perdidos.',
        ]},
        { type: 'p', text: 'Cada cohorte recibe guión y oferta diferente. La segmentación por historial de compra (ticket promedio, frecuencia previa) refina más.' },
      ],
    },
    {
      id: 'guion-warm',
      heading: 'Guión para segmento Warm (30-60 días)',
      blocks: [
        { type: 'quote', text: 'Noah: "Buenas tardes, ¿es el señor Roberto Garza? Le habla Noah de [Negocio X]. Vi que la última vez que vino fue hace mes y medio y quería saludar rápidamente."\nCliente: "Hola, sí. Ah, sí, no había podido regresar."\nNoah: "Comprendo. Le comento que este mes tenemos [oferta específica X] para clientes que ya conocemos. ¿Le podría interesar agendar un espacio?"\nCliente: "Cuéntame más."\nNoah: [ofrece detalles cortos] "¿Le gustaría agendar el jueves o el viernes?"' },
        { type: 'p', text: 'Tono: cercano, sin presión. Objetivo: agendar cita o venta rápida. Conversión típica: 15-25%.' },
      ],
    },
    {
      id: 'guion-cool',
      heading: 'Guión para segmento Cool (60-120 días)',
      blocks: [
        { type: 'quote', text: 'Noah: "Buenos días, señora Ana. Le habla Noah de [Negocio X]. Notamos que la última vez que nos visitó fue hace un par de meses y quisimos preguntarle si hubo algo con nuestro servicio o simplemente ha estado ocupada."\nCliente: "Sí, todo bien, solo he estado con mucho trabajo."\nNoah: "Entendido. Cuando tenga oportunidad de regresar, quería ofrecerle [oferta suave]. ¿Le gustaría que le enviemos un recordatorio en dos semanas?"' },
        { type: 'p', text: 'Objetivo doble: recuperar cliente y detectar razones de inactividad. Si el cliente reporta insatisfacción, se escala al operador humano para escuchar. Conversión: 8-15%. Información capturada: alta.' },
      ],
    },
    {
      id: 'guion-cold',
      heading: 'Guión para segmento Cold (120+ días)',
      blocks: [
        { type: 'quote', text: 'Noah: "Buenas tardes. Le habla Noah de [Negocio X]. Es cliente de la casa desde [fecha]. Le comento que tenemos una oferta especial para clientes que hace tiempo no nos visitan: [oferta significativa]. ¿Le sería útil?"\nCliente: "Ah, sí, había olvidado que ustedes lo hacían."\nNoah: "Precisamente por eso llamamos. La oferta es válida esta semana. ¿Prefiere pasar por la sucursal o le envío el link ahora mismo?"' },
        { type: 'p', text: 'Tono: cordial y directo. La oferta es más agresiva porque el cliente casi está perdido. Conversión: 5-10%. Cada cliente reactivado a este punto es margen neto.' },
      ],
    },
    {
      id: 'cadencia-lista',
      heading: 'Cadencia de la lista completa',
      blocks: [
        { type: 'p', text: 'Se define un límite de llamadas por cliente por período:' },
        { type: 'ol', items: [
          '**Primera llamada**: en el momento que califica como inactivo (30, 60 o 120 días según cohorte)',
          '**Segunda llamada**: 7 días después si no contestó la primera',
          '**Tercera llamada**: 14 días después si sigue sin contestar',
          '**Correo o WhatsApp**: si ninguna llamada conecta',
          '**Espera de 6 meses**: antes de una nueva secuencia de reactivación',
        ]},
        { type: 'p', text: 'Este límite protege la relación. Nadie quiere ser el negocio que llama 10 veces en el mes.' },
      ],
    },
    {
      id: 'incentivos',
      heading: 'Diseñar el incentivo correcto',
      blocks: [
        { type: 'p', text: 'No siempre gana el descuento agresivo. Incentivos efectivos:' },
        { type: 'ul', items: [
          '**Servicio gratis o de cortesía**: consulta gratis, revisión sin costo, primera limpieza sin cargo',
          '**Producto complementario**: postre gratis con un platillo, refacciones al costo',
          '**Servicio premium por precio estándar**: "esta vez te doy la revisión completa por precio de la básica"',
          '**Prioridad de agenda**: "te reservo el horario que prefieras esta semana"',
          '**Descuento porcentual**: solo cuando los anteriores no aplican',
        ]},
        { type: 'p', text: 'El descuento porcentual es la última opción porque enseña al cliente a esperar promociones. Los incentivos de valor agregado son más sostenibles.' },
      ],
    },
    {
      id: 'metricas',
      heading: 'Métricas para medir el éxito',
      blocks: [
        { type: 'p', text: 'Las métricas core de una campaña de reactivación:' },
        { type: 'ul', items: [
          '**Tasa de conexión**: cuántos clientes contestaron / cuántos se llamaron',
          '**Tasa de agenda**: de los que contestaron, cuántos agendaron',
          '**Tasa de cierre**: de los que agendaron, cuántos vinieron y compraron',
          '**Ticket promedio de reactivados**: comparado con ticket regular',
          '**Costo por cliente reactivado**: minutos gastados × costo por minuto',
        ]},
        { type: 'p', text: 'Los datos observados en operaciones mexicanas 2026: tasa de conexión 45-60%, agenda 25-35%, cierre 55-70%. Costo por cliente reactivado: menos del 10% del margen que genera el cliente reactivado en su primera visita.' },
      ],
    },
    {
      id: 'ejemplo-real',
      heading: 'Ejemplo real: floristería en Monterrey',
      blocks: [
        { type: 'p', text: 'Una floristería mediana en Monterrey aplicó reactivación automatizada con Nico:' },
        { type: 'ul', items: [
          'Lista base: 380 clientes históricos, 220 inactivos (>90 días)',
          'Segmentación: 90 Warm (30-60 días), 78 Cool (60-120), 52 Cold (>120)',
          'Duración de campaña: 3 semanas',
          'Llamadas realizadas: 380 (con reintentos)',
          'Llamadas conectadas: 178',
          'Clientes reactivados con compra: 62',
          'Ticket promedio reactivado: $1,850 MXN',
          'Ingresos generados: $114,700 MXN',
          'Costo total de la campaña (minutos usados de Nico Profesional): incluido en la suscripción mensual',
        ]},
        { type: 'p', text: 'Recuperar 62 clientes en 3 semanas es imposible con un vendedor humano. Con automatización se hizo mientras el equipo atendía el piso.' },
      ],
    },
    {
      id: 'cuando-no',
      heading: 'Cuándo no hacer reactivación automatizada',
      blocks: [
        { type: 'p', text: 'Hay casos donde la llamada masiva no aplica:' },
        { type: 'ul', items: [
          'Clientes que se quejaron y no fueron atendidos (necesitan seguimiento humano)',
          'Clientes de alto valor (deben tenerse en cartera humana)',
          'Nichos donde la relación es tan personal que una llamada automatizada se percibe fría (algunos servicios de terapia, coaching)',
          'Cuando la razón de inactividad es un problema estructural del negocio (mala calidad reciente, precio no competitivo)',
        ]},
        { type: 'p', text: 'La reactivación no arregla problemas de fondo. Si el cliente se fue porque el servicio bajó de calidad, primero se resuelve el servicio.' },
      ],
    },
  ],
  faq: [
    { q: '¿No molesta al cliente recibir una llamada de reactivación?', a: 'Cuando el tono es cordial y el timing es respetuoso, la mayoría lo agradece. Datos: menos del 3% pide no ser contactado de nuevo. Se registra y se respeta.' },
    { q: '¿Puedo hacer reactivación solo por WhatsApp o correo?', a: 'Sí, pero la conversión baja significativamente. La llamada personal tiene 3-5x mejor tasa de agenda. La mezcla óptima es llamada primero, WhatsApp o correo como seguimiento.' },
    { q: '¿Y si el cliente contesta "quítame de tu lista"?', a: 'El sistema captura la solicitud, marca al cliente como "no contactar" y respeta la baja de forma permanente. Cumple con LFPDPPP.' },
    { q: '¿Cuántos clientes puedo reactivar al mes con el plan Esencial?', a: '250 minutos rinden entre 200 y 350 clientes contactados según duración promedio de llamada. Con un plan Profesional (500 minutos) se puede correr una campaña completa de 400-700 clientes.' },
    { q: '¿Se puede combinar con campaña de venta cruzada?', a: 'Sí. Al reactivar, el sistema puede ofrecer producto complementario. Convierte mejor porque el cliente ya está en modo receptivo.' },
  ],
  crossLinks: [
    { href: '/empleados/noah',            label: 'Noah, ventas digitales',        desc: 'El vendedor que llama con la misma energía a la llamada 1 y a la 500.' },
    { href: '/empleados/nico',            label: 'Nico, recuperación de cartera', desc: 'Reactivación y cobranza automatizadas.' },
    { href: '/blog/cobranza-automatizada-recuperar-cartera-vencida', label: 'Cobranza automatizada',   desc: 'Cómo automatizar cobro sin dañar la relación.' },
    { href: '/glosario/empleado-digital', label: 'Qué es un empleado digital',    desc: 'Definición y diferencia con chatbot o call center tradicional.' },
  ],
  cta: {
    heading: 'Reactiva tu base de clientes dormidos este mes',
    body:    'Con Noah o Nico corres una campaña de reactivación de tu lista completa en 2-3 semanas. Sin costo por llamada individual.',
    button:  'Diseñar campaña de reactivación',
    href:    '/cotizar',
  },
};
