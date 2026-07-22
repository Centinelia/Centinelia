'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, CheckCircle, Loader2, Trash2, AlertTriangle, RefreshCw, User } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentEmail {
  id:            string;
  provider:      'gmail' | 'outlook';
  email:         string;
  last_sync_at:  string | null;
  needs_reauth:  boolean;
  send_as_email: string | null;
}

// ── Provider config ───────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id:        'gmail' as const,
    label:     'Gmail',
    areaDesc:  'Google Workspace o Gmail del área',
    aliasNote: 'Para que funcione, este correo debe estar añadido como alias verificado en la cuenta de Gmail conectada (Configuración → Cuentas e importación → Enviar correo como).',
    color:     '#EA4335',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="8" width="40" height="32" rx="2" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
        <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="2.5" fill="none" />
      </svg>
    ),
  },
  {
    id:        'outlook' as const,
    label:     'Outlook',
    areaDesc:  'Microsoft 365 o Outlook del área',
    aliasNote: 'Para que funcione, el administrador de Microsoft 365 debe otorgar el permiso "Enviar como" para esta dirección en Exchange Admin Center.',
    color:     '#0078D4',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="6" fill="#0078D4" />
        <rect x="8" y="12" width="18" height="24" fill="#fff" opacity=".9" />
        <circle cx="17" cy="24" r="6" fill="#0078D4" />
        <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
      </svg>
    ),
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return 'Nunca';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentEmailSection({ token }: { token: string }) {
  const [connections,   setConnections]   = useState<AgentEmail[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [sendAsDraft,   setSendAsDraft]   = useState<Record<string, string>>({});
  const [savingSendAs,  setSavingSendAs]  = useState<string | null>(null);
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
    const label = provider === 'gmail' ? 'Gmail' : 'Outlook';
    if (!confirm(`¿Desconectar ${label} de este empleado?`)) return;
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

  const anyConnected = connections.length > 0;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Slot 1: Bandeja de área ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
            Bandeja de área
          </p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
            El empleado lee, clasifica y responde como esta dirección. Es el correo del área que este empleado atiende.
          </p>
        </div>

        {justConnected && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <CheckCircle size={13} />
            Correo conectado correctamente. Los mensajes nuevos se procesarán en los próximos minutos.
          </div>
        )}

        {PROVIDERS.map(provider => {
          const conn = connections.find(c => c.provider === provider.id);
          return (
            <div
              key={provider.id}
              className="rounded-xl p-4"
              style={{
                background: 'var(--c-surface)',
                border:     `1px solid ${conn && !conn.needs_reauth ? 'rgba(34,197,94,0.2)' : 'var(--c-border-2)'}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}
                >
                  {provider.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                      {provider.label}
                    </span>
                    {conn && !conn.needs_reauth && (
                      <span
                        className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                      >
                        <CheckCircle size={10} /> Conectado
                      </span>
                    )}
                    {conn?.needs_reauth && (
                      <span
                        className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
                      >
                        <AlertTriangle size={10} /> Requiere reconexión
                      </span>
                    )}
                  </div>

                  {conn ? (
                    <>
                      <p className="text-xs mt-0.5 truncate font-mono" style={{ color: 'var(--c-text-2)' }}>
                        {conn.email}
                      </p>
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--c-text-4)' }}>
                        <RefreshCw size={9} />
                        Última sync: {timeAgo(conn.last_sync_at)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                      {provider.areaDesc}
                    </p>
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
                          : <Trash2 size={14} />
                        }
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

        <div
          className="flex gap-2 rounded-lg px-3 py-2"
          style={{ background: 'rgba(108,59,255,0.04)', border: '1px solid rgba(108,59,255,0.1)' }}
        >
          <Mail size={12} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-4)' }}>
            Los mensajes nuevos se revisan cada 15 minutos. El empleado los analiza y los deja listos para revisión en la Oficina.
          </p>
        </div>
      </div>

      {/* ── Slot 2: Correo propio del empleado ───────────────────────────── */}
      {anyConnected && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
              Correo propio del empleado
            </p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
              Para seguimientos, propuestas y correos personales, el empleado envía desde su propia dirección en lugar del correo del área.
            </p>
          </div>

          {connections.map(conn => {
            const provider = PROVIDERS.find(p => p.id === conn.provider)!;
            const draft    = sendAsDraft[conn.provider] ?? '';
            const current  = conn.send_as_email ?? '';
            const dirty    = draft !== current;
            const hasValue = !!conn.send_as_email;

            return (
              <div
                key={conn.provider}
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{
                  background: 'var(--c-surface)',
                  border:     `1px solid ${hasValue ? 'rgba(108,59,255,0.2)' : 'var(--c-border-2)'}`,
                }}
              >
                {/* Provider label + current value */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}
                  >
                    {provider.icon}
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
                    {provider.label}
                  </span>
                  {hasValue && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                      style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF' }}>
                      {conn.send_as_email}
                    </span>
                  )}
                </div>

                {/* Input row */}
                <div className="flex items-center gap-2">
                  <User size={12} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
                  <input
                    type="email"
                    placeholder="Neo@empresa.com"
                    value={draft}
                    onChange={e => setSendAsDraft(prev => ({ ...prev, [conn.provider]: e.target.value }))}
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg outline-none"
                    style={{
                      background: 'var(--c-bg)',
                      border:     '1px solid var(--c-border)',
                      color:      'var(--c-text)',
                      minWidth:   0,
                    }}
                  />
                  <button
                    onClick={() => saveSendAs(conn.provider)}
                    disabled={savingSendAs === conn.provider || !dirty}
                    className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80 disabled:opacity-40 flex-shrink-0"
                    style={{ background: '#6C3BFF', color: '#fff' }}
                  >
                    {savingSendAs === conn.provider
                      ? <Loader2 size={11} className="animate-spin" />
                      : 'Guardar'
                    }
                  </button>
                </div>

                {/* Setup instructions */}
                <p className="text-[11px] leading-relaxed pl-4" style={{ color: 'var(--c-text-4)' }}>
                  {provider.aliasNote}
                </p>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
