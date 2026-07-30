'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Mail, CheckCircle, Loader2, Trash2, Zap, ZapOff, AlertTriangle, ArrowLeftRight } from 'lucide-react';

interface Integration {
  id:           string;
  provider:     'gmail' | 'outlook';
  email:        string;
  auto_reply:   boolean;
  agent_id?:    string;
  last_sync_at: string | null;
  needs_reauth: boolean;
}


const PROVIDERS = [
  {
    id:          'gmail' as const,
    label:       'Gmail',
    description: 'Google Workspace o Gmail personal',
    color:       '#EA4335',
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
    id:          'outlook' as const,
    label:       'Outlook',
    description: 'Microsoft 365 o Outlook personal',
    color:       '#0078D4',
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

export default function EmailOAuthSection({ token, only, workspacePanel }: { token: string; only?: 'gmail' | 'outlook'; workspacePanel?: React.ReactNode }) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [toggling,     setToggling]     = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [showAll,      setShowAll]      = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);

  function flashNote() {
    const el = noteRef.current;
    if (!el) return;
    el.classList.remove('anchor-active');
    void el.offsetWidth;
    el.classList.add('anchor-active');
    setTimeout(() => el.classList.remove('anchor-active'), 2000);
  }

  const load = useCallback(async () => {
    const res  = await fetch(`/api/portal/${token}/email-oauth`);
    const data = await res.json();
    setIntegrations(data.integrations ?? []);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function connectedFor(provider: 'gmail' | 'outlook') {
    return integrations.find(i => i.provider === provider) ?? null;
  }

  async function toggleAutoReply(provider: 'gmail' | 'outlook', current: boolean) {
    setToggling(provider);
    await fetch(`/api/portal/${token}/email-oauth`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ provider, auto_reply: !current }),
    });
    setIntegrations(prev => prev.map(i => i.provider === provider ? { ...i, auto_reply: !current } : i));
    setToggling(null);
    flashNote();
  }

  async function disconnect(provider: 'gmail' | 'outlook') {
    if (!confirm(`¿Desconectar ${provider === 'gmail' ? 'Gmail' : 'Outlook'}?`)) return;
    setDisconnecting(provider);
    await fetch(`/api/portal/${token}/email-oauth`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ provider }),
    });
    setIntegrations(prev => prev.filter(i => i.provider !== provider));
    setDisconnecting(null);
    setShowAll(false);
  }

  const connectedProvider = integrations.find(i => !i.needs_reauth)?.provider ?? null;
  const visibleProviders  = only
    ? PROVIDERS.filter(p => p.id === only)
    : (connectedProvider && !showAll)
      ? PROVIDERS.filter(p => p.id === connectedProvider)
      : PROVIDERS;

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
      {visibleProviders.map(provider => {
        const connected = connectedFor(provider.id);
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
                  <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{provider.label}</span>
                  {connected && (
                    <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <CheckCircle size={10} /> Conectado
                    </span>
                  )}
                </div>
                {connected ? (
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-3)' }}>{connected.email}</p>
                ) : (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{provider.description}</p>
                )}
                {connected && !connected.needs_reauth && connected.last_sync_at && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                    Última sync: {new Date(connected.last_sync_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                )}
                {connected?.needs_reauth && (
                  <p className="text-xs mt-0.5 font-semibold flex items-center gap-1" style={{ color: '#f59e0b' }}>
                    <AlertTriangle size={10} /> Requiere reconexion
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {connected && (
                  // Toggle legacy de auto_reply. El nuevo Modo de respuesta (auto_mode)
                  // se configura en /portal/[token]/configurar, per-empleado.
                  <button
                    onClick={() => toggleAutoReply(provider.id, connected.auto_reply)}
                    disabled={toggling === provider.id}
                    title={connected.auto_reply ? 'Respuesta automática activa' : 'Respuesta automática desactivada'}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={connected.auto_reply
                      ? { background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.25)' }
                      : { background: 'var(--c-bg)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
                  >
                    {toggling === provider.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : connected.auto_reply ? <Zap size={12} /> : <ZapOff size={12} />}
                    Auto-respuesta
                  </button>
                )}
                {connected && (
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
                )}
                {!connected && (
                  <a
                    href={`/api/portal/${token}/email-oauth/connect?provider=${provider.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                    style={{ background: provider.color, color: '#fff', textDecoration: 'none' }}
                  >
                    <Mail size={12} />
                    Conectar
                  </a>
                )}
              </div>
            </div>

            {connected && connected.needs_reauth && (
              <div className="mt-3 pt-3 px-3 py-3 rounded-lg flex flex-col gap-2"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                    La sesion expiro o fue revocada. Tu empleado no puede leer ni responder correos hasta que reconectes la cuenta.
                  </p>
                </div>
                <a
                  href={`/api/portal/${token}/email-oauth/connect?provider=${provider.id}`}
                  className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ background: '#f59e0b', color: '#000', textDecoration: 'none' }}
                >
                  <Mail size={11} /> Reconectar {provider.label}
                </a>
              </div>
            )}
            {connected && !connected.needs_reauth && (
              workspacePanel ? (
                <div className="mt-3 grid gap-3 items-center" style={{ gridTemplateColumns: '4fr 7fr' }}>
                  <div>{workspacePanel}</div>
                  <div className="flex flex-col gap-2">
                    <div ref={noteRef} className="flex items-start gap-2 rounded-lg px-3 py-2"
                      style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                      {connected.auto_reply
                        ? <Zap size={12} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
                        : <ZapOff size={12} style={{ color: 'var(--c-text-4)', flexShrink: 0, marginTop: 1 }} />}
                      <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                        {connected.auto_reply
                          ? 'Tu empleado lee el correo entrante, redacta una respuesta y la envía directamente sin pedir aprobación.'
                          : 'Tu empleado redacta una respuesta y se la envía a tu aprobador asignado para que la apruebe o descarte antes de que salga.'}
                      </p>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg px-3 py-2"
                      style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.12)' }}>
                      <Mail size={12} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                        Los correos se sincronizan automáticamente cada 15 minutos. Solo se procesan mensajes nuevos no leídos en tu bandeja de entrada.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-start gap-2 rounded-lg px-3 py-2"
                    style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                    {connected.auto_reply
                      ? <Zap size={12} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
                      : <ZapOff size={12} style={{ color: 'var(--c-text-4)', flexShrink: 0, marginTop: 1 }} />}
                    <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      {connected.auto_reply
                        ? 'Tu empleado responde automáticamente a los correos entrantes usando el borrador redactado, sin requerir tu aprobación.'
                        : 'Los correos entrantes se procesan y aparecen en La Oficina. Recibirás un correo para aprobar o descartar la respuesta de tu empleado.'}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg px-3 py-2"
                    style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.12)' }}>
                    <Mail size={12} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                      Los correos se sincronizan automáticamente cada 15 minutos. Solo se procesan mensajes nuevos no leídos en tu bandeja de entrada.
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        );
      })}

      {workspacePanel && !connectedProvider && (
        <div>{workspacePanel}</div>
      )}

      {!only && connectedProvider && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="self-start flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
          style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
        >
          <ArrowLeftRight size={11} />
          Cambiar proveedor
        </button>
      )}

      {!only && connectedProvider && showAll && (
        <p className="text-xs px-1" style={{ color: 'var(--c-text-4)' }}>
          Para cambiar, desconecta el proveedor actual y luego conecta el nuevo.
        </p>
      )}

    </div>
  );
}
