/**
 * DEPRECATED shim — la lógica real vive en `@/components/portal-ui/patterns/EmptyState`.
 *
 * Este archivo se mantiene sólo para preservar los imports existentes
 * (`@/components/ui/empty-state`) mientras Fase 3+ migra cada consumidor
 * al path canónico del design system.
 */

export { EmptyState, default } from '@/components/portal-ui/patterns/EmptyState';
export type { EmptyStateProps, EmptyStateSize } from '@/components/portal-ui/patterns/EmptyState';
