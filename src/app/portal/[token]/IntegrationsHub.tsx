'use client';

import { useEffect, useState } from 'react';
import { Calendar, Mail, FolderOpen, MessageSquare, Database, ShoppingCart, ChevronDown } from 'lucide-react';
import type { Plan } from '@/types/agent';

import IntegrationsSection   from './IntegrationsSection';
import NotionSection         from './NotionSection';
import NotionSchemasSection  from './NotionSchemasSection';
import TeamsSection          from './TeamsSection';
import EmailOAuthSection      from './EmailOAuthSection';
import EmailSettings          from './EmailSettings';
import AgentIntegrationsPanel from './AgentIntegrationsPanel';
import MercadoLibreSection    from './MercadoLibreSection';

/* ── types ─────────────────────────────────────────────────────────────── */

interface CalStatus    { calendar_type: string | null }
interface NotionStatus { connected: boolean }
interface EmailStatus  { provider: 'gmail' | 'outlook' }
interface MLStatus     { connected: boolean; nickname: string | null }
interface HubStatus    {
  cal:        CalStatus | null;
  notion:     NotionStatus | null;
  emails:     EmailStatus[];
  teamsEmail: string | null;
  ml:         MLStatus | null;
}

/* ── provider icons (small, for row header badges) ──────────────────────── */

const PIcons = {
  gmail: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="8" width="40" height="32" rx="2" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
      <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="2.5" fill="none" />
    </svg>
  ),
  drive: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <path d="M16 38L4 18l12-18h16l12 18-12 20H16z" fill="none" />
      <path d="M6 38h36l-6-10H12L6 38z" fill="#FBBC04" />
      <path d="M24 4L12 24h12l12-20H24z" fill="#4285F4" />
      <path d="M12 24L6 38l6-10 6-10-6 6z" fill="none" />
      <path d="M4 38l8-14L24 4 12 24 6 38H4z" fill="#34A853" />
      <path d="M4 38h8l4-7H6L4 38z" fill="#34A853" />
      <path d="M24 4h12L24 24H12L24 4z" fill="#4285F4" />
      <path d="M36 24l6 14H18l6-14h12z" fill="#FBBC04" />
    </svg>
  ),
  outlook: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="6" fill="#0078D4" />
      <rect x="8" y="12" width="18" height="24" fill="#fff" opacity=".9" />
      <circle cx="17" cy="24" r="7" fill="#0078D4" />
      <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
    </svg>
  ),
  onedrive: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <path d="M28 34H10a8 8 0 01-2-15.7A11 11 0 0129 14a9 9 0 018 9 8 8 0 01-1 17H28z" fill="#0078D4" />
      <path d="M34 34H20a6 6 0 01-1-12 9 9 0 0116.5-2A7 7 0 0134 34z" fill="#28A8E8" />
    </svg>
  ),
  'google-calendar': (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect x="2" y="6" width="44" height="38" rx="4" fill="#fff" stroke="#ddd" strokeWidth="2" />
      <rect x="2" y="6" width="44" height="13" rx="4" fill="#4285F4" />
      <rect x="2" y="13" width="44" height="6" fill="#4285F4" />
      <circle cx="16" cy="33" r="3.5" fill="#EA4335" />
      <circle cx="24" cy="33" r="3.5" fill="#34A853" />
      <circle cx="32" cy="33" r="3.5" fill="#FBBC05" />
    </svg>
  ),
  'outlook-calendar': (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="6" fill="#0078D4" />
      <rect x="8" y="12" width="18" height="24" fill="#fff" opacity=".9" />
      <circle cx="17" cy="24" r="7" fill="#0078D4" />
      <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
    </svg>
  ),
  notion: (
    <svg width="13" height="13" viewBox="0 0 100 100" fill="none">
      <path fillRule="evenodd" clipRule="evenodd"
        d="M61.35.227l-55.333 4.086C1.553 4.7 0 7.617 0 11.113v61.197c0 2.723.967 5.057 3.3 8.167l13.16 16.387c2.137 2.723 4.08 3.307 8.16 3.113l64.257-3.89c5.433-.387 6.99-2.917 6.99-7.193V19.64c0-2.21-.873-2.847-3.443-4.733L74.167 2.143C69.893-.963 68.147-1.357 61.35.227z"
        fill="#000" />
    </svg>
  ),
  teams: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#5865F2" />
      <path d="M5 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#fff" strokeWidth="1.5" fill="none" />
      <circle cx="11" cy="8" r="2.5" fill="#fff" />
    </svg>
  ),
  mercadolibre: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="8" fill="#FFE600" />
      <path d="M24 10c-7.7 0-14 6.3-14 14s6.3 14 14 14 14-6.3 14-14S31.7 10 24 10z" fill="#E3002A" />
      <path d="M24 14c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10-4.5-10-10-10z" fill="#FFE600" />
    </svg>
  ),
};

/* ── provider badge ─────────────────────────────────────────────────────── */

function ProviderBadge({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap"
      style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
      {icon && <span className="flex-shrink-0 flex items-center">{icon}</span>}
      {label}
    </span>
  );
}

function EmailProviderBadge({ emails }: { emails: EmailStatus[] }) {
  if (emails.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {emails.map(e => {
        const isGmail = e.provider === 'gmail';
        return (
          <span key={e.provider}
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
            <span className="flex items-center">{PIcons[isGmail ? 'gmail' : 'outlook']}</span>
            <span style={{ opacity: 0.4, fontSize: 9 }}>+</span>
            <span className="flex items-center">{PIcons[isGmail ? 'drive' : 'onedrive']}</span>
          </span>
        );
      })}
    </div>
  );
}

function CalProviderBadge({ cal }: { cal: CalStatus | null }) {
  if (!cal?.calendar_type) return null;
  const isGoogle = cal.calendar_type === 'google';
  return (
    <ProviderBadge
      label={isGoogle ? 'Google Calendar' : 'Outlook Calendar'}
      icon={PIcons[isGoogle ? 'google-calendar' : 'outlook-calendar']}
    />
  );
}

/* ── status dot ─────────────────────────────────────────────────────────── */

function StatusDot({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: '#22c55e', boxShadow: '0 0 5px rgba(34,197,94,0.5)' }} />
  );
}

/* ── capability row ─────────────────────────────────────────────────────── */

function CapabilityRow({
  icon, label, connected, comingSoon, badge, children,
}: {
  icon:        React.ReactNode;
  label:       string;
  connected?:  boolean;
  comingSoon?: boolean;
  badge?:      React.ReactNode;
  children?:   React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--c-surface)',
        border: `1px solid ${connected ? 'rgba(34,197,94,0.2)' : 'var(--c-border-2)'}`,
      }}>

      <button
        onClick={() => !comingSoon && setOpen(o => !o)}
        disabled={comingSoon}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
        style={{ cursor: comingSoon ? 'default' : 'pointer' }}
        onMouseEnter={e => { if (!comingSoon) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.03)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
          {icon}
        </div>

        <span className="flex-1 text-sm font-semibold"
          style={{ color: comingSoon ? 'var(--c-text-4)' : 'var(--c-text)' }}>
          {label}
        </span>

        {badge}
        <StatusDot on={!!connected} />

        {comingSoon ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-4)', border: '1px solid var(--c-border)' }}>
            Pronto
          </span>
        ) : (
          <ChevronDown size={14} style={{
            color:      'var(--c-text-4)',
            flexShrink: 0,
            transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms',
          }} />
        )}
      </button>

      {open && !comingSoon && (
        <div className="px-4 pb-5 pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── main ───────────────────────────────────────────────────────────────── */

interface Props {
  token:          string;
  plan:           Plan;
  hasOpsAgent:    boolean;
  hasNotion:      boolean;
  showPerAgent:   boolean;
}

export default function IntegrationsHub({ token, plan, hasOpsAgent, hasNotion, showPerAgent }: Props) {
  const [status, setStatus] = useState<HubStatus>({
    cal: null, notion: null, emails: [], teamsEmail: null, ml: null,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/portal/${token}/integrations`).then(r => r.json()).catch(() => null),
      fetch(`/api/portal/${token}/notion`).then(r => r.json()).catch(() => null),
      fetch(`/api/portal/${token}/email-oauth`).then(r => r.json()).catch(() => null),
      fetch(`/api/portal/${token}/ml-oauth`).then(r => r.json()).catch(() => null),
      hasOpsAgent
        ? fetch(`/api/portal/${token}/teams`).then(r => r.json()).catch(() => null)
        : Promise.resolve(null),
    ]).then(([calData, notionData, emailData, mlData, teamsData]) => {
      setStatus({
        cal:        calData    ?? null,
        notion:     notionData ?? null,
        emails:     emailData?.integrations ?? [],
        teamsEmail: teamsData?.teams_user_email ?? null,
        ml:         mlData    ?? null,
      });
    });
  }, [token, hasOpsAgent]);

  return (
    <div className="flex flex-col gap-1.5">

      {/* ── Correo ─────────────────────────────────────────────────────── */}
      <CapabilityRow
        icon={<Mail size={16} style={{ color: '#9B6DFF' }} />}
        label="Correo"
        connected={status.emails.length > 0}
        badge={<EmailProviderBadge emails={status.emails} />}
      >
        <div className="flex flex-col gap-4">
          <EmailOAuthSection token={token} />
          {status.emails.length > 0 && <EmailSettings token={token} />}
          <div className="flex gap-2 rounded-lg px-3 py-2.5"
            style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
            <FolderOpen size={13} style={{ color: '#06b6d4', flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
              Al conectar Gmail tu empleado también tiene acceso a Google Drive. Al conectar Outlook, tiene acceso a OneDrive. No se requiere configuración adicional.
            </p>
          </div>

          {showPerAgent && (
            <div className="flex flex-col gap-3 pt-2" style={{ borderTop: '1px solid var(--c-border)' }}>
              <div>
                <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-4)' }}>
                  Correo por empleado
                </p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                  Cada empleado atiende una bandeja distinta. Asigna aquí qué cuenta lee y desde cuál envía.
                </p>
              </div>
              <AgentIntegrationsPanel token={token} />
            </div>
          )}
        </div>
      </CapabilityRow>

      {/* ── Agenda ─────────────────────────────────────────────────────── */}
      <CapabilityRow
        icon={<Calendar size={16} style={{ color: '#6C3BFF' }} />}
        label="Agenda"
        connected={!!status.cal?.calendar_type}
        badge={<CalProviderBadge cal={status.cal} />}
      >
        <IntegrationsSection token={token} plan={plan} />
      </CapabilityRow>

      {/* ── CRM ────────────────────────────────────────────────────────── */}
      <CapabilityRow
        icon={<Database size={16} style={{ color: '#6C3BFF' }} />}
        label="CRM"
        connected={!!status.notion?.connected}
        badge={status.notion?.connected ? <ProviderBadge label="Notion" icon={PIcons.notion} /> : undefined}
      >
        <div className="flex flex-col gap-5">
          <NotionSection token={token} />
          {hasNotion && <NotionSchemasSection token={token} />}
        </div>
      </CapabilityRow>

      {/* ── Mensajería ─────────────────────────────────────────────────── */}
      {hasOpsAgent && (
        <CapabilityRow
          icon={<MessageSquare size={16} style={{ color: '#5865F2' }} />}
          label="Mensajería"
          connected={!!status.teamsEmail}
          badge={status.teamsEmail ? <ProviderBadge label="Teams" icon={PIcons.teams} /> : undefined}
        >
          <TeamsSection token={token} />
        </CapabilityRow>
      )}

      {/* ── Comercio ───────────────────────────────────────────────────── */}
      <CapabilityRow
        icon={<ShoppingCart size={16} style={{ color: '#F5D000' }} />}
        label="Comercio"
        connected={!!status.ml?.connected}
        badge={status.ml?.connected ? <ProviderBadge label="MercadoLibre" icon={PIcons.mercadolibre} /> : undefined}
      >
        <MercadoLibreSection token={token} />
      </CapabilityRow>

    </div>
  );
}
