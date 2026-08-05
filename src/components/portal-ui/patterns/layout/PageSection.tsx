/**
 * PageSection — bloque vertical dentro de una página del portal.
 * Provee spacing vertical entre hijos (space-y-8) y un slot opcional
 * para el heading de la sección.
 *
 * El heading se renderea antes de los children con margin-bottom.
 * Cuando se migre SectionHeader (Fase 2B), reemplazará el ReactNode aquí.
 *
 * Uso:
 *   <PageSection heading={<h2 className="text-xl font-semibold">Título</h2>}>
 *     <Card>...</Card>
 *     <Card>...</Card>
 *   </PageSection>
 */

import type { ReactNode } from 'react';

export interface PageSectionProps {
  children: ReactNode;
  heading?: ReactNode;
  className?: string;
}

export default function PageSection({ children, heading, className = '' }: PageSectionProps) {
  return (
    <section className={`space-y-4 ${className}`}>
      {heading}
      <div className="space-y-8">
        {children}
      </div>
    </section>
  );
}
