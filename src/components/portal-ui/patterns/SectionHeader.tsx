/**
 * SectionHeader — encabezado de sección con eyebrow + title + description
 * + slot derecho para actions/filtros.
 * + tooltip inline junto al título (ícono ⓘ nativo, Stripe/Linear style)
 *
 * Uso:
 *   <SectionHeader
 *     eyebrow="HOY"
 *     title="Buenas tardes, Pneuma Studio"
 *     tooltip="Explicación breve de esta sección."
 *     description="Tu oficina está activa y atendiendo."
 *     right={<Button>Nuevo</Button>}
 *   />
 */

import { Info } from 'lucide-react';

export type HeadingLevel = 'h1' | 'h2' | 'h3';

export interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  tooltip?: string;              // inline ⓘ next to title
  description?: string;
  right?: React.ReactNode;
  as?: HeadingLevel;
  className?: string;
}

const TITLE_CLASS: Record<HeadingLevel, string> = {
  h1: 'text-[var(--fs-3xl)] font-[var(--font-heading)] font-semibold leading-tight',
  h2: 'text-[var(--fs-2xl)] font-[var(--font-heading)] font-semibold leading-tight',
  h3: 'text-[var(--fs-xl)]  font-[var(--font-heading)] font-semibold leading-tight',
};

export default function SectionHeader({
  eyebrow,
  title,
  tooltip,
  description,
  right,
  as = 'h2',
  className,
}: SectionHeaderProps) {
  const HeadingTag = as;

  return (
    <header
      className={[
        'flex items-start justify-between gap-4',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0 flex-1 space-y-1">
        {eyebrow && (
          <p className="text-[var(--fs-xs)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)]">
            {eyebrow}
          </p>
        )}
        <HeadingTag className={`${TITLE_CLASS[as]} text-[var(--text-primary)] inline-flex items-center gap-1.5`}>
          {title}
          {tooltip && (
            <button
              type="button"
              title={tooltip}
              aria-label="Más información"
              className="inline-flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3BFF]"
              style={{
                width: 16,
                height: 16,
                background: 'rgba(108,59,255,0.10)',
                border: 'none',
                padding: 0,
                cursor: 'help',
                color: '#9B6DFF',
                flexShrink: 0,
                verticalAlign: 'middle',
              }}
            >
              <Info size={10} strokeWidth={2.5} />
            </button>
          )}
        </HeadingTag>
        {description && (
          <p className="text-[var(--fs-base)] text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
