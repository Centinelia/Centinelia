import type { SVGProps } from 'react';

export interface MeerkatIconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  size?: number | string;
}

/**
 * Meerkat — icono outline al estilo Lucide (fill none, stroke currentColor,
 * strokeWidth 2, rounded caps/joins). Trazado a partir del isotipo de
 * Centinelia: cabeza de suricata en perfil mirando a la derecha, con oreja
 * en la parte superior-trasera, máscara facial almendrada alrededor del ojo,
 * hocico pronunciado y nariz redondeada.
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
      {/* Silueta de cabeza en perfil (mirando a la derecha) */}
      <path d="M 6.2 5.2
               C 7.5 3.8, 11.5 3.6, 13.8 4.6
               C 15.5 5.2, 17 6.5, 18 8
               C 19.2 9, 20.6 10, 21.5 10.8
               C 22 11.3, 22 12.1, 21 12.5
               L 18.4 12.9
               C 16 14, 12 14.6, 8 14.2
               C 5 13.6, 3.6 11, 3.8 8
               C 4 6.2, 5 5.4, 6.2 5.2 Z" />
      {/* Oreja — pequeña V arriba-atrás */}
      <path d="M 8 4 L 8.8 2.4 L 10.2 3.8" />
      {/* Máscara facial almendrada alrededor del ojo */}
      <path d="M 12 8
               C 10.4 9.4, 10.8 11.2, 13 11.5
               C 15.5 11.4, 16.4 9.8, 15 8.2
               C 14 7.6, 12.8 7.6, 12 8 Z" />
      {/* Ojo */}
      <circle cx="13.2" cy="9.6" r="0.9" />
    </svg>
  );
}
