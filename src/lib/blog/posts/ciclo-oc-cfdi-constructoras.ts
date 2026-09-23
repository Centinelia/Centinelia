import type { BlogPost } from '../types';

export const POST: BlogPost = {
  slug:      'automatizar-ciclo-oc-cfdi-constructoras',
  categoria: 'Industria',
  autor:     'Equipo Centinelia',
  datePublished: '2026-09-23',
  readingTime:   9,
  titulo:    'Automatizar el ciclo Orden de Compra → CFDI en constructoras y comercializadoras',
  subtitulo: 'Guía práctica de los 11 pasos del ciclo, cómo automatizarlos con Nala y Nox, e integrarlos con QuickBooks, tu PAC y tu archivo local.',
  metaTitle: 'Automatizar ciclo OC → CFDI para constructoras y comercializadoras (México 2026)',
  metaDescription: 'De la cotización del proveedor al CFDI del cliente sin intervención manual. Los 11 pasos del ciclo OC-CFDI y cómo automatizarlos con integraciones a QuickBooks, PAC y Drive.',
  keywords: [
    'ciclo orden compra CFDI', 'automatizar OC constructora', 'ciclo OC-CFDI',
    'comercializadora CFDI automático', 'ERP constructora', 'flujo OC a factura',
  ],
  intro: 'Una constructora mediana o una comercializadora manejan decenas de órdenes de compra al día. Cada una requiere solicitar cotización, generar OC, firmar, pagar, recibir CFDI del proveedor, archivar, y eventualmente emitir el CFDI al cliente final. Este artículo desmonta los 11 pasos del ciclo y cómo automatizarlos con [Nala](/empleados/nala) y [Nox](/empleados/nox).',
  sections: [
    {
      id: 'ciclo-completo',
      heading: 'Los 11 pasos del ciclo OC → CFDI',
      blocks: [
        { type: 'p', text: 'El flujo completo, tal como opera en una comercializadora industrial mexicana:' },
        { type: 'ol', items: [
          '**Cotización solicitada**: el cliente pide un producto o servicio. Se solicita cotización al proveedor.',
          '**Cotización recibida**: el proveedor manda su cotización (PDF, correo, WhatsApp).',
          '**OC generada**: se crea la orden de compra en QuickBooks o el ERP fiscal.',
          '**OC firmada**: el responsable autoriza la OC con firma digital.',
          '**OC enviada al proveedor**: el proveedor recibe la OC firmada.',
          '**Pago procesado**: se paga al proveedor (transferencia, tarjeta corporativa).',
          '**CFDI del proveedor recibido**: el proveedor timbra y manda el CFDI.',
          '**CFDI archivado**: se guarda XML y PDF en Drive/Dropbox con nomenclatura estándar.',
          '**CFDI de venta al cliente generado**: se emite el CFDI de venta con el PAC configurado.',
          '**CFDI enviado al cliente**: se manda por correo con XML y PDF.',
          '**Registro contable**: ingreso y gasto se registran en QuickBooks.',
        ]},
        { type: 'p', text: 'En una operación manual, este ciclo consume 20-40 minutos por caso. En una operación automatizada, el 90% de las tareas se hacen sin intervención humana.' },
      ],
    },
    {
      id: 'nala-nox',
      heading: 'Roles: quién hace qué',
      blocks: [
        { type: 'p', text: 'La automatización se distribuye entre dos empleados digitales:' },
        { type: 'ul', items: [
          '**[Nala](/empleados/nala), facturación**: valida datos fiscales, timbra [CFDIs](/glosario/cfdi) con el [PAC](/glosario/pac) del cliente, archiva XML y PDF, emite complementos de pago, envía al cliente',
          '**[Nox](/empleados/nox), dirección**: coordina el flujo entre pasos, escala al humano lo que requiere autorización, revisa consistencia y detecta atascos',
        ]},
        { type: 'p', text: 'El operador humano interviene solo cuando: (a) se necesita autorizar montos grandes, (b) hay excepciones fuera del template configurado, (c) se necesita decisión comercial. El 80-90% del ciclo corre sin humano.' },
      ],
    },
    {
      id: 'integraciones',
      heading: 'Integraciones necesarias',
      blocks: [
        { type: 'p', text: 'Un ciclo OC-CFDI automatizado necesita tres integraciones core:' },
        { type: 'ol', items: [
          '**[QuickBooks Online o CONTPAQi](/glosario/contpaqi-comercial)**: donde vive la OC, la contabilidad y las cuentas por cobrar/pagar',
          '**[PAC](/glosario/pac) del cliente**: [Facturama](https://facturama.com.mx), [Solución Factible](https://solucionfactible.com) u otro autorizado. Cada timbre se paga al PAC según su tarifa',
          '**Drive / Dropbox / OneDrive**: para archivar XMLs y PDFs con estructura por cliente/mes/tipo',
        ]},
        { type: 'p', text: 'Adicionalmente conviene tener correo (para envío al cliente) y WhatsApp entrante (para recibir cotizaciones de proveedores por chat).' },
      ],
    },
    {
      id: 'paso-a-paso',
      heading: 'Automatización paso a paso',
      blocks: [
        { type: 'h3', text: 'Paso 1-2: cotización y recepción',   id: 'cotizacion' },
        { type: 'p',  text: 'La cotización del proveedor puede llegar por correo, WhatsApp o llamada. El empleado digital extrae los datos clave (proveedor, producto, precio, plazo) del texto o el PDF y los registra en el sistema.' },

        { type: 'h3', text: 'Paso 3-5: OC generada, firmada y enviada', id: 'oc' },
        { type: 'p',  text: 'La OC se genera automáticamente en QuickBooks con los datos capturados. Se manda a firma digital al responsable configurado (típicamente el dueño para montos grandes; se puede autorizar automáticamente hasta un umbral). Una vez firmada, se envía al proveedor por correo.' },

        { type: 'h3', text: 'Paso 6: pago', id: 'pago' },
        { type: 'p',  text: 'El pago sigue siendo humano (transferencia bancaria o tarjeta corporativa). El empleado digital prepara la propuesta de pagos con los CFDIs pendientes agrupados por proveedor y la envía al operador de tesorería.' },

        { type: 'h3', text: 'Paso 7-8: CFDI del proveedor', id: 'cfdi-proveedor' },
        { type: 'p',  text: 'Cuando el proveedor manda el CFDI, Nala lo valida (RFC, monto, uso), lo registra en QuickBooks como gasto y lo archiva en Drive con nomenclatura estándar (`YYYY-MM/proveedor/UUID.xml`).' },

        { type: 'h3', text: 'Paso 9-10: CFDI de venta al cliente', id: 'cfdi-venta' },
        { type: 'p',  text: 'Cuando el cliente autoriza la venta o el pedido se cierra, Nala genera el CFDI de venta con el [PAC](/glosario/pac) del cliente. Valida el [RFC](/glosario/rfc), el [uso de CFDI](/glosario/uso-cfdi), y el régimen fiscal antes de timbrar. Después envía XML y PDF al correo del cliente.' },

        { type: 'h3', text: 'Paso 11: registro contable', id: 'contable' },
        { type: 'p',  text: 'Cada movimiento (OC, pago, CFDI recibido, CFDI emitido) se registra automáticamente en QuickBooks o el ERP. El contador solo revisa y cierra el periodo.' },
      ],
    },
    {
      id: 'excepciones',
      heading: 'Manejo de excepciones',
      blocks: [
        { type: 'p', text: 'No todo el ciclo es feliz. Los casos que requieren intervención humana:' },
        { type: 'ul', items: [
          '**Datos fiscales del cliente incompletos o inválidos**: Nala escala al operador para pedirlos al cliente',
          '**Montos que exceden el umbral autorizado**: Nox pide autorización al dueño antes de generar la OC',
          '**Complementos especiales** (pagos, comercio exterior, cartas porte): pueden requerir configuración adicional',
          '**Cancelaciones de CFDI**: los motivos válidos SAT requieren validación humana antes de ejecutar',
        ]},
        { type: 'p', text: 'Estas excepciones se escalan con contexto completo al humano correcto (operador, contador, dueño). Nada se pierde en un limbo.' },
      ],
    },
    {
      id: 'metricas-tipicas',
      heading: 'Métricas típicas de una operación automatizada',
      blocks: [
        { type: 'p', text: 'Datos observados en operaciones de comercializadoras y constructoras que ya operan con Centinelia:' },
        { type: 'ul', items: [
          '**Tiempo del ciclo OC-CFDI**: baja de 20-40 minutos manuales a 3-5 minutos de intervención humana total',
          '**Errores de timbrado**: bajan de 3-8% (RFC mal, uso equivocado, monto incorrecto) a menos del 0.5%',
          '**Retraso de facturación**: baja de 5-15 días promedio a mismo día en 85% de los casos',
          '**Cuentas por cobrar vencidas**: bajan entre 20% y 40% por facturación puntual',
          '**Costo operativo del departamento de facturación**: baja entre 40% y 60%',
        ]},
      ],
    },
    {
      id: 'setup',
      heading: 'Setup para una constructora o comercializadora nueva',
      blocks: [
        { type: 'ol', items: [
          '**Día 1-2**: conexión con QuickBooks o CONTPAQi. Carga de catálogo de proveedores, clientes y productos.',
          '**Día 3**: conexión con el PAC del cliente y prueba de timbrado con un CFDI de prueba.',
          '**Día 4-5**: configuración de reglas de negocio (umbrales de autorización, uso de CFDI por cliente, políticas de cobro).',
          '**Día 6-7**: piloto con 5-10 casos reales supervisados por el equipo humano. Ajuste de reglas.',
          '**Día 8+**: operación normal con revisión semanal de casos escalados.',
        ]},
        { type: 'p', text: 'Después de la primera semana, la operación se estabiliza y el equipo humano puede reasignarse a tareas de mayor valor.' },
      ],
    },
  ],
  faq: [
    { q: '¿Funciona con CONTPAQi Comercial?', a: 'Sí. Se integra con CONTPAQi Comercial, Aspel SAE y Bind ERP a nivel de importación/exportación de datos. Para sistemas con API se integra de forma directa.' },
    { q: '¿Puede timbrar en el PAC que ya tengo?', a: 'Sí. Nala se configura con las credenciales del PAC actual del cliente. Los timbres se pagan al PAC directamente según su tarifa.' },
    { q: '¿Y si mi ciclo tiene pasos custom que no aparecen aquí?', a: 'El template se personaliza. Constructoras suelen tener estimaciones y avance de obra; comercializadoras tienen inventario y devoluciones. Estos flujos se configuran adicionalmente.' },
    { q: '¿Puede manejar complemento de pago?', a: 'Sí. Cuando el cliente paga a plazos, se emite complemento de pago automáticamente por cada abono. Es una de las tareas más repetitivas del ciclo.' },
    { q: '¿Cuánto cuesta operar el ciclo completo?', a: 'Depende del volumen. Una comercializadora con 50 CFDIs/mes suele operar bien con el plan Profesional ($5,994 MXN mensuales). Volúmenes de 200+ CFDIs/mes van a Alta Demanda o Empresarial.' },
  ],
  crossLinks: [
    { href: '/empleados/nala',            label: 'Nala, facturación digital',     desc: 'Detalles del rol de facturación con PAC y CONTPAQi.' },
    { href: '/empleados/nox',             label: 'Nox, dirección de operaciones', desc: 'Coordina el flujo y escala excepciones.' },
    { href: '/pack-ciclo-oc-cfdi',        label: 'Pack Ciclo OC-CFDI',            desc: 'Página del producto con detalle del pack completo.' },
    { href: '/glosario/cfdi',             label: 'Qué es un CFDI',                desc: 'Definición del comprobante fiscal digital y variantes.' },
  ],
  cta: {
    heading: 'Automatiza tu ciclo OC-CFDI este mes',
    body:    'Nala y Nox se integran con tu QuickBooks y PAC actual. Empiezas a ver el impacto en el primer cierre mensual.',
    button:  'Cotizar automatización del ciclo',
    href:    '/cotizar',
  },
};
