'use client';

import Tabs from '@/components/portal-ui/overlays/Tabs';

/**
 * ActivityTabsCard — client wrapper alrededor de Tabs (compound client component).
 * Necesario porque page.tsx es Server Component y no puede consumir Tabs.Root directo.
 */

export interface ActivityTabsCardProps {
  recientes: React.ReactNode;
  horaria?: React.ReactNode;
}

export default function ActivityTabsCard({ recientes, horaria }: ActivityTabsCardProps) {
  return (
    <Tabs.Root defaultValue="recientes" variant="pill">
      <Tabs.List className="mb-4 flex-nowrap">
        <Tabs.Trigger value="recientes">Recientes</Tabs.Trigger>
        {horaria && <Tabs.Trigger value="horaria">Horaria</Tabs.Trigger>}
      </Tabs.List>
      <Tabs.Content value="recientes">{recientes}</Tabs.Content>
      {horaria && <Tabs.Content value="horaria">{horaria}</Tabs.Content>}
    </Tabs.Root>
  );
}
