// Data del roster de 13 empleados digitales de Centinelia.
// Cada entry alimenta:
//   - /empleados/[slug] (páginas individuales)
//   - /llms-full.txt (sección de roster expandida)
//   - /empleados (hub, para linkear)
// Un solo source of truth para roles: si un rol cambia, se cambia aquí y
// se propaga a todas las superficies.

export interface Meerkat {
  slug:            string;
  nombre:          string;
  rol:             string;
  categoria:       'operacion' | 'direccion';
  tagline:         string;
  color:           string;
  image:           string;
  descCorta:       string;
  descLarga:       string;
  capacidades:     string[];
  casosUso:        { titulo: string; desc: string }[];
  herramientas:    string[];
  vsHumano:        { titulo: string; desc: string }[];
  faq:             { q: string; a: string }[];
  keywords:        string[];
}

// ─── Roster ─────────────────────────────────────────────────────────────────

const NOX: Meerkat = {
  slug: 'nox', nombre: 'Nox', rol: 'Dirección de Operaciones', categoria: 'direccion',
  tagline: 'Encuentra orden donde otros ven caos.',
  color: '#6C3BFF', image: '/meerkats/nox.png',
  descCorta: 'Coordina al equipo digital, distribuye trabajo y supervisa que cada empleado esté cumpliendo su parte.',
  descLarga: 'Nox es el director digital que mantiene sincronizado a todo tu equipo de empleados. Distribuye tareas entre los otros empleados según su especialidad y disponibilidad, supervisa el trabajo terminado, detecta cuellos de botella y le reporta al dueño lo que necesita su atención. No atiende llamadas directamente, coordina.',
  capacidades: [
    'Distribuye trabajo entre los empleados digitales según capacidad y prioridad',
    'Supervisa métricas de cada empleado (llamadas atendidas, tareas cerradas, calidad de respuesta)',
    'Detecta cuellos de botella antes de que afecten al cliente',
    'Escala al dueño solo lo que requiere decisión humana',
    'Revisa transcripciones y aprendizajes propuestos por otros empleados',
    'Genera reporte diario ejecutivo con lo relevante',
    'Reasigna tareas cuando un canal se satura',
  ],
  casosUso: [
    { titulo: 'Reasignar picos de llamadas',      desc: 'Cuando Nia se satura en hora pico, Nox redirige llamadas de baja urgencia hacia el correo para que Nia solo atienda las urgentes.' },
    { titulo: 'Aprobar aprendizajes en lote',     desc: 'Revisa los aprendizajes propuestos por otros empleados y agrupa los que requieren decisión del dueño.' },
    { titulo: 'Alertar sobre incidencias',        desc: 'Detecta caídas de tasa de éxito o clientes molestos y notifica al dueño de inmediato.' },
    { titulo: 'Reporte ejecutivo diario',         desc: 'Cada mañana entrega al dueño un resumen: qué se cerró, qué está pendiente, qué necesita atención.' },
    { titulo: 'Coordinar procesos multi-empleado', desc: 'Cuando llega una venta cerrada por Noah, Nox coordina que Nala facture, Nico cobre y Nara dé seguimiento.' },
  ],
  herramientas: [
    'Portal Centinelia (dashboard de métricas)',
    'Todos los canales de correo del equipo',
    'Notion (KB del negocio)',
    'Reportes automatizados semanales',
    'Sistema de alertas al dueño',
  ],
  vsHumano: [
    { titulo: 'Coordina 24/7',                   desc: 'Un gerente de operaciones humano descansa. Nox no. Supervisa turnos nocturnos, fines de semana y festivos.' },
    { titulo: 'Cero política interna',           desc: 'Distribuye trabajo por lógica, no por preferencias ni fricciones humanas.' },
    { titulo: 'Reporte objetivo',                desc: 'No reporta selectivo para verse mejor. Los datos que llegan al dueño son los reales.' },
  ],
  faq: [
    { q: '¿Nox atiende llamadas?',                                            a: 'No. Nox es coordinador: no habla con clientes finales, distribuye trabajo entre los empleados que sí lo hacen.' },
    { q: '¿Necesito a Nox si contrato un solo empleado digital?',            a: 'No. Nox tiene sentido cuando tienes tres o más empleados digitales trabajando juntos. Con uno solo, no hay nada que coordinar.' },
    { q: '¿Nox toma decisiones sin consultarme?',                             a: 'Solo las operativas: reasignar trabajo, aprobar respuestas dentro de plantilla, agrupar aprendizajes rutinarios. Las decisiones que requieren criterio del dueño se escalan.' },
    { q: '¿Cuál es la diferencia entre Nox y Niva?',                          a: 'Nox está enfocado en operación día a día. Niva mira la dirección a mediano plazo: qué está aprendiendo el equipo, dónde hay que ajustar el prompt, qué procesos rediseñar.' },
    { q: '¿En qué tier viene Nox?',                                           a: 'Como coordinador, Nox opera en modo tareas-only. Los tiers son Esencial (500 tareas), Profesional (1,200) y Alta Demanda (3,000).' },
  ],
  keywords: ['director digital', 'gerente operaciones IA', 'coordinador equipo automatizado', 'supervisor de empleados digitales'],
};

const NIVA: Meerkat = {
  slug: 'niva', nombre: 'Niva', rol: 'Dirección Estratégica', categoria: 'direccion',
  tagline: 'Ve el patrón que el resto no ve todavía.',
  color: '#6C3BFF', image: '/meerkats/niva.png',
  descCorta: 'Analiza qué está aprendiendo el equipo, sugiere ajustes al prompt maestro y propone nuevos procesos al dueño.',
  descLarga: 'Niva es la contraparte estratégica de Nox. Mientras Nox coordina la operación día a día, Niva mira el patrón: qué preguntas se repiten, dónde falla el equipo, qué procesos habría que rediseñar. Propone mejoras al dueño con evidencia de las transcripciones acumuladas.',
  capacidades: [
    'Detecta patrones en las conversaciones (temas recurrentes, quejas repetidas)',
    'Propone ajustes al prompt maestro con evidencia',
    'Identifica procesos manuales que se podrían automatizar',
    'Revisa la calidad de las respuestas de los otros empleados',
    'Genera reportes trimestrales de aprendizaje',
    'Compara desempeño entre empleados',
    'Sugiere entrenamiento adicional cuando un rol se está quedando corto',
  ],
  casosUso: [
    { titulo: 'Detectar preguntas frecuentes no cubiertas', desc: 'Si Nia responde 40 veces al mes que no tiene la información, Niva propone ampliar la base de conocimiento.' },
    { titulo: 'Rediseñar procesos con datos',              desc: 'Cuando 3 de cada 10 llamadas terminan en transferencia manual, Niva analiza por qué y sugiere el proceso corregido.' },
    { titulo: 'Auditar calidad',                            desc: 'Revisa muestras aleatorias de transcripciones y flagea respuestas que podrían mejorar.' },
    { titulo: 'Preparar cambios de temporada',              desc: 'Antes de temporadas altas o cierres fiscales, propone ajustes preventivos.' },
    { titulo: 'Alinear con nuevos productos o servicios',   desc: 'Cuando el negocio agrega servicios, Niva revisa qué empleado debe conocer qué información.' },
  ],
  herramientas: [
    'Portal Centinelia (analítica agregada)',
    'Notion (KB para propuestas de cambio)',
    'Base histórica de transcripciones',
    'Reportes trimestrales',
    'Sistema de aprendizajes con aprobación humana',
  ],
  vsHumano: [
    { titulo: 'Lee 100% de las conversaciones', desc: 'Un director humano lee muestras. Niva analiza todo.' },
    { titulo: 'Análisis sin sesgo político',    desc: 'No favorece a nadie del equipo porque no hay política interna.' },
    { titulo: 'Cambios propuestos con evidencia', desc: 'Cada sugerencia trae los ejemplos concretos que la soportan.' },
  ],
  faq: [
    { q: '¿Niva puede tomar decisiones estratégicas por mí?', a: 'No. Niva propone; el dueño decide. Las propuestas vienen con evidencia para que la decisión sea rápida.' },
    { q: '¿En qué se diferencia Niva de Nox?',                a: 'Nox opera. Niva analiza. Nox: "hay que reasignar esta llamada". Niva: "el proceso completo debería cambiar".' },
    { q: '¿Cuánto contenido histórico necesita Niva para funcionar?', a: 'Con dos semanas de operación ya empieza a detectar patrones útiles. A partir del mes se vuelve especialmente valiosa.' },
    { q: '¿Niva puede coexistir con un gerente humano?',      a: 'Sí. Niva le entrega al gerente el análisis ya digerido para que su tiempo se enfoque en decidir y comunicar.' },
    { q: '¿Los reportes de Niva son en español?',             a: 'Sí. Todo el reporting es en español mexicano.' },
  ],
  keywords: ['director estratégico digital', 'análisis de conversaciones IA', 'auditoría de equipo automatizado', 'mejora continua empleados digitales'],
};

const NIA: Meerkat = {
  slug: 'nia', nombre: 'Nia', rol: 'Recepción', categoria: 'operacion',
  tagline: 'Nunca se le escapa un dato.',
  color: '#6C3BFF', image: '/meerkats/nia.png',
  descCorta: 'Recepcionista digital que contesta llamadas, agenda citas y captura leads las 24 horas del día.',
  descLarga: 'Nia es la recepcionista digital de Centinelia. Contesta cada llamada entrante en menos de dos tonos, agenda citas consultando el calendario en tiempo real, responde preguntas frecuentes con la información cargada en el portal y captura los datos completos de cada prospecto. Trabaja las 24 horas del día, todos los días, en español mexicano nativo.',
  capacidades: [
    'Contesta llamadas entrantes 24/7 sin llamadas en espera',
    'Agenda, modifica y cancela citas en Cal.com, Google Calendar o Calendly',
    'Responde preguntas frecuentes de precios, servicios, horarios y ubicación',
    'Captura leads completos: nombre, teléfono, motivo, urgencia, contexto',
    'Transfiere en vivo cuando el caso lo requiere',
    'Envía correos de confirmación y recordatorios automáticos',
    'Detecta urgencias y las escala al humano de guardia',
  ],
  casosUso: [
    { titulo: 'Agendar citas fuera de horario',       desc: 'El paciente llama a las 10pm y Nia agenda para la mañana siguiente sin que nadie se pierda esa venta.' },
    { titulo: 'Atender picos en hora pico',            desc: 'Mientras la recepcionista humana está con un cliente en persona, Nia contesta las tres llamadas que entran simultáneamente.' },
    { titulo: 'Filtrar leads calificados',             desc: 'Antes de agendar, Nia hace las preguntas de calificación que le indiques.' },
    { titulo: 'Transferir emergencias',                desc: 'Si detecta urgencia, transfiere en vivo al número del doctor o abogado de guardia.' },
    { titulo: 'Capturar leads que iban a colgar',      desc: 'Si el cliente prefiere no agendar en el momento, Nia toma sus datos para que el equipo llame al día siguiente.' },
  ],
  herramientas: [
    'Cal.com (agendamiento en tiempo real)',
    'Google Calendar y Calendly',
    'Base de conocimiento del negocio',
    'Portal de leads con notificaciones al correo',
    'Transferencia telefónica a números configurables',
    'SMTP para confirmaciones automáticas',
  ],
  vsHumano: [
    { titulo: 'Contesta al primer tono',              desc: 'Sin llamadas en espera. Ningún prospecto se va porque nadie contestó.' },
    { titulo: 'Trabaja 24/7',                          desc: 'Fin de semana y noches también. Cada lead se atiende cuando el cliente quiere.' },
    { titulo: 'Sin ausencias',                         desc: 'Sin vacaciones, incapacidades, permisos ni rotación.' },
    { titulo: 'Múltiples llamadas simultáneas',        desc: 'Puede atender tres llamadas al mismo tiempo, algo que un humano no puede.' },
  ],
  faq: [
    { q: '¿Nia puede manejar cancelaciones y reagendar?',        a: 'Sí. Acepta cancelaciones y ofrece reagendar en el momento. El dueño recibe notificación con el hueco liberado.' },
    { q: '¿Puede trabajar con varios doctores o servicios?',     a: 'Sí. Se configura disponibilidad por doctor, por servicio o por sucursal. Consulta el calendario en tiempo real y solo ofrece horarios disponibles.' },
    { q: '¿Y si el cliente pregunta algo que Nia no sabe?',      a: 'Lo dice con honestidad y ofrece tomar los datos para que el equipo humano llame de regreso. Nunca inventa.' },
    { q: '¿Cuánto tarda en aprender los servicios del negocio?', a: 'Menos de 24 horas. Se carga la información en el portal y arranca.' },
    { q: '¿Nia puede tomar pedidos por teléfono?',               a: 'Puede tomar pedidos simples. Para pedidos con muchos modificadores conviene contratar también un empleado con jornada de mayor volumen.' },
  ],
  keywords: ['recepcionista virtual', 'recepcionista IA', 'agenda citas automática', 'atención telefónica automatizada', 'contestador inteligente'],
};

const NOAH: Meerkat = {
  slug: 'noah', nombre: 'Noah', rol: 'Ventas', categoria: 'operacion',
  tagline: 'Siempre al teléfono, siempre cerrando.',
  color: '#22c55e', image: '/meerkats/noah.png',
  descCorta: 'Vendedor digital que llama prospectos, califica leads y cierra oportunidades sin descanso.',
  descLarga: 'Noah es el vendedor digital que hace lo que ningún vendedor humano quiere hacer: llamar cientos de prospectos fríos con la misma energía en la llamada uno que en la llamada cien. Califica según el perfil ideal del cliente, agenda demos con los mejores y le entrega al equipo humano solo las oportunidades más calientes.',
  capacidades: [
    'Llama prospectos en frío con guion adaptativo',
    'Califica según criterios configurables (BANT, presupuesto, decisor, timing)',
    'Agenda demos o siguientes pasos directo en el calendario del vendedor',
    'Reintenta llamadas no contestadas con cadencia inteligente',
    'Actualiza CRM con el resultado de cada llamada',
    'Detecta objeciones repetidas y las reporta a Niva',
    'Manda correo de seguimiento después de cada llamada',
  ],
  casosUso: [
    { titulo: 'Prospección saliente masiva',      desc: 'Se le carga la lista de prospectos y Noah trabaja hasta cerrar la llamada con cada uno.' },
    { titulo: 'Confirmar demos agendadas',        desc: 'Un día antes, Noah confirma la demo. Menos no-shows, más cierres.' },
    { titulo: 'Reactivar leads fríos',            desc: 'Cada 60 días, Noah retoma contacto con leads que no cerraron. Muchos cierres llegan en el segundo intento.' },
    { titulo: 'Recuperar carritos abandonados',   desc: 'Si tu ecommerce integra, Noah llama a quienes abandonaron carrito con oferta o resolución de duda.' },
    { titulo: 'Verificar y calificar leads web',  desc: 'Cuando entra un lead por formulario, Noah llama en menos de 5 minutos para calificar y agendar.' },
  ],
  herramientas: [
    'CRM (HubSpot, Salesforce, Pipedrive)',
    'Cal.com (agenda del vendedor humano)',
    'SMTP para correos de seguimiento',
    'Base de conocimiento del producto',
    'Listas de prospección importadas',
    'Cadencia configurable de reintentos',
  ],
  vsHumano: [
    { titulo: 'Escala infinita en volumen',       desc: 'Un vendedor humano hace 40 llamadas al día. Noah hace 500 sin bajar energía.' },
    { titulo: 'Guion consistente',                 desc: 'Nunca improvisa fuera del guion, nunca se olvida de mencionar el descuento actual.' },
    { titulo: 'Cero excusas',                      desc: 'No se acobarda antes del rechazo, no evita llamadas difíciles.' },
    { titulo: 'Registra 100% de la información',   desc: 'Cada llamada queda transcrita. Cero dependencia de que el vendedor "actualice el CRM luego".' },
  ],
  faq: [
    { q: '¿Noah es agresivo o presiona al cliente?',              a: 'No. El tono se configura y por defecto es respetuoso. Cierra por valor, no por presión.' },
    { q: '¿Puede manejar objeciones complejas?',                   a: 'Las objeciones frecuentes las maneja con el guion. Objeciones complejas o técnicas las escala a un vendedor humano en tiempo real o agenda seguimiento.' },
    { q: '¿Reemplaza a mi equipo de ventas?',                      a: 'No. Amplía capacidad. Le entrega al equipo humano solo los leads más calientes; el equipo humano cierra las oportunidades grandes.' },
    { q: '¿Se integra con mi CRM actual?',                         a: 'Sí. Se conecta con HubSpot, Salesforce, Pipedrive y CRMs con API. Para CRMs propios se hace integración custom.' },
    { q: '¿Cuál es el ROI típico?',                                a: 'Depende del ticket. En operaciones B2C con ticket bajo, se recupera la mensualidad en la primera semana. En B2B con ciclo largo, en el primer mes.' },
  ],
  keywords: ['vendedor digital', 'llamadas salientes automáticas', 'prospección automatizada', 'SDR digital', 'agente ventas IA'],
};

const NARA: Meerkat = {
  slug: 'nara', nombre: 'Nara', rol: 'Coordinación', categoria: 'operacion',
  tagline: 'Carpeta en mano, todo bajo control.',
  color: '#4338CA', image: '/meerkats/nara.png',
  descCorta: 'Coordinadora digital que mueve los procesos hacia adelante, da seguimiento y no deja nada atorado.',
  descLarga: 'Nara es la project manager digital. Toma el trabajo que otros empleados iniciaron, se asegura de que llegue al siguiente paso y hace seguimiento hasta que se cierra. Cuando un proceso se atora, sabe exactamente a quién despertar.',
  capacidades: [
    'Da seguimiento a cotizaciones, contratos y trámites pendientes',
    'Coordina firmas digitales y envío de documentos',
    'Recuerda a los clientes cuando algo requiere su acción',
    'Mueve procesos entre departamentos internos',
    'Actualiza el estatus de cada caso en el portal',
    'Escala al dueño cuando algo lleva demasiado atorado',
    'Genera reportes de casos activos por etapa',
  ],
  casosUso: [
    { titulo: 'Cotización a firma',                desc: 'Nia captura el interés, Noah cierra el precio, Nara persigue la firma del contrato hasta que llega.' },
    { titulo: 'Documentos pendientes del cliente', desc: 'Cuando falta un documento, Nara le llama al cliente cada dos días hasta que lo mande.' },
    { titulo: 'Trámites en curso',                 desc: 'Notifica al cliente de cada avance y le pide la información faltante en el momento correcto.' },
    { titulo: 'Onboarding paso a paso',            desc: 'Guía al cliente nuevo por cada paso hasta que esté 100% activo.' },
    { titulo: 'Cierre de casos',                    desc: 'Cuando un proceso se completa, Nara confirma satisfacción, pide reseña y archiva el caso.' },
  ],
  herramientas: [
    'Portal de casos con estatus',
    'SMTP para correos de seguimiento',
    'Cal.com para agendar reuniones',
    'Google Drive o Dropbox (archivos del cliente)',
    'Sistema de recordatorios automáticos',
    'Notion o CRM (fuente de verdad de casos)',
  ],
  vsHumano: [
    { titulo: 'Cero casos olvidados',              desc: 'Cada seguimiento tiene fecha programada. Ninguno se pierde en un post-it.' },
    { titulo: 'Consistencia perfecta',              desc: 'Sigue el mismo proceso con el cliente 1 y con el cliente 1,000.' },
    { titulo: 'Reporta sin sesgo',                   desc: 'Lo que está atorado se reporta como está, sin justificaciones.' },
  ],
  faq: [
    { q: '¿Nara reemplaza a mi project manager?',   a: 'Amplía capacidad. Un PM humano puede llevar 20 casos activos; Nara lleva cientos con la misma atención.' },
    { q: '¿Puede coordinar con proveedores externos?', a: 'Sí. Si el proveedor acepta correo o llamada, Nara le da seguimiento igual que a un cliente.' },
    { q: '¿Cómo sé qué está haciendo Nara?',        a: 'El portal muestra cada caso activo con su estatus, próximo paso y última acción de Nara.' },
    { q: '¿Puede manejar aprobaciones internas?',   a: 'Sí. Le indicas quién aprueba qué y Nara persigue la aprobación hasta que llega.' },
    { q: '¿Qué pasa si un caso se atora demasiado?', a: 'Después del umbral que configures, Nara escala al dueño con contexto y el historial completo.' },
  ],
  keywords: ['coordinador digital', 'project manager IA', 'seguimiento de casos automatizado', 'gestión de procesos automatizada'],
};

const NEO: Meerkat = {
  slug: 'neo', nombre: 'Neo', rol: 'Tecnología', categoria: 'operacion',
  tagline: 'Laptop abierta, problema resuelto.',
  color: '#06b6d4', image: '/meerkats/neo.png',
  descCorta: 'Mesa de ayuda digital que resuelve tickets técnicos, gestiona incidentes y escala solo lo que requiere un humano.',
  descLarga: 'Neo es el empleado digital de tecnología. Atiende tickets de mesa de ayuda internos y externos, resuelve los problemas comunes con la base de conocimiento del cliente y escala al equipo técnico humano solo los casos que realmente requieren su intervención.',
  capacidades: [
    'Recibe tickets por correo, chat o llamada',
    'Diagnostica con preguntas guiadas',
    'Aplica soluciones documentadas en la KB',
    'Reinicia servicios y limpia cachés cuando la KB lo permite',
    'Escala a on-call cuando el problema queda fuera de su alcance',
    'Actualiza el ticket con toda la información capturada',
    'Envía SLA y sigue el ticket hasta cierre',
  ],
  casosUso: [
    { titulo: 'Reset de contraseña',            desc: 'El caso más frecuente en mesas de ayuda internas. Neo lo resuelve sin escalar.' },
    { titulo: 'Diagnóstico de problemas comunes', desc: 'Aplica el árbol de decisión de la KB antes de escalar.' },
    { titulo: 'Filtrar tickets duplicados',      desc: 'Detecta cuando un incidente ya está reportado y agrupa.' },
    { titulo: 'Alertar caídas de servicio',      desc: 'Cuando varias personas reportan lo mismo, Neo notifica a on-call en tiempo real.' },
    { titulo: 'Onboarding de usuarios nuevos',   desc: 'Guía al usuario nuevo por su primer setup: cuentas, permisos, herramientas.' },
  ],
  herramientas: [
    'Sistema de tickets (Jira Service Desk, Zendesk, propio)',
    'Base de conocimiento en Notion o Confluence',
    'Correo entrante y saliente',
    'Escalación en vivo a on-call',
    'Portal de estatus de tickets',
  ],
  vsHumano: [
    { titulo: 'Disponible 24/7',                desc: 'Los tickets nocturnos y de fin de semana no esperan hasta el lunes.' },
    { titulo: 'Aplica la KB al pie de la letra', desc: 'Sigue el runbook exacto, sin atajos que se acumulan como deuda técnica.' },
    { titulo: 'Documenta todo automáticamente',  desc: 'Cada ticket queda con contexto completo, sin depender de que el ingeniero escriba el resumen.' },
  ],
  faq: [
    { q: '¿Neo reemplaza a mi equipo de IT?',          a: 'No. Filtra y resuelve tickets fáciles para que el equipo humano se enfoque en los complejos.' },
    { q: '¿Puede ejecutar comandos en mis sistemas?',   a: 'Solo si le das acceso controlado por integración (API, MCP). Sin acceso, solo guía al usuario.' },
    { q: '¿Cómo aprende Neo mi ambiente técnico?',      a: 'Se le carga la KB del cliente. Cada resolución exitosa se propone como nueva entrada de KB para que el dueño la apruebe.' },
    { q: '¿Puede integrarse con mi Jira o Zendesk?',    a: 'Sí. Se conecta vía API o webhook.' },
    { q: '¿Qué pasa si Neo se equivoca?',                a: 'Cada respuesta queda transcrita. El equipo puede revisar y ajustar la KB para que no se repita.' },
  ],
  keywords: ['mesa de ayuda automatizada', 'help desk IA', 'soporte técnico automático', 'ITSM inteligente', 'ticketing automatizado'],
};

const NAIA: Meerkat = {
  slug: 'naia', nombre: 'Naia', rol: 'Recursos Humanos', categoria: 'operacion',
  tagline: 'Con lupa: nada se le escapa.',
  color: '#ec4899', image: '/meerkats/naia.png',
  descCorta: 'Empleada digital de RH que gestiona vacaciones, permisos, expedientes y responde dudas del equipo.',
  descLarga: 'Naia es la responsable digital de recursos humanos. Atiende las preguntas del equipo (¿cuántas vacaciones me quedan?, ¿cuándo cobro el aguinaldo?, ¿cómo justifico esta incapacidad?), gestiona solicitudes de permisos y vacaciones, mantiene actualizados los expedientes y notifica al dueño cuando algo requiere aprobación.',
  capacidades: [
    'Responde preguntas del equipo sobre políticas internas',
    'Gestiona solicitudes de vacaciones, permisos e incapacidades',
    'Mantiene actualizados los expedientes digitales',
    'Recuerda cumpleaños, aniversarios y fechas importantes',
    'Genera recibos y constancias de RH',
    'Onboarding administrativo de nuevos empleados',
    'Escala al dueño lo que requiere aprobación',
  ],
  casosUso: [
    { titulo: '¿Cuántas vacaciones me quedan?',   desc: 'La duda más frecuente del equipo. Naia responde al instante consultando el expediente.' },
    { titulo: 'Solicitud de vacaciones',           desc: 'El empleado le pide días; Naia verifica saldo, escala al jefe y confirma cuando queda aprobado.' },
    { titulo: 'Onboarding de nuevo ingreso',       desc: 'Guía al nuevo empleado en llenado de expediente, entrega de documentos y capacitación inicial.' },
    { titulo: 'Recordatorio de aniversarios',      desc: 'Notifica al dueño para que reconozca al equipo en su fecha.' },
    { titulo: 'Constancias laborales',              desc: 'Genera la constancia y la manda por correo con la firma configurada.' },
  ],
  herramientas: [
    'Base de expedientes en Notion o Google Drive',
    'Portal de solicitudes',
    'Correo interno',
    'Plantillas de constancias y recibos',
    'Sistema de aprobaciones escalables al dueño',
  ],
  vsHumano: [
    { titulo: 'Responde al instante',              desc: 'El empleado no espera a que RH tenga tiempo; recibe respuesta inmediata.' },
    { titulo: 'Sin sesgo personal',                 desc: 'Aplica las políticas igual para todos, sin favoritos.' },
    { titulo: 'Expedientes siempre al día',         desc: 'Cada movimiento se registra automáticamente, sin depender de que RH tenga tiempo de actualizar.' },
  ],
  faq: [
    { q: '¿Naia maneja nómina?',                                   a: 'No procesa nómina directamente. Puede consultar recibos y responder dudas, pero el cálculo lo hace tu sistema de nómina o contador.' },
    { q: '¿Puede acceder a información sensible del empleado?',    a: 'Solo la que se le da explícitamente. Cumple con LFPDPPP y las restricciones que configures.' },
    { q: '¿Naia puede aprobar vacaciones sola?',                    a: 'Depende de tus políticas. Si configuras aprobación automática hasta cierto umbral, Naia aprueba dentro de ese umbral. Fuera del umbral, escala.' },
    { q: '¿Funciona con equipos remotos?',                           a: 'Sí. El equipo se comunica con Naia por correo o portal, sin importar dónde esté.' },
    { q: '¿Cómo se conecta con mi sistema de nómina actual?',        a: 'Vía API o exportando datos. Se configura la integración según tu proveedor.' },
  ],
  keywords: ['recursos humanos automatizado', 'RH IA', 'gestión de vacaciones automatizada', 'expedientes digitales'],
};

const NICO: Meerkat = {
  slug: 'nico', nombre: 'Nico', rol: 'Recuperación de Cartera', categoria: 'operacion',
  tagline: 'Ya tiene tu dinero contado.',
  color: '#f59e0b', image: '/meerkats/nico.png',
  descCorta: 'Cobrador digital que llama a cartera vencida, ofrece opciones de pago y recupera clientes inactivos.',
  descLarga: 'Nico es el cobrador digital. Llama a clientes con pagos atrasados con un tono firme pero respetuoso, ofrece las opciones de pago que le configures (parcialidades, descuento por pronto pago, extensión), captura acuerdos y hace seguimiento hasta que la cuenta se regulariza.',
  capacidades: [
    'Llama a cartera vencida con cadencia configurable',
    'Ofrece opciones de pago según reglas del negocio',
    'Envía links de pago (Stripe, transferencia, otros)',
    'Registra acuerdos y compromisos de pago',
    'Da seguimiento hasta cierre del caso',
    'Escala a legal cuando el caso sale del alcance',
    'Reactiva clientes inactivos con oferta personalizada',
  ],
  casosUso: [
    { titulo: 'Cobranza preventiva',              desc: 'Un día antes del vencimiento, Nico recuerda al cliente para evitar el atraso.' },
    { titulo: 'Primer contacto por atraso',        desc: 'Al día del vencimiento, Nico llama con tono amable para regularizar.' },
    { titulo: 'Cartera vencida seria',              desc: 'Después de 30 días de atraso, Nico ofrece parcialidades o extensión con las reglas que configures.' },
    { titulo: 'Reactivación de clientes dormidos',  desc: 'A los 90 días sin compra, Nico contacta con oferta de reactivación.' },
    { titulo: 'Confirmación de pago',                desc: 'Cuando el sistema detecta el pago, Nico confirma con el cliente y agradece.' },
  ],
  herramientas: [
    'Sistema contable (CONTPAQi, Aspel, QuickBooks)',
    'Stripe para links de pago',
    'CRM con historial de cliente',
    'Portal de acuerdos de pago',
    'SMTP para confirmaciones y recordatorios',
  ],
  vsHumano: [
    { titulo: 'Emocionalmente neutro',              desc: 'No se involucra emocionalmente ni se cansa. La llamada 100 tiene la misma energía que la llamada 1.' },
    { titulo: 'Cero fricción interna',              desc: 'Los cobradores humanos a veces evitan casos difíciles. Nico no evita ninguno.' },
    { titulo: 'Documentación perfecta',              desc: 'Cada llamada queda grabada y transcrita, esencial si el caso escala a legal.' },
    { titulo: 'Cadencia sin fallos',                 desc: 'Los recordatorios salen cuando toca, no cuando el cobrador se acuerde.' },
  ],
  faq: [
    { q: '¿Nico presiona o amenaza al cliente?',                a: 'No. El tono es firme pero respetuoso. Cumple con las regulaciones aplicables (PROFECO y equivalentes).' },
    { q: '¿Puede negociar parcialidades?',                       a: 'Sí, dentro de las reglas que le configures. Si el cliente pide algo fuera del rango, escala al dueño.' },
    { q: '¿Se conecta con mi sistema contable?',                 a: 'Sí. Con CONTPAQi, Aspel, Bind, QuickBooks. Para sistemas propios se hace integración custom.' },
    { q: '¿Qué pasa con casos que salen a legal?',                a: 'Nico escala con todo el historial documentado. Tu abogado recibe el expediente completo listo para actuar.' },
    { q: '¿Puede cobrar internacionalmente?',                      a: 'Sí. Puede llamar en inglés y coordinar pagos por Stripe con tarjeta internacional.' },
  ],
  keywords: ['cobrador digital', 'cobranza automatizada', 'recuperación de cartera IA', 'gestión de cartera vencida'],
};

const NELIA: Meerkat = {
  slug: 'nelia', nombre: 'Nelia', rol: 'Atención al Cliente', categoria: 'operacion',
  tagline: 'Siempre conectada, siempre respondiendo.',
  color: '#3b82f6', image: '/meerkats/nelia.png',
  descCorta: 'Empleada digital de atención al cliente que resuelve dudas, gestiona incidencias y acompaña al cliente hasta cerrar el caso.',
  descLarga: 'Nelia se especializa en la relación post-venta. Atiende dudas sobre productos y servicios ya vendidos, gestiona quejas e incidencias con empatía, coordina reemplazos o devoluciones y hace seguimiento hasta cerrar el caso. Es el punto de contacto que hace que el cliente vuelva.',
  capacidades: [
    'Atiende dudas post-venta por teléfono, chat y correo',
    'Gestiona incidencias y quejas con seguimiento',
    'Coordina devoluciones, reemplazos y ajustes',
    'Activa procesos de callback cuando la queja lo requiere',
    'Envía links de pago corregidos o notas de crédito',
    'Documenta cada caso para análisis de calidad',
    'Detecta patrones de quejas y los reporta a Niva',
  ],
  casosUso: [
    { titulo: 'Queja B2B con callback',           desc: 'Cuando un cliente empresa se queja, Nelia toma el detalle, coordina la solución y le llama de regreso en 3 días con la respuesta.' },
    { titulo: 'Devolución simple',                 desc: 'El cliente reporta un producto defectuoso; Nelia inicia el proceso de devolución y le da número de guía.' },
    { titulo: 'Duda sobre uso del producto',       desc: 'Consulta la KB del producto y responde. Si excede la KB, escala al equipo humano.' },
    { titulo: 'Seguimiento post-servicio',          desc: 'Un día después de terminar un servicio, Nelia llama a verificar satisfacción y pedir reseña.' },
    { titulo: 'Filtro previo a soporte técnico',    desc: 'Antes de pasar el caso al equipo técnico, Nelia captura toda la información para acelerar la resolución.' },
  ],
  herramientas: [
    'CRM con historial completo del cliente',
    'Base de conocimiento del producto',
    'SMTP y IMAP (correo bidireccional)',
    'Sistema de tickets con SLA',
    'Portal de casos con seguimiento visible al cliente',
  ],
  vsHumano: [
    { titulo: 'Paciencia infinita',                desc: 'No se cansa del cliente que repite la misma queja tres veces.' },
    { titulo: 'Escalación estructurada',            desc: 'Nunca "olvida" seguir un caso. El SLA aplica siempre.' },
    { titulo: 'Trilingüe',                          desc: 'Puede atender en español, inglés y otros idiomas si se configura.' },
  ],
  faq: [
    { q: '¿Nelia puede resolver quejas complejas?',                       a: 'Las simples las resuelve dentro de las reglas configuradas. Las complejas las escala con contexto completo.' },
    { q: '¿Cómo maneja clientes molestos?',                                a: 'Con protocolo de-escalation configurable. Reconoce el problema, ofrece soluciones y escala si el cliente lo pide o si la situación lo requiere.' },
    { q: '¿Se integra con mi sistema de tickets?',                          a: 'Sí. Zendesk, Freshdesk, Jira Service Desk y sistemas propios vía API.' },
    { q: '¿Puede procesar reembolsos automáticamente?',                     a: 'Sí, dentro de los límites que configures (por monto, por motivo). Fuera de límites, escala.' },
    { q: '¿Es adecuada para B2B o para B2C?',                                a: 'Ambos. En B2B el flujo típico es callback estructurado; en B2C es resolución en la primera interacción.' },
  ],
  keywords: ['atención al cliente automatizada', 'customer service IA', 'gestión de quejas automatizada', 'post-venta automatizado'],
};

const NOVA: Meerkat = {
  slug: 'nova', nombre: 'Nova', rol: 'Despacho', categoria: 'operacion',
  tagline: 'El cerebro operativo de tu equipo en campo.',
  color: '#ef4444', image: '/meerkats/nova.png',
  descCorta: 'Empleada digital de despacho que coordina equipos en campo, actualiza estatus y gestiona órdenes de servicio.',
  descLarga: 'Nova coordina operaciones de campo. Recibe la orden de servicio, asigna al técnico o equipo adecuado, mantiene informado al cliente en cada paso, actualiza el estatus en el sistema y confirma la ejecución al cierre. Ideal para talleres, servicios a domicilio, logística y operaciones con múltiples cuadrillas.',
  capacidades: [
    'Asigna órdenes de servicio a técnicos o cuadrillas',
    'Coordina rutas y horarios',
    'Notifica al cliente ETA y actualizaciones',
    'Actualiza estatus de cada orden en tiempo real',
    'Escala urgencias al supervisor de campo',
    'Documenta cierre con fotos, firma o formulario',
    'Genera reporte de operaciones del día',
  ],
  casosUso: [
    { titulo: 'Despacho de técnicos a domicilio',   desc: 'Recibe la orden, asigna al técnico por zona, envía ETA al cliente y confirma llegada.' },
    { titulo: 'Coordinación de flota',              desc: 'Reasigna rutas según tráfico, avisa al cliente de retrasos, cierra órdenes con evidencia.' },
    { titulo: 'Órdenes de mantenimiento preventivo', desc: 'Programa mantenimientos recurrentes y coordina al equipo que ejecuta.' },
    { titulo: 'Emergencias fuera de horario',        desc: 'Toma la llamada de emergencia, evalúa gravedad, contacta al técnico de guardia.' },
    { titulo: 'Cierre con evidencia',                 desc: 'Al terminar el servicio, pide al técnico fotos y firma del cliente antes de cerrar la orden.' },
  ],
  herramientas: [
    'Sistema de órdenes de servicio (propio o Protrack)',
    'Google Maps para rutas y ETA',
    'SMS o WhatsApp para actualizaciones al cliente',
    'Portal de cuadrillas',
    'Google Drive o Dropbox para evidencia',
    'CRM con historial del cliente',
  ],
  vsHumano: [
    { titulo: 'Sin llamadas perdidas',              desc: 'Cada orden entrante se atiende y se despacha, incluso en picos operativos.' },
    { titulo: 'Actualizaciones consistentes',        desc: 'El cliente recibe ETA y avances sin depender de que el técnico se acuerde.' },
    { titulo: 'Reporte del día automático',          desc: 'El supervisor recibe cada mañana el resumen sin que nadie tenga que armarlo.' },
  ],
  faq: [
    { q: '¿Nova se integra con mi sistema de flotas actual?',    a: 'Sí. Con Protrack, sistemas propios y CRMs con API. Para sistemas legacy sin API se hace integración por importación.' },
    { q: '¿Puede optimizar rutas?',                                a: 'Sí, usando Google Maps o proveedores de routing. Reasigna dinámicamente según tráfico y prioridad.' },
    { q: '¿Y si un técnico no reporta el cierre?',                a: 'Nova le llama, escala al supervisor si sigue sin respuesta después del umbral.' },
    { q: '¿Cómo maneja emergencias?',                              a: 'Se le configura el flujo de emergencia: quién es on-call, qué preguntas hacer, en qué punto llamar al 911 si aplica.' },
    { q: '¿Trabaja con contratistas independientes?',              a: 'Sí. Se le carga la lista de contratistas con sus zonas, tarifas y disponibilidad, y Nova despacha en consecuencia.' },
  ],
  keywords: ['despachador digital', 'dispatch automatizado', 'gestión de servicios en campo', 'coordinación de flota IA', 'órdenes de servicio automatizadas'],
};

const NALA: Meerkat = {
  slug: 'nala', nombre: 'Nala', rol: 'Facturación', categoria: 'operacion',
  tagline: 'El SAT no perdona errores, y ella tampoco.',
  color: '#a16207', image: '/meerkats/nala.png',
  descCorta: 'Empleada digital de facturación que timbra CFDIs, archiva comprobantes y mantiene el orden fiscal.',
  descLarga: 'Nala se encarga de la facturación fiscal. Recibe la información de venta, valida datos fiscales del cliente (RFC, razón social, uso de CFDI), timbra el CFDI con el PAC configurado, envía el XML y PDF al cliente y archiva todo. También maneja notas de crédito, cancelaciones y complementos de pago.',
  capacidades: [
    'Timbra CFDIs 4.0 con el PAC del cliente',
    'Valida datos fiscales antes de timbrar',
    'Envía XML y PDF al cliente por correo',
    'Emite notas de crédito y complementos de pago',
    'Cancela CFDIs con motivos válidos SAT',
    'Archiva comprobantes en Drive o Dropbox',
    'Genera reporte fiscal diario y mensual',
  ],
  casosUso: [
    { titulo: 'Facturación desde nota de venta',    desc: 'El cliente pide factura; Nala captura RFC, valida, timbra y manda el CFDI.' },
    { titulo: 'Facturación masiva mensual',          desc: 'Al cierre de mes, Nala procesa las facturas recurrentes del portafolio en lote.' },
    { titulo: 'Complemento de pago',                 desc: 'Cuando entra un pago parcial, Nala emite el complemento automáticamente.' },
    { titulo: 'Cancelación con motivo válido',       desc: 'Cliente pide cancelar; Nala valida, ejecuta cancelación con el motivo correcto y archiva.' },
    { titulo: 'Consolidación de bloques (Excel)',    desc: 'Recibe notas de venta en Excel del PDV, consolida por reglas (1 bloque = 1 CFDI) y timbra en lote.' },
  ],
  herramientas: [
    'Facturama (PAC principal)',
    'Solución Factible (PAC alternativo)',
    'CONTPAQi Comercial (ERP fiscal)',
    'QuickBooks Online (contabilidad)',
    'Google Drive o Dropbox (archivo fiscal)',
    'SMTP con IMAP APPEND (envío + copia en Sent)',
    'Portal de bandeja de facturación',
  ],
  vsHumano: [
    { titulo: 'Cero errores de captura',              desc: 'Valida RFC y datos fiscales antes de timbrar. El humano se equivoca en 1 de cada 50; Nala en 1 de cada 5,000.' },
    { titulo: '24/7 en cierres',                       desc: 'El último día del mes puede timbrar cientos de CFDIs en horas.' },
    { titulo: 'Archivo perfecto',                      desc: 'Cada XML archivado en Drive con estructura consistente. Auditorías SAT sin sudar.' },
  ],
  faq: [
    { q: '¿Nala usa mi propio PAC o el suyo?',                     a: 'El del cliente. Nala se configura con las credenciales de tu PAC (Facturama, Solución Factible u otro). Los timbres los pagas al PAC directamente.' },
    { q: '¿Puede timbrar CFDIs con complementos especiales?',       a: 'Sí. Pagos, INE, cartas porte, comercio exterior, entre otros. Depende de lo que soporte tu PAC.' },
    { q: '¿Se integra con CONTPAQi o Aspel?',                       a: 'Sí. Se conecta con CONTPAQi Comercial, Aspel COI y SAE, y Bind ERP.' },
    { q: '¿Qué pasa si el RFC del cliente está mal?',               a: 'Valida con el SAT antes de timbrar. Si falla la validación, no timbra y pide corrección.' },
    { q: '¿Puede manejar clientes extranjeros?',                     a: 'Sí. RFC genérico XEXX010101000 con el manejo correcto de datos.' },
  ],
  keywords: ['facturación automatizada', 'CFDI automático', 'timbrado CFDI IA', 'facturación electrónica automatizada', 'empleado digital facturación'],
};

const NALU: Meerkat = {
  slug: 'nalu', nombre: 'Nalú', rol: 'Tesorería', categoria: 'operacion',
  tagline: 'Cada peso conciliado, cada break atrapado.',
  color: '#059669', image: '/meerkats/nalu.png',
  descCorta: 'Empleada digital de tesorería que concilia banca diariamente, detecta diferencias y entrega el reporte financiero.',
  descLarga: 'Nalú lleva la tesorería. Cada día concilia los movimientos bancarios contra el sistema contable, detecta diferencias, investiga transferencias no identificadas y le entrega al dueño un reporte financiero limpio. Ideal para negocios con flujo de caja intenso donde una diferencia sin detectar se convierte en un boquete de miles.',
  capacidades: [
    'Descarga estados de cuenta bancarios diarios',
    'Concilia movimientos contra sistema contable',
    'Detecta diferencias y las investiga',
    'Identifica pagos de clientes por concepto o monto',
    'Alerta sobre gastos inusuales',
    'Genera reporte financiero diario, semanal y mensual',
    'Prepara base para pago a proveedores',
  ],
  casosUso: [
    { titulo: 'Conciliación diaria',                desc: 'Cada mañana, Nalú tiene la conciliación del día anterior lista con las diferencias marcadas.' },
    { titulo: 'Identificar pagos SPEI',              desc: 'Cuando entra un SPEI sin referencia clara, Nalú cruza con facturas pendientes de cobro.' },
    { titulo: 'Reporte de flujo semanal',            desc: 'Cada lunes, un pantallazo del flujo de caja de la semana anterior.' },
    { titulo: 'Preparación de pago a proveedores',   desc: 'Consolida CFDIs por proveedor, verifica saldos y arma la propuesta de pagos semanal.' },
    { titulo: 'Alertas de gastos anormales',          desc: 'Detecta cargos fuera del patrón y alerta al dueño.' },
  ],
  herramientas: [
    'Portal bancario (con credenciales del cliente)',
    'QuickBooks Online o CONTPAQi Contabilidad',
    'Google Sheets para reportes',
    'Correo del dueño para alertas',
    'Bandeja de conciliación en el portal',
  ],
  vsHumano: [
    { titulo: 'Cero errores de captura',             desc: 'No transcribe manualmente; jala los movimientos por API o parsing directo del estado de cuenta.' },
    { titulo: 'Diaria, no mensual',                   desc: 'La mayoría concilia una vez al mes. Nalú lo hace todos los días.' },
    { titulo: 'Alertas en tiempo real',               desc: 'Un cargo anormal se detecta el mismo día, no un mes después.' },
  ],
  faq: [
    { q: '¿Nalú tiene acceso a mi banco?',                          a: 'Solo lectura, con las credenciales que le configures. No puede transferir fondos.' },
    { q: '¿Con qué bancos funciona?',                                a: 'BBVA, Santander, Banorte, Banregio, HSBC, Banamex. Otros bancos se conectan por descarga de estado de cuenta.' },
    { q: '¿Puede pagar a proveedores?',                              a: 'Prepara la propuesta con montos y referencias. La ejecución final la haces tú desde el portal bancario.' },
    { q: '¿Cómo maneja flujos en dólares?',                          a: 'Puede conciliar cuentas en USD y expresar el reporte en pesos con el tipo de cambio del día.' },
    { q: '¿Reemplaza a mi contador?',                                 a: 'No. Nalú es tesorería (flujo), no contabilidad (registro). Complementa al contador entregándole conciliación limpia.' },
  ],
  keywords: ['tesorería automatizada', 'conciliación bancaria automática', 'flujo de caja IA', 'reporte financiero automatizado', 'CFO digital'],
};

const NAMI: Meerkat = {
  slug: 'nami', nombre: 'Nami', rol: 'Inventarios', categoria: 'operacion',
  tagline: 'Cada serie, cada bodega, todo bajo control.',
  color: '#EA580C', image: '/meerkats/nami.png',
  descCorta: 'Empleada digital de inventarios que cuenta stock, detecta faltantes y dispara reposiciones automáticas.',
  descLarga: 'Nami controla el inventario. Reconcilia entradas y salidas, detecta discrepancias entre físico y sistema, alerta sobre productos por debajo del punto de reorden y dispara órdenes de compra automáticas cuando lo autorizas. Especialmente útil para operaciones con múltiples bodegas o series controladas.',
  capacidades: [
    'Reconcilia inventario físico contra sistema',
    'Detecta faltantes y sobrantes',
    'Alerta sobre productos por debajo del punto de reorden',
    'Dispara órdenes de compra automáticas dentro de reglas',
    'Actualiza catálogo con nuevos productos',
    'Genera reporte de rotación y productos muertos',
    'Coordina inventarios cíclicos y físicos anuales',
  ],
  casosUso: [
    { titulo: 'Punto de reorden inteligente',       desc: 'Cuando un SKU baja del umbral configurado, Nami arma la OC borrador y la manda al dueño para aprobar.' },
    { titulo: 'Detección de mermas',                 desc: 'Cuando el físico no cuadra con el sistema, Nami investiga y alerta si el patrón es sospechoso.' },
    { titulo: 'Rotación de productos',                desc: 'Reporte mensual de qué se está vendiendo y qué lleva 90 días sin moverse.' },
    { titulo: 'Múltiples bodegas',                    desc: 'Coordina transferencias entre bodegas para balancear stock.' },
    { titulo: 'Series controladas',                    desc: 'Rastrea series individuales (equipos, electrónicos) desde entrada hasta venta.' },
  ],
  herramientas: [
    'CONTPAQi Comercial o Aspel SAE (ERP con inventario)',
    'Mercado Libre y Shopify (marketplaces)',
    'Google Sheets para reportes',
    'Portal de OC pendientes',
    'Sistema de alertas al dueño',
  ],
  vsHumano: [
    { titulo: 'Reconciliación diaria, no mensual',   desc: 'Los faltantes se detectan cuando ocurren, no cuando se hace inventario físico anual.' },
    { titulo: 'Sin dependencia de una persona',       desc: 'Si el encargado de inventario se enferma, Nami sigue trabajando.' },
    { titulo: 'Órdenes de compra en momento óptimo',  desc: 'Compra cuando toca, no cuando el humano se acuerda.' },
  ],
  faq: [
    { q: '¿Nami se conecta con mi punto de venta?',                     a: 'Sí. Con CONTPAQi Comercial, Aspel SAE, Shopify, Mercado Libre y sistemas propios con API.' },
    { q: '¿Puede rastrear series o lotes?',                              a: 'Sí. Para equipos con serie única y productos con caducidad por lote.' },
    { q: '¿Cómo funciona con múltiples bodegas?',                        a: 'Consolida inventario a nivel empresa y propone transferencias entre bodegas cuando conviene.' },
    { q: '¿Puede detectar robo interno?',                                 a: 'Detecta patrones de merma anormal. La investigación final la haces tú con la evidencia que Nami documenta.' },
    { q: '¿Genera órdenes de compra sola?',                               a: 'Solo dentro de las reglas que configures. Fuera de esas reglas, propone y escala al dueño para aprobar.' },
  ],
  keywords: ['inventario automatizado', 'gestión de stock IA', 'reposición automática', 'punto de reorden inteligente', 'control de inventarios digital'],
};

// ─── Registro ────────────────────────────────────────────────────────────────

export const MEERKATS: Meerkat[] = [
  NOX, NIVA, NIA, NOAH, NARA, NEO, NAIA, NICO, NELIA, NOVA, NALA, NALU, NAMI,
];

export function getMeerkatBySlug(slug: string): Meerkat | undefined {
  return MEERKATS.find(m => m.slug === slug);
}

export function meerkatSlugs(): string[] {
  return MEERKATS.map(m => m.slug);
}
