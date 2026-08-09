export type CategorySlug = 'cliente' | 'proveedor' | 'factura' | 'urgente' | 'notificacion' | 'otros';

export const CATEGORY_ORDER: CategorySlug[] = ['cliente', 'proveedor', 'factura', 'urgente', 'notificacion', 'otros'];

export const CATEGORY_LABELS: Record<CategorySlug, string> = {
  cliente:      'Cliente',
  proveedor:    'Proveedor',
  factura:      'Factura',
  urgente:      'Urgente',
  notificacion: 'Notificación',
  otros:        'Otros',
};

// hex + hex de fondo (10% alpha) + hex de texto (700)
export const CATEGORY_COLORS: Record<CategorySlug, { fg: string; bg: string; border: string }> = {
  cliente:      { fg: '#1D4ED8', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.30)'  }, // blue
  proveedor:    { fg: '#047857', bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)'  }, // emerald
  factura:      { fg: '#B45309', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)'  }, // amber
  urgente:      { fg: '#B91C1C', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)'   }, // red
  notificacion: { fg: '#5B21B6', bg: 'rgba(139,92,246,0.10)',  border: 'rgba(139,92,246,0.30)'  }, // violet — FYI
  otros:        { fg: '#374151', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.30)' }, // gray
};

const SYNONYMS: Record<string, CategorySlug> = {
  cliente:       'cliente',
  clientes:      'cliente',
  client:        'cliente',
  proveedor:     'proveedor',
  proveedores:   'proveedor',
  supplier:      'proveedor',
  vendor:        'proveedor',
  factura:       'factura',
  facturas:      'factura',
  invoice:       'factura',
  recibo:        'factura',
  urgente:       'urgente',
  urgent:        'urgente',
  urgencia:      'urgente',
  prioritario:   'urgente',
  notificacion:  'notificacion',
  notificación:  'notificacion',
  notification:  'notificacion',
  notifications: 'notificacion',
  aviso:         'notificacion',
  alerta:        'notificacion',
};

export function normalizeCategory(raw: string | null | undefined): CategorySlug {
  if (!raw) return 'otros';
  const key = raw.trim().toLowerCase();
  return SYNONYMS[key] ?? 'otros';
}

export interface InboxAgent {
  id:            string;
  agent_name:    string | null;
  business_name: string | null;
}
