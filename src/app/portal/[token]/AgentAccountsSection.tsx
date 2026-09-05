'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle, Cloud, Loader2, Trash2 } from 'lucide-react';

// Cuentas per-empleado para Calendar (Google/Outlook) y Storage (Drive/OneDrive).
// Fase 1 del desacople per-agent (ver .brain/decisions/2026-09-04-integraciones-per-agent-vs-org-level.md).

type Kind = 'calendar' | 'storage';
type Provider = 'google' | 'microsoft' | 'dropbox';

interface Account {
  provider:      Provider;
  capability:    string;
  email:         string;
  needs_reauth:  boolean;
  expires_at:    string | null;
  also_used_by?: string[];
}

interface ProviderMeta {
  id:    Provider;
  label: string;
  color: string;
  icon:  React.ReactNode;
}

const CAL_PROVIDERS: ProviderMeta[] = [
  {
    id: 'google', label: 'Google Calendar', color: '#4285F4',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="8" width="40" height="36" rx="3" fill="#fff" stroke="#4285F4" strokeWidth="2" />
        <path d="M4 18h40" stroke="#4285F4" strokeWidth="2" />
        <rect x="14" y="2" width="4" height="10" rx="2" fill="#4285F4" />
        <rect x="30" y="2" width="4" height="10" rx="2" fill="#4285F4" />
        <rect x="13" y="24" width="8" height="8" rx="1" fill="#4285F4" />
      </svg>
    ),
  },
  {
    id: 'microsoft', label: 'Outlook Calendar', color: '#0078D4',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="8" width="40" height="36" rx="3" fill="#fff" stroke="#0078D4" strokeWidth="2" />
        <path d="M4 18h40" stroke="#0078D4" strokeWidth="2" />
        <rect x="14" y="2" width="4" height="10" rx="2" fill="#0078D4" />
        <rect x="30" y="2" width="4" height="10" rx="2" fill="#0078D4" />
        <rect x="13" y="24" width="8" height="8" rx="1" fill="#0078D4" />
      </svg>
    ),
  },
];

const STORAGE_PROVIDERS: ProviderMeta[] = [
  {
    id: 'google', label: 'Google Drive', color: '#4285F4',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <path d="M6 38h36l-6-10H12L6 38z" fill="#FBBC04" />
        <path d="M24 4h12L24 24H12L24 4z" fill="#4285F4" />
        <path d="M4 38l8-14L24 4 12 24 6 38H4z" fill="#34A853" />
        <path d="M36 24l6 14H18l6-14h12z" fill="#FBBC04" />
      </svg>
    ),
  },
  {
    id: 'microsoft', label: 'OneDrive', color: '#0078D4',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <path d="M28 34H10a8 8 0 01-2-15.7A11 11 0 0129 14a9 9 0 018 9 8 8 0 01-1 17H28z" fill="#0078D4" />
        <path d="M34 34H20a6 6 0 01-1-12 9 9 0 0116.5-2A7 7 0 0134 34z" fill="#28A8E8" />
      </svg>
    ),
  },
  {
    id: 'dropbox', label: 'Dropbox', color: '#0061FF',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <path d="M12 6l12 8-12 8L0 14l12-8z" fill="#0061FF" />
        <path d="M36 6l12 8-12 8-12-8 12-8z" fill="#0061FF" />
        <path d="M12 22l12 8-12 8L0 30l12-8z" fill="#0061FF" />
        <path d="M36 22l12 8-12 8-12-8 12-8z" fill="#0061FF" />
      </svg>
    ),
  },
];

const KIND_META: Record<Kind, {
  routeSlug: string;
  urlFlag:   string;
  Icon:      React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title:     string;
  desc:      string;
  providers: ProviderMeta[];
}> = {
  calendar: {
    routeSlug: 'agent-calendar-oauth',
    urlFlag:   'cal',
    Icon:      Calendar,
    title:     'Calendario del empleado',
    desc:      'Conecta el calendario personal de este empleado para que agende y consulte citas en su propio Google/Outlook.',
    providers: CAL_PROVIDERS,
  },
  storage: {
    routeSlug: 'agent-storage-oauth',
    urlFlag:   'storage',
    Icon:      Cloud,
    title:     'Almacenamiento del empleado',
    desc:      'Conecta el Drive, OneDrive o Dropbox donde este empleado guardará y buscará sus archivos.',
    providers: STORAGE_PROVIDERS,
  },
};

export default function AgentAccountsSection({
  token, agentId, kind,
}: {
  token:   string;
  agentId: string;
  kind:    Kind;
}) {
  const meta = KIND_META[kind];
  const [accounts,      setAccounts]      = useState<Account[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(false);
  const [disconnecting, setDisconnecting] = useState<Provider | null>(null);
  const [justConnected, setJustConnected] = useState<string | null>(null);

  // Detecta callback exitoso al montar (?cal=connected&provider=google | ?storage=connected&provider=microsoft)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get(meta.urlFlag) === 'connected') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJustConnected(p.get('provider'));
      const next = new URL(window.location.href);
      next.searchParams.delete(meta.urlFlag);
      next.searchParams.delete('provider');
      window.history.replaceState({}, '', next.toString());
    }
  }, [meta.urlFlag]);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/portal/${token}/${meta.routeSlug}?agentId=${agentId}`);
      if (!res.ok) throw new Error('fetch-error');
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } catch {
      setError(true);
    } finally { setLoading(false); }
  }, [token, agentId, meta.routeSlug]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function disconnect(provider: Provider) {
    const label = meta.providers.find(p => p.id === provider)?.label ?? provider;
    if (!confirm(`¿Desconectar ${label} de este empleado?`)) return;
    setDisconnecting(provider);
    const snapshot = accounts;
    setAccounts(prev => prev.filter(a => a.provider !== provider));
    try {
      const res = await fetch(`/api/portal/${token}/${meta.routeSlug}`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agentId, provider }),
      });
      if (!res.ok) throw new Error('delete-failed');
    } catch {
      setAccounts(snapshot);
    } finally { setDisconnecting(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4" style={{ color: '#6B6480' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm" style={{ color: '#f59e0b' }}>
        <AlertTriangle size={14} />
        No se pudo cargar la información. Recarga la página para intentar de nuevo.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
          {meta.title}
        </p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#6B6480' }}>
          {meta.desc}
        </p>
      </div>

      {justConnected && (
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          <CheckCircle size={13} />
          Cuenta conectada correctamente.
        </div>
      )}

      {meta.providers.map(provider => {
        const acc = accounts.find(a => a.provider === provider.id);
        const connected = !!acc && !acc.needs_reauth;
        const connectHref = `/api/portal/${token}/${meta.routeSlug}/connect?provider=${provider.id}&agentId=${agentId}`;

        return (
          <div
            key={provider.id}
            className="rounded-xl p-4"
            style={{
              background: '#ffffff',
              border:     `1px solid ${connected ? 'rgba(34,197,94,0.2)' : '#F0EDF9'}`,
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
              >
                {provider.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
                    {provider.label}
                  </span>
                  {connected && (
                    <span
                      className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                    >
                      <CheckCircle size={10} /> Conectado
                    </span>
                  )}
                  {acc?.needs_reauth && (
                    <span
                      className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
                    >
                      <AlertTriangle size={10} /> Requiere reconexión
                    </span>
                  )}
                </div>

                {acc ? (
                  <>
                    <p className="text-xs mt-0.5 truncate font-mono" style={{ color: '#1A0A3B' }}>
                      {acc.email}
                    </p>
                    {acc.also_used_by && acc.also_used_by.length > 0 && (
                      <div
                        className="flex items-start gap-1.5 mt-1.5 px-2 py-1.5 rounded-md text-[11px] leading-snug"
                        style={{ background: 'rgba(245,158,11,0.08)', color: '#92400e', border: '1px solid rgba(245,158,11,0.22)' }}
                      >
                        <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1, color: '#f59e0b' }} />
                        <span>
                          Esta cuenta también la usa <b>{acc.also_used_by.join(', ')}</b>. Recuerda pedirle a este empleado que firme sus mensajes o archivos con su nombre para que se distingan.
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
                    No conectado
                  </p>
                )}
              </div>

              <div className="flex gap-2 items-center flex-shrink-0">
                {acc ? (
                  <>
                    {acc.needs_reauth && (
                      <a
                        href={connectHref}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                        style={{
                          background: '#f59e0b',
                          color:      '#ffffff',
                        }}
                      >
                        Reconectar
                      </a>
                    )}
                    <button
                      onClick={() => disconnect(provider.id)}
                      disabled={disconnecting === provider.id}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                      style={{
                        background: 'transparent',
                        color:      '#6B6480',
                        border:     '1px solid #E8E3F5',
                        opacity:    disconnecting === provider.id ? 0.5 : 1,
                      }}
                      title={`Desconectar ${provider.label}`}
                      aria-label={`Desconectar ${provider.label}`}
                    >
                      {disconnecting === provider.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Trash2 size={12} />}
                    </button>
                  </>
                ) : (
                  <a
                    href={connectHref}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      background: provider.color,
                      color:      '#ffffff',
                    }}
                  >
                    Conectar
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
