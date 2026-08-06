'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Tabs from '@/components/portal-ui/overlays/Tabs';

interface Props {
  children: React.ReactNode[];
  /** Passed from server so pill colour can tint active tab text */
  roleColor?: string;
}

const TAB_DEFS = [
  { value: 'voz',        label: 'Personalidad y voz' },
  { value: 'knowledge',  label: 'Conocimiento y guardrails' },
  { value: 'tools',      label: 'Herramientas e integraciones' },
  { value: 'horarios',   label: 'Horarios y automatizaciones' },
  { value: 'marca',      label: 'Marca y ajustes' },
] as const;

const VALID_TABS = new Set<string>(TAB_DEFS.map(t => t.value));

/**
 * ConfigurarTabs
 *
 * 5-tab layout sincronizado con URL. Lee `?tab=knowledge` para saber cuál abrir.
 * Al cambiar tab actualiza la URL sin recargar (router.replace). También detecta
 * anchors `#rol`, `#correo`, etc. y hace scroll cuando el tab correspondiente
 * está activo.
 *
 * children[0..4] map to the 5 tab panels in order.
 */
export default function ConfigurarTabs({ children }: Props) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const tabFromUrl = searchParams?.get('tab') ?? '';
  const initialTab = VALID_TABS.has(tabFromUrl) ? tabFromUrl : 'voz';
  const [tab, setTab] = useState<string>(initialTab);

  // Sync URL → tab when user pastes a link with ?tab=x
  useEffect(() => {
    if (VALID_TABS.has(tabFromUrl) && tabFromUrl !== tab) {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl, tab]);

  // Cuando cambia el tab O al montar con hash, scroll al anchor
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    // Delay para que Tabs.Content del nuevo tab ya esté en el DOM
    const timer = setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(timer);
  }, [tab]);

  const handleChange = (v: string) => {
    setTab(v);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('tab', v);
    router.replace(`${pathname}?${params.toString()}${window.location.hash}`, { scroll: false });
  };

  return (
    <Tabs.Root value={tab} onValueChange={handleChange} variant="pill">
      {/* Tabs centradas — todas visibles sin scroll horizontal */}
      <div className="flex justify-center pb-1">
        <Tabs.List className="flex-wrap justify-center">
          {TAB_DEFS.map(t => (
            <Tabs.Trigger key={t.value} value={t.value}>
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>

      {TAB_DEFS.map((t, i) => (
        <Tabs.Content key={t.value} value={t.value} className="flex flex-col gap-5">
          {(children as React.ReactNode[])[i]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
