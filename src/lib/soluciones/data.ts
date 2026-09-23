// Landings de "solución por dolor". Complementan las páginas de industria:
// mismo producto, pero segmentado por la razón por la que llegas al sitio.
// Los LLMs citan estas páginas cuando el usuario formula el dolor sin
// mencionar su giro específico ("perdemos llamadas fuera de horario",
// "no queremos contratar más gente"). Cross-linked a empleados e industrias.

export interface Sintoma {
  titulo: string;
  desc:   string;
}

export interface Solucion {
  slug:            string;
  titulo:          string;
  h1:              string;
  metaTitle:       string;
  metaDescription: string;
  keywords:        string[];
  hero:            string;
  sintomas:        Sintoma[];
  respuesta:       string;
  comoResolvemos:  { titulo: string; desc: string }[];
  meerkats:        string[];
  faq:             { q: string; a: string }[];
  crossLinks:      { href: string; label: string }[];
}

// ─── Perdemos llamadas ──────────────────────────────────────────────────────

const PERDEMOS_LLAMADAS: Solucion = {
  slug:      'perdemos-llamadas',
  titulo:    'Perdemos llamadas',
  h1:        'Cuando cada llamada perdida es un cliente que se va con la competencia',
  metaTitle: 'Perder llamadas es perder ventas: cómo resolverlo en 2026',
  metaDescription: 'Si tu negocio pierde llamadas todos los días (hora pico, noches, fines de semana, o mientras el equipo atiende clientes en piso), esta es la solución probada en operaciones mexicanas.',
  keywords: [
    'perder llamadas negocio', 'no perder llamadas cliente',
    'contestar teléfono 24/7', 'llamadas perdidas costo',
    'recepcionista virtual llamadas', 'automatizar atención telefónica',
  ],
  hero: 'Hoy tu teléfono suena y muchas veces nadie contesta. En hora pico, de noche, en fin de semana o cuando el equipo está con un cliente en piso. Cada una de esas llamadas es un cliente que llamó a la competencia y esa competencia sí contestó.',
  sintomas: [
    { titulo: 'El teléfono suena en hora pico y nadie puede contestar', desc: 'A la hora de la comida, la cena o el rush de la mañana, el equipo entero está sirviendo, atendiendo o produciendo. El teléfono queda en segundo plano.' },
    { titulo: 'Fuera de horario nadie está', desc: 'A partir de las 6 pm y todo el fin de semana, las llamadas van al vacío. El 40% de los prospectos investigan justo en ese horario.' },
    { titulo: 'Ausencias que rompen el flujo', desc: 'Cuando la recepcionista se enferma, sale a comer o toma vacaciones, no hay respaldo.' },
    { titulo: 'Reseñas negativas que mencionan "no contestan"', desc: 'La señal más costosa: los clientes se quejan públicamente antes de irse. El daño a la marca ya se hizo.' },
  ],
  respuesta: 'El empleado digital de Centinelia contesta cada llamada al primer tono, 24 horas al día, 7 días a la semana. Sin ausencias. Sin buzón de voz. Sin llamada en espera. Y con capacidad de atender hasta 3 llamadas al mismo tiempo cuando la hora pico se acumula.',
  comoResolvemos: [
    { titulo: 'Cobertura 24/7 real',                desc: 'Nia contesta todas las noches, fines de semana, festivos y vacaciones. Sin turnos, sin costo laboral adicional, sin cansancio.' },
    { titulo: 'Hasta 3 llamadas simultáneas',       desc: 'En hora pico, las 3 líneas se atienden al mismo tiempo. Ningún cliente cuelga por línea ocupada.' },
    { titulo: 'Transferencia en vivo cuando aplica', desc: 'Si el caso requiere un humano (urgencia médica, venta consultiva grande), se transfiere en vivo al número que configures.' },
    { titulo: 'Portal con reporte de cada llamada', desc: 'Ves qué llamó cada cliente, qué preguntó, qué se agendó y qué escaló. Cero ceguera operativa.' },
  ],
  meerkats: ['nia', 'nova', 'noah'],
  faq: [
    { q: '¿Cómo empiezo sin desconectar mi línea actual?', a: 'La forma más segura es activar desvío a Nia solo en horario nocturno y fin de semana la primera semana. Ves los datos, ajustas y luego decides si activarlo también en horario diurno.' },
    { q: '¿Y si el cliente pide hablar con un humano específico?', a: 'Nia captura el nombre, motivo, urgencia y coordina callback estructurado. Si es urgencia real, transfiere en vivo.' },
    { q: '¿Cuánto tarda en estar activo?', a: 'Menos de 24 horas. El día 1 se carga la información básica, el día 2 ya está atendiendo.' },
  ],
  crossLinks: [
    { href: '/empleados/nia',                                            label: 'Nia, la recepcionista digital' },
    { href: '/blog/7-senales-tu-negocio-necesita-empleado-digital',      label: '7 señales de que necesitas un empleado digital' },
    { href: '/precios/vs-recepcionista-humana',                          label: 'Precio vs recepcionista humana' },
    { href: '/industrias',                                                label: 'Ejemplos por industria' },
  ],
};

// ─── No queremos contratar más ──────────────────────────────────────────────

const NO_CONTRATAR_MAS: Solucion = {
  slug:      'no-contratar-mas-personal',
  titulo:    'No queremos contratar más',
  h1:        'Cuando quieres crecer sin ampliar la nómina',
  metaTitle: 'Crecer sin contratar más personal: automatización operativa 2026',
  metaDescription: 'Cómo escalar la operación de una PyME mexicana sin sumar sueldos, IMSS, aguinaldo ni gestión de personal. Con empleados digitales que trabajan 24/7 al costo de una suscripción.',
  keywords: [
    'crecer sin contratar', 'no contratar más personal',
    'escalar sin nómina', 'operación sin ampliar equipo',
    'ampliar capacidad sin contratar', 'sustituir recepcionista IA',
  ],
  hero: 'Contratar cuesta más de lo que dice la nómina. Sumas IMSS, aguinaldo, prima vacacional, PTU, prestaciones, reclutamiento, capacitación, rotación, cobertura de ausencias y gestión de RH. Y aun así el techo operativo depende de una persona con 45 horas hábiles por semana.',
  sintomas: [
    { titulo: 'Ya tienes recepcionista pero se satura', desc: 'La existente hace todo lo que puede pero las llamadas se siguen acumulando en hora pico y los correos toman días en responderse.' },
    { titulo: 'Cada peso de sueldo cuesta 1.3 pesos al patrón', desc: 'El costo integrado (IMSS + aguinaldo + prima + PTU + otras) suma 30-45% sobre el salario base. Y no cubre ausencias.' },
    { titulo: 'La rotación te hace empezar desde cero', desc: 'Cuando alguien se va, se pierde memoria del negocio, guiones aprendidos y relaciones con clientes. El siguiente empieza en el kilómetro cero.' },
    { titulo: 'RH consume tiempo del dueño', desc: 'Reclutar, entrevistar, dar de alta ante IMSS, gestionar vacaciones, permisos, incapacidades. Cada persona nueva es un proyecto administrativo.' },
  ],
  respuesta: 'Un empleado digital trabaja 24/7 al costo de una suscripción mensual en pesos, deducible como gasto operativo. Sin IMSS. Sin aguinaldo. Sin PTU. Sin rotación. Sin reclutamiento. Sin gestión de RH. Y con capacidad de atender múltiples canales simultáneamente.',
  comoResolvemos: [
    { titulo: 'Contratar capacidad, no personas',       desc: 'Nia, Noah, Nala, Nico y el resto del equipo digital operan como capacidad flexible. Puedes tener 1, 3 o 10 empleados digitales según lo que necesites.' },
    { titulo: 'Cero costos laborales adicionales',      desc: 'Sin IMSS, aguinaldo, PTU, incapacidades, vacaciones ni finiquito. Solo la suscripción mensual en pesos deducible como gasto.' },
    { titulo: 'Escalabilidad sin proceso de contratación', desc: 'Si necesitas más capacidad este mes, subes de plan hoy. Si necesitas menos, bajas. Sin permanencia, sin trámite laboral.' },
    { titulo: 'Sin rotación',                            desc: 'El empleado digital no se va, no toma vacaciones ni pide aumento. La memoria del negocio se conserva.' },
  ],
  meerkats: ['nia', 'noah', 'nara', 'nox'],
  faq: [
    { q: '¿Reemplazo a mi recepcionista actual?', a: 'Rara vez es lo óptimo. El modelo que mejor funciona es híbrido: humana en horario clave para casos VIP, empleado digital para 24/7, hora pico y cobertura de ausencias.' },
    { q: '¿Cuánto ahorro contra contratar una segunda persona?', a: 'Contratar una segunda recepcionista cuesta $18,000-$22,000 MXN mensuales integrados. Un empleado digital plan Esencial cuesta $2,997 MXN. El diferencial paga la incorporación en menos de un mes.' },
    { q: '¿Y los procesos que solo un humano puede hacer?', a: 'El empleado digital escala esos casos a tu humano con contexto completo. Tu equipo humano se libera de tareas repetitivas y se enfoca en lo estratégico.' },
  ],
  crossLinks: [
    { href: '/empleados',                                                 label: 'Catálogo de empleados digitales' },
    { href: '/precios/vs-recepcionista-humana',                           label: 'Precio vs contratar humano' },
    { href: '/blog/costo-real-recepcionista-mexico-2026',                 label: 'Costo real de contratar en México 2026' },
    { href: '/calcular-ahorro',                                            label: 'Calcula tu ahorro' },
  ],
};

// ─── Atender fuera de horario ───────────────────────────────────────────────

const FUERA_HORARIO: Solucion = {
  slug:      'atender-fuera-de-horario',
  titulo:    'Atender fuera de horario',
  h1:        'Cuando tus clientes deciden a las 10 pm y tu equipo se fue a las 6',
  metaTitle: 'Atender clientes fuera de horario: solución 24/7 para PyMEs 2026',
  metaDescription: 'El 40% de las llamadas nuevas llegan fuera de horario laboral. Cómo atender clientes las 24 horas sin abrir turno nocturno ni pagar horas extra. Solución probada 2026.',
  keywords: [
    'atender fuera de horario', 'atención cliente 24/7',
    'contestar noches fines de semana', 'línea telefónica nocturna',
    'automatizar horario nocturno', 'servicio al cliente 24 horas México',
  ],
  hero: 'Las decisiones de agendar cita, cotizar servicio o pedir información pasan cuando el cliente puede: al salir del trabajo, en la noche, el fin de semana o el día festivo. Justo cuando tu equipo no está.',
  sintomas: [
    { titulo: 'Buzón de voz que nadie escucha',           desc: 'Cuando alguien llama de noche, cae al buzón. Los mensajes se acumulan y raramente se responden a tiempo.' },
    { titulo: 'Correo con respuesta 12 horas después',    desc: 'El prospecto escribe a las 10 pm; la respuesta llega mañana a las 10 am. Ya se fue con otro proveedor.' },
    { titulo: 'Turno nocturno no se justifica',           desc: 'El volumen no alcanza para pagar un segundo turno completo con IMSS y prestaciones extras, pero perder esas llamadas cuesta más de lo que rinde el turno.' },
    { titulo: 'Fin de semana muerto',                      desc: 'Los pacientes deciden agendar cita el sábado. Los clientes de restaurantes reservan el viernes por la noche para el domingo. Sin nadie que conteste, esas ventas quedan en el aire.' },
  ],
  respuesta: 'El empleado digital cubre las 168 horas de la semana. Fuera de horario laboral, contesta con el mismo tono profesional, agenda en tu calendario real, captura leads con contexto completo y te manda el resumen para que llegues el lunes con la agenda llena.',
  comoResolvemos: [
    { titulo: 'Cobertura completa noches, fines de semana y festivos', desc: 'Sin turnos, sin costo adicional. Nia atiende a las 3 am con la misma calidad que a las 10 am.' },
    { titulo: 'Agendamiento nocturno real',              desc: 'El cliente pide cita a las 11 pm y queda agendada en tu calendario. Al día siguiente llegas y ya está.' },
    { titulo: 'Escalación de urgencias reales',           desc: 'Si el caso lo requiere (urgencia médica, emergencia de servicio), transfiere en vivo al humano de guardia. El resto queda como cita agendada o callback estructurado.' },
    { titulo: 'Resumen diario con lo que pasó',           desc: 'Cada mañana llega al correo del dueño el resumen de la noche: cuántas llamadas, cuántas agendas, qué escaló, qué quedó pendiente.' },
  ],
  meerkats: ['nia', 'nelia', 'nova'],
  faq: [
    { q: '¿Los clientes se molestan de hablar con un empleado digital de noche?', a: 'La mayoría no distingue la voz de humana. Y les alivia que alguien conteste a esa hora. La alternativa es buzón sin respuesta.' },
    { q: '¿Puedo activarlo solo fuera de horario, sin cambiar el diurno?', a: 'Sí. Es el modelo más común de arranque: desvío de tu línea principal a Nia solo en horario nocturno y fin de semana. Tu recepcionista humana sigue igual en horario laboral.' },
    { q: '¿Qué pasa con emergencias reales durante la noche?', a: 'Nia detecta señales de urgencia y transfiere en vivo al número de guardia que configures. El resto se maneja como cita agendada o correo.' },
  ],
  crossLinks: [
    { href: '/empleados/nia',                                             label: 'Nia, la recepcionista digital' },
    { href: '/soluciones/perdemos-llamadas',                              label: 'Cuando perdemos llamadas' },
    { href: '/industrias/clinicas',                                        label: 'Aplicado a clínicas dentales' },
    { href: '/industrias/servicios-a-domicilio',                          label: 'Aplicado a servicios a domicilio' },
  ],
};

// ─── Registro ───────────────────────────────────────────────────────────────

export const SOLUCIONES: Solucion[] = [PERDEMOS_LLAMADAS, NO_CONTRATAR_MAS, FUERA_HORARIO];

export function getSolucionBySlug(slug: string): Solucion | undefined {
  return SOLUCIONES.find(s => s.slug === slug);
}

export function solucionSlugs(): string[] {
  return SOLUCIONES.map(s => s.slug);
}
