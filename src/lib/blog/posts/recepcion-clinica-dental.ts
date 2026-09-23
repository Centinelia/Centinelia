import type { BlogPost } from '../types';

export const POST: BlogPost = {
  slug:      'como-automatizar-recepcion-clinica-dental',
  categoria: 'Industria',
  autor:     'Equipo Centinelia',
  datePublished: '2026-09-23',
  readingTime:   8,
  titulo:    'Cómo automatizar la recepción telefónica de una clínica dental',
  subtitulo: 'Guía práctica para no perder pacientes fuera de horario, filtrar urgencias y liberar a la asistente para lo que sí requiere criterio humano.',
  metaTitle: 'Automatizar recepción de clínica dental en México: guía práctica 2026',
  metaDescription: 'Cómo un consultorio dental puede automatizar el teléfono para agendar citas 24/7, filtrar urgencias y no perder pacientes por llamadas sin contestar. Pasos concretos y ejemplos.',
  keywords: [
    'automatizar recepción dental', 'recepcionista virtual dentista', 'agenda citas dental automática',
    'clínica dental 24/7', 'consultorio dental IA', 'no perder pacientes dental',
  ],
  intro: 'La mayoría de las llamadas nuevas a un consultorio dental llegan en momentos donde la asistente no puede contestar: mientras está limpiando la unidad, cobrando o entregando material al doctor. Esta guía es un mapa práctico para dueños de clínicas dentales que quieren dejar de perder pacientes por el teléfono sin gastar en un segundo turno.',
  sections: [
    {
      id: 'diagnostico',
      heading: 'Diagnóstico: cuántos pacientes estás perdiendo hoy',
      blocks: [
        { type: 'p',  text: 'Antes de automatizar hay que medir. Un ejercicio de 15 minutos que arroja el dato real:' },
        { type: 'ol', items: [
          'Revisa el historial de llamadas del conmutador o del celular donde llega el teléfono principal',
          'Cuenta llamadas entrantes de los últimos 30 días',
          'Cuenta llamadas que quedaron sin contestar (ring-timeout, buzón, ocupado)',
          'Divide: llamadas perdidas / llamadas totales = tasa de pérdida',
        ]},
        { type: 'p', text: 'La mayoría de las clínicas dentales que auditamos tienen tasas de pérdida entre 18% y 32%. La franja de las 6 pm a 10 am concentra el 40% de las llamadas perdidas, más los fines de semana completos.' },
        { type: 'p', text: 'Multiplica las llamadas perdidas por tu ticket promedio × tu tasa de cierre telefónica (típicamente 20-30% en dental). Ese es el dinero mensual que se está fugando por no contestar.' },
      ],
    },
    {
      id: 'que-automatizar',
      heading: 'Qué se puede automatizar (y qué no)',
      blocks: [
        { type: 'p', text: 'Automatizable con alto retorno:' },
        { type: 'ul', items: [
          '**Agendamiento de citas nuevas**: paciente pide cita, el sistema consulta el calendario, ofrece huecos y agenda al momento',
          '**Preguntas sobre precios y servicios**: cuánto cuesta una limpieza, qué incluye una ortodoncia, si aceptan seguros',
          '**Confirmación de citas del día siguiente**: llamada saliente que reduce no-shows entre 30% y 50%',
          '**Recordatorios de revisión semestral**: contacto proactivo a pacientes que no han visitado en 6+ meses',
          '**Filtro de urgencias**: derivar al doctor de guardia cuando la conversación detecta síntomas serios',
        ]},
        { type: 'p', text: 'No automatizable (todavía):' },
        { type: 'ul', items: [
          'Diagnósticos clínicos por teléfono (nadie profesional lo hace)',
          'Manejo de pacientes en crisis emocional severa',
          'Ventas complejas de tratamientos de $100,000+ MXN donde el rapport determina el cierre',
        ]},
      ],
    },
    {
      id: 'stack-tipico',
      heading: 'Stack típico de una clínica dental automatizada',
      blocks: [
        { type: 'p', text: 'La configuración recomendada para un consultorio dental promedio en México:' },
        { type: 'ol', items: [
          '**Número dedicado 24/7**: se puede portar el actual o usar uno nuevo con desvío desde el existente',
          '**[Nia como recepcionista digital](/empleados/nia)**: contesta llamadas, agenda, responde preguntas frecuentes, escala urgencias',
          '**Cal.com o Google Calendar** conectado como fuente de disponibilidad: la agenda del doctor',
          '**Correo del consultorio**: recibe resúmenes de cada llamada con datos capturados',
          '**Base de conocimiento**: precios, servicios, horarios, seguros aceptados, protocolos',
        ]},
        { type: 'p', text: 'Con este stack, el 80% de las llamadas se atienden sin intervención humana. El 20% restante (urgencias, casos complejos) se transfiere en vivo al doctor o queda como callback estructurado.' },
      ],
    },
    {
      id: 'flujo-agenda',
      heading: 'Cómo se ve el flujo de agenda',
      blocks: [
        { type: 'quote', text: 'Paciente: "Buenas noches, quería agendar una limpieza dental."\nNia: "Claro que sí. ¿Le viene mejor esta semana o la próxima? Tenemos el jueves a las 10am o el viernes a las 4pm."\nPaciente: "El jueves a las 10, por favor. Me llamo Roberto Garza."\nNia: "Perfecto, Roberto. Quedaste agendado para el jueves 26 a las 10am. Te llegará una confirmación por WhatsApp. ¿Es la primera vez que nos visitas?"\nPaciente: "Sí."\nNia: "Excelente. Aparta 45 minutos para tu primera consulta que incluye evaluación completa. Cualquier cosa nos avisas por este medio."' },
        { type: 'p',     text: 'Esta interacción dura menos de 60 segundos, ocurre a las 8:34 pm y agenda un paciente nuevo que llamó a tres consultorios y solo uno le contestó.' },
      ],
    },
    {
      id: 'urgencias',
      heading: 'Cómo se manejan las urgencias',
      blocks: [
        { type: 'p', text: 'Las urgencias dentales reales (dolor severo, sangrado, absceso, fractura) no pueden esperar. El empleado digital reconoce señales verbales y activa el protocolo configurado por la clínica:' },
        { type: 'ol', items: [
          'Detecta palabras clave (dolor intenso, hinchazón, sangrado, no puedo, urgente)',
          'Pregunta 2-3 preguntas de calificación para confirmar severidad',
          'Si califica: transfiere en vivo al número personal del doctor de guardia',
          'Si el doctor no contesta en 3 intentos: captura contacto y envía SMS de "voy a llamarte en X minutos"',
        ]},
        { type: 'p', text: 'Este flujo mantiene la disponibilidad para casos reales sin que el doctor tenga que estar pegado al teléfono. La mayoría de urgencias reales terminan en el consultorio a la mañana siguiente; el resto se maneja por teléfono o se deriva a hospital.' },
      ],
    },
    {
      id: 'seguros',
      heading: 'Preguntas sobre seguros y planes de tratamiento',
      blocks: [
        { type: 'p', text: 'Uno de los volúmenes altos de preguntas repetitivas en dental es sobre seguros ("¿aceptan Bupa? ¿AXA? ¿ISSSTE?") y precios de tratamientos multi-sesión (ortodoncia, implantes).' },
        { type: 'p', text: 'Se le carga al empleado digital:' },
        { type: 'ul', items: [
          'Lista de seguros aceptados con condiciones (copago, autorización previa)',
          'Rango de precios por tratamiento estándar (limpieza, extracción, blanqueamiento, endodoncia)',
          'Precio orientativo por tratamiento complejo con nota "el diagnóstico definitivo requiere consulta"',
          'Planes de pago disponibles y a cuántos meses',
        ]},
        { type: 'p', text: 'El empleado digital nunca inventa precios; si el paciente pregunta por algo fuera de su base de conocimiento, agenda consulta o toma el dato para que el doctor le llame.' },
      ],
    },
    {
      id: 'multi-doctor',
      heading: 'Configuración multi-doctor y especialidad',
      blocks: [
        { type: 'p', text: 'Consultorios con varios doctores o especialidades (odontopediatra, ortodoncista, endodoncista) se configuran así:' },
        { type: 'ol', items: [
          'Cada doctor tiene su propio calendario en Cal.com',
          'El empleado digital pregunta motivo antes de agendar y elige al doctor correcto',
          'Si el paciente tiene preferencia por doctor específico, se respeta',
          'Los horarios de especialistas se filtran por servicio (una limpieza no requiere al endodoncista)',
        ]},
        { type: 'p', text: 'El paciente no necesita saber la estructura interna; solo pide lo que necesita y el sistema decide el doctor apropiado.' },
      ],
    },
    {
      id: 'salientes',
      heading: 'Llamadas salientes: donde se recupera lo perdido',
      blocks: [
        { type: 'p', text: 'La parte que la mayoría de las clínicas ignoran: las llamadas salientes automatizadas. Casos con mayor retorno:' },
        { type: 'ul', items: [
          '**Confirmación de cita 24 horas antes**: reduce no-shows entre 30% y 50%',
          '**Revisión semestral**: contacta a pacientes limpiados hace 6 meses. Convierte ~15% en cita.',
          '**Seguimiento post-tratamiento**: 48 horas después de una endodoncia o cirugía, verifica cómo va y detecta complicaciones tempranas',
          '**Lista de espera cuando hay cancelación**: si un paciente cancela hoy, el sistema llama a quienes pidieron adelantar cita',
        ]},
        { type: 'p', text: 'Estos son minutos salientes que se pagan del pool mensual del empleado digital; suelen convertir mejor que cualquier campaña de marketing pagado.' },
      ],
    },
    {
      id: 'implementacion',
      heading: 'Pasos concretos de implementación (5 días)',
      blocks: [
        { type: 'ol', items: [
          '**Día 1**: contratación y captura de información básica del consultorio en el portal (servicios, precios, horarios, seguros).',
          '**Día 2**: conexión con Cal.com o Google Calendar y prueba de agendamiento.',
          '**Día 3**: primera semana en modo prueba con el número asignado por Centinelia. Se hacen llamadas de prueba.',
          '**Día 4**: se activa el desvío desde el número principal del consultorio en horario nocturno y fin de semana.',
          '**Día 5**: revisión de las primeras llamadas reales, ajuste de guion y aprobación de aprendizajes propuestos por el sistema.',
        ]},
        { type: 'p', text: 'Después del quinto día, el consultorio empieza a operar 24/7 sin costo laboral adicional. Los ajustes finos se hacen sobre la marcha, aprobando o rechazando aprendizajes desde el portal.' },
      ],
    },
  ],
  faq: [
    { q: '¿Los pacientes se van a molestar por hablar con una recepcionista digital?', a: 'La mayoría no la distingue de una humana. La voz de [ElevenLabs](/glosario/elevenlabs) es prácticamente idéntica a una persona real. Si el paciente pregunta directamente, el empleado digital lo reconoce con honestidad.' },
    { q: '¿Qué pasa si el paciente insiste en hablar con la doctora?', a: 'Se le pide su nombre y motivo, se le explica que la doctora le llamará en un rango de tiempo (que tú configuras) y queda como callback estructurado. En urgencias reales, se transfiere en vivo.' },
    { q: '¿Puede el empleado digital acceder al expediente clínico del paciente?', a: 'Por diseño, no. Su función es logística: agendar, informar, capturar contacto. La información clínica sensible se maneja fuera del alcance del sistema.' },
    { q: '¿Funciona con mi sistema actual de agenda (Nubimed, Dentical, Progrentis)?', a: 'Se integra con sistemas que expongan API o webhooks. Para sistemas legacy sin API, la agenda se maneja desde Cal.com o Google Calendar como capa intermedia.' },
    { q: '¿Cuánto cuesta al mes para una clínica dental típica?', a: 'El plan Esencial ($2,997 MXN mensuales) alcanza para un consultorio con volumen medio (250 minutos de voz al mes). Consultorios de alto volumen suelen elegir Profesional ($5,994 MXN) o Alta Demanda ($11,988 MXN).' },
  ],
  crossLinks: [
    { href: '/empleados/nia',              label: 'Nia, recepcionista digital',    desc: 'Capacidades específicas, integraciones y precios del rol de recepción.' },
    { href: '/industrias/clinicas',        label: 'Centinelia para clínicas',      desc: 'Página con testimonios, demo conversacional y casos por especialidad.' },
    { href: '/glosario/base-de-conocimiento', label: 'Base de conocimiento del negocio', desc: 'Cómo se estructura la información que el empleado digital usa para responder.' },
    { href: '/blog/recepcionista-humana-vs-empleado-digital-2026', label: 'Recepcionista humana vs digital', desc: 'Comparativa de costo y capacidad en pesos mexicanos.' },
  ],
  cta: {
    heading: 'Deja de perder pacientes por no contestar el teléfono',
    body:    'En menos de 24 horas Nia empieza a agendar tus pacientes 24/7. Sin contrato de permanencia.',
    button:  'Contratar Nia',
    href:    '/registro',
  },
};
