/**
 * PageContainer — wrapper directo del content de una página del portal.
 * Aplica padding lateral responsive fill-width (nunca max-w-*).
 *
 * Uso típico:
 *   <PageContainer>
 *     <PageSection ...>...</PageSection>
 *     <PageSection ...>...</PageSection>
 *   </PageContainer>
 */

import type { ReactNode } from 'react';

export interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={`w-full px-4 py-6 md:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}
