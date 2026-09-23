import type { BlogPost } from '../types';

export const POST: BlogPost = {
  slug:      'automatizar-despacho-servicios-a-domicilio',
  categoria: 'Industria',
  autor:     'Equipo Centinelia',
  datePublished: '2026-09-23',
  readingTime:   8,
  titulo:    'Cómo automatizar el despacho de servicios a domicilio',
  subtitulo: 'Plomeros, electricistas, técnicos, cerrajeros: guía para atender llamadas 24/7, asignar al técnico correcto y cerrar cada orden con evidencia.',
  metaTitle: 'Automatizar despacho de servicios a domicilio en México (guía 2026)',
  metaDescription: 'Cómo automatizar la línea de un negocio de servicios a domicilio: contestar emergencias 24/7, agendar visitas, asignar al técnico correcto y cerrar con evidencia fotográfica.',
  keywords: [
    'despacho servicios domicilio', 'automatizar plomero electricista',
    'agendar técnico a domicilio', 'ETA cliente automatizado',
    'servicio a domicilio 24/7', 'gestión de cuadrillas',
  ],
  intro: 'Un negocio de plomería, electricidad o mantenimiento vive de una realidad simple: si no contestas el teléfono en menos de tres tonos, el cliente llama al siguiente en Google. Este artículo es la guía práctica para automatizar el despacho de servicios a domicilio sin dejar de cerrar cada orden con calidad.',
  sections: [
    {
      id: 'realidad-operativa',
      heading: 'La realidad operativa del negocio de servicios a domicilio',
      blocks: [
        { type: 'p', text: 'Los negocios de servicios a domicilio comparten cinco características que hacen del teléfono un cuello de botella:' },
        { type: 'ul', items: [
          'El técnico está trabajando con las manos ocupadas, no puede contestar',
          'Las emergencias reales llegan de noche, fin de semana o justo cuando estás en otra visita',
          'Cada llamada nueva requiere calificar antes de agendar (zona, urgencia, disponibilidad)',
          'Cada visita termina con documentación (foto, firma, factura) que muchos técnicos olvidan',
          'El cliente espera saber cuándo va a llegar el técnico y cuánto tiempo va a durar',
        ]},
        { type: 'p', text: 'Un [empleado digital de despacho](/empleados/nova) resuelve el eslabón telefónico y la coordinación operativa. El técnico se enfoca en lo que sabe: reparar.' },
      ],
    },
    {
      id: 'flujo-tipico',
      heading: 'Flujo típico de una orden de servicio automatizada',
      blocks: [
        { type: 'ol', items: [
          '**Cliente llama**. Nia o Nova (según configuración) contesta al primer tono.',
          '**Califica**: qué falla, dónde, cuándo lo notó, urgencia estimada.',
          '**Agenda o transfiere**: si es urgencia, transfiere al técnico de guardia en vivo. Si es rutina, agenda en el calendario del técnico apropiado por zona.',
          '**Confirma al cliente**: mensaje con nombre del técnico, ventana de llegada, teléfono para dudas.',
          '**Notifica al técnico**: nueva orden con dirección, referencias y descripción del problema.',
          '**ETA en tiempo real**: cuando el técnico va en camino, se envía al cliente la ETA.',
          '**Cierre con evidencia**: técnico marca "terminado" en su portal, sube foto y firma del cliente. El sistema factura o marca cobrado.',
        ]},
        { type: 'p', text: 'Este flujo funciona con 2 técnicos o con 20 cuadrillas. El sistema escala sin friction.' },
      ],
    },
    {
      id: 'calificacion',
      heading: 'La calificación inicial es la clave',
      blocks: [
        { type: 'p', text: 'Un despachador humano promedio tarda 3-5 minutos en calificar una orden. El empleado digital tarda 90 segundos y captura más información. Las preguntas core:' },
        { type: 'ul', items: [
          '**Qué falla**: descripción del problema en palabras del cliente',
          '**Cuándo empezó**: hoy, ayer, hace semanas',
          '**Ubicación**: dirección completa con referencias visibles',
          '**Acceso**: hay quien reciba, hay estacionamiento, hay perros',
          '**Urgencia percibida**: puede esperar, media, emergencia',
          '**Historial**: es cliente nuevo o recurrente',
        ]},
        { type: 'p', text: 'La calificación se guarda íntegra en la orden. El técnico llega con contexto, no con "algo se rompió en el baño".' },
      ],
    },
    {
      id: 'emergencias',
      heading: 'Manejo de emergencias reales',
      blocks: [
        { type: 'p', text: 'Fuga de agua a las 2 am. Corto eléctrico en fin de semana. Estos casos no esperan. El empleado digital detecta señales verbales y activa el protocolo configurado:' },
        { type: 'ol', items: [
          'Palabras clave que activan modo emergencia (fuga, sin agua, sin luz, humo, olor a gas)',
          '2-3 preguntas para calibrar severidad (¿el agua sigue saliendo?, ¿hay riesgo eléctrico visible?, ¿hay olor de gas?)',
          'Si califica como severa: se transfiere en vivo al técnico de guardia',
          'Si el técnico no contesta en 3 intentos: se llama al siguiente en la lista',
          'Si nadie contesta: se manda SMS al dueño con contexto completo',
        ]},
        { type: 'p', text: 'El cliente nunca queda "esperando en el vacío". Aun si nadie humano puede atender, el sistema confirma que se está buscando y da tiempo estimado.' },
      ],
    },
    {
      id: 'ruteo-tecnicos',
      heading: 'Asignación del técnico correcto',
      blocks: [
        { type: 'p', text: 'La asignación de técnicos combina factores:' },
        { type: 'ul', items: [
          '**Zona geográfica**: proximidad al domicilio del cliente',
          '**Especialidad**: plomería general, gas, aire acondicionado, electrónica, cerrajería',
          '**Disponibilidad en calendario**: horarios ya comprometidos',
          '**Nivel de experiencia**: casos complejos van a técnico senior',
          '**Preferencia del cliente si es recurrente**: mismo técnico que la última vez si aplica',
        ]},
        { type: 'p', text: 'Se configura una vez y el sistema decide. Si la asignación óptima no está disponible, el sistema ofrece siguiente mejor opción al cliente.' },
      ],
    },
    {
      id: 'eta-comunicacion',
      heading: 'ETA y comunicación proactiva',
      blocks: [
        { type: 'p', text: 'Una fuente enorme de fricción es no saber cuándo va a llegar el técnico. El sistema resuelve con tres comunicaciones automáticas:' },
        { type: 'ol', items: [
          '**Al agendar**: confirma ventana amplia (ej. "entre 10 am y 12 pm mañana")',
          '**Cuando el técnico sale**: mensaje "Juan va en camino, llega en aproximadamente 30 minutos"',
          '**Si hay retraso**: llamada o mensaje explicando causa y nueva ETA',
        ]},
        { type: 'p', text: 'Esto reduce llamadas de cliente preguntando "¿dónde está el técnico?" en 70-80%. El técnico no se distrae con esas llamadas y el dueño no invierte tiempo en resolverlas.' },
      ],
    },
    {
      id: 'cierre-evidencia',
      heading: 'Cierre de orden con evidencia',
      blocks: [
        { type: 'p', text: 'La documentación del servicio es un problema clásico. El técnico terminó, se fue, y el reporte queda incompleto por días o nunca se hace. El empleado digital fuerza el cierre:' },
        { type: 'ul', items: [
          'Al marcar "en sitio", inicia checklist configurable',
          'Antes de marcar "terminado" pide foto del trabajo, firma del cliente y descripción de lo hecho',
          'Si el trabajo requirió refacciones adicionales, las captura para cotización posterior',
          'Genera reporte automático para el cliente con foto de antes/después',
          'Marca la orden como cobrada o pendiente de cobro',
        ]},
        { type: 'p', text: 'La evidencia protege al negocio en caso de queja posterior y sirve para reportes de calidad al cliente empresarial.' },
      ],
    },
    {
      id: 'cobranza-integrada',
      heading: 'Cobranza integrada',
      blocks: [
        { type: 'p', text: 'El empleado digital coordina con [Nico, cobrador digital](/empleados/nico), tres modelos:' },
        { type: 'ol', items: [
          '**Pago en sitio**: técnico cobra tarjeta o efectivo. Sistema registra.',
          '**Link de pago inmediato**: al cerrar la orden, se envía link Stripe al cliente por SMS',
          '**Facturación a fin de mes** (clientes recurrentes): las órdenes del mes se consolidan y se facturan con [Nala](/empleados/nala) el día 25',
        ]},
        { type: 'p', text: 'La cobranza automatizada reduce cuentas por cobrar entre 40% y 60% en operaciones bien configuradas.' },
      ],
    },
    {
      id: 'servicios-recurrentes',
      heading: 'Servicios recurrentes: donde el dinero se acumula',
      blocks: [
        { type: 'p', text: 'Los negocios que combinan servicio bajo demanda con contratos de mantenimiento tienen la mejor economía. El empleado digital genera esto automáticamente:' },
        { type: 'ul', items: [
          'Después de una reparación grande, ofrece plan de mantenimiento preventivo',
          'Cada 6 o 12 meses, llama al cliente para agendar revisión programada',
          'Detecta clientes que no han contratado servicio en 12+ meses y los reactiva',
          'Programa recordatorios estacionales (mantenimiento de A/C antes del verano)',
        ]},
        { type: 'p', text: 'Estos son ingresos recurrentes que la mayoría de negocios de servicios pierden porque nadie tiene tiempo de hacer seguimiento. El empleado digital lo hace automáticamente y con consistencia.' },
      ],
    },
  ],
  faq: [
    { q: '¿Funciona con mi sistema actual de despacho?', a: 'Con sistemas que expongan API (Protrack, Salesforce Field Service, sistemas propios), se integra. Con sistemas sin API se maneja por importación de agendas o operación paralela.' },
    { q: '¿Y si el técnico no habla claro por teléfono?', a: 'El empleado digital no depende del técnico para tomar la orden; toma toda la información del cliente y se la manda al técnico. El técnico solo confirma llegada y cierre.' },
    { q: '¿Puede optimizar rutas?', a: 'Con integración de mapas, sí. Considera ubicación de próximas visitas y sugiere el orden óptimo al despachar.' },
    { q: '¿Cuánto cuesta para un negocio de 3 técnicos?', a: 'Plan Esencial ($2,997 MXN) es suficiente para operaciones de bajo volumen. Para 3-5 técnicos activos, generalmente conviene Profesional ($5,994 MXN).' },
    { q: '¿Puede tomar el pago por teléfono?', a: 'Sí, mediante link de Stripe que se envía al cliente por SMS o WhatsApp. El pago llega a la cuenta bancaria del negocio de forma directa.' },
  ],
  crossLinks: [
    { href: '/empleados/nova',            label: 'Nova, despacho digital',        desc: 'Coordina cuadrillas en campo, ETAs y cierre con evidencia.' },
    { href: '/industrias/servicios-a-domicilio', label: 'Centinelia para servicios a domicilio', desc: 'Casos por giro: plomeros, electricistas, técnicos.' },
    { href: '/empleados/nico',            label: 'Nico, cobrador digital',        desc: 'Cobranza automatizada y recuperación de cartera.' },
    { href: '/empleados/nala',            label: 'Nala, facturación digital',     desc: 'Timbra CFDIs al cierre del mes o por servicio individual.' },
  ],
  cta: {
    heading: 'Que tu operación no dependa de contestar el teléfono',
    body:    'Nova toma cada emergencia, agenda visitas y coordina técnicos 24/7. Tú te enfocas en el trabajo real.',
    button:  'Contratar Nova',
    href:    '/registro',
  },
};
