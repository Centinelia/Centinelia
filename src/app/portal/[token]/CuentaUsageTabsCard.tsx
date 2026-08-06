'use client';

import { useEffect, useState } from 'react';
import Tabs from '@/components/portal-ui/overlays/Tabs';

interface Props {
  /** Content for the "Uso" tab (Minutos + Tareas usage bars) */
  usoContent:     React.ReactNode;
  /** Content for the "Comprar" tab (dynamic border/bg, buy buttons) */
  comprarContent: React.ReactNode;
  /** Content for the "Recarga" tab (auto-refill configuration) */
  recargaContent: React.ReactNode;
}

// Map URL hash (used by sidebar anchors) → tab value
function hashToTab(): 'uso' | 'comprar' | 'recarga' {
  if (typeof window === 'undefined') return 'uso';
  const h = window.location.hash.slice(1);
  if (h === 'comprar') return 'comprar';
  if (h === 'recarga') return 'recarga';
  return 'uso';
}

/**
 * CuentaUsageTabsCard
 *
 * Client shell que fusiona las 3 secciones (Uso / Comprar / Recarga) en una
 * sola Card con pill tabs. El tab activo se sincroniza con el hash de la URL
 * para que los links "Consumo" (#uso-del-mes) y "Saldo" (#comprar) del sidebar
 * abran el tab correcto.
 */
export default function CuentaUsageTabsCard({ usoContent, comprarContent, recargaContent }: Props) {
  const [value, setValue] = useState<'uso' | 'comprar' | 'recarga'>('uso');

  useEffect(() => {
    setValue(hashToTab());
    const onHash = () => setValue(hashToTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
        <Tabs.Root value={value} onValueChange={v => setValue(v as 'uso' | 'comprar' | 'recarga')} variant="pill">
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
