import type { SVGProps } from 'react';

export interface MeerkatIconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  size?: number | string;
}

/**
 * Meerkat — icono de línea al estilo Lucide (fill none, stroke currentColor,
 * strokeWidth 2, rounded caps/joins). Silueta de suricata alerta en posición
 * bípeda, para representar al "empleado" Centinelia.
 */
export default function Meerkat({
  size          = 24,
  strokeWidth   = 2,
  className,
  style,
  ...rest
}: MeerkatIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth as number}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      {...rest}
    >
      {/* Orejas — pequeñas V */}
      <path d="M9.7 4 L 10.2 2.5 L 10.8 4" />
      <path d="M14.3 4 L 13.8 2.5 L 13.2 4" />
      {/* Cabeza + cuerpo — silueta continua vertical, cintura marcada */}
      <path d="M9 6.5
               C 9 4.5, 15 4.5, 15 6.5
               C 15 7.9, 13.9 8.5, 13.4 8.9
               C 15.4 11.8, 15.8 15.8, 14.4 19
               L 9.6 19
               C 8.2 15.8, 8.6 11.8, 10.6 8.9
               C 10.1 8.5, 9 7.9, 9 6.5 Z" />
      {/* Suelo / patas */}
      <path d="M9 20 h 6" />
    </svg>
  );
}
