'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { BitacoraAgentSummary } from './loadBitacoraData';

interface Props {
  token:      string;
  activeId:   string;
  agents:     BitacoraAgentSummary[];
}

/**
 * Selector de empleado para /oficina/bitácora cuando hay más de un empleado
 * con bitácora activa. Cambia ?agent_id=X en la URL — page.tsx re-renderiza.
 * Si solo hay 1 empleado, no se muestra (single view).
 */
export function BitacoraTabs({ token, activeId, agents }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  if (agents.length < 2) return null;

  function switchAgent(agentId: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('agent_id', agentId);
    router.replace(`/portal/${token}/oficina/bitacora?${params.toString()}`, { scroll: false });
  }

  return (
    <div
      className="flex flex-wrap gap-1 p-1 rounded-xl"
      style={{ background: '#F4F1FB', border: '1px solid #E8E3F5' }}
    >
      {agents.map(a => {
        const active = a.id === activeId;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => switchAgent(a.id)}
            className="text-xs font-semibold px-3 py-1.5 rounded transition-colors"
            style={{
              background: active ? '#ffffff' : 'transparent',
              color:      active ? '#1A0A3B' : '#6B6480',
              border:     'none',
              cursor:     'pointer',
              boxShadow:  active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {a.agent_name}
            <span className="ml-1.5 text-[10px] font-normal" style={{ color: active ? '#9B8FB5' : '#9B8FB5' }}>
              ({a.incident_count})
            </span>
          </button>
        );
      })}
    </div>
  );
}
