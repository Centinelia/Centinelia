'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, CheckCircle, Loader2, Trash2, AlertTriangle, RefreshCw, Send } from 'lucide-react';

interface AgentEmail {
  id:             string;
  provider:       'gmail' | 'outlook';
  email:          string;
  last_sync_at:   string | null;
  needs_reauth:   boolean;
  send_as_email:  string | null;
}

const PROVIDERS = [
  {
    id:    'gmail' as const,
    label: 'Gmail',
    desc:  'Google Workspace o Gmail del área',
    color: '#EA4335',
    icon: (
      <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
        <path d="M4 8h40v32H4z" fill="#fff" />
        <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="3" fill="none" />
        <rect x="4" y="8" width="40" height="32" rx="2" stroke="#ddd" strokeWidth="1.5" fill="none" />
        <path d="M4 8l20 14L44 8" fill="none" stroke="#EA4335" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    id:    'outlook' as const,
    label: 'Outlook',
    desc:  'Microsoft 365 o Outlook del área',
    color: '#0078D4',
    icon: (
      <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="6" fill="#0078D4" />
        <path d="M8 12h20v24H8z" fill="#fff" opacity=".9" />
        <circle cx="18" cy="24" r="7" fill="#0078D4" />
        <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
      </svg>
    ),
  },
];

function timeAgo(iso: string | null): string {
  if (!iso) return 'Nunca';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)   return 'Ahora';
  if (mins < 60)  return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

export default function AgentEmailSection({ token }: { token: string }) {
  const [connections,   setConnections]   = useState<AgentEmail[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [sendAsDraft,   setSendAsDraft]   = useState<Record<string, string>>({});
  const [savingSendAs,  setSavingSendAs]  = useState<string | null>(null);

  // Show success banner when returning from OAuth
  const [justConnected, setJustConnected] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('email') === 'connected') {
      setJustConnected(p.get('provider'));
      const next = new URL(window.location.href);
      next.searchParams.delete('email');
      next.searchParams.delete('provider');
      window.history.replaceState({}, '', next.toString());
    }
  }, []);

  const load = useCallback(async () => {
    const res  = await fetch(`/api/portal/${token}/agent-email`);
    const data = await res.json();
    const conns: AgentEmail[] = data.connections ?? [];
    setConnections(conns);
    setSendAsDraft(Object.fromEntries(conns.map(c => [c.provider, c.send_as_email ?? ''])));
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function connectedFor(provider: 'gmail' | 'outlook') {
    return connections.find(c => c.provider === provider) ?? null;
  }

  async function saveSendAs(provider: 'gmail' | 'outlook') {
    setSavingSendAs(provider);
    await fetch(`/api/portal/${token}/agent-email`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ provider, send_as_email: sendAsDraft[provider] || null }),
    });
    setConnections(prev => prev.map(c =>
      c.provider === provider ? { ...c, send_as_email: sendAsDraft[provider] || null } : c,
    ));
    setSavingSendAs(null);
  }

  async function disconnect(provider: 'gmail' | 'outlook') {
    if (!confirm(`¿Desconectar ${provider === 'gmail' ? 'Gmail' : 'Outlook'} de este empleado?`)) return;
    setDisconnecting(provider);
    await fetch(`/api/portal/${token}/agent-email`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ provider }),
    });
    setConnections(prev => prev.filter(c => c.provider !== provider));
    setDisconnecting(null);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4" style={{ color: 'var(--c-text-3)' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
        Conecta el correo de este empleado para que reciba y procese mensajes de su área de forma autónoma. Cada empleado puede tener su propio correo independiente.
      </p>

      {justConnected && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
          <CheckCircle size={13} />
          Correo conectado correctamente. Los nuevos mensajes se procesarán en los próximos minutos.
        </div>
      )}

      {PROVIDERS.map(provider => {
        const conn = connectedFor(provider.id);
        return (
          <div key={provider.id}
            className="rounded-xl p-4"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                {provider.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    {provider.label}
                  </span>
                  {conn && !conn.needs_reauth && (
                    <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <CheckCircle size={10} /> Conectado
                    </span>
                  )}
                  {conn?.needs_reauth && (
                    <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                      <AlertTriangle size={10} /> Requiere reconexión
                    </span>
                  )}
                </div>

                {conn ? (
                  <>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-3)' }}>
                      {conn.email}
                    </p>
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--c-text-4)' }}>
                      <RefreshCw size={9} />
                      Última sync: {timeAgo(conn.last_sync_at)}
                    </p>
                  </>
                ) : (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{provider.desc}</p>
                )}

                {conn && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Send size={11} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                      <input
                        type="email"
                        placeholder="Correo de envío (ej: noah@empresa.com)"
                        value={sendAsDraft[provider.id] ?? ''}
                        onChange={e => setSendAsDraft(prev => ({ ...prev, [provider.id]: e.target.value }))}
                        className="flex-1 text-xs px-2 py-1 rounded-lg outline-none"
                        style={{
                          background: 'var(--c-bg)',
                          border:     '1px solid var(--c-border)',
                          color:      'var(--c-text)',
                          minWidth:   0,
                        }}
                      />
                      <button
                        onClick={() => saveSendAs(provider.id)}
                        disabled={
                          savingSendAs === provider.id ||
                          (sendAsDraft[provider.id] ?? '') === (conn.send_as_email ?? '')
                        }
                        className="text-xs px-2.5 py-1 rounded-lg font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ background: provider.color, color: '#fff', flexShrink: 0 }}
                      >
                        {savingSendAs === provider.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : 'Guardar'}
                      </button>
                    </div>
                    <p className="text-xs leading-relaxed pl-4" style={{ color: 'var(--c-text-4)' }}>
                      {provider.id === 'gmail'
                        ? 'Para que funcione, este correo debe estar añadido como alias verificado en la cuenta de Gmail conectada (Configuración → Cuentas e importación → Enviar correo como).'
                        : 'Para que funcione, el administrador de Microsoft 365 debe otorgar el permiso "Enviar como" para esta dirección en Exchange Admin Center.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {conn ? (
                  <>
                    {conn.needs_reauth && (
                      <a
                        href={`/api/portal/${token}/email-oauth/connect?provider=${provider.id}&scope=agent`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ background: '#f59e0b', color: '#000', textDecoration: 'none' }}
                      >
                        <Mail size={11} /> Reconectar
                      </a>
                    )}
                    <button
                      onClick={() => disconnect(provider.id)}
                      disabled={disconnecting === provider.id}
                      className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      style={{ color: 'var(--c-text-3)' }}
                      title="Desconectar"
                    >
                      {disconnecting === provider.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </>
                ) : (
                  <a
                    href={`/api/portal/${token}/email-oauth/connect?provider=${provider.id}&scope=agent`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                    style={{ background: provider.color, color: '#fff', textDecoration: 'none' }}
                  >
                    <Mail size={12} /> Conectar
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex gap-2 rounded-lg px-3 py-2.5"
        style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.12)' }}>
        <Mail size={13} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Los mensajes nuevos se revisan cada 15 minutos. El empleado los analiza, genera un borrador de respuesta y los deja listos para tu revisión en la Oficina.
        </p>
      </div>
    </div>
  );
}
