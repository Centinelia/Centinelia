'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

interface Tab { id: string; label: string; }

export default function PortalTabNav({ token, currentTab, tabs }: { token: string; currentTab: string; tabs: Tab[] }) {
  const [open, setOpen] = useState(false);
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

      {/* Mobile: current tab name + hamburger, whole row is clickable */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex sm:hidden w-full items-center justify-between py-2.5 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span className="text-sm font-semibold" style={{ color: '#6C3BFF', filter: 'drop-shadow(0 0 8px rgba(108,59,255,0.4))' }}>
          {current?.label}
        </span>
        <span
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--c-text-2)', background: open ? 'var(--c-surface-2)' : 'transparent' }}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </span>
      </button>

      {/* Mobile dropdown, inline expansion, negative margins to fill nav bar width */}
      {open && (
        <div className="sm:hidden" style={{ marginLeft: '-1rem', marginRight: '-1rem', borderTop: '1px solid var(--c-border)' }}>
          {tabs.map((t, i) => (
            <Link
              key={t.id}
              href={`/portal/${token}?tab=${t.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-5 py-3.5 text-sm font-medium"
              style={{
                borderTop:  i > 0 ? '1px solid var(--c-border)' : undefined,
                color:      currentTab === t.id ? '#6C3BFF' : 'var(--c-text-2)',
                background: currentTab === t.id ? 'rgba(108,59,255,0.06)' : 'transparent',
              }}
            >
              <span>{t.label}</span>
              {currentTab === t.id && (
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#6C3BFF' }} />
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
