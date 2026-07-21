'use client';

import { useEffect, useState } from 'react';

export type SidebarSection = { id: string; label: string; group: string };

export default function ConfigurarSidebar({
  sections,
  roleColor,
}: {
  sections: SidebarSection[];
  roleColor: string;
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );
    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []); // stable — sections don't change after mount

  const groups = Array.from(new Set(sections.map(s => s.group)));

  return (
    <nav className="hidden lg:flex flex-col gap-0.5 sticky top-6 self-start w-48 flex-shrink-0">
      {groups.map((group, gi) => (
        <div key={group}>
          {gi > 0 && (
            <div className="my-2" style={{ borderTop: '1px solid var(--c-border)' }} />
          )}
          <p className="text-[10px] font-bold tracking-widest uppercase px-3 mb-1"
            style={{ color: 'var(--c-text-4)' }}>
            {group}
          </p>
          {sections.filter(s => s.group === group).map(s => {
            const active = activeId === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={e => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background:  active ? `${roleColor}15` : 'transparent',
                  color:       active ? roleColor : 'var(--c-text-3)',
                  borderLeft:  `2px solid ${active ? roleColor : 'transparent'}`,
                }}
              >
                {s.label}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
