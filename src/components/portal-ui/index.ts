/**
 * Portal Design System — public entrypoint.
 *
 * Consumidores importan desde aquí:
 *   import { PageContainer, PageSection, GridStretch } from '@/components/portal-ui';
 */

export { default as PageContainer } from './patterns/layout/PageContainer';
export { default as PageSection }   from './patterns/layout/PageSection';
export { default as GridStretch }   from './patterns/layout/GridStretch';

export type { PageContainerProps } from './patterns/layout/PageContainer';
export type { PageSectionProps }   from './patterns/layout/PageSection';
export type { GridStretchProps }   from './patterns/layout/GridStretch';
