'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import AgentTasksSection    from './AgentTasksSection';
import PlanApprovalsSection from '../tareas-programadas/PlanApprovalsSection';
import TareasProgramadasSection from '../tareas-programadas/TareasProgramadasSection';

type Tab = 'tareas' | 'programadas';

interface AgentInfo {
  id:              string;
  agent_name:      string | null;
  role:            string | null;
  is_coordinator:  boolean;
  meerkat_role_id: string | null;
}

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: 'tareas',      label: 'Tareas',       desc: 'Trabajo delegado + aprobaciones pendientes' },
  { key: 'programadas', label: 'Programadas',  desc: 'Ejecución en calendario (cron)' },
];

export default function TareasClient({ token, agents }: { token: string; agents: AgentInfo[] }) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();
  const initial      = (searchParams.get('tab') as Tab) === 'programadas' ? 'programadas' : 'tareas';
  const [tab, setTab] = useState<Tab>(initial);

  useEffect(() => {
    const q = new URLSearchParams(Array.from(searchParams.entries()));
    if (tab === 'tareas') q.delete('tab'); else q.set('tab', tab);
    const url = q.toString() ? `${pathname}?${q.toString()}` : pathname;
    router.replace(url, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Tareas</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Todo lo que tus empleados están haciendo o programaron. Aquí ves progreso, resultado y aprobaciones pendientes.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg p-1 w-fit" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-md text-sm transition-all"
            style={{
              color:      tab === t.key ? '#FAFBFF' : 'var(--c-text-2)',
              background: tab === t.key ? '#6C3BFF' : 'transparent',
              fontWeight: tab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tareas' && (
        <div className="space-y-4">
          <PlanApprovalsSection token={token} />
          <AgentTasksSection    token={token} />
        </div>
      )}

      {tab === 'programadas' && (
        <TareasProgramadasSection token={token} agents={agents} />
      )}
    </div>
  );
}
