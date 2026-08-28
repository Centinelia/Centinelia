'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, CheckCircle, Loader2, Globe } from 'lucide-react';
import EmailOAuthSection from './EmailOAuthSection';
import EmailSettings from './EmailSettings';

interface Integration {
  id:           string;
  provider:     'gmail' | 'outlook';
  email:        string;
  needs_reauth: boolean;
}

interface DomainSettings {
  email_from:            string | null;
  email_domain_verified: boolean;
  resend_domain_id:      string | null;
  domain_status:         string | null;
}

type Mode = 'gmail' | 'outlook' | 'domain';

const CARDS: { id: Mode; label: string; subtitle: string; color: string; icon: React.ReactNode }[] = [
  {
    id:       'gmail',
    label:    'Gmail',
    subtitle: 'Google Workspace o Gmail',
    color:    '#EA4335',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <path d="M4 8h40v32H4z" fill="#fff" />
        <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="3" fill="none" />
        <rect x="4" y="8" width="40" height="32" rx="2" stroke="#ddd" strokeWidth="1.5" fill="none" />
        <path d="M4 8l20 14L44 8" fill="none" stroke="#EA4335" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    id:       'outlook',
    label:    'Outlook',
    subtitle: 'Microsoft 365 o Outlook',
    color:    '#0078D4',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="6" fill="#0078D4" />
        <path d="M8 12h20v24H8z" fill="#fff" opacity=".9" />
        <circle cx="18" cy="24" r="7" fill="#0078D4" />
        <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
      </svg>
    ),
  },
  {
    id:       'domain',
    label:    'Otro correo',
    subtitle: 'Tu dominio con Zoho, Titan, hosting propio, etc',
    color:    '#6C3BFF',
    icon:     <Globe size={18} style={{ color: '#6C3BFF' }} />,
  },
];

interface Props {
  token:           string;
  workspacePanel?: React.ReactNode;
}

export default function EmailChannelPicker({ token, workspacePanel }: Props) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [domain,       setDomain]       = useState<DomainSettings | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);

  const load = useCallback(async () => {
    const [oauthRes, domainRes] = await Promise.all([
      fetch(`/api/portal/${token}/email-oauth`).then(r => r.json()),
      fetch(`/api/portal/${token}/email-settings`).then(r => r.json()),
    ]);
    setIntegrations(oauthRes.integrations ?? []);
    setDomain(domainRes);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const activeOAuth = integrations.find(i => !i.needs_reauth) ?? null;
  const hasDomain   = !!domain?.email_domain_verified || !!domain?.resend_domain_id;

  // Auto-select current mode al cargar si no hay selección manual
  const currentMode: Mode | null =
    activeOAuth?.provider === 'gmail'   ? 'gmail'
  : activeOAuth?.provider === 'outlook' ? 'outlook'
  : hasDomain                           ? 'domain'
  : null;

  const shownMode: Mode = selectedMode ?? currentMode ?? 'gmail';

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6" style={{ color: '#9B8FB5' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Cargando canal de correo...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[13px] font-semibold mb-2" style={{ color: '#1A0A3B' }}>
          ¿Cómo quieres que tus empleados manden correo?
        </p>
        <p className="text-[12px] leading-relaxed mb-3" style={{ color: '#6B6480' }}>
          Si tienes Gmail Workspace o Outlook/Microsoft 365, conéctalo directo — es el camino más simple.
          Si tu correo empresarial vive en otro proveedor (Zoho, Titan, hosting propio, iCloud), usa &quot;Otro correo&quot; para configurar tu dominio.
        </p>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {CARDS.map(card => {
            const isSelected = shownMode === card.id;
            const isActive =
              (card.id === 'gmail'   && activeOAuth?.provider === 'gmail') ||
              (card.id === 'outlook' && activeOAuth?.provider === 'outlook') ||
              (card.id === 'domain'  && hasDomain);
            return (
              <button
                key={card.id}
                onClick={() => setSelectedMode(card.id)}
                className="flex flex-col gap-1.5 items-start rounded-xl px-3 py-3 text-left transition-all"
                style={{
                  background: isSelected ? 'rgba(108,59,255,0.06)' : '#fff',
                  border:     isSelected ? '1px solid rgba(108,59,255,0.45)' : '1px solid #E8E3F5',
                  cursor:     'pointer',
                  boxShadow:  isSelected ? '0 1px 3px rgba(108,59,255,0.12)' : 'none',
                }}
              >
                <div className="flex items-center gap-2 w-full">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
                  >
                    {card.icon}
                  </div>
                  <span className="text-[13px] font-bold flex-1" style={{ color: '#1A0A3B' }}>
                    {card.label}
                  </span>
                  {isActive && (
                    <CheckCircle size={13} style={{ color: '#22c55e' }} />
                  )}
                </div>
                <span className="text-[11px] leading-snug" style={{ color: '#6B6480' }}>
                  {card.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Branch UI */}
      <div>
        {shownMode === 'gmail' && (
          <EmailOAuthSection token={token} only="gmail" workspacePanel={workspacePanel} />
        )}
        {shownMode === 'outlook' && (
          <EmailOAuthSection token={token} only="outlook" />
        )}
        {shownMode === 'domain' && (
          <>
            {activeOAuth && (
              <div
                className="mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
              >
                <Mail size={13} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                  Tienes <strong style={{ color: '#1A0A3B' }}>{activeOAuth.provider === 'gmail' ? 'Gmail' : 'Outlook'}</strong> conectado.
                  Mientras esa integración esté activa, los correos de tus empleados saldrán por ahí — no por el dominio.
                  Desconéctala arriba si quieres usar solo el dominio.
                </p>
              </div>
            )}
            <EmailSettings token={token} />
          </>
        )}
      </div>
    </div>
  );
}
