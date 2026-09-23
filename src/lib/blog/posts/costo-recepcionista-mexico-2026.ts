import type { BlogPost } from '../types';

export const POST: BlogPost = {
  slug:      'costo-real-recepcionista-mexico-2026',
  categoria: 'Costos',
  autor:     'Equipo Centinelia',
  datePublished: '2026-09-23',
  readingTime:   8,
  titulo:    'Cuánto cuesta realmente contratar una recepcionista en México en 2026',
  subtitulo: 'Desglose punto por punto del costo integrado con IMSS, aguinaldo, prima vacacional, PTU y reclutamiento, con ejemplos por ciudad y tamaño de empresa.',
  metaTitle: 'Costo real de una recepcionista en México 2026: salario, IMSS, aguinaldo y prestaciones',
  metaDescription: 'Guía definitiva sobre el costo integrado de contratar una recepcionista en México en 2026: sueldo base, cuota patronal IMSS, aguinaldo, prima vacacional, PTU y costos ocultos.',
  keywords: [
    'costo recepcionista México', 'cuánto cuesta contratar recepcionista', 'costo integrado empleado',
    'IMSS cuota patronal 2026', 'costo laboral México 2026', 'sueldo recepcionista México',
  ],
  intro: 'La pregunta "¿cuánto cuesta una recepcionista?" se responde con el sueldo bruto en 5 segundos y con el costo real en 30 minutos. Este artículo hace ese cálculo con precisión para 2026, con datos reales de IMSS, aguinaldo, prima vacacional, PTU, prestaciones de mercado y costos que raramente aparecen en un presupuesto.',
  sections: [
    {
      id: 'sueldo-bruto',
      heading: 'Sueldo bruto: el punto de partida',
      blocks: [
        { type: 'p', text: 'El sueldo bruto de una recepcionista en México varía por ciudad, giro y experiencia. Datos de mercado 2026 en las principales plazas:' },
        { type: 'ul', items: [
          '**Monterrey**: $10,000 - $15,000 MXN mensuales para recepcionista con 1 a 3 años de experiencia',
          '**Ciudad de México**: $11,000 - $16,000 MXN',
          '**Guadalajara**: $9,500 - $14,000 MXN',
          '**Ciudades intermedias (Querétaro, Puebla, León)**: $8,500 - $12,000 MXN',
        ]},
        { type: 'p', text: 'Para consultorios médicos, notarías y despachos legales, el sueldo suele ser 15-25% mayor que el promedio por el nivel de responsabilidad. Para retail y servicios, tiende al piso.' },
      ],
    },
    {
      id: 'cuota-imss',
      heading: 'Cuota patronal IMSS: 25% adicional al sueldo',
      blocks: [
        { type: 'p', text: 'La [cuota patronal al IMSS](/glosario/imss) es la primera capa de costo obligatorio. Se calcula sobre el salario base de cotización (SBC), que incluye el sueldo más ciertas prestaciones. Para una recepcionista en régimen general, la cuota patronal ronda:' },
        { type: 'ul', items: [
          '**Seguro de enfermedades y maternidad**: aproximadamente 20.4% del SBC (prestaciones en especie y en dinero)',
          '**Seguro de invalidez y vida**: 1.75%',
          '**Riesgos de trabajo**: variable por rama, típicamente 0.5% para oficinas',
          '**Retiro, cesantía y vejez (SAR)**: 5.15%',
          '**Guarderías y prestaciones sociales**: 1%',
          '**INFONAVIT**: 5%',
          '**Total aproximado**: 33.8% del SBC',
        ]},
        { type: 'p', text: 'Nota: el porcentaje puede ser menor si el sueldo integrado está topeado a 25 UMAs. Para sueldos de recepcionista promedio ($10,000-$15,000), el tope no aplica y la cuota patronal efectiva ronda entre 25% y 30% del sueldo bruto.' },
        { type: 'p', text: 'Ejemplo: sueldo bruto de $12,000 MXN mensuales → cuota patronal aproximada de $3,000 a $3,600 al mes. El SBC integrado con aguinaldo y prima vacacional sube un poco esta base, resultando en unos $3,200 en promedio.' },
      ],
    },
    {
      id: 'aguinaldo',
      heading: 'Aguinaldo: 15 días mínimos de ley',
      blocks: [
        { type: 'p', text: 'El [aguinaldo](/glosario/aguinaldo) es prestación obligatoria de la Ley Federal del Trabajo (artículo 87). El mínimo son 15 días de salario, pagados antes del 20 de diciembre. Mensualizado equivale a alrededor del 4.17% del sueldo anual.' },
        { type: 'p', text: 'La práctica de mercado en 2026 en México:' },
        { type: 'ul', items: [
          '**PyMEs y comercios**: 15 días (el mínimo)',
          '**Corporativos medianos**: 20 a 22 días',
          '**Empresas grandes y multinacionales**: 30 días',
        ]},
        { type: 'p', text: 'Para el cálculo mensualizado, con sueldo de $12,000 MXN y aguinaldo de 15 días: $6,000 anuales ÷ 12 = **$500 MXN por mes**.' },
      ],
    },
    {
      id: 'prima-vacacional',
      heading: 'Prima vacacional: 25% mínimo sobre vacaciones',
      blocks: [
        { type: 'p', text: 'La prima vacacional es el pago adicional sobre los días de vacaciones. Desde la reforma de 2023, los trabajadores tienen derecho a 12 días de vacaciones al primer año (antes eran 6). La prima mínima es del 25% sobre los días de vacaciones.' },
        { type: 'p', text: 'Cálculo mensualizado con sueldo de $12,000 y 12 días de vacaciones al primer año:' },
        { type: 'ul', items: [
          'Vacaciones (12 días de salario) = $4,800 MXN al año → $400 mensualizados',
          'Prima vacacional (25% de las vacaciones) = $1,200 al año → $100 mensualizados',
        ]},
        { type: 'p', text: 'Total prestaciones vacacionales mensualizadas: **$500 MXN**. En años posteriores (con 14, 16, 18 y hasta 22 días de vacaciones), la cifra sube proporcionalmente.' },
      ],
    },
    {
      id: 'ptu',
      heading: 'PTU: 10% de la utilidad fiscal',
      blocks: [
        { type: 'p', text: 'La participación de los trabajadores en las utilidades (PTU) es el 10% de la utilidad fiscal anual repartida entre los empleados. Para una PyME con utilidad de $500,000 MXN y una recepcionista más 3 empleados, la parte de la recepcionista rondaría $12,000-$15,000 anuales, o **$1,000-$1,250 mensualizados**.' },
        { type: 'p', text: 'El monto varía enormemente por rentabilidad de la empresa. Empresas nuevas o con utilidad baja pueden repartir mucho menos. Empresas rentables pueden llegar a repartir 2 meses de sueldo por trabajador.' },
      ],
    },
    {
      id: 'reclutamiento',
      heading: 'Reclutamiento y capacitación: costos únicos amortizables',
      blocks: [
        { type: 'p', text: 'Contratar una recepcionista no es gratis:' },
        { type: 'ul', items: [
          '**Publicación en bolsas de trabajo** (OCC, LinkedIn, Indeed): $2,000-$8,000 por búsqueda si es paga',
          '**Agencia de reclutamiento**: 1 a 3 sueldos mensuales de comisión, típicamente $12,000-$36,000',
          '**Tiempo del dueño o gerente entrevistando**: 8-15 horas × costo hora, típicamente $2,000-$5,000',
          '**Capacitación inicial (2 semanas de baja productividad)**: 50% de sueldo × 2 semanas = $3,000',
          '**Rotación (si la persona se va en 6 meses)**: se dobla todo lo anterior',
        ]},
        { type: 'p', text: 'Amortizado sobre 12 meses (asumiendo que dura el año), esto añade $1,000-$2,500 mensuales al costo real del puesto.' },
      ],
    },
    {
      id: 'costos-ocultos',
      heading: 'Costos ocultos: ausencias y cobertura',
      blocks: [
        { type: 'p', text: 'Los costos más difíciles de cuantificar son las llamadas perdidas cuando la recepcionista:' },
        { type: 'ul', items: [
          'Está en su hora de comida (60-90 minutos diarios sin cobertura)',
          'Toma sus 12 días de vacaciones al año',
          'Se incapacita por enfermedad (promedio nacional: 8-12 días al año en oficinas)',
          'Sale a trámites, permisos personales o cita médica',
        ]},
        { type: 'p', text: 'Suma total de días sin cobertura al año: típicamente 30-45 días, o **8% a 12%** del tiempo hábil. Si tu recepcionista atiende 40 llamadas diarias en promedio, eso son 300-500 llamadas al año que se pierden por ausencias no cubiertas.' },
        { type: 'p', text: 'Costo de esas llamadas perdidas: si tu ticket promedio es de $2,000 y tu tasa de conversión telefónica es 15%, cada llamada vale $300 en valor esperado. 400 llamadas perdidas al año = **$120,000 MXN** de valor no capturado.' },
      ],
    },
    {
      id: 'costo-total',
      heading: 'Costo total: la suma real de contratar una recepcionista',
      blocks: [
        { type: 'p', text: 'Sumando todas las capas para una recepcionista con sueldo bruto de $12,000 MXN en 2026:' },
        { type: 'ul', items: [
          'Sueldo bruto: **$12,000**',
          'Cuota patronal IMSS + INFONAVIT: **$3,200**',
          'Aguinaldo (15 días mensualizado): **$500**',
          'Vacaciones + prima vacacional: **$500**',
          'PTU proporcional (empresa promedio): **$800**',
          'Reclutamiento + capacitación amortizado: **$1,500**',
          'Costo directo total: **~$18,500 MXN mensuales**',
        ]},
        { type: 'p', text: 'Y esto sin contar el costo de oportunidad de las llamadas perdidas por ausencias (que agrega $10,000-$15,000 mensuales en valor esperado no capturado).' },
        { type: 'p', text: 'Comparación: [Nia, la recepcionista digital de Centinelia](/empleados/nia), en su plan **Esencial cuesta $2,997 MXN mensuales** con 250 minutos de voz y 300 tareas incluidas. Sin cuotas, sin aguinaldo, sin ausencias. La incorporación única es $14,990 MXN + IVA (amortizada en 6 meses = $2,500 mensualizados el primer año).' },
      ],
    },
    {
      id: 'cuando-vale-humano',
      heading: '¿Cuándo vale la pena pagar el costo de un humano?',
      blocks: [
        { type: 'p', text: 'A pesar del diferencial, hay contextos donde una recepcionista humana justifica su costo:' },
        { type: 'ul', items: [
          'Cuando la recepción es también atención presencial en piso',
          'En negocios de ultra-alto valor por transacción, donde perder un lead cuesta más que 3 años de sueldo',
          'Cuando la marca depende del sello personal (spas premium, notarías de élite)',
          'Cuando el equipo humano completo es de 2 personas y no hay masa crítica para automatizar',
        ]},
        { type: 'p', text: 'Para el 80% de las PyMEs mexicanas con flujo de llamadas moderado, la matemática favorece claramente al [empleado digital](/glosario/empleado-digital), especialmente para el turno nocturno y de fin de semana donde nadie contesta hoy.' },
      ],
    },
  ],
  faq: [
    { q: '¿Cuánto gana una recepcionista en México en 2026?', a: 'Entre $9,000 y $16,000 MXN mensuales de sueldo bruto según ciudad, giro y experiencia. Monterrey y CDMX pagan más; ciudades intermedias menos.' },
    { q: '¿Cuál es la cuota patronal del IMSS?', a: 'Aproximadamente 25% a 30% del sueldo bruto para puestos de oficina, dependiendo del riesgo de la actividad y otros factores del SBC.' },
    { q: '¿Se puede ahorrar contratando por outsourcing?', a: 'La reforma laboral de 2021 eliminó el outsourcing tradicional en México. Solo se permiten servicios especializados que no sean actividad principal, y con registro REPSE. El ahorro estructural desapareció.' },
    { q: '¿Un empleado digital paga impuestos?', a: 'La empresa que lo contrata paga IVA sobre la suscripción y puede deducirla como gasto operativo. El empleado digital en sí no genera obligaciones fiscales laborales.' },
    { q: '¿Puedo tener una recepcionista humana y un empleado digital al mismo tiempo?', a: 'Sí, es la configuración óptima en la mayoría de casos. La humana atiende en horario clave, el empleado digital cubre el resto y las llamadas simultáneas.' },
  ],
  crossLinks: [
    { href: '/empleados/nia',                                                label: 'Nia, recepción digital',                    desc: 'Detalles del rol de recepción: capacidades, integraciones, precios.' },
    { href: '/blog/recepcionista-humana-vs-empleado-digital-2026',           label: 'Comparativa lado a lado 2026',              desc: 'Costo, capacidad, disponibilidad y consistencia frente a frente.' },
    { href: '/glosario/imss',                                                label: 'Qué es la cuota patronal IMSS',              desc: 'Cómo se calcula el 25%-30% adicional al sueldo.' },
    { href: '/glosario/aguinaldo',                                           label: 'Aguinaldo y prestaciones',                   desc: 'La prestación anual obligatoria y sus variantes en el mercado.' },
  ],
  cta: {
    heading: 'Ve cuánto ahorra tu negocio con un empleado digital',
    body:    'Con tus números reales (sueldos actuales, llamadas al mes, ticket promedio) hacemos el cálculo en 15 minutos.',
    button:  'Calcular mi ahorro',
    href:    '/cotizar',
  },
};
