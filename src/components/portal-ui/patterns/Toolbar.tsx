/**
 * Toolbar — barra horizontal con 3 slots (izquierda / centro / derecha).
 * Puede ser sticky al top del content container.
 *
 * Uso:
 *   <Toolbar
 *     left={<SectionHeader title="Llamadas" />}
 *     center={<FilterBar ... />}
 *     right={<Button>Nueva</Button>}
 *   />
 */

export interface ToolbarProps {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}

export default function Toolbar({
  left,
  center,
  right,
  sticky = false,
  className,
}: ToolbarProps) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-4 py-3',
        'border-b border-[var(--border-subtle)] bg-[var(--surface-canvas)]',
        sticky ? 'sticky top-14 z-10' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0 flex-1">{left}</div>
      {center && <div className="shrink-0">{center}</div>}
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
