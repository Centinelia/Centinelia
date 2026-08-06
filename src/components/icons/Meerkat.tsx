import type { CSSProperties, AriaAttributes } from 'react';

export interface MeerkatIconProps extends AriaAttributes {
  size?:        number | string;
  className?:   string;
  style?:       CSSProperties;
  alt?:         string;
  /** Ignored — el componente renderiza un PNG con relleno, sin stroke. */
  strokeWidth?: number | string;
  /** Ignored — mismo motivo. */
  color?:       string;
}

/**
 * Meerkat — isotipo oficial de Centinelia. Renderiza el PNG real (color lila
 * fijo, alineado al brand). Se usa donde antes usaríamos un ícono lucide para
 * la pestaña 'Empleados' del portal y en marketing.
 *
 * Trade-off: color fijo (no adopta currentColor). El isotipo es una marca
 * registrada — mantener el color es intencional. Si necesitas versiones
 * monocromáticas o adaptables, usa un Lucide (Users2, UserCircle, Bot).
 */
export default function Meerkat({
  size      = 24,
  className,
  style,
  alt       = 'Centinelia',
  strokeWidth: _strokeWidth,
  color:       _color,
  ...aria
}: MeerkatIconProps) {
  const dim = typeof size === 'number' ? `${size}px` : size;
  return (
    <img
      {...aria}
      src="/icons/meerkat-lucide.png"
      alt={alt}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={className}
      style={{
        width:       dim,
        height:      dim,
        display:     'inline-block',
        objectFit:   'contain',
        flexShrink:  0,
        ...style,
      }}
      draggable={false}
    />
  );
}
