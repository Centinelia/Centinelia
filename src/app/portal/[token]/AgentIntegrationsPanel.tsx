'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Loader2, Mail, Calendar, HardDrive, Database, CheckCircle, XCircle } from 'lucide-react';
import AgentEmailSection from './AgentEmailSection';

interface AgentRow {
  id:               string;
  agent_name:       string | null;
  role:             string;
  portal_token:     string;
  role_color:       string | null;
  connections:      { provider: string; needs_reauth?: boolean }[];
  notion_connected: boolean;
}

function RoleChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: `${color}1f`, color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

interface IntegrationPillProps {
  icon:      React.ReactNode;
  label:     string;
  connected: boolean;
}
function IntegrationPill({ icon, label, connected }: IntegrationPillProps) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
      style={{
        background: connected ? 'rgba(34,197,94,0.08)' : 'var(--c-surface-2)',
        color:      connected ? '#22c55e' : 'var(--c-text-4)',
        border:     connected ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--c-border)',
      }}
      title={`${label}: ${connected ? 'conectado' : 'no conectado'}`}
    >
      {icon}
      {label}
    </span>
  );
}

function NotionSection({ token }: { token: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
        Notion
      </p>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
        Notion se configura a nivel de cuenta, no por empleado. Para conectar o cambiar la base de datos, ve a Integraciones.
      </p>
      <a
        href={`/portal/${token}?tab=negocio#integraciones`}
        className="self-start text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80"
        style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}
      >
        Ir a Integraciones
      </a>
    </div>
  );
}

function AgentAccordion({ agent }: { agent: AgentRow }) {
  const [open, setOpen] = useState(false);
  const color = agent.role_color ?? '#6C3BFF';
  const name  = agent.agent_name?.trim() || 'Empleado';

  const emailOk = agent.connections.some(c => !c.needs_reauth);
  const hasAnyConn = emailOk || agent.notion_connected;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
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

          {/* Integration status pills */}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <IntegrationPill
              icon={<Mail size={8} />}
              label="Correo"
              connected={emailOk}
            />
            <IntegrationPill
              icon={<Calendar size={8} />}
              label="Calendario"
              connected={emailOk}
            />
            <IntegrationPill
              icon={<HardDrive size={8} />}
              label="Drive"
              connected={emailOk}
            />
            <IntegrationPill
              icon={<Database size={8} />}
              label="Notion"
              connected={agent.notion_connected}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {hasAnyConn ? (
            <CheckCircle size={13} style={{ color: '#22c55e' }} />
          ) : (
            <XCircle size={13} style={{ color: 'var(--c-text-4)' }} />
          )}
          <ChevronDown
            size={15}
            style={{
              color:      'var(--c-text-3)',
              transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </div>
      </button>

      {open && (
        <div
          className="px-4 pb-4 pt-3 flex flex-col gap-6"
          style={{ borderTop: '1px solid var(--c-border)', background: 'var(--c-bg)' }}
        >
          {/* Email / Calendar / Drive — all from same OAuth */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
              Correo, Calendario y Drive
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
              Una sola conexión de Gmail u Outlook activa los tres. Conecta el correo del area para habilitarlos.
            </p>
            <AgentEmailSection token={agent.portal_token} />
          </div>

          {/* Notion */}
          <NotionSection token={agent.portal_token} />
        </div>
      )}
    </div>
  );
}

export default function AgentIntegrationsPanel({ token }: { token: string }) {
  const [agents,  setAgents]  = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/portal/${token}/integrations/agents`);
      const data = await res.json();
      setAgents(data.agents ?? []);
    } finally { setLoading(false); }
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
