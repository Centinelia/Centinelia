import type { EventType } from './patterns/ActivityEventCard';
import type { AvatarSize } from './primitives/Avatar';
import type { BadgeVariant } from './primitives/Badge';

/**
 * tokens.ts — mapas semánticos para componentes del design system.
 * Complementa los tokens CSS de globals.css con lookups JS.
 */

export const EVENT_TYPE_COLORS: Record<EventType, { color: string; bg: string; badge: BadgeVariant }> = {
  llamada:    { color: 'var(--accent-default)',    bg: 'var(--accent-subtle)',   badge: 'info' },
  lead:       { color: 'var(--success)',           bg: 'var(--success-subtle)',  badge: 'success' },
  cita:       { color: 'var(--info)',              bg: 'var(--info-subtle)',     badge: 'info' },
  pedido:     { color: 'var(--warning)',           bg: 'var(--warning-subtle)',  badge: 'warning' },
  ticket:     { color: 'var(--danger)',            bg: 'var(--danger-subtle)',   badge: 'danger' },
  incidente:  { color: 'var(--danger)',            bg: 'var(--danger-subtle)',   badge: 'danger' },
  reporte:    { color: 'var(--info)',              bg: 'var(--info-subtle)',     badge: 'info' },
  encuesta:   { color: 'var(--accent-default)',    bg: 'var(--accent-subtle)',   badge: 'info' },
  delegacion: { color: 'var(--accent-emphasized)', bg: 'var(--accent-subtle)',   badge: 'info' },
  correo:     { color: 'var(--text-secondary)',    bg: 'var(--surface-sunken)',  badge: 'neutral' },
  otro:       { color: 'var(--text-tertiary)',     bg: 'var(--surface-sunken)',  badge: 'neutral' },
};

export const AVATAR_SIZES: Record<AvatarSize, number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 44,
};

export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
} as const;

export type IconSizeKey = keyof typeof ICON_SIZES;
