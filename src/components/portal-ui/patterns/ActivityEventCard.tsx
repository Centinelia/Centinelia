import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import Icon from '../primitives/Icon';
import Badge, { type BadgeVariant } from '../primitives/Badge';

/**
 * ActivityEventCard — card de evento tipo feed. Icon box coloreado por type +
 * Badge del type + title + description + timestamp muted.
 *
 * Si href se pasa, la card entera es clickeable (via Link wrap).
 *
 * Uso:
 *   <ActivityEventCard
 *     type="llamada"
 *     icon={Phone}
 *     typeLabel="Llamada"
 *     title="Miguel Morales"
 *     description="Solicitó factura por correo"
 *     timestamp="2026-08-05T15:23:00Z"
 *     href="/portal/[t]/llamadas/xyz"
 *   />
 */

export type EventType =
  | 'llamada' | 'lead' | 'cita' | 'pedido' | 'ticket'
  | 'incidente' | 'reporte' | 'encuesta' | 'delegacion'
  | 'correo' | 'otro';

export interface ActivityEventCardProps {
  type: EventType;
  icon: LucideIcon;
  typeLabel: string;
  title: string;
  description?: string;
  timestamp: string;
  agentName?: string;
  href?: string;
  className?: string;
}

// Fallback map — se sobrescribe con import de tokens.ts (Task 11) cuando toque
const EVENT_TONE: Record<EventType, { color: string; bg: string; badge: BadgeVariant }> = {
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

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

export default function ActivityEventCard({
  type,
  icon,
  typeLabel,
  title,
  description,
  timestamp,
  agentName,
  href,
  className,
}: ActivityEventCardProps) {
  const tone = EVENT_TONE[type];

  const inner = (
    <div
      className={[
        'flex items-start gap-3 rounded-lg p-3',
        'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
        href ? 'hover:bg-[var(--surface-sunken)]' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: tone.bg, color: tone.color }}
      >
        <Icon icon={icon} size={16} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant={tone.badge} size="sm">{typeLabel}</Badge>
          {agentName && (
            <span className="text-[var(--fs-xs)] text-[var(--text-tertiary)]">
              {agentName}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[var(--fs-xs)] text-[var(--text-tertiary)]">
            {formatRelative(timestamp)}
          </span>
        </div>
        <p className="mt-1 text-[var(--fs-sm)] font-semibold text-[var(--text-primary)]">
          {title}
        </p>
        {description && (
          <p className="mt-0.5 text-[var(--fs-sm)] text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">
        {inner}
      </Link>
    );
  }
  return inner;
}
