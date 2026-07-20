'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Loader2, Mail } from 'lucide-react';
import AgentEmailSection from './AgentEmailSection';

interface AgentRow {
  id:           string;
  agent_name:   string | null;
  role:         string;
  portal_token: string;
  role_color:   string | null;
  connections:  { provider: string }[];
}

function RoleChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{
        background: `${color}1f`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
}

function AgentAccordion({ agent }: { agent: AgentRow }) {
  const [open, setOpen] = useState(false);
  const color           = agent.role_color ?? '#6C3BFF';
  const name            = agent.agent_name?.trim() || 'Empleado';
  const connCount       = agent.connections.length;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--c-border)' }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--c-surface-2)]"
        style={{ background: 'var(--c-surface)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
          style={{ background: `${color}1a`, border: `1px solid ${color}33`, color }}
        >
          {name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              {name}
            </span>
            {agent.role && <RoleChip label={agent.role} color={color} />}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {connCount === 0
              ? 'Sin correo conectado'
              : connCount === 1
                ? '1 correo conectado'
                : `${connCount} correos conectados`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {connCount > 0 && (
            <span
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: 'rgba(34,197,94,0.08)',
                color:      '#22c55e',
                border:     '1px solid rgba(34,197,94,0.15)',
              }}
            >
              <Mail size={9} /> Activo
            </span>
          )}
          <ChevronDown
            size={15}
            style={{
              color:     'var(--c-text-3)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </div>
      </button>

      {open && (
        <div
          className="px-4 pb-4 pt-3"
          style={{ borderTop: '1px solid var(--c-border)', background: 'var(--c-bg)' }}
        >
          <AgentEmailSection token={agent.portal_token} />
        </div>
      )}
    </div>
  );
}

export default function AgentIntegrationsPanel({ token }: { token: string }) {
  const [agents,  setAgents]  = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res  = await fetch(`/api/portal/${token}/integrations/agents`);
    const data = await res.json();
    setAgents(data.agents ?? []);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6" style={{ color: 'var(--c-text-3)' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Cargando empleados...</span>
      </div>
    );
  }

  if (!agents.length) {
    return (
      <p className="text-sm py-4" style={{ color: 'var(--c-text-3)' }}>
        No hay empleados en esta cuenta.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {agents.map(agent => (
        <AgentAccordion key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
