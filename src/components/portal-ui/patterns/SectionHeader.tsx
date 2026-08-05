/**
 * SectionHeader — encabezado de sección con eyebrow + title + description
 * + slot derecho para actions/filtros.
 *
 * Uso:
 *   <SectionHeader
 *     eyebrow="HOY"
 *     title="Buenas tardes, Pneuma Studio"
 *     description="Tu oficina está activa y atendiendo."
 *     right={<Button>Nuevo</Button>}
 *   />
 */

export type HeadingLevel = 'h1' | 'h2' | 'h3';

export interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
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
        <HeadingTag className={`${TITLE_CLASS[as]} text-[var(--text-primary)]`}>
          {title}
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
