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
  { value: 'personalidad', label: 'Rol y Personalidad' },
  { value: 'conocimiento', label: 'Conocimiento' },
  { value: 'tools',        label: 'Herramientas' },
  { value: 'autonomia',    label: 'Autonomía y Avisos' },
] as const;

// Retrocompat: legacy ?tab=knowledge / ?tab=voz / ?tab=rol / ?tab=horarios / ?tab=marca
const LEGACY_MAP: Record<string, string> = {
  voz:       'personalidad',
  knowledge: 'conocimiento',
  rol:       'conocimiento',
  horarios:  'autonomia',
  marca:     'autonomia',
};

const VALID_TABS = new Set<string>(TAB_DEFS.map(t => t.value));

function resolveTab(raw: string): string {
  if (VALID_TABS.has(raw)) return raw;
  const mapped = LEGACY_MAP[raw];
  if (mapped && VALID_TABS.has(mapped)) return mapped;
  return 'personalidad';
}

/**
 * ConfigurarTabs
 *
 * 4-tab layout sincronizado con URL. Lee `?tab=rol` para saber cuál abrir.
 * Al cambiar tab actualiza la URL sin recargar (router.replace). También detecta
 * anchors `#voz`, `#correo`, etc. y hace scroll cuando el tab correspondiente
 * está activo.
 *
 * children[0..3] map to the 4 tab panels in order.
 */
export default function ConfigurarTabs({ children }: Props) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const tabFromUrl = searchParams?.get('tab') ?? '';
  const initialTab = resolveTab(tabFromUrl);
  const [tab, setTab] = useState<string>(initialTab);

  // Sync URL → tab when user pastes a link with ?tab=x (con retrocompat)
  useEffect(() => {
    const resolved = resolveTab(tabFromUrl);
    if (resolved !== tab) setTab(resolved);
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
      {/* Tabs en un solo renglón; en desktop centradas, en móvil con scroll horizontal */}
      <div className="flex justify-start sm:justify-center pb-1 min-w-0 max-w-full">
        <Tabs.List className="max-w-full sm:justify-center">
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
