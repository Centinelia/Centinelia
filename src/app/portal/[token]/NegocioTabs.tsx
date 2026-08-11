'use client';

/**
 * NegocioTabs — 5-tab layout para /organizacion (tab=negocio del portal).
 *
 * Mismo patrón que ConfigurarTabs: URL sync (?nav=identidad), anchor scroll,
 * retrocompat con anchors legacy que apuntaban a la vista scroll larga.
 *
 * children[0..4] = paneles en orden de TAB_DEFS.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Tabs from '@/components/portal-ui/overlays/Tabs';

interface Props { children: React.ReactNode[] }

const TAB_DEFS = [
  { value: 'perfil',        label: 'Perfil' },
  { value: 'identidad',     label: 'Identidad' },
  { value: 'operacion',     label: 'Operación' },
  { value: 'directorio',    label: 'Directorio' },
  { value: 'integraciones', label: 'Integraciones' },
] as const;

// Mapa anchor → tab donde vive. Permite que links viejos (#branding, #horarios,
// etc.) sigan funcionando: cambian al tab correcto y hacen scroll al anchor.
const ANCHOR_TO_TAB: Record<string, string> = {
  organizacion:    'perfil',
  conocimiento:    'perfil',
  'perfil-dueno':  'perfil',
  branding:        'identidad',
  'tono-de-marca': 'identidad',
  sitio:           'identidad',
  horarios:        'operacion',
  'sheets-crm':    'operacion',
  directorio:      'directorio',
  integraciones:   'integraciones',
};

const VALID_TABS = new Set<string>(TAB_DEFS.map(t => t.value));

function resolveTabFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace('#', '');
  if (!hash) return null;
  return ANCHOR_TO_TAB[hash] ?? null;
}

function resolveTab(rawNav: string): string {
  if (VALID_TABS.has(rawNav)) return rawNav;
  const fromHash = resolveTabFromHash();
  if (fromHash) return fromHash;
  return 'perfil';
}

export default function NegocioTabs({ children }: Props) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const navFromUrl  = searchParams?.get('nav') ?? '';
  const [tab, setTab] = useState<string>(() => resolveTab(navFromUrl));

  // Sync URL → tab
  useEffect(() => {
    const resolved = resolveTab(navFromUrl);
    if (resolved !== tab) setTab(resolved);
  }, [navFromUrl, tab]);

  // Listen for hash-only navigation (same tab, different sub-section anchor).
  // Sin esto, hacer click en un sidebar item que apunta a otro sub-tab dentro
  // de Organización solo cambia el hash — searchParams no cambian y este
  // componente no se enteraría, dejando el usuario en el sub-tab equivocado.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const fromHash = resolveTabFromHash();
      if (fromHash && fromHash !== tab) setTab(fromHash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [tab]);

  // Scroll al anchor cuando cambia el tab (con delay para que el DOM del panel esté montado).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => clearTimeout(timer);
  }, [tab]);

  const handleChange = (v: string) => {
    setTab(v);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('nav', v);
    // Limpia hash al cambiar tab — el hash legacy ya nos posicionó, y mantenerlo
    // dispararía otro scroll cuando el usuario cambia manualmente de tab.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs.Root value={tab} onValueChange={handleChange} variant="pill">
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
