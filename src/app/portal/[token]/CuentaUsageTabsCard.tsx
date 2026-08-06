'use client';

import Tabs from '@/components/portal-ui/overlays/Tabs';

interface Props {
  /** Content for the "Uso" tab (Minutos + Tareas usage bars) */
  usoContent:     React.ReactNode;
  /** Content for the "Comprar" tab (dynamic border/bg, buy buttons) */
  comprarContent: React.ReactNode;
  /** Content for the "Recarga" tab (auto-refill configuration) */
  recargaContent: React.ReactNode;
}

/**
 * CuentaUsageTabsCard
 *
 * Client shell that fuses the 3 cuenta-Col-1 sections (Uso / Comprar / Recarga)
 * into a single Card with pill tabs. Created in portal restructure A6.
 */
export default function CuentaUsageTabsCard({ usoContent, comprarContent, recargaContent }: Props) {
  return (
    <div
      className="rounded-xl"
      style={{
        background: 'var(--c-surface)',
        border:     '1px solid var(--c-border-2)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Pill tab bar */}
      <div className="p-5">
        <Tabs.Root defaultValue="uso" variant="pill">
          <Tabs.List>
            <Tabs.Trigger value="uso">Uso</Tabs.Trigger>
            <Tabs.Trigger value="comprar">Comprar</Tabs.Trigger>
            <Tabs.Trigger value="recarga">Recarga</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="uso">
            <div className="flex flex-col gap-4">{usoContent}</div>
          </Tabs.Content>

          <Tabs.Content value="comprar">
            <div className="flex flex-col gap-4">{comprarContent}</div>
          </Tabs.Content>

          <Tabs.Content value="recarga">
            <div className="flex flex-col gap-4">{recargaContent}</div>
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
