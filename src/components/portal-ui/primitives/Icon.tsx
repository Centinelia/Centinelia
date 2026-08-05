import type { LucideIcon } from 'lucide-react';

/**
 * Icon — wrapper de Lucide con size tokens consistentes y strokeWidth default 1.75.
 *
 * Uso:
 *   <Icon icon={Home} size={18} />
 *   <Icon icon={Home} size={24} aria-label="Inicio" />
 */

export type IconSize = 14 | 16 | 18 | 20 | 24;

export interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  strokeWidth?: number;
  className?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
}

export default function Icon({
  icon: Component,
  size = 18,
  strokeWidth = 1.75,
  className,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden = !ariaLabel,
}: IconProps) {
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    />
  );
}
