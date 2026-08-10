'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface AgentOption {
  id:         string;
  name:       string;
  role:       string | null;
  color:      string | null;
}

interface Props {
  token:    string;
  agents:   AgentOption[];
  /** id del agente actualmente seleccionado (para highlight) */
  activeId: string;
}

/**
 * Chip strip para elegir qué empleado configurar cuando el org tiene N>1.
 * Solo se renderiza si hay más de un agente activo. Sin sesión de URL o
 * empleado_id explícito, el default es el primero por created_at.
 */
export default function EmpleadoPickerChips({ token, agents, activeId }: Props) {
  const searchParams = useSearchParams();
  if (agents.length <= 1) return null;

  // Preserva otros query params al cambiar de empleado (ej: tab=knowledge).
  const buildHref = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('empleado_id', id);
    return `/portal/${token}/configurar?${sp.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 pb-3"
      style={{ borderBottom: '1px solid #E8E3F5' }}>
      <span className="text-[11px] font-semibold uppercase tracking-widest mr-1"
        style={{ color: '#9B8FB5' }}>
        Empleado
      </span>
      {agents.map(a => {
        const active = a.id === activeId;
        const color  = a.color || '#6C3BFF';
        return (
          <Link key={a.id} href={buildHref(a.id)} scroll={false}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all no-underline"
            style={{
              background:  active ? `${color}15` : '#FAFAFB',
              border:      `1px solid ${active ? `${color}55` : '#E8E3F5'}`,
              color:       active ? color : '#1A0A3B',
              opacity:     active ? 1 : 0.85,
            }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: color }} />
            <span>{a.name}</span>
            {a.role && (
              <span style={{ color: active ? color : '#6B6480', opacity: 0.75 }}>
                · {a.role}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
