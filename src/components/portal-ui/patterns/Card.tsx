/**
 * Card — container base del design system. Slots Header/Body/Footer opcionales.
 *
 * Uso simple:
 *   <Card>content</Card>
 *
 * Uso con slots:
 *   <Card padding="none">
 *     <Card.Header>...</Card.Header>
 *     <Card.Body>...</Card.Body>
 *     <Card.Footer>...</Card.Footer>
 *   </Card>
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  elevated?: boolean;
  border?: boolean;
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: 'p-0',
  sm:   'p-4',
  md:   'p-6',
  lg:   'p-8',
};

function CardRoot({
  padding = 'md',
  elevated = true,
  border = false,
  className,
  children,
  ...rest
}: CardProps) {
  const base = 'bg-[var(--surface-elevated)] rounded-xl';
  const shadow = elevated ? 'shadow-[var(--shadow-xs)]' : '';
  const borderClass = border ? 'border border-[var(--border-subtle)]' : '';

  return (
    <div
      className={[base, PADDING[padding], shadow, borderClass, className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => (
  <div
    className={[
      'flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {children}
  </div>
);

const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => (
  <div className={['p-6', className ?? ''].filter(Boolean).join(' ')} {...rest}>
    {children}
  </div>
);

const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => (
  <div
    className={[
      'flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border-subtle)]',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {children}
  </div>
);

interface CardComponent {
  (props: CardProps): React.JSX.Element;
  Header: typeof CardHeader;
  Body:   typeof CardBody;
  Footer: typeof CardFooter;
}

const Card = CardRoot as CardComponent;
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
