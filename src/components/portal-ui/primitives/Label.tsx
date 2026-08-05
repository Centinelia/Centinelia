/**
 * Label — etiqueta semántica <label>. Soporta prop `required` que renderea
 * asterisco de danger color al final del label.
 *
 * Uso:
 *   <Label htmlFor="email" required>Correo</Label>
 *   <Input id="email" ... />
 */

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: React.ReactNode;
}

export default function Label({
  required,
  className,
  children,
  ...rest
}: LabelProps) {
  return (
    <label
      className={[
        'inline-block text-[var(--fs-sm)] font-medium text-[var(--text-secondary)]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
      {required && (
        <span aria-hidden className="ml-0.5 text-[var(--danger)]">*</span>
      )}
    </label>
  );
}
