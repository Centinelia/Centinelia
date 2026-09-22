// Data de industrias long-tail para /industrias/[slug].
// Las 5 industrias core (clinicas, restaurantes, despachos, inmobiliarias,
// tiendas) tienen páginas custom con hero conversacional y quedan intocadas.
// Aquí curamos las 10 industrias adicionales con un template consistente.

import type { LucideIcon } from 'lucide-react';
import {
  Wrench,       // talleres
  Cat,          // veterinarias
  GraduationCap,// escuelas
  Dumbbell,     // gimnasios
  Scale,        // notarías
  Eye,          // ópticas
  Sparkles,     // spas
  HardHat,      // servicios a domicilio
  Baby,         // guarderías
  Car,          // concesionarias
} from 'lucide-react';

export interface Industry {
  slug:              string;
  titulo:            string;
  metaTitle:         string;
  metaDescription:   string;
  keywords:          string[];
  icon:              LucideIcon;
  color:             string;
  categoria:         string;
  heroHeadline:      string;
  heroHighlight:     string;
  heroSub:           string;
  intro:             string;
  problemas:         { titulo: string; desc: string }[];
  features:          string[];
  outboundCases:     { titulo: string; desc: string }[];
  meerkatsRelevantes: string[]; // slugs de src/lib/meerkats/data.ts
  faq:               { q: string; a: string }[];
}

// ─── Talleres mecánicos ─────────────────────────────────────────────────────

const TALLERES: Industry = {
  slug: 'talleres-mecanicos',
  titulo: 'Talleres mecánicos y refaccionarias',
  metaTitle: 'Empleado digital para talleres mecánicos y refaccionarias',
  metaDescription: 'Contesta llamadas, agenda servicios, cotiza refacciones y da seguimiento a reparaciones 24/7 sin descuidar el taller. Desde $2,997 al mes.',
  keywords: ['empleado digital taller mecánico', 'recepcionista virtual taller', 'agenda servicios automotrices IA', 'agente de voz refaccionaria', 'atención telefónica taller mecánico México'],
  icon: Wrench, color: '#F59E0B',
  categoria: 'Servicios automotrices',
  heroHeadline: 'Tu taller nunca más',
  heroHighlight: 'pierde un servicio',
  heroSub: 'Atiende llamadas, cotiza servicios, agenda entradas y coordina entrega de vehículos mientras el equipo tiene las manos ocupadas.',
  intro: 'Los talleres pierden clientes porque el mecánico no puede parar de trabajar para contestar el teléfono. El empleado digital de Centinelia contesta cada llamada, agenda servicios en el calendario, cotiza refacciones con la lista de precios cargada y avisa al cliente cuando su carro está listo.',
  problemas: [
    { titulo: 'Teléfono sin contestar mientras trabajas', desc: 'El cliente llama, nadie contesta porque el equipo está bajo el cofre. Ese cliente se va con el taller de la esquina.' },
    { titulo: 'Cotizaciones que consumen tiempo del mecánico', desc: 'Preguntas de precio y disponibilidad de refacciones interrumpen el trabajo real y no siempre cierran.' },
    { titulo: 'Servicios olvidados sin seguimiento', desc: 'Los clientes que dejaron su carro esperan sin novedades. Cuando finalmente llaman, ya perdiste la próxima venta.' },
  ],
  features: [
    'Agenda servicios y cambios de aceite en el calendario del taller',
    'Cotiza refacciones y mano de obra con la lista de precios cargada',
    'Confirma diagnóstico inicial con el cliente antes de comenzar',
    'Avisa al cliente cuando su carro está listo para recoger',
    'Recuerda revisiones periódicas y servicios preventivos',
    'Captura datos completos: placas, modelo, kilometraje, problema reportado',
    'Escala urgencias al maestro mecánico de guardia',
  ],
  outboundCases: [
    { titulo: 'Tu servicio está listo', desc: 'Cuando el carro sale de la bahía, el empleado llama al cliente para recogerlo. Nadie olvida el vehículo por dos días.' },
    { titulo: 'Cotización aprobada', desc: 'Después de diagnosticar, llama al cliente con el desglose y captura la autorización.' },
    { titulo: 'Servicio de temporada', desc: 'Antes de vacaciones o cambios de clima, contacta a clientes recurrentes con promoción de revisión.' },
    { titulo: 'Recordatorio de servicio preventivo', desc: 'A los 10,000 km del último servicio, recuerda al cliente que toca revisión.' },
  ],
  meerkatsRelevantes: ['nia', 'noah', 'nova'],
  faq: [
    { q: '¿Puede cotizar refacciones específicas?', a: 'Sí, si se le carga la lista de precios de refacciones frecuentes. Para refacciones raras, escala al comprador humano.' },
    { q: '¿Y si el cliente pide un diagnóstico por teléfono?', a: 'Captura los síntomas del vehículo, agenda la entrada al taller y aclara que el diagnóstico definitivo requiere revisión física.' },
    { q: '¿Se integra con mi sistema de administración de taller?', a: 'Sí, con sistemas con API. Para sistemas legacy sin API se hace importación de la lista de servicios.' },
    { q: '¿Maneja flotillas empresariales?', a: 'Sí. Captura el número económico, coordina con el responsable de la flota y factura al final del período.' },
    { q: '¿Puede tomar pagos por teléfono?', a: 'Sí, con Stripe u otro procesador. Envía link de pago después de aprobar cotización.' },
  ],
};

// ─── Veterinarias ────────────────────────────────────────────────────────────

const VETERINARIAS: Industry = {
  slug: 'veterinarias',
  titulo: 'Veterinarias y estéticas caninas',
  metaTitle: 'Empleado digital para veterinarias y estéticas caninas',
  metaDescription: 'Recepcionista virtual que agenda consultas, vacunas y baños 24/7, responde precios y captura casos urgentes. Desde $2,997 al mes.',
  keywords: ['recepcionista veterinaria IA', 'agenda vet automática', 'empleado digital clínica veterinaria', 'agente de voz estética canina', 'atención veterinaria 24/7'],
  icon: Cat, color: '#22C55E',
  categoria: 'Salud animal',
  heroHeadline: 'Tu clínica veterinaria nunca más',
  heroHighlight: 'pierde una consulta',
  heroSub: 'Agenda consultas, vacunas y baños, responde precios y captura urgencias mientras atiendes al paciente en la mesa.',
  intro: 'Las veterinarias reciben llamadas todo el día: consultas rutinarias, urgencias, servicios de estética, dudas sobre alimentación. Cuando el doctor está en cirugía o el equipo está bañando a un perro, nadie contesta. El empleado digital atiende cada llamada, agenda, responde precios y escala solo las urgencias reales.',
  problemas: [
    { titulo: 'Llamadas durante cirugía o consulta', desc: 'El doctor está operando, el equipo está en el consultorio, y nadie puede tomar el teléfono. El cliente llama a la siguiente veterinaria.' },
    { titulo: 'Preguntas repetitivas sobre precios', desc: 'Costo de consulta, vacunas, esterilización, baño y corte. Las mismas preguntas todo el día consumen tiempo del equipo.' },
    { titulo: 'Urgencias que llegan fuera de horario', desc: 'Los animales no se enferman en horario de oficina. Sin nadie que conteste a las 10pm, el cliente busca urgencias en otro lado.' },
  ],
  features: [
    'Agenda consultas, vacunas, baños y cirugías en el calendario',
    'Responde precios de servicios frecuentes',
    'Captura datos: nombre del dueño, mascota, especie, raza, edad, motivo',
    'Detecta urgencias y transfiere al veterinario de guardia',
    'Envía recordatorios de vacunación y desparasitación',
    'Recuerda pickup de mascotas hospitalizadas',
    'Coordina servicios de estética con el horario disponible',
  ],
  outboundCases: [
    { titulo: 'Recordatorio de vacuna', desc: 'Un mes antes de que venza la vacuna anual, el empleado llama al dueño para agendar.' },
    { titulo: 'Tu mascota está lista', desc: 'Cuando terminan la estética o el checkup, avisan al dueño para recoger.' },
    { titulo: 'Seguimiento post-cirugía', desc: '48 horas después de una operación, el empleado llama a verificar cómo va la recuperación.' },
    { titulo: 'Recordatorio de desparasitación', desc: 'Cada 3 o 6 meses según protocolo, recuerda la aplicación al dueño.' },
  ],
  meerkatsRelevantes: ['nia', 'nelia', 'nara'],
  faq: [
    { q: '¿Puede manejar urgencias?', a: 'Detecta señales de urgencia y transfiere en vivo al veterinario de guardia. Nunca deja al dueño esperando cuando la vida del animal está en riesgo.' },
    { q: '¿Y si el dueño pregunta si tal medicamento sirve para su mascota?', a: 'No da diagnósticos ni prescripciones. Captura la duda y agenda consulta con el veterinario.' },
    { q: '¿Puede coordinar servicios de estética con el resto de la clínica?', a: 'Sí. Se configura disponibilidad por servicio (baño, corte, spa) y agenda solo cuando el equipo tiene capacidad.' },
    { q: '¿Recuerda historiales de vacunación de pacientes recurrentes?', a: 'Sí, si le das acceso al sistema de expedientes. Al reconocer al cliente, retoma el historial.' },
    { q: '¿Funciona para veterinarias de grandes animales o solo pequeñas?', a: 'Ambas. Para grandes animales se enfoca más en coordinación de visitas a rancho o corral.' },
  ],
};

// ─── Escuelas privadas ──────────────────────────────────────────────────────

const ESCUELAS: Industry = {
  slug: 'escuelas',
  titulo: 'Escuelas privadas y academias',
  metaTitle: 'Empleado digital para escuelas privadas y academias',
  metaDescription: 'Recepcionista virtual que informa costos, agenda visitas, captura interesados en inscripción y responde preguntas de padres 24/7. Desde $2,997 al mes.',
  keywords: ['recepcionista escuela privada IA', 'agente de voz academia', 'atención telefónica escuela México', 'captación de alumnos IA', 'admisiones automatizadas'],
  icon: GraduationCap, color: '#3B82F6',
  categoria: 'Educación',
  heroHeadline: 'Tu escuela nunca más',
  heroHighlight: 'pierde un prospecto de inscripción',
  heroSub: 'Responde costos, colegiaturas y planes, agenda visitas a instalaciones y captura interesados 24/7 sin cargar más al equipo administrativo.',
  intro: 'Los padres investigan escuelas cuando pueden: en la noche, los fines de semana, entre trabajo y trabajo. Si nadie contesta, agendan una visita con la escuela de la competencia. El empleado digital responde costos, agenda visitas guiadas, captura los datos completos del prospecto y notifica al equipo de admisiones al día siguiente con leads calientes.',
  problemas: [
    { titulo: 'Preguntas repetitivas de colegiatura', desc: 'La secretaría responde el mismo detalle de costos, becas, uniformes y horarios docenas de veces por semana.' },
    { titulo: 'Prospectos que investigan fuera de horario', desc: 'El 60% de las decisiones de inscripción se investigan de noche o en fin de semana, cuando nadie contesta.' },
    { titulo: 'Padres con preguntas administrativas rutinarias', desc: 'Fechas de pago, calendario escolar, uniformes, extraescolares: consultas que consumen tiempo del área administrativa.' },
  ],
  features: [
    'Responde colegiaturas, inscripciones, becas y planes de pago',
    'Agenda visitas guiadas a las instalaciones',
    'Captura datos completos del prospecto: papás, hijo, grado, contacto',
    'Informa horarios, calendario y actividades extraescolares',
    'Responde requisitos de admisión y documentación',
    'Recuerda fechas de pago y eventos importantes a padres actuales',
    'Escala a coordinación académica cuando el caso lo requiere',
  ],
  outboundCases: [
    { titulo: 'Confirmar visita agendada', desc: 'Un día antes de la visita, confirma con los papás para reducir no-shows.' },
    { titulo: 'Seguimiento a prospecto', desc: 'A los 7 días de una visita sin cierre, retoma contacto con material adicional.' },
    { titulo: 'Recordatorio de pago', desc: 'Antes de fecha límite, recuerda a los padres el pago pendiente sin generar fricción.' },
    { titulo: 'Aviso de eventos escolares', desc: 'Convoca a juntas de padres, festivales o entregas de boletas.' },
  ],
  meerkatsRelevantes: ['nia', 'nara', 'nala'],
  faq: [
    { q: '¿Puede compartir información sensible como el precio real después de beca?', a: 'Sí, siempre que el negocio le proporcione las reglas de becas. Es más consistente que un humano.' },
    { q: '¿Cómo maneja la conversación con padres exigentes?', a: 'Con protocolo de-escalation. Reconoce la inquietud, ofrece opciones y escala si el padre lo pide.' },
    { q: '¿Se integra con mi sistema escolar (SEP, Progrentis, otros)?', a: 'Sí con sistemas con API. Para sistemas legacy se hace importación de listas.' },
    { q: '¿Puede tomar el pago de una inscripción por teléfono?', a: 'Sí. Envía link de pago Stripe con el monto correcto.' },
    { q: '¿Funciona para academias de idiomas o cursos particulares?', a: 'Perfecto. Ideal para academias con múltiples niveles y horarios simultáneos.' },
  ],
};

// ─── Gimnasios ──────────────────────────────────────────────────────────────

const GIMNASIOS: Industry = {
  slug: 'gimnasios',
  titulo: 'Gimnasios y estudios fitness',
  metaTitle: 'Empleado digital para gimnasios, boxes de crossfit y estudios de fitness',
  metaDescription: 'Contesta llamadas, informa costos y horarios, agenda pases de prueba y retiene socios en riesgo 24/7. Desde $2,997 al mes.',
  keywords: ['empleado digital gimnasio', 'agente de voz estudio fitness', 'atención telefónica gym', 'captación de socios IA', 'retención gym automatizada'],
  icon: Dumbbell, color: '#EF4444',
  categoria: 'Fitness',
  heroHeadline: 'Tu gimnasio nunca más',
  heroHighlight: 'pierde un socio nuevo',
  heroSub: 'Responde costos, horarios de clases, agenda pases de prueba y reactiva socios que dejaron de asistir, mientras el equipo se enfoca en atender el piso.',
  intro: 'Los gimnasios reciben cientos de llamadas de personas evaluando planes, pero el equipo está entrenando, dando clase o registrando entradas. Muchas ventas potenciales quedan sin contestar. El empleado digital responde costos y modalidades, agenda pases de prueba y hasta reactiva socios inactivos.',
  problemas: [
    { titulo: 'Prospectos comparando gimnasios llaman todo el día', desc: 'Preguntas repetidas de costos, horarios, planes familiares. Nadie del equipo tiene tiempo de responder todas.' },
    { titulo: 'Clases llenas sin lugar disponible', desc: 'Los socios llaman preguntando si hay cupo. Sin respuesta rápida, se pierden la clase o pierden la lealtad.' },
    { titulo: 'Socios que dejaron de venir se pierden en silencio', desc: 'Nadie tiene tiempo de llamar a los que dejaron de asistir. El churn crece sin que se detecte a tiempo.' },
  ],
  features: [
    'Responde planes, membresías, promociones y horarios de clases',
    'Agenda pases de prueba en el calendario',
    'Consulta disponibilidad en clases con cupo limitado',
    'Captura datos de prospectos con nivel de interés',
    'Reactiva socios inactivos con oferta personalizada',
    'Envía links de pago para renovación o nuevos socios',
    'Coordina reservas de clases especiales o personal training',
  ],
  outboundCases: [
    { titulo: 'Recordatorio de clase agendada', desc: 'Una hora antes de una clase, recuerda al socio para reducir no-shows en cupo limitado.' },
    { titulo: 'Renovación de membresía', desc: 'Antes del vencimiento, llama al socio para renovar y ofrecerle continuidad.' },
    { titulo: 'Reactivación de socios inactivos', desc: 'Después de 30 días sin visita, el empleado llama con oferta de vuelta.' },
    { titulo: 'Bienvenida al nuevo socio', desc: 'Al inscribirse, un empleado llama para agendar la evaluación inicial y presentar el gym.' },
  ],
  meerkatsRelevantes: ['nia', 'noah', 'nico'],
  faq: [
    { q: '¿Puede manejar múltiples ubicaciones?', a: 'Sí. Se configura información por sucursal y el empleado responde según la elegida por el cliente.' },
    { q: '¿Se integra con mi sistema de control de acceso o CRM de gym?', a: 'Con Mindbody, Perfect Gym, Trainerize y sistemas con API. Para propios se hace integración custom.' },
    { q: '¿Puede tomar la inscripción completa por teléfono?', a: 'Captura datos, envía link de pago y coordina primera evaluación. La firma del contrato final se hace por firma digital o presencial.' },
    { q: '¿Maneja clases de personal training con instructor específico?', a: 'Sí. Se le configura la agenda por instructor y agenda con el correcto según preferencia del socio.' },
    { q: '¿Puede vender productos como suplementos o merchandise?', a: 'Puede tomar el pedido y coordinar recolección o envío. El pago va por link de Stripe.' },
  ],
};

// ─── Notarías ───────────────────────────────────────────────────────────────

const NOTARIAS: Industry = {
  slug: 'notarias',
  titulo: 'Notarías públicas',
  metaTitle: 'Empleado digital para notarías públicas',
  metaDescription: 'Recepción para notarías que agenda citas, cotiza trámites y filtra consultas repetitivas 24/7 sin desviar al notario ni al equipo jurídico. Desde $2,997 al mes.',
  keywords: ['recepcionista notaría IA', 'agente de voz notaría pública', 'atención telefónica notaría', 'agenda notario', 'cotización trámites notariales'],
  icon: Scale, color: '#7C3AED',
  categoria: 'Servicios jurídicos',
  heroHeadline: 'Tu notaría nunca más',
  heroHighlight: 'pierde tiempo del notario',
  heroSub: 'Cotiza trámites, agenda firmas, responde requisitos y captura casos nuevos 24/7 sin distraer al notario ni al equipo jurídico.',
  intro: 'Las notarías reciben llamadas de gente que apenas está averiguando qué necesita para su escritura, poder o testamento. Explicar requisitos por décima vez desgasta al equipo jurídico. El empleado digital cotiza trámites frecuentes, agenda firmas y solo escala consultas que realmente requieren criterio notarial.',
  problemas: [
    { titulo: 'Llamadas de información básica que saturan la recepción', desc: 'Requisitos para escritura, tiempos, costos aproximados: preguntas repetitivas que ocupan al equipo.' },
    { titulo: 'Notario interrumpido para dudas rutinarias', desc: 'El notario se distrae de trabajo importante para responder preguntas que su recepción no puede resolver.' },
    { titulo: 'Consultas fuera de horario', desc: 'La gente decide trámites cuando puede: noches, fines de semana. Sin nadie que conteste, van con otra notaría.' },
  ],
  features: [
    'Cotiza trámites frecuentes: compraventa, poder, testamento, sociedad',
    'Explica requisitos y documentación necesaria',
    'Agenda firmas en el calendario del notario',
    'Captura datos completos del cliente y tipo de trámite',
    'Envía checklist de documentos al cliente por correo',
    'Recuerda al cliente los documentos pendientes antes de la firma',
    'Escala consultas complejas al notario o al equipo jurídico',
  ],
  outboundCases: [
    { titulo: 'Documentos pendientes antes de firma', desc: 'Días antes de la firma, el empleado le llama al cliente para verificar que tenga todo listo.' },
    { titulo: 'Recordatorio de firma', desc: 'Un día antes de la cita, confirma la firma para evitar reprogramaciones.' },
    { titulo: 'Cliente con trámite abandonado', desc: 'Si un trámite se estancó por documento faltante, el empleado retoma contacto.' },
    { titulo: 'Aviso de escritura lista para recoger', desc: 'Cuando la escritura sale, el empleado avisa al cliente para pasar por copia certificada.' },
  ],
  meerkatsRelevantes: ['nia', 'nara', 'nala'],
  faq: [
    { q: '¿Puede dar asesoría jurídica?', a: 'No. Explica trámites, requisitos y tiempos genéricos, pero la asesoría legal específica la da el notario.' },
    { q: '¿Cotiza exactamente o aproximado?', a: 'Cotiza aproximado con la lista de tarifas cargada. La cotización final la valida el equipo antes de la firma.' },
    { q: '¿Puede manejar información sensible del cliente?', a: 'Con cifrado y las restricciones que configures. Cumple con LFPDPPP.' },
    { q: '¿Y si el trámite requiere apostilla o traducción?', a: 'Captura la necesidad y coordina con el proveedor externo si lo tienes configurado.' },
    { q: '¿Funciona para notarías con varios titulares?', a: 'Sí. Se configura disponibilidad por notario y agenda con el correcto según especialidad o preferencia.' },
  ],
};

// ─── Ópticas ────────────────────────────────────────────────────────────────

const OPTICAS: Industry = {
  slug: 'opticas',
  titulo: 'Ópticas y clínicas oftalmológicas',
  metaTitle: 'Empleado digital para ópticas y clínicas oftalmológicas',
  metaDescription: 'Agenda exámenes de la vista, responde precios de armazones y lentes, coordina entrega y recuerda revisiones anuales 24/7. Desde $2,997 al mes.',
  keywords: ['recepcionista óptica IA', 'agenda examen de la vista', 'agente de voz oftalmología', 'atención telefónica óptica', 'entrega de lentes automatizada'],
  icon: Eye, color: '#06B6D4',
  categoria: 'Salud visual',
  heroHeadline: 'Tu óptica nunca más',
  heroHighlight: 'deja esperando a un cliente',
  heroSub: 'Agenda exámenes de la vista, responde precios de armazones y lentes, avisa cuando los lentes están listos y recuerda revisiones anuales.',
  intro: 'Las ópticas reciben llamadas para agendar examen de la vista, preguntar por marcas específicas, verificar si sus lentes están listos y renovar aros. El empleado digital atiende cada llamada al instante, agenda exámenes en el calendario del optometrista y avisa a cada cliente cuando sus lentes salieron del laboratorio.',
  problemas: [
    { titulo: 'Clientes preguntando si sus lentes ya llegaron', desc: 'Muchas llamadas al día para verificar si el pedido está listo. Cada consulta interrumpe al equipo de atención.' },
    { titulo: 'Prospectos comparando precios de armazones', desc: 'Consultas repetitivas de precios por marca. Sin nadie que conteste ágilmente, el prospecto compra en línea.' },
    { titulo: 'Pacientes que olvidan su revisión anual', desc: 'Sin recordatorio proactivo, muchos clientes no regresan al año como corresponde.' },
  ],
  features: [
    'Agenda exámenes de la vista con el optometrista',
    'Cotiza armazones y lentes por marca, material y armadura',
    'Consulta estatus de pedidos: si los lentes ya llegaron del laboratorio',
    'Toma pedidos de renovación de armazón con receta actual',
    'Recuerda revisiones anuales y control de graduación',
    'Coordina servicio de garantía y ajuste post-entrega',
    'Escala a oftalmólogo cuando hay síntomas fuera de rango',
  ],
  outboundCases: [
    { titulo: 'Tus lentes están listos', desc: 'Cuando los lentes salen del laboratorio, el empleado llama para recolección.' },
    { titulo: 'Revisión anual', desc: 'Un año después del último examen, recuerda al cliente que toca control.' },
    { titulo: 'Confirmación de cita de examen', desc: 'Un día antes, confirma la cita para reducir no-shows.' },
    { titulo: 'Cliente con lentes rotos', desc: 'Después de reportar un daño, el empleado da seguimiento hasta que se resuelve.' },
  ],
  meerkatsRelevantes: ['nia', 'nara', 'nala'],
  faq: [
    { q: '¿Puede responder si mi receta actual sirve para armazón nuevo?', a: 'Verifica la vigencia de la receta según el criterio configurado (típicamente 1 año). Fuera de vigencia, agenda revisión.' },
    { q: '¿Se conecta con mi laboratorio de tallado?', a: 'Con laboratorios que expongan API o webhooks. Para otros se importa el estatus manualmente.' },
    { q: '¿Puede tomar el pago del pedido?', a: 'Envía link de pago Stripe. El pago completo o anticipo, según configures.' },
    { q: '¿Y si el cliente pregunta por síntomas raros de vista?', a: 'No diagnostica. Agenda consulta con optometrista u oftalmólogo según severidad.' },
    { q: '¿Funciona con múltiples sucursales?', a: 'Sí. Se configura por sucursal, con inventario y agendas separadas.' },
  ],
};

// ─── Spas y estética ─────────────────────────────────────────────────────────

const SPAS: Industry = {
  slug: 'spas',
  titulo: 'Spas y clínicas de estética',
  metaTitle: 'Empleado digital para spas, salones y clínicas de estética',
  metaDescription: 'Agenda tratamientos, responde precios de servicios y paquetes, coordina esteticistas y captura leads 24/7. Desde $2,997 al mes.',
  keywords: ['recepcionista spa IA', 'agente de voz clínica estética', 'atención telefónica salón belleza', 'agenda tratamientos automatizada', 'agenda spa 24/7'],
  icon: Sparkles, color: '#EC4899',
  categoria: 'Estética y bienestar',
  heroHeadline: 'Tu spa nunca más',
  heroHighlight: 'pierde una cita por teléfono',
  heroSub: 'Agenda tratamientos, responde precios y paquetes, coordina esteticistas y hace seguimiento a clientes recurrentes 24/7.',
  intro: 'Los spas y clínicas de estética viven del calendario. Cada hueco vacío es dinero perdido. Cuando la recepcionista está atendiendo a un cliente presencial, las llamadas se pierden. El empleado digital contesta, agenda con el especialista correcto, informa promociones y hasta reactiva clientas que hace tiempo no visitan.',
  problemas: [
    { titulo: 'Recepción saturada en horas pico', desc: 'La recepcionista está cobrando, agendando y atendiendo dudas presenciales. El teléfono queda sin contestar.' },
    { titulo: 'Preguntas repetitivas sobre paquetes y promociones', desc: 'Precios de facial, botox, depilación láser, paquetes: consultas continuas que consumen tiempo.' },
    { titulo: 'Clientas frecuentes que dejan de venir sin razón', desc: 'Sin seguimiento proactivo, muchas clientas se pierden en silencio.' },
  ],
  features: [
    'Agenda tratamientos con el especialista correcto',
    'Responde precios, duraciones y paquetes con descuento',
    'Captura contraindicaciones y perfil de piel/salud del cliente',
    'Confirma citas del día siguiente para reducir cancelaciones',
    'Recuerda controles post-tratamiento',
    'Reactiva clientas inactivas con oferta personalizada',
    'Coordina primera consulta con médico si el tratamiento lo requiere',
  ],
  outboundCases: [
    { titulo: 'Confirmación de cita', desc: 'Un día antes de cada tratamiento, confirma con la clienta para evitar reprogramaciones.' },
    { titulo: 'Control post-tratamiento', desc: 'Después de un procedimiento importante, el empleado llama a verificar cómo va la recuperación.' },
    { titulo: 'Cumpleaños con regalo', desc: 'En su cumpleaños, la clienta recibe llamada con obsequio o descuento.' },
    { titulo: 'Reactivación de clienta inactiva', desc: 'A los 3 meses sin visita, ofrece promoción para regresar.' },
  ],
  meerkatsRelevantes: ['nia', 'nelia', 'nico'],
  faq: [
    { q: '¿Puede responder si un tratamiento sirve para mi caso?', a: 'Explica el tratamiento y sus indicaciones. Para casos específicos, agenda consulta con el médico o especialista.' },
    { q: '¿Coordina múltiples cabinas y especialistas?', a: 'Sí. Se le configura disponibilidad por cabina y por especialista.' },
    { q: '¿Puede vender paquetes con anticipo?', a: 'Sí. Envía link de pago Stripe con el monto configurado.' },
    { q: '¿Maneja contraindicaciones?', a: 'Captura embarazo, tratamientos previos y medicamentos. Si detecta contraindicación, agenda consulta médica antes del tratamiento.' },
    { q: '¿Funciona para clínicas dermatológicas más médicas?', a: 'Sí. Aplica el mismo criterio de recepción y agenda, con más peso a la parte de historial y consulta médica.' },
  ],
};

// ─── Servicios a domicilio ──────────────────────────────────────────────────

const SERVICIOS: Industry = {
  slug: 'servicios-a-domicilio',
  titulo: 'Servicios a domicilio: plomeros, electricistas, técnicos',
  metaTitle: 'Empleado digital para plomeros, electricistas y servicios a domicilio',
  metaDescription: 'Contesta emergencias 24/7, agenda visitas, cotiza reparaciones básicas y despacha al técnico correcto. Desde $2,997 al mes.',
  keywords: ['empleado digital plomero', 'agente de voz electricista', 'atención emergencias hogar', 'despacho técnicos domicilio', 'servicio a domicilio IA'],
  icon: HardHat, color: '#EA580C',
  categoria: 'Servicios técnicos',
  heroHeadline: 'Tu operación de servicios nunca más',
  heroHighlight: 'pierde una emergencia',
  heroSub: 'Contesta 24/7, agenda visitas, califica emergencias, despacha al técnico correcto y cotiza reparaciones básicas.',
  intro: 'Plomeros, electricistas, técnicos de aires acondicionados y todo tipo de servicio a domicilio dependen del teléfono. Los clientes llaman en emergencia, muchas veces fuera de horario. Sin nadie que conteste, llaman al siguiente en Google. El empleado digital contesta cada llamada, califica urgencia, agenda al técnico disponible y hasta cotiza reparaciones básicas.',
  problemas: [
    { titulo: 'Emergencias nocturnas sin respuesta', desc: 'Fuga de agua a las 2am, apagón en fin de semana: el cliente busca hasta encontrar quien conteste, y ese cierra la venta.' },
    { titulo: 'Técnico interrumpido con llamadas de nuevos clientes', desc: 'El técnico está trabajando y no puede contestar cada llamada nueva. Muchas se pierden en el correo de voz.' },
    { titulo: 'Coordinación caótica de visitas', desc: 'Anotar direcciones y teléfonos en un cuaderno mientras se maneja lleva a errores y retrasos.' },
  ],
  features: [
    'Contesta 24/7 incluidas emergencias nocturnas y fines de semana',
    'Califica urgencia y agenda visita con el técnico disponible',
    'Cotiza reparaciones básicas y visitas de diagnóstico',
    'Captura dirección completa, problema reportado y datos de contacto',
    'Envía ETA al cliente cuando el técnico está en camino',
    'Coordina múltiples cuadrillas por zona geográfica',
    'Cierra caso con reporte y evidencia fotográfica del técnico',
  ],
  outboundCases: [
    { titulo: 'Confirmación de visita', desc: 'Antes de la visita programada, confirma con el cliente para evitar viajes en vano.' },
    { titulo: 'Retraso del técnico', desc: 'Si el técnico va retrasado, el empleado llama al cliente con nueva ETA.' },
    { titulo: 'Seguimiento post-servicio', desc: 'Un día después de la reparación, verifica que todo esté funcionando.' },
    { titulo: 'Servicio de mantenimiento anual', desc: 'Recuerda al cliente cuando toca revisión preventiva.' },
  ],
  meerkatsRelevantes: ['nia', 'nova', 'nara'],
  faq: [
    { q: '¿Cómo maneja emergencias reales?', a: 'Se le configura qué palabras o síntomas activan emergencia. En esos casos, transfiere en vivo al técnico de guardia.' },
    { q: '¿Puede optimizar rutas de los técnicos?', a: 'Con integración de mapas, agenda considerando ubicación y tiempo estimado entre visitas.' },
    { q: '¿Se integra con mi sistema de despacho actual?', a: 'Con sistemas con API. Para propios sin API se hace importación de agendas.' },
    { q: '¿Cotiza reparaciones exactas por teléfono?', a: 'Cotiza rangos aproximados y visita de diagnóstico. La cotización final la da el técnico en sitio.' },
    { q: '¿Puede tomar el pago del servicio?', a: 'Envía link de pago Stripe. El cliente paga anticipo, o el total cuando el técnico confirma que terminó.' },
  ],
};

// ─── Guarderías ─────────────────────────────────────────────────────────────

const GUARDERIAS: Industry = {
  slug: 'guarderias',
  titulo: 'Guarderías y estancias infantiles',
  metaTitle: 'Empleado digital para guarderías y estancias infantiles',
  metaDescription: 'Recepcionista virtual para guarderías: agenda visitas de padres interesados, responde costos, horarios y protocolos, 24/7. Desde $2,997 al mes.',
  keywords: ['recepcionista guardería IA', 'agente de voz estancia infantil', 'atención telefónica guardería', 'agenda visitas guardería', 'admisión estancia infantil'],
  icon: Baby, color: '#F97316',
  categoria: 'Cuidado infantil',
  heroHeadline: 'Tu guardería nunca más',
  heroHighlight: 'pierde a un padre interesado',
  heroSub: 'Responde costos, protocolos, horarios y agenda visitas guiadas para padres interesados 24/7 mientras el equipo se enfoca en los niños.',
  intro: 'Los padres que buscan guardería llaman con muchas preguntas: costos, edad de ingreso, protocolo de comidas, protocolo de sueño, cámaras, higiene. La coordinadora está enseñando o cambiando pañales. El empleado digital contesta cada llamada, responde con la información cargada y agenda visitas.',
  problemas: [
    { titulo: 'Papás con dudas llaman en cualquier momento', desc: 'La decisión de dejar a un hijo en guardería no espera al horario de oficina. Muchas llamadas llegan de noche.' },
    { titulo: 'Preguntas repetitivas sobre protocolos', desc: 'Alimentación, siestas, actividades, cámaras: preguntas continuas que la coordinadora no siempre puede atender.' },
    { titulo: 'Visitas guiadas sin agendar', desc: 'Los papás quieren visitar antes de decidir. Sin agenda ágil, muchos se van con la competencia.' },
  ],
  features: [
    'Responde costos, protocolos y edades de ingreso',
    'Agenda visitas guiadas con la coordinadora',
    'Explica procedimientos de emergencia y seguridad',
    'Captura datos completos del niño y los papás',
    'Informa horarios de entrada, salida y actividades',
    'Recuerda pagos de mensualidad',
    'Escala a coordinación en casos especiales',
  ],
  outboundCases: [
    { titulo: 'Recordatorio de visita', desc: 'Un día antes de la visita agendada, confirma con los papás.' },
    { titulo: 'Seguimiento a papás interesados', desc: 'A los 7 días de una visita sin cierre, retoma contacto con material y disponibilidad actualizada.' },
    { titulo: 'Recordatorio de pago mensual', desc: 'Antes del vencimiento, recuerda a los papás el pago pendiente.' },
    { titulo: 'Aviso de eventos y festivales', desc: 'Convoca a padres para eventos, muestras o juntas informativas.' },
  ],
  meerkatsRelevantes: ['nia', 'nara', 'nala'],
  faq: [
    { q: '¿Y si hay una emergencia con un niño?', a: 'Las emergencias con niños internos se manejan directamente por el equipo humano en piso. El empleado digital atiende llamadas externas.' },
    { q: '¿Se conecta con mi sistema de administración?', a: 'Con sistemas con API. Para propios sin API se hace importación de datos de niños y agendas.' },
    { q: '¿Puede tomar el pago de una inscripción?', a: 'Sí. Envía link de pago Stripe con el monto correcto.' },
    { q: '¿Y si el papá quiere hablar directo con la coordinadora?', a: 'Toma nota y coordina un callback. La coordinadora recibe la llamada con el contexto ya capturado.' },
    { q: '¿Funciona para estancias privadas y para las subsidiadas del gobierno?', a: 'Ambas. En estancias subsidiadas se acomoda al criterio de la SEDESOL o Bienestar según aplique.' },
  ],
};

// ─── Concesionarias ─────────────────────────────────────────────────────────

const CONCESIONARIAS: Industry = {
  slug: 'concesionarias',
  titulo: 'Concesionarias y agencias de autos',
  metaTitle: 'Empleado digital para concesionarias y agencias de autos',
  metaDescription: 'Atiende leads de venta, agenda test drives, cotiza autos y da seguimiento post-venta y de servicio 24/7. Desde $2,997 al mes.',
  keywords: ['recepcionista concesionaria IA', 'agente de voz agencia autos', 'test drive automatizado', 'seguimiento venta automotriz', 'atención agencia autos'],
  icon: Car, color: '#0EA5E9',
  categoria: 'Automotriz',
  heroHeadline: 'Tu agencia nunca más',
  heroHighlight: 'pierde un lead caliente',
  heroSub: 'Atiende cada llamada de prospecto, agenda test drives, cotiza autos con la lista de precios cargada y da seguimiento post-venta.',
  intro: 'Las agencias de autos gastan miles en publicidad para generar leads que muchas veces se pierden por falta de respuesta rápida. Cuando el vendedor está con otro cliente, la llamada nueva queda sin atender. El empleado digital contesta al instante, califica y agenda test drives al vendedor correcto.',
  problemas: [
    { titulo: 'Leads de publicidad que llaman y no encuentran a nadie', desc: 'Pagaste el clic o el impresión. El prospecto llama y nadie contesta. El lead se convierte en gasto perdido.' },
    { titulo: 'Vendedor ocupado con otro cliente', desc: 'El vendedor está en test drive o cerrando una venta. Las llamadas nuevas caen al correo de voz.' },
    { titulo: 'Post-venta y servicio saturan la línea', desc: 'Clientes preguntando por servicios, refacciones o citas de taller mezclados con leads de venta nueva.' },
  ],
  features: [
    'Contesta cada lead de venta al instante y califica',
    'Cotiza modelos con la lista de precios y equipamientos',
    'Agenda test drives con el vendedor correcto',
    'Separa llamadas de venta, servicio y refacciones',
    'Captura datos completos del prospecto: presupuesto, modelo, uso',
    'Recuerda mantenimientos y servicios preventivos',
    'Reactiva prospectos que no cerraron con oferta',
  ],
  outboundCases: [
    { titulo: 'Confirmación de test drive', desc: 'Un día antes, confirma para reducir no-shows.' },
    { titulo: 'Seguimiento a prospecto sin cierre', desc: 'A los 7 días, retoma contacto con actualización de disponibilidad o promociones.' },
    { titulo: 'Recordatorio de servicio', desc: 'Cada 10,000 km o 6 meses, según protocolo, recuerda al cliente que toca servicio.' },
    { titulo: 'Aviso de auto listo', desc: 'Cuando el servicio o entrega está listo, avisa al cliente.' },
  ],
  meerkatsRelevantes: ['nia', 'noah', 'nova'],
  faq: [
    { q: '¿Puede cotizar autos con financiamiento?', a: 'Sí. Con la calculadora de plan cargada, cotiza mensualidad estimada por enganche y plazo.' },
    { q: '¿Se integra con mi CRM automotriz?', a: 'Con CDK, Reynolds, Autofact, Kavak Business y otros con API. Para propios se hace integración custom.' },
    { q: '¿Distingue entre lead de venta y cliente de servicio?', a: 'Sí. Con las preguntas iniciales identifica el motivo y despacha al equipo correcto.' },
    { q: '¿Puede coordinar entrega de auto vendido?', a: 'Sí. Agenda la entrega, recuerda documentos pendientes y confirma placas y seguro.' },
    { q: '¿Funciona con seminuevos y multimarca?', a: 'Sí. Se le carga el inventario y responde con lo disponible.' },
  ],
};

// ─── Registro central ────────────────────────────────────────────────────────

export const INDUSTRIES: Industry[] = [
  TALLERES,
  VETERINARIAS,
  ESCUELAS,
  GIMNASIOS,
  NOTARIAS,
  OPTICAS,
  SPAS,
  SERVICIOS,
  GUARDERIAS,
  CONCESIONARIAS,
];

export function getIndustryBySlug(slug: string): Industry | undefined {
  return INDUSTRIES.find(i => i.slug === slug);
}

export function industrySlugs(): string[] {
  return INDUSTRIES.map(i => i.slug);
}
