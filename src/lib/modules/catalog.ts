/**
 * Catálogo de módulos activables por org. Cada módulo empaqueta:
 * - Tools que se activan cuando el flag correspondiente está true
 * - Config UI en portal (páginas dedicadas)
 * - Un contract claro de qué hace y qué NO hace
 *
 * Modelo mental: la base de cada meerkat es INMUTABLE (Nelia siempre es
 * recepción + registro de eventos). Los módulos son add-ons que amplían
 * su comportamiento sin duplicar código o crear "versiones custom".
 *
 * Estado se guarda en `organizations.features` (JSONB). Activar un módulo
 * = setear el flag correspondiente a true. Desactivar = false.
 *
 * Pricing: informativo por ahora. Fase 2 = billing automático via Stripe.
 */

export type ModuleId =
  | 'bitacora'
  | 'facturacion_cfdi'
  | 'ciclo_oc_cfdi'
  | 'quickbooks'
  | 'cloud_catalog'
  | 'outbound_calls'
  | 'google_sheets'
  | 'contract_drafts'
  | 'civic_reports'
  | 'external_tramites'
  | 'inventory_excel';

export type MeerkatRole =
  | 'nia' | 'noah' | 'nelia' | 'nala' | 'nox' | 'nico' | 'niva' | 'nara' | 'nova' | 'naia' | 'nami';

export interface ModuleDefinition {
  id:                ModuleId;
  name:              string;
  tagline:           string;
  description:       string;
  /** Emoji o Lucide icon name para display */
  iconName:          string;
  /** Empleados que aprovechan este módulo. */
  meerkats:          MeerkatRole[];
  /** Flag en organizations.features que activa/desactiva el módulo. */
  featureFlag:       string;
  /** Precio mensual informativo. null = incluido en base. */
  priceMonthly:      number | null;
  /** Override del label de pricing. Cuando está set, la UI lo muestra tal cual
   *  en vez de "$X/mes" o "Incluido en tu plan". Útil para verticales que
   *  requieren cotización individual. */
  priceNote?:        string;
  /** Requerimientos externos que el cliente debe tener antes de activar.
   *  Se muestran como checklist en el catálogo. */
  requirements:      string[];
  /** Lista de capabilities que el módulo agrega — para mostrar al cliente. */
  capabilities:      string[];
  /** Cosas que el módulo NO hace, para setear expectativas. */
  outOfScope:        string[];
  /** Ruta del portal donde se configura este módulo. Null = no requiere config. */
  configPath:        string | null;
  /** Vertical al que aplica. Undefined = universal. */
  vertical?:         'gobierno' | 'retail' | 'servicios';
  /** Si true, el módulo requiere una integración externa conectada (ej: QB, PAC).
   *  UI muestra "requiere setup" en vez de botón directo de activar. */
  requiresSetup:     boolean;
  /** Madurez del módulo para el catálogo público:
   *   - `ga`: production-ready, cliente puede activar sin fricción
   *   - `beta`: funcional pero le falta pulido (KB, tests, UI menor); activable con warning
   *   - `coming_soon`: aparece en catálogo pero NO se puede activar todavía */
  stage:             'ga' | 'beta' | 'coming_soon';
  /** Copy que aparece en el confirm de desactivación para explicar el side effect.
   *  Si null, solo se pregunta "¿Estás seguro?". */
  deactivateWarning?: string;
}

export const MODULE_CATALOG: ModuleDefinition[] = [
  {
    id:            'bitacora',
    name:          'Bitácora de incidencias',
    tagline:       'Registro semanal de quejas y altas con verificación automática.',
    description:   'Cuando un cliente reporta que no le llegó su pedido o se da de alta, el empleado registra el evento, avisa al encargado por correo y agenda una llamada de verificación 3 días después. Cada sábado te llega un correo con el resumen de la semana en tu propio formato Excel.',
    iconName:      'BookOpen',
    meerkats:      ['nia', 'noah', 'nelia'],
    featureFlag:   'incidencia_flow',
    priceMonthly:  null, // incluido
    requirements:  [],
    capabilities: [
      'Registro automático de quejas (bitácora)',
      'Registro automático de altas de clientes nuevos',
      'Correo al encargado con la tarjeta de cada evento',
      'Llamada de verificación auto-agendada +3 días',
      'Reintentos automáticos +2 días si no contestan (máx 4)',
      'Bitácora semanal por correo en Excel personalizable',
      'Grid semanal L-D con OK/NV/NC',
    ],
    outOfScope: [
      'No factura (usa el módulo Facturación CFDI para eso)',
      'No genera pedidos (usa el módulo Ciclo OC-CFDI o toma pedidos por voz)',
      'No hace cobranza (usa el módulo Llamadas salientes)',
    ],
    configPath:    '/oficina/bitacora',
    requiresSetup: false,
    stage:         'ga',
    deactivateWarning: 'El correo semanal de bitácora dejará de enviarse y no se agendarán nuevas llamadas de verificación. Los eventos ya registrados quedan intactos.',
  },
  {
    id:            'facturacion_cfdi',
    name:          'Facturación a clientes',
    tagline:       'Emite CFDIs a tus clientes desde ventas, notas o pedidos.',
    description:   'Cuando tu cliente te pide su factura, Nala (con apoyo de Nox como admin) toma los datos de la venta, arma el CFDI 4.0, lo sella con tu PAC y le manda el XML+PDF al correo del cliente. Cancela con motivo SAT cuando hace falta.',
    iconName:      'Receipt',
    meerkats:      ['nala', 'nox'],
    featureFlag:   'invoicing_provider',
    priceMonthly:  399,
    requirements:  [
      'Tener CSD (certificado de sello digital) vigente',
      'Contrato con un PAC (Solución Factible o CONTPAQi)',
    ],
    capabilities: [
      'Emisión de facturas CFDI 4.0',
      'Sellado con PAC (Solución Factible / CONTPAQi)',
      'Adjunto XML+PDF automático al correo del cliente',
      'Cancelación con motivo SAT',
      'Reportes de facturas emitidas por período',
    ],
    outOfScope: [
      'No hace la contabilidad ni concilia bancarios (usa QuickBooks o tu contador)',
      'No cobra pagos (usa Stripe si es online, o registra manualmente)',
      'No valida facturas de proveedores — eso es Facturación de proveedores',
    ],
    configPath:    '/portal?tab=organizacion#integraciones',
    requiresSetup: true,
    stage:         'beta',
    deactivateWarning: 'Los empleados dejarán de poder emitir facturas CFDI. Los CFDIs ya emitidos siguen disponibles en tu PAC.',
  },
  {
    id:            'ciclo_oc_cfdi',
    name:          'Facturación de proveedores',
    tagline:       'Recibe facturas de tus proveedores, matcheándolas contra sus órdenes de compra.',
    description:   'Cuando un proveedor te manda una cotización o factura, Nala (con Nox) crea la orden de compra correspondiente en tu sistema, y cuando llega la factura la matchea contra la OC para autorizar el pago. Detecta discrepancias de precio, cantidad o SKU automáticamente.',
    iconName:      'FileSignature',
    meerkats:      ['nala', 'nox'],
    featureFlag:   'ciclo_oc_cfdi',
    priceMonthly:  399,
    requirements:  [
      'QuickBooks Online o ERP con integración disponible',
    ],
    capabilities: [
      'Parseo de cotizaciones (PDF/imagen) con Vision AI',
      'Creación automática de OCs en tu ERP',
      'Match automático OC ↔ factura del proveedor',
      'Detección de discrepancias (precio, cantidad, SKU)',
      'Expedientes por OC con historial completo',
    ],
    outOfScope: [
      'No paga automáticamente (Nala solo autoriza)',
      'No emite CFDIs a tus clientes — eso es Facturación a clientes',
    ],
    configPath:    null,
    requiresSetup: true,
    stage:         'beta',
    deactivateWarning: 'Nala dejará de crear OCs automáticamente y de matchear facturas de proveedores. Las OCs y matches ya generados quedan en tu ERP.',
  },
  {
    id:            'quickbooks',
    name:          'QuickBooks',
    tagline:       'Contabilidad y facturación desde QuickBooks Online.',
    description:   'Nox, Nico y Niva leen y escriben directamente en tu QuickBooks: consultan facturas, cobran, generan cotizaciones, registran gastos y de caja chica.',
    iconName:      'BarChart2',
    meerkats:      ['nox', 'nico', 'niva', 'nala'],
    featureFlag:   'quickbooks',
    priceMonthly:  399,
    requirements:  [
      'Cuenta QuickBooks Online activa',
      'OAuth de QB completado en Configuración',
    ],
    capabilities: [
      'Consulta y creación de facturas',
      'Búsqueda de clientes',
      'Registro de pagos, gastos y caja chica',
      'Cotizaciones',
      'Reportes de ingresos/AR/gastos por período',
    ],
    outOfScope: [
      'No es sustituto de tu contador (auditoría manual sigue igual)',
      'Solo QuickBooks Online — no soporta Desktop',
    ],
    configPath:    '/portal?tab=organizacion#integraciones',
    requiresSetup: true,
    stage:         'beta',
    deactivateWarning: 'Los empleados dejarán de leer y escribir en tu QuickBooks. Tu cuenta QB no se ve afectada.',
  },
  {
    id:            'cloud_catalog',
    name:          'Catálogo en la nube',
    tagline:       'Busca SKUs y precios en tu Excel/CSV cuando cotizas o generas OCs.',
    description:   'Cuando Nox o Noah necesita un código de pieza, precio o descripción, consulta tu catálogo en Dropbox, Google Drive o OneDrive sin que tengas que subir nada. Búsqueda fuzzy por SKU o descripción.',
    iconName:      'FolderOpen',
    meerkats:      ['nox', 'noah'],
    featureFlag:   'cloud_catalog',
    priceMonthly:  149,
    requirements:  [
      'Cuenta Dropbox, Google Drive u OneDrive conectada',
      'Archivo Excel o CSV con el catálogo (columnas: SKU, descripción, precio)',
    ],
    capabilities: [
      'Consulta de catálogo por SKU exacto',
      'Búsqueda fuzzy por descripción',
      'Devuelve hasta 20 coincidencias con precio',
      'Actualización en tiempo real (lee tu archivo tal cual está)',
    ],
    outOfScope: [
      'No modifica tu catálogo (solo lectura)',
      'No aplica descuentos automáticos',
    ],
    configPath:    '/portal?tab=organizacion#integraciones',
    requiresSetup: true,
    stage:         'ga',
    deactivateWarning: 'Los empleados dejarán de consultar tu catálogo cuando cotizan o generan OCs. Tu archivo en la nube no se toca.',
  },
  {
    id:            'outbound_calls',
    name:          'Llamadas salientes',
    tagline:       'El empleado llama por ti para cobranza, reactivación o encuestas.',
    description:   'Noah dispara llamadas salientes desde tu portal o disparadas por triggers (cobranza a X días de vencimiento, reactivación de cliente sin actividad, encuestas post-venta). Consume minutos igual que llamadas entrantes.',
    iconName:      'PhoneOutgoing',
    meerkats:      ['noah'],
    featureFlag:   'outbound_calls',
    priceMonthly:  null,
    requirements:  [],
    capabilities: [
      'Llamadas salientes disparadas por trigger o manual',
      'Cobranza automática a X días de vencimiento',
      'Reactivación de clientes inactivos',
      'Encuestas post-venta',
      'Reintentos automáticos con backoff',
    ],
    outOfScope: [
      'No llama fuera de horario configurado',
      'No manda SMS/WhatsApp automáticos (otro módulo)',
    ],
    configPath:    '/oficina/campanas',
    requiresSetup: false,
    stage:         'ga',
    deactivateWarning: 'Las campañas salientes activas se pausan y no se disparan más llamadas por triggers. Las llamadas ya realizadas siguen en el historial.',
  },
  {
    id:            'google_sheets',
    name:          'Google Sheets',
    tagline:       'Lee y escribe en Google Sheets configurados como base de datos.',
    description:   'Cuando quieres que un empleado registre eventos en tu propia hoja de cálculo (lista de prospectos, inventario, control interno), conectas la sheet y le dices para qué usarla.',
    iconName:      'LayoutTemplate',
    meerkats:      ['nox'],
    featureFlag:   'google_sheets',
    priceMonthly:  149,
    requirements:  [
      'Cuenta Google conectada',
      'Sheet compartida con permisos de escritura',
    ],
    capabilities: [
      'Lectura, búsqueda y actualización de filas',
      'Agregado de filas nuevas',
      'Múltiples sheets para propósitos distintos',
    ],
    outOfScope: [
      'No genera fórmulas automáticamente',
      'No corre pivots ni scripts de Apps Script',
    ],
    configPath:    '/portal?tab=organizacion#integraciones',
    requiresSetup: true,
    stage:         'beta',
    deactivateWarning: 'Los empleados dejarán de leer y escribir en tus sheets. Tu Google Sheet no se toca.',
  },
  {
    id:            'contract_drafts',
    name:          'Contratos',
    tagline:       'Nox genera borradores de contrato en tu plantilla.',
    description:   'Cuando cierras una venta o servicio, Nox arma el borrador de contrato en tu plantilla (comercial, servicios, arrendamiento) y te lo manda para firma. Extrae los datos de la conversación previa.',
    iconName:      'FileSignature',
    meerkats:      ['nox'],
    featureFlag:   'contract_drafts',
    priceMonthly:  null,
    requirements:  [
      'Plantilla de contrato subida en formato Word/PDF',
    ],
    capabilities: [
      'Generación de borradores desde conversación',
      'Reemplazo de placeholders en tu plantilla',
      'Multiple plantillas por tipo de contrato',
    ],
    outOfScope: [
      'No es asesoría legal — revisa cada borrador antes de firmar',
      'No manda a firma electrónica (usa DocuSign/Sign.com aparte)',
    ],
    configPath:    '/oficina/contratos',
    requiresSetup: false,
    stage:         'coming_soon',
    deactivateWarning: 'Nox dejará de generar borradores de contrato. Los borradores ya generados quedan en tu carpeta.',
  },
  {
    id:            'civic_reports',
    name:          'Reportes ciudadanos',
    tagline:       'Nara recibe reportes cívicos por teléfono, chat o correo.',
    description:   'Ciudadanos reportan baches, luminarias, basura y otros temas municipales. Nara clasifica, prioriza, asigna al área correspondiente y da seguimiento hasta cierre.',
    iconName:      'ClipboardList',
    meerkats:      ['nara'],
    featureFlag:   'civic_reports',
    priceMonthly:  null,
    priceNote:     'Cotización a medida',
    requirements:  [],
    capabilities: [
      'Recepción de reportes por voz/chat/correo',
      'Clasificación automática (área, prioridad)',
      'Asignación al departamento correspondiente',
      'Seguimiento y notificación de estado al ciudadano',
      'Reportes agregados por área/período',
    ],
    outOfScope: [
      'No sustituye a 911 (emergencias)',
      'No dispatchear cuadrillas (solo notifica al departamento)',
    ],
    configPath:    '/oficina/reportes-ciudadanos',
    vertical:      'gobierno',
    requiresSetup: false,
    stage:         'coming_soon',
  },
  {
    id:            'external_tramites',
    name:          'Trámites municipales',
    tagline:       'Nara ayuda al ciudadano a hacer trámites por teléfono.',
    description:   'Consulta el catálogo de trámites, busca al ciudadano en el padrón, y envía trámites al backend municipal. Ideal para dependencias con mucha carga telefónica.',
    iconName:      'FileSignature',
    meerkats:      ['nara'],
    featureFlag:   'external_tramites',
    priceMonthly:  null,
    priceNote:     'Cotización a medida',
    requirements:  [
      'Integración con el backend municipal (padrón + trámites)',
    ],
    capabilities: [
      'Consulta de catálogo de trámites',
      'Búsqueda en padrón ciudadano',
      'Envío de trámite al backend municipal',
      'Seguimiento por folio',
    ],
    outOfScope: [
      'No cobra derechos (redirige a caja o portal municipal)',
      'No sustituye ventanilla presencial para actos con firma manual',
    ],
    configPath:    null,
    vertical:      'gobierno',
    requiresSetup: true,
    stage:         'coming_soon',
  },
  {
    id:            'inventory_excel',
    name:          'Inventarios en Excel',
    tagline:       'Nami lleva tu inventario histórico y stock por bodega directo en tu Excel de SharePoint u OneDrive.',
    description:   'Cuando manejas equipos por número de serie individual, con estatus por bodega y ciclo OC → almacén → separado → entregado, Nami opera tu Excel sin que tengas que copiar datos. Consulta existencias, captura equipos que llegan, actualiza estatus, mueve entre bodegas y manda correos de reposición cuando el stock cae bajo el ideal.',
    iconName:      'Package',
    meerkats:      ['nami'],
    featureFlag:   'inventory_excel',
    priceMonthly:  null,
    priceNote:     'Cotización a medida',
    requirements:  [
      'Cuenta de Microsoft (Outlook) conectada con permisos Files.ReadWrite.All + Sites.ReadWrite.All',
      'Archivo Excel en SharePoint u OneDrive con hojas INVENTARIO (tabla nombrada) + STOCK (con columna IDEAL)',
      'Correos de encargados de reposición configurados',
    ],
    capabilities: [
      'Consulta por serie o modelo con filtros de estatus y bodega',
      'Snapshot de stock vs ideal con reposiciones sugeridas',
      'Correo automático al encargado cuando el stock cae bajo el ideal',
      'Captura de equipos nuevos con normalización de bodegas',
      'Cambio de estatus ALMACEN → SEPARADO → ENTREGADO con auditoría',
      'Reporte de factor de venta por modelo',
    ],
    outOfScope: [
      'No timbra las facturas de venta (eso es del módulo Facturación a clientes)',
      'No coloca la orden de compra automática al proveedor (eso lo hace Nala si activas ciclo OC-CFDI)',
      'No sustituye a un WMS completo si necesitas ubicación pasillo/rack por SKU',
    ],
    configPath:    '/integraciones/inventario',
    requiresSetup: true,
    stage:         'coming_soon',
    deactivateWarning: 'Nami dejará de consultar y actualizar tu Excel de inventario. Los datos ya capturados quedan en tu archivo tal cual — no se borran.',
  },
];

/** Retorna el módulo por id, o null si no existe. */
export function getModule(id: string): ModuleDefinition | null {
  return MODULE_CATALOG.find(m => m.id === id) ?? null;
}

/** Retorna solo los módulos aplicables al vertical del cliente. */
export function modulesForVertical(vertical?: string): ModuleDefinition[] {
  if (!vertical) return MODULE_CATALOG.filter(m => !m.vertical);
  return MODULE_CATALOG.filter(m => !m.vertical || m.vertical === vertical);
}
