'use client';

import Link from 'next/link';

interface Tab { id: string; label: string; }

export default function PortalTabNav({ token, currentTab, tabs }: { token: string; currentTab: string; tabs: Tab[] }) {
  const current = tabs.find(t => t.id === currentTab);

  return (
    <>
      {/* Desktop: horizontal scrollable tabs */}
      <div className="hidden sm:flex gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {tabs.map(t => (
          <Link
            key={t.id}
            href={`/portal/${token}?tab=${t.id}`}
            className="px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2"
            style={{
              borderColor: currentTab === t.id ? '#6C3BFF' : 'transparent',
              color:       currentTab === t.id ? '#6C3BFF' : 'var(--c-text-3)',
              filter:      currentTab === t.id ? 'drop-shadow(0 0 8px rgba(108,59,255,0.5))' : undefined,
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Mobile: título de la pestaña actual como referencia visual.
          La navegación entre pestañas vive en el drawer del header. */}
      <div className="flex sm:hidden w-full items-center py-2.5">
        <span
          className="text-sm font-semibold"
          style={{ color: '#6C3BFF', filter: 'drop-shadow(0 0 8px rgba(108,59,255,0.4))' }}
        >
          {current?.label}
        </span>
      </div>
    </>
  );
}
