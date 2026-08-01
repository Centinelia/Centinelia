'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_TOKENS: Record<
  NonNullable<EmptyStateProps['size']>,
  {
    container: string;
    iconWrap: string;
    iconSize: number;
    title: string;
    description: string;
    gap: string;
  }
> = {
  sm: {
    container: 'py-6 px-4 max-w-xs',
    iconWrap: 'h-10 w-10',
    iconSize: 18,
    title: 'text-sm',
    description: 'text-xs',
    gap: 'gap-1.5',
  },
  md: {
    container: 'py-10 px-6 max-w-md',
    iconWrap: 'h-12 w-12',
    iconSize: 22,
    title: 'text-base',
    description: 'text-sm',
    gap: 'gap-2',
  },
  lg: {
    container: 'py-16 px-8 max-w-lg',
    iconWrap: 'h-16 w-16',
    iconSize: 28,
    title: 'text-lg',
    description: 'text-sm',
    gap: 'gap-2.5',
  },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const tokens = SIZE_TOKENS[size];

  return (
    <div
      className={cn(
        'mx-auto flex flex-col items-center justify-center text-center',
        tokens.container,
        tokens.gap,
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            'mb-2 flex items-center justify-center rounded-full',
            tokens.iconWrap
          )}
          style={{
            background: 'var(--c-hover)',
            color: 'var(--c-text-3)',
          }}
        >
          <Icon size={tokens.iconSize} strokeWidth={1.75} />
        </div>
      )}
      <p
        className={cn('font-medium', tokens.title)}
        style={{ color: 'var(--c-text)' }}
      >
        {title}
      </p>
      {description && (
        <p
          className={cn('leading-relaxed', tokens.description)}
          style={{ color: 'var(--c-text-3)' }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
