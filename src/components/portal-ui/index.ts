/**
 * Portal Design System — public entrypoint.
 *
 * Consumidores importan desde aquí:
 *   import { PageContainer, Button, Card, SectionHeader } from '@/components/portal-ui';
 */

// ─── Layout (Fase 2A) ──────────────────────────────────────────────────
export { default as PageContainer } from './patterns/layout/PageContainer';
export { default as PageSection }   from './patterns/layout/PageSection';
export { default as GridStretch }   from './patterns/layout/GridStretch';

export type { PageContainerProps } from './patterns/layout/PageContainer';
export type { PageSectionProps }   from './patterns/layout/PageSection';
export type { GridStretchProps }   from './patterns/layout/GridStretch';

// ─── Primitives (Fase 2B-1) ────────────────────────────────────────────
export { default as Icon }   from './primitives/Icon';
export { default as Button } from './primitives/Button';
export { default as Badge }  from './primitives/Badge';
export { default as Chip }   from './primitives/Chip';

export type { IconProps, IconSize }             from './primitives/Icon';
export type { ButtonProps, ButtonVariant, ButtonSize } from './primitives/Button';
export type { BadgeProps, BadgeVariant, BadgeSize }    from './primitives/Badge';
export type { ChipProps }                       from './primitives/Chip';

// ─── Patterns (Fase 2B-1) ──────────────────────────────────────────────
export { default as Card }          from './patterns/Card';
export { default as SectionHeader } from './patterns/SectionHeader';
export { default as EmptyState }    from './patterns/EmptyState';
export { EmptyState as EmptyStateNamed } from './patterns/EmptyState';

export type { CardProps }                        from './patterns/Card';
export type { SectionHeaderProps, HeadingLevel } from './patterns/SectionHeader';
export type { EmptyStateProps, EmptyStateSize }  from './patterns/EmptyState';
