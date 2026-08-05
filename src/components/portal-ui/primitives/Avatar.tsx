import Image from 'next/image';

/**
 * Avatar — círculo con foto o inicial fallback. Sizes xs/sm/md/lg
 * (20/28/36/44 px). Status opcional muestra dot semantic en esquina.
 *
 * Uso:
 *   <Avatar src={user.photo} initial={user.name[0]} alt={user.name} />
 *   <Avatar initial="N" size="lg" status="online" />
 */

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
export type AvatarStatus = 'online' | 'away' | 'offline';

export interface AvatarProps {
  src?: string | null;
  initial: string;
  alt?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
}

const SIZE_PX: Record<AvatarSize, number> = { xs: 20, sm: 28, md: 36, lg: 44 };
const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-[13px]',
  lg: 'h-11 w-11 text-sm',
};
const STATUS_COLOR: Record<AvatarStatus, string> = {
  online: 'bg-[var(--success)]',
  away:   'bg-[var(--warning)]',
  offline:'bg-[var(--text-tertiary)]',
};

export default function Avatar({
  src,
  initial,
  alt,
  size = 'md',
  status,
  className,
}: AvatarProps) {
  const px = SIZE_PX[size];
  const containerClass = SIZE_CLASS[size];
  const initialUpper = (initial ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      className={[
        'relative inline-flex items-center justify-center overflow-visible rounded-full',
        'bg-[var(--surface-sunken)] text-[var(--text-secondary)] font-semibold',
        containerClass,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {src ? (
        <Image
          src={src}
          alt={alt ?? ''}
          width={px}
          height={px}
          className="h-full w-full rounded-full object-cover"
          style={{ objectPosition: 'center 3%' }}
        />
      ) : (
        <span aria-hidden>{initialUpper}</span>
      )}
      {status && (
        <span
          aria-label={status}
          className={[
            'absolute bottom-0 right-0 rounded-full ring-2 ring-[var(--surface-elevated)]',
            'h-2 w-2',
            STATUS_COLOR[status],
          ].join(' ')}
        />
      )}
    </span>
  );
}
