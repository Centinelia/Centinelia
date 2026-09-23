import type { BlogPost } from '../types';

export const POST: BlogPost = {
  slug:      'restaurante-pedidos-por-telefono-24-7',
  categoria: 'Industria',
  autor:     'Equipo Centinelia',
  datePublished: '2026-09-23',
  readingTime:   7,
  titulo:    'Cómo un restaurante puede tomar pedidos por teléfono 24/7 sin contratar a nadie',
  subtitulo: 'Guía práctica para atender hora pico, tomar pedidos a domicilio de noche y agendar reservaciones sin que la mesera pare de servir mesas.',
  metaTitle: 'Pedidos por teléfono automatizados para restaurantes en México (2026)',
  metaDescription: 'Cómo automatizar la línea telefónica de un restaurante para tomar pedidos, agendar reservaciones y responder el menú en hora pico. Con menú extenso, variantes y coordinación con cocina.',
  keywords: [
    'pedidos telefónicos restaurante', 'automatizar teléfono restaurante',
    'restaurante 24/7', 'reservaciones automáticas restaurante',
    'toma de pedidos por teléfono IA', 'restaurante hora pico',
  ],
  intro: 'A las 8 pm de un viernes, el teléfono suena mientras el equipo está sirviendo mesas y la cocina está saturada. Nadie contesta. Ese cliente pide en otro lado. Este artículo es la guía práctica para que un restaurante mexicano automatice su línea telefónica sin sacrificar la experiencia del cliente ni saturar la cocina.',
  sections: [
    {
      id: 'donde-duele',
      heading: 'Dónde duele hoy: los tres huecos telefónicos',
      blocks: [
        { type: 'p', text: 'Los restaurantes pierden ventas telefónicas en tres momentos específicos:' },
        { type: 'ol', items: [
          '**Hora pico de comida y cena**: todo el equipo está en operación de piso. Las llamadas se acumulan.',
          '**Fuera de horario del local**: cliente llama a las 10 pm queriendo reservar para el día siguiente o pedir a domicilio. Nadie contesta, pide en otro lado.',
          '**Preguntas repetitivas de menú**: "¿tienen opción sin gluten?", "¿cuánto tarda el envío?". Cada pregunta consume 2-3 minutos que podrían ir a servir la mesa 8.',
        ]},
        { type: 'p', text: 'Un [empleado digital](/glosario/empleado-digital) contesta al primer tono, mantiene la conversación en tono cálido, toma el pedido completo con modificadores y lo manda a cocina o al POS sin que nadie del equipo intervenga.' },
      ],
    },
    {
      id: 'que-toma',
      heading: 'Qué tipos de pedido puede tomar el empleado digital',
      blocks: [
        { type: 'p', text: 'Con el menú cargado en la base de conocimiento, el empleado digital toma:' },
        { type: 'ul', items: [
          '**Pedidos para llevar** con recolección en tienda: nombre, tiempo estimado, forma de pago',
          '**Pedidos a domicilio**: dirección completa, referencias, forma de pago, propina opcional',
          '**Reservaciones de mesa**: fecha, hora, número de personas, celebración especial',
          '**Menú del día y platillos de temporada**: informa lo que hay hoy y lo que no',
          '**Pedidos con modificadores**: sin cebolla, extra queso, salsa aparte, término medio',
          '**Consultas previas de disponibilidad**: si un platillo puede modificarse, si hay opción vegana',
        ]},
        { type: 'p', text: 'Los pedidos aparecen en el POS al instante (si hay integración) o llegan por correo al operador que los captura manualmente. Un WhatsApp de aviso a la cocina también es posible.' },
      ],
    },
    {
      id: 'menu-extenso',
      heading: 'Cómo se maneja un menú extenso con variantes',
      blocks: [
        { type: 'p', text: 'El menú se carga en el portal con estructura:' },
        { type: 'ul', items: [
          'Categorías (entradas, principales, postres, bebidas)',
          'Platillos con nombre, descripción corta, precio',
          'Modificadores por platillo (sin gluten, veganismo, término, extras)',
          'Combinaciones especiales y paquetes',
          'Restricciones de disponibilidad por hora (menú del día solo hasta las 5 pm)',
          'Tiempos de preparación por platillo o por combinación',
        ]},
        { type: 'p', text: 'El empleado digital conversa de forma natural: si el cliente pide "las alitas", el sistema pregunta "¿doradas o BBQ?" en lugar de leer el catálogo entero. Si el cliente cambia de opinión a mitad de pedido, ajusta sin problema.' },
      ],
    },
    {
      id: 'coordinacion-cocina',
      heading: 'Coordinación con la cocina en hora pico',
      blocks: [
        { type: 'p', text: 'El punto delicado: no saturar la cocina. Configuraciones que evitan colapso:' },
        { type: 'ol', items: [
          '**Tiempo estimado dinámico**: si hay 8 pedidos activos, el sistema comunica al cliente "35-45 minutos" en vez del estándar "20 minutos"',
          '**Pausa de nuevos pedidos**: cuando la cocina llega a cierto umbral, el sistema deja de tomar pedidos a domicilio y solo agenda reservaciones o pedidos para más tarde',
          '**Cierre programado**: 90 minutos antes de cerrar, el sistema deja de aceptar pedidos nuevos para no dejar comida pendiente',
          '**Comunicación al cliente si hay retraso**: si un pedido se demora más de lo estimado, el sistema llama automáticamente al cliente con nueva ETA',
        ]},
        { type: 'p', text: 'La cocina define las reglas; el empleado digital las aplica sin fallar. Nadie del equipo pierde tiempo diciéndole a un cliente por teléfono "es que tenemos mucho pedido".' },
      ],
    },
    {
      id: 'reservaciones',
      heading: 'Reservaciones sin fricción',
      blocks: [
        { type: 'p', text: 'Para restaurantes que trabajan por reservación, la línea telefónica es el punto de contacto principal. Flujo típico:' },
        { type: 'quote', text: 'Cliente: "Quería reservar para 4 personas mañana viernes a las 9 pm."\nAgente: "Claro. Tenemos mesa interior o terraza a esa hora. ¿Preferencia?"\nCliente: "Terraza, si es posible."\nAgente: "Perfecto, mesa de terraza para 4 mañana viernes a las 9 pm. ¿A nombre de quién?"\nCliente: "Roberto Garza."\nAgente: "Roberto, quedaste reservado. Te llegará confirmación al celular. Un día antes te llamamos para confirmar. ¿Alguna celebración especial que debamos preparar?"' },
        { type: 'p', text: 'Un día antes, el sistema hace llamada saliente para confirmar. Reduce no-shows entre 25% y 40%. Cuando el cliente cancela, el sistema puede llamar automáticamente a lista de espera.' },
      ],
    },
    {
      id: 'pagos',
      heading: 'Cobro y pagos por teléfono',
      blocks: [
        { type: 'p', text: 'Tres modelos según lo que ya usa el restaurante:' },
        { type: 'ol', items: [
          '**Pago al recoger o entregar**: el empleado digital solo toma el pedido. El pago es a la llegada.',
          '**Link de Stripe**: al terminar de tomar el pedido, se envía un link de pago por SMS o WhatsApp. Sin tarjeta guardada en el sistema.',
          '**POS con procesador integrado**: si el sistema del restaurante ya cobra tarjetas, el empleado digital captura los últimos 4 dígitos por seguridad y coordina cobro con el operador.',
        ]},
        { type: 'p', text: 'El pago electrónico anticipado reduce cancelaciones y "fantasmas" (pedidos que nunca se recogen). Para el cliente frecuente que confía en el negocio, el pago al recibir es más natural.' },
      ],
    },
    {
      id: 'delivery-apps',
      heading: 'Coexistencia con apps de delivery',
      blocks: [
        { type: 'p', text: 'Muchos restaurantes usan Rappi, Uber Eats y DiDi Food. El teléfono no compite con las apps; captura al cliente que **prefiere hablar**:' },
        { type: 'ul', items: [
          'Clientes mayores que no usan apps',
          'Clientes con pedidos grandes o corporativos (comidas de oficina)',
          'Clientes que quieren personalización que la app no ofrece',
          'Clientes en zonas fuera de cobertura de apps',
          'Clientes fidelizados que llaman directo por costumbre',
        ]},
        { type: 'p', text: 'Cada pedido por teléfono ahorra la comisión de la app (típicamente 25-35%) y mantiene los datos del cliente en la base propia del restaurante. Es margen puro.' },
      ],
    },
    {
      id: 'setup',
      heading: 'Setup en 3 pasos (menos de 24 horas)',
      blocks: [
        { type: 'ol', items: [
          '**Carga el menú en el portal**: platillos, precios, modificadores, tiempos, categorías. Puedes copiar tu carta actual y adaptarla en 30 minutos.',
          '**Define horarios y protocolos**: cuándo se acepta pedido a domicilio, tiempo estimado por default, cuándo pausar por saturación, zonas de reparto.',
          '**Conecta tu POS o correo**: si tienes integración con Cadú, Parrot, Loyverse u otro POS, se conecta. Si no, los pedidos llegan por correo al momento.',
        ]},
        { type: 'p', text: 'Después de estos tres pasos, el número del restaurante se puede desviar a Nia o se puede empezar con un número nuevo dedicado para pedidos automatizados.' },
      ],
    },
  ],
  faq: [
    { q: '¿Puede coordinar con mi POS actual?', a: 'Sí, con POS que expongan API. Con sistemas cerrados sin API, los pedidos llegan por correo o WhatsApp al operador de cocina para captura.' },
    { q: '¿Y si un cliente pide algo que no está en el menú?', a: 'El empleado digital lo reconoce ("no tenemos ese platillo hoy") y ofrece opciones similares. Nunca inventa.' },
    { q: '¿Funciona para restaurantes de mariscos, hamburguesas, comida corrida, cafeterías?', a: 'Sí. Se adapta a cualquier menú. Los restaurantes con menú del día que cambia todos los días actualizan la base en 5 minutos.' },
    { q: '¿Puede atender en inglés a turistas?', a: 'Sí. Detecta el idioma del cliente en la misma llamada y responde en español o inglés según corresponda.' },
    { q: '¿Cuánto tarda en estar activo?', a: 'Menos de 24 horas si el menú está listo para cargar. Para menús muy extensos con muchos modificadores, puede tomar hasta 3 días de configuración fina.' },
  ],
  crossLinks: [
    { href: '/empleados/nia',           label: 'Nia, recepcionista digital', desc: 'El empleado que toma llamadas, agenda y toma pedidos.' },
    { href: '/industrias/restaurantes', label: 'Centinelia para restaurantes', desc: 'Página específica de industria con demo y testimonios.' },
    { href: '/blog/costo-real-recepcionista-mexico-2026', label: 'Costo real de una recepcionista', desc: 'Cifras 2026 con IMSS, aguinaldo y prestaciones.' },
    { href: '/glosario/empleado-digital', label: 'Qué es un empleado digital',  desc: 'Definición y diferencia frente a chatbot o menú IVR.' },
  ],
  cta: {
    heading: 'Empieza a tomar pedidos 24/7 este viernes',
    body:    'Nia contesta cada llamada al primer tono. Tú te enfocas en la cocina y el servicio en piso.',
    button:  'Activar Nia en mi restaurante',
    href:    '/registro',
  },
};
