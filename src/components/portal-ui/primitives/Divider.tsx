/**
 * Divider — separador horizontal o vertical con spacing opcional.
 *
 * Uso:
 *   <Divider />
 *   <Divider orientation="vertical" spacing="md" />
 */

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  spacing?: 'sm' | 'md' | 'lg';
  className?: string;
}

const H_SPACING: Record<NonNullable<DividerProps['spacing']>, string> = {
  sm: 'my-2',
  md: 'my-4',
  lg: 'my-6',
};
const V_SPACING: Record<NonNullable<DividerProps['spacing']>, string> = {
  sm: 'mx-2',
  md: 'mx-4',
  lg: 'mx-6',
};

export default function Divider({
  orientation = 'horizontal',
  spacing,
  className,
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={[
          'inline-block h-full w-px bg-[var(--border-subtle)]',
          spacing ? V_SPACING[spacing] : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
    );
  }

  return (
    <hr
      className={[
        'w-full border-0 border-t border-[var(--border-subtle)]',
        spacing ? H_SPACING[spacing] : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
