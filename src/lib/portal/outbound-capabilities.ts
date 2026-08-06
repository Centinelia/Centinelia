/**
 * Catálogo canónico de capabilities de llamadas salientes.
 *
 * Cada meerkat declara qué subset de estas capabilities puede ejecutar
 * (en `meerkat-roles.ts` → `features.outbound_capabilities`). El backend
 * (routes de campañas + cron) rechaza campañas con una capability que el
 * meerkat asignado no tiene declarada.
 *
 * La UI de /configurar → Llamadas salientes muestra todo el catálogo
 * como chip grid: iluminados los que el empleado puede, muted el resto.
 * Al hover sobre muted se muestra qué meerkat sí desbloquea esa capability
 * (discovery + upsell).
 */

export type OutboundCapabilityId =
  | 'seguimiento_leads'
  | 'confirmacion_citas'
  | 'cobranza'
  | 'recordatorios_pago'
  | 'promociones'
  | 'encuestas'
  | 'reactivacion'
  | 'actualizacion_estatus';

export interface OutboundCapability {
  id:          OutboundCapabilityId;
  label:       string;
  description: string;
}

export const OUTBOUND_CAPABILITIES: OutboundCapability[] = [
  {
    id:          'seguimiento_leads',
    label:       'Seguimientos de leads',
    description: 'Llama a prospectos que dejaron sus datos para avanzar la conversación.',
  },
  {
    id:          'confirmacion_citas',
    label:       'Confirmaciones de cita',
    description: 'Recordatorio y confirmación de asistencia a citas agendadas.',
  },
  {
    id:          'cobranza',
    label:       'Cobranza',
    description: 'Contacto para cartera vencida con guion no confrontacional.',
  },
  {
    id:          'recordatorios_pago',
    label:       'Recordatorios de pago',
    description: 'Avisos antes del vencimiento para reducir mora.',
  },
  {
    id:          'promociones',
    label:       'Promociones y ofertas',
    description: 'Campañas comerciales a base instalada con opt-in previo.',
  },
  {
    id:          'encuestas',
    label:       'Encuestas de satisfacción',
    description: 'NPS y feedback post-servicio, resultados en el portal.',
  },
  {
    id:          'reactivacion',
    label:       'Reactivación de clientes inactivos',
    description: 'Contacta clientes que dejaron de comprar o interactuar.',
  },
  {
    id:          'actualizacion_estatus',
    label:       'Actualizaciones de estatus a clientes',
    description: 'Informa cambios en pedidos, tickets o servicios en curso.',
  },
];

const BY_ID = new Map(OUTBOUND_CAPABILITIES.map(c => [c.id, c]));

export function getOutboundCapability(id: string): OutboundCapability | undefined {
  return BY_ID.get(id as OutboundCapabilityId);
}

export function isValidOutboundCapability(id: string): id is OutboundCapabilityId {
  return BY_ID.has(id as OutboundCapabilityId);
}
